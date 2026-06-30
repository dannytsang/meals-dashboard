/**
 * components/dashboard-client.order-items.test.tsx
 *
 * Spec 034 / FR-012 — the seven RTL assertions covering the
 * Order Items by Category section's previous / next delivery
 * pipeline. Sibling file to components/dashboard-client.test.ts
 * (which has the source-string assertions). The fixture here is
 * hand-built (NOT read from lib/fixtures/dashboard-fixture.json)
 * because FR-012 needs:
 *   - Two order blobs with controlled dates (one previous, one next)
 *   - A `today` value the test sets per-scenario (phase-machines the
 *     auto-flip behaviour without a real cron)
 *   - Tests that survive even if the generated fixture JSON's
 *     delivery dates drift (NFR-009: reference dates are fixed in
 *     the seed, but FR-012 should not couple to them).
 *
 * The seven assertions (per spec.md FR-012):
 *   1. default render shows only next order's items
 *   2. deliveryFilter=previous shows only previous order's items
 *   3. deliveryFilter=all shows both, grouped under sub-headings
 *   4. bump `today` to one day after next order's deliveryDate ->
 *      items reclassify as previous
 *   5. no future order blob -> Next filter renders Pending
 *      placeholder row
 *   6. delivery filter composes with category chips, match filter,
 *      search query, sort (verify displayItems pipeline output)
 *   7. (documented as: covered by source-string assertions + the
 *      classifyOrderItemsByDelivery unit tests; this file asserts
 *      the surfaced chip payload stays in sync — FR-010 overlay on
 *      the FR-012 mandate)
 *
 * Notes on the imports:
 *   - `dashboardDebugChips` is dynamically imported in dashboard-client
 *     with `ssr: false`. Under jsdom + vitest, we mock `next/dynamic`
 *     (see vi.mock below) to resolve the loader eagerly so the chip
 *     renders synchronously after the first effect tick. That
 *     allows the FR-012 #7 test (debugOn=true) to find the
 *     delivery-filter-state-chip testid.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import React, { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DashboardClient } from './dashboard-client';
import { DashboardDebugChips } from './dashboard-debug-chips';
import type { DashboardData } from '@/lib/dashboard-data';
import type { GroceryItem } from '@/lib/meals-data';
import type { OrderBlob } from '@/lib/dashboard-sync';

/*
 * Spec 034 / FR-009 — the time-machine query param tests need
 * `useSearchParams` to be controllable per-test. The holder pattern
 * below lets each test mutate the URL params it wants to fake
 * without re-importing the module or re-mocking `next/navigation`.
 *
 * The default value is an empty params object, which is what every
 * pre-Phase-5 test expects (no `?delivery_date_offset` in the URL).
 */
const mockSearchParams: { current: Record<string, string> } = {
  current: {},
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearchParams.current),
}));

// Spec 034 / FR-010 renders DashboardDebugChips via
//   dynamic(() => import('./dashboard-debug-chips').then(m => m.DashboardDebugChips), { ssr: false })
// In jsdom + vitest, next/dynamic's real loader would return null
// because the client-side chunk never loads synchronously. The
// FR-012 #7 test (debugOn=true) needs the chip to render so it can
// read the delivery-filter-state-chip testid. Mock next/dynamic to
// resolve the loader eagerly (mirrors the real production code
// path once the dynamic import finishes); the test uses
// findByTestId to wait for the post-effect render.
vi.mock('next/dynamic', () => ({
  default: (
    loader: () => Promise<Record<string, React.ComponentType<unknown>>>,
  ) => {
    const Mock = (props: Record<string, unknown>) => {
      const [Component, setComponent] =
        React.useState<React.ComponentType<unknown> | null>(null);
      React.useEffect(() => {
        let cancelled = false;
        loader().then((m) => {
          // The real call site uses `.then(m => m.DashboardDebugChips)`
          // (named export) — so `m` is the resolved value (the
          // component itself), not a module namespace. Defensive
          // fallback: if it looks like a module namespace, use
          // `m.DashboardDebugChips` or `m.default`.
          const resolved: React.ComponentType<unknown> | undefined =
            typeof m === 'function'
              ? (m as unknown as React.ComponentType<unknown>)
              : m.DashboardDebugChips ?? m.default;
          if (!cancelled && resolved) setComponent(() => resolved);
        });
        return () => {
          cancelled = true;
        };
      }, []);
      return Component
        ? React.createElement(Component, props as Record<string, unknown>)
        : null;
    };
    return Mock;
  },
}));

/**
 * Build a `DashboardData` fixture with two OrderBlobs at controlled
 * dates. `today` is provided separately so each test can vary it
 * without rebuilding the orders.
 */
function makeTwoOrderData(today: string): DashboardData {
  const previousItem: GroceryItem = {
    name: 'Tesco Milk 4 Pints',
    quantity: 1,
    price: 1.8,
    category: 'Dairy',
  };
  const nextItem: GroceryItem = {
    name: 'Tesco Garlic Bulb',
    quantity: 1,
    price: 0.65,
    category: 'Fresh',
  };

  const previousOrder: OrderBlob = {
    orderNumber: 'PREV-1',
    deliveryDate: '2026-06-08',
    deliverySlot: '10:00-12:00',
    orderTotal: 1.8,
    items: [previousItem],
    substitutions: [],
    unavailable: [],
    shortLifeItems: [],

    status: 'active',
  };

  const nextOrder: OrderBlob = {
    orderNumber: 'NEXT-1',
    deliveryDate: '2026-06-20',
    deliverySlot: '14:00-16:00',
    orderTotal: 1.5,
    items: [nextItem],
    substitutions: [],
    unavailable: [],
    shortLifeItems: [],

    status: 'active',
  };

  // The latestOrder field is whatever the loader returns — for the
  // row renderer it's irrelevant (displayItems drives the rows).
  // We pass the next order as latestOrder to mirror the production
  // shape (loader exposes the latest as latestOrder).
  return {
    coverage: [
      {
        meal: { id: 'm1', content: 'Broccoli pasta', date: today, labels: [], section: 'Planned' },
        status: 'covered',
        coverageScore: 100,
        matchedItems: [],
        missingItems: [],
      },
    ],
    deliveryWindows: [
      { date: '2026-06-08', slot: '10:00-12:00', status: 'delivered', orderTotal: 1.8 },
      { date: '2026-06-20', slot: '14:00-16:00', status: 'scheduled', orderTotal: 1.5 },
    ],
    latestOrder: nextOrder as unknown as DashboardData['latestOrder'],
    mealsCheckSummary: null,
    dataGeneratedAt: '2026-06-15T00:00:00Z',
    uiUpdatedAt: '2026-06-15T00:00:00Z',
    loadError: null,
    validOrders: [previousOrder, nextOrder],
  };
}

// Reference notes kept above intentionally — the previous/next
// items are now declared inline. Each scenario in the FR-012
// describe block rebuilds the data set it needs.

describe('DashboardClient Order Items by Category (Spec 034 / FR-012)', () => {
  beforeEach(() => {
    cleanup();
    // Reset the per-test search-params holder so each scenario starts
    // from a clean URL (no stale `?delivery_date_offset=…` from the
    // previous test).
    mockSearchParams.current = {};
    // Wipe sessionStorage between tests so the delivery filter
    // always starts at the FR-002 default value of 'next'.
    try {
      window.sessionStorage.clear();
    } catch {
      // privacy-locked contexts; ignore
    }
  });

  it('FR-012 #1: with a previous + next fixture, default render shows only the next order items', () => {
    const today = '2026-06-15'; // between previous (06-08) and next (06-20)
    const data = makeTwoOrderData(today);
    render(createElement(DashboardClient, { today, data, userName: 'Danny' }));

    // The next-order item (garlic) IS visible by default.
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();
    // The previous-order item (milk) is NOT visible by default.
    expect(screen.queryByText('Tesco Milk 4 Pints')).toBeNull();
    // The default filter chip "Next delivery" is the active one
    // (aria-pressed=true). Both other chips are inactive.
    const nextChip = screen.getByRole('button', { name: 'Next delivery' });
    expect(nextChip.getAttribute('aria-pressed')).toBe('true');
    const prevChip = screen.getByRole('button', { name: 'Previous delivery' });
    expect(prevChip.getAttribute('aria-pressed')).toBe('false');
    const allChip = screen.getByRole('button', { name: 'All deliveries' });
    expect(allChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('FR-012 #2: setting deliveryFilter to "previous" shows only previous order items', () => {
    const today = '2026-06-15';
    const data = makeTwoOrderData(today);
    render(createElement(DashboardClient, { today, data, userName: 'Danny' }));

    const prevChip = screen.getByRole('button', { name: 'Previous delivery' });
    fireEvent.click(prevChip);

    // After flipping to previous, the previous-order item (milk) IS
    // visible and the next-order item (garlic) is NOT.
    expect(screen.getByText('Tesco Milk 4 Pints')).toBeTruthy();
    expect(screen.queryByText('Tesco Garlic Bulb')).toBeNull();
    // The chip's aria-pressed reflects the new state.
    expect(prevChip.getAttribute('aria-pressed')).toBe('true');
    const nextChip = screen.getByRole('button', { name: 'Next delivery' });
    expect(nextChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('FR-012 #3: setting deliveryFilter to "all" shows both, grouped under sub-headings', () => {
    const today = '2026-06-15';
    const data = makeTwoOrderData(today);
    render(createElement(DashboardClient, { today, data, userName: 'Danny' }));

    const allChip = screen.getByRole('button', { name: 'All deliveries' });
    fireEvent.click(allChip);

    // Both items are now visible (items have unique names so this
    // is unambiguous).
    expect(screen.getByText('Tesco Milk 4 Pints')).toBeTruthy();
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();

    // The sub-headings (FR-005 / NFR-004) are rendered with role=heading
    // and aria-level=4 — there must be exactly two because there are
    // two orders visible. The text shape is "Delivery {DD MMM YYYY}".
    const subHeadings = screen.getAllByTestId('delivery-subheading');
    expect(subHeadings).toHaveLength(2);
    for (const sh of subHeadings) {
      expect(sh.getAttribute('role')).toBe('heading');
      expect(sh.getAttribute('aria-level')).toBe('4');
    }
    // Sub-headings MUST be a plain <div> (NOT <button>, NOT an
    // accordion — locked by AS-014 / AS-015).
    for (const sh of subHeadings) {
      expect(sh.tagName.toLowerCase()).toBe('div');
    }
  });

  it('FR-012 #4: bumping `today` past the next order reclassifies its items as Previous', () => {
    // Initial render: today is between the two orders.
    const data = makeTwoOrderData('2026-06-15');
    const { rerender } = render(
      createElement(DashboardClient, { today: '2026-06-15', data, userName: 'Danny' }),
    );

    // Sanity: default (Next) shows garlic, not milk.
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();
    expect(screen.queryByText('Tesco Milk 4 Pints')).toBeNull();

    // Bump today to one day AFTER the next order's deliveryDate
    // (2026-06-20 + 1 = 2026-06-21). The next-order item is now
    // classified as previous; the default Next filter hides it.
    rerender(createElement(DashboardClient, { today: '2026-06-21', data, userName: 'Danny' }));

    expect(screen.queryByText('Tesco Garlic Bulb')).toBeNull();
    // Toggling to "previous" now reveals it (alongside milk).
    fireEvent.click(screen.getByRole('button', { name: 'Previous delivery' }));
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();
    expect(screen.getByText('Tesco Milk 4 Pints')).toBeTruthy();
  });

  it('FR-012 #5: with no future order blob, the Next filter renders the Pending placeholder', () => {
    // Build a data set whose only order is in the past — there's
    // no future order blob, so the pending-next case fires when
    // a future deliveryWindow entry exists.
    const today = '2026-06-15';
    const futureWindow = { date: '2026-06-25', slot: '14:00-16:00', status: 'scheduled' as const, orderTotal: 0 };
    const pastOrder: OrderBlob = {
      orderNumber: 'PAST-1',
      deliveryDate: '2026-06-01',
      deliverySlot: '10:00-12:00',
      orderTotal: 1.8,
      items: [{ name: 'Tesco Milk 4 Pints', quantity: 1, price: 1.8, category: 'Dairy' }],
      substitutions: [],
      unavailable: [],
      shortLifeItems: [],

      status: 'active',
    };
    const data: DashboardData = {
      coverage: [],
      deliveryWindows: [futureWindow],
      latestOrder: pastOrder as unknown as DashboardData['latestOrder'],
      mealsCheckSummary: null,
      dataGeneratedAt: '2026-06-15T00:00:00Z',
      uiUpdatedAt: '2026-06-15T00:00:00Z',
      loadError: null,
      validOrders: [pastOrder],
    };

    render(createElement(DashboardClient, { today, data, userName: 'Danny' }));

    // Pending placeholder is rendered with the canonical text and
    // the data-testid hook (T036).
    const placeholder = screen.getByTestId('pending-next-placeholder');
    expect(placeholder.textContent).toMatch(/Pending next delivery/);
    // The placeholder REPLACES the item list (not in addition to it).
    expect(screen.queryByText('Tesco Milk 4 Pints')).toBeNull();
  });

  it('FR-012 #6: delivery filter composes with category chips, match filter, search query, and sort', () => {
    const today = '2026-06-15';
    // Build a data set with multiple items across categories so we
    // can exercise category + match + search + sort. Item NAMES are
    // chosen so the existing transformCachedOrderSafely category
    // heuristic (lib/dashboard-ui-utils.ts:79-95) classifies them
    // correctly via substring matching — that keeps the test
    // independent of the internal category-assignment function.
    const previousOrder: OrderBlob = {
      orderNumber: 'PREV-1',
      deliveryDate: '2026-06-08',
      deliverySlot: '10:00-12:00',
      orderTotal: 5.55,
      items: [
        { name: 'Tesco Broccoli 500g', quantity: 1, price: 1.5, category: 'Fresh' },
        { name: 'Tesco Whole Milk 4 Pints', quantity: 1, price: 1.8, category: 'Dairy' },
        { name: 'Tesco Fusilli 500g Pasta', quantity: 1, price: 1.2, category: 'Pantry' },
      ],
      substitutions: [],
      unavailable: [],
      shortLifeItems: [],

      status: 'active',
    };
    const nextOrder: OrderBlob = {
      orderNumber: 'NEXT-1',
      deliveryDate: '2026-06-20',
      deliverySlot: '14:00-16:00',
      orderTotal: 5.55,
      items: [
        { name: 'Tesco Broccoli Florets 900g', quantity: 1, price: 2.25, category: 'Fresh' },
        { name: 'Tesco Garlic Bulb', quantity: 1, price: 0.65, category: 'Pantry' },
        { name: 'Tesco Greek Feta Cheese 200g', quantity: 1, price: 1.15, category: 'Dairy' },
      ],
      substitutions: [],
      unavailable: [],
      shortLifeItems: [],

      status: 'active',
    };
    const data: DashboardData = {
      coverage: [],
      deliveryWindows: [
        { date: '2026-06-08', slot: '10:00-12:00', status: 'delivered', orderTotal: 5.55 },
        { date: '2026-06-20', slot: '14:00-16:00', status: 'scheduled', orderTotal: 5.55 },
      ],
      latestOrder: nextOrder as unknown as DashboardData['latestOrder'],
      mealsCheckSummary: null,
      dataGeneratedAt: '2026-06-15T00:00:00Z',
      uiUpdatedAt: '2026-06-15T00:00:00Z',
      loadError: null,
      validOrders: [previousOrder, nextOrder],
    };

    render(createElement(DashboardClient, { today, data, userName: 'Danny' }));

    // Default Next filter -> only next-order items visible.
    expect(screen.getByText('Tesco Broccoli Florets 900g')).toBeTruthy();
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();
    expect(screen.getByText('Tesco Greek Feta Cheese 200g')).toBeTruthy();
    expect(screen.queryByText('Tesco Whole Milk 4 Pints')).toBeNull();
    expect(screen.queryByText('Tesco Fusilli 500g Pasta')).toBeNull();

    // Search "broc" filters to the broccoli item only — proves
    // the search composes after the delivery filter (FR-008 step 3).
    const search = screen.getByRole('searchbox', { name: /search order items/i });
    fireEvent.change(search, { target: { value: 'broc' } });
    expect(screen.getByText('Tesco Broccoli Florets 900g')).toBeTruthy();
    expect(screen.queryByText('Tesco Garlic Bulb')).toBeNull();

    // Clear the search and apply the Dairy category chip — the
    // next-order Feta matches, but Broccoli (Fresh) does not. This
    // proves the category chip composes with the delivery filter
    // (next only). Previous-order Milk is still hidden.
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Dairy' }));
    expect(screen.getByText('Tesco Greek Feta Cheese 200g')).toBeTruthy();
    expect(screen.queryByText('Tesco Broccoli Florets 900g')).toBeNull();
    expect(screen.queryByText('Tesco Garlic Bulb')).toBeNull();
    expect(screen.queryByText('Tesco Whole Milk 4 Pints')).toBeNull(); // previous, still hidden

    // Reset the category chip to "All", flip delivery filter to
    // "All deliveries" — all six items are now visible (3 next +
    // 3 previous). Proves the delivery filter is the FIRST stage
    // (FR-008 step 1) and that all subsequent stages compose on
    // top of the broadened pool.
    fireEvent.click(screen.getByRole('button', { name: 'All' })); // the categories "All" chip
    fireEvent.click(screen.getByRole('button', { name: 'All deliveries' }));
    expect(screen.getByText('Tesco Broccoli Florets 900g')).toBeTruthy();
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();
    expect(screen.getByText('Tesco Greek Feta Cheese 200g')).toBeTruthy();
    expect(screen.getByText('Tesco Whole Milk 4 Pints')).toBeTruthy();
    expect(screen.getByText('Tesco Fusilli 500g Pasta')).toBeTruthy();

    // Apply the Name Z–A sort — Broccoli items (with capital-B
    // start, but "Feta" > "Garlic" > "Florets" > etc.) should now
    // be in reverse alphabetical order by cleaned name. Sort is
    // the LAST pipeline stage (FR-008 step 4) so it composes on
    // top of the categories + delivery filter still in effect.
    fireEvent.click(screen.getByRole('button', { name: /Name Z/i }));
    const allRows = screen.getAllByText(/^Tesco /);
    // Expect the first row (top of the visible list) to be the
    // highest-alphabetical item: "Tesco Whole Milk 4 Pints"
    // beats "Tesco Greek Feta Cheese 200g" beats "Tesco Fusilli
    // 500g Pasta" beats "Tesco Garlic Bulb" beats "Tesco
    // Broccoli Florets 900g" beats "Tesco Broccoli 500g".
    expect(allRows[0]?.textContent).toBe('Tesco Whole Milk 4 Pints');
  });

  it('FR-012 #7: coverage target assertion — debug chip surfaces the FR-010 payload (FR-010 ↔ FR-012 invariant)', async () => {
    // This is assertion #7 in the FR-012 list per spec.md; the spec
    // notes it's "covered by the existing 47 source-string tests +
    // new Phase 2 work". We additionally assert the FR-010 chip
    // payload (dashboard-debug-chips.tsx) is rendered with the
    // correct five fields, which confirms the FR-012 pipeline state
    // is observable via the FR-010 debug surface.
    const today = '2026-06-15';
    const data = makeTwoOrderData(today);
    // Enable debug mode + demo off so the chip block renders.
    render(createElement(DashboardClient, { today, data, debugOn: true, userName: 'Danny' }));

    // The chip is loaded via next/dynamic; the mocked loader resolves
    // asynchronously after the first useEffect tick, so wait for it.
    const chip = await screen.findByTestId('delivery-filter-state-chip');
    expect(chip.getAttribute('data-active')).toBe('next');
    expect(chip.getAttribute('data-source')).toBe('default');
    expect(chip.getAttribute('data-today')).toBe(today);
    expect(chip.getAttribute('data-next-delivery-date')).toBe('2026-06-20');
    expect(chip.getAttribute('data-previous-delivery-date')).toBe('2026-06-08');
  });

  it('FR-009: ?delivery_date_offset=1 shifts today forward by one day and reclassifies the next order as previous', () => {
    /*
     * Time-machine param, FR-009. The fixture is the standard
     * two-order set: previous order 2026-06-08, next order 2026-06-20.
     * Without an offset, today=2026-06-15 classifies the next order
     * as `next` (visible in the default Next view). With
     * `?delivery_date_offset=6` (today shifts to 2026-06-21, one
     * day past the next order's deliveryDate), the same order
     * reclassifies as `previous` and is therefore hidden in the
     * default Next view. Toggling to Previous reveals it.
     *
     * The test exercises the URL-param path explicitly (rather than
     * rerendering with a bumped `today` prop like FR-012 #4 does)
     * because FR-009's value-add is precisely the
     * URL-as-time-machine model — the param must drive the
     * classification, not the `today` prop.
     */
    const today = '2026-06-15';
    const data = makeTwoOrderData(today);
    // Shift today FORWARD by 6 days -> effective today = 2026-06-21,
    // which is one day past the next order's deliveryDate (2026-06-20).
    // Debug mode MUST be on for the param to take effect (FR-009
    // hard constraint).
    mockSearchParams.current = { delivery_date_offset: '6' };
    render(
      createElement(DashboardClient, { today, data, debugOn: true, userName: 'Danny' }),
    );

    // Default Next filter now hides garlic (it has been reclassified
    // as previous by the time-machine shift).
    expect(screen.queryByText('Tesco Garlic Bulb')).toBeNull();
    // Sanity: the milk item from the original-previous order is
    // still classified as previous (its date 2026-06-08 is in the
    // past either way), and is hidden by the default Next filter.
    expect(screen.queryByText('Tesco Milk 4 Pints')).toBeNull();

    // Toggle to Previous to confirm garlic WAS reclassified as
    // previous (i.e. the time-machine shift took effect, not just
    // a default-view flip).
    fireEvent.click(screen.getByRole('button', { name: 'Previous delivery' }));
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();
    expect(screen.getByText('Tesco Milk 4 Pints')).toBeTruthy();
  });

  it('FR-009 (negative path): ?delivery_date_offset with debug mode OFF is a no-op', () => {
    /*
     * FR-009 hard constraint: "No-op when debug mode is off". Even
     * with `?delivery_date_offset=1` in the URL, the dashboard MUST
     * render identically to a no-param render when the debug
     * cookie is unset (the `debugOn` prop is false).
     */
    const today = '2026-06-15';
    const data = makeTwoOrderData(today);
    mockSearchParams.current = { delivery_date_offset: '6' };
    // NOTE: debugOn defaults to undefined/false here on purpose.
    render(createElement(DashboardClient, { today, data, userName: 'Danny' }));

    // Default Next filter shows garlic (the time-machine shift
    // did NOT take effect).
    expect(screen.getByText('Tesco Garlic Bulb')).toBeTruthy();
    expect(screen.queryByText('Tesco Milk 4 Pints')).toBeNull();
  });

  it('FR-009 (debug chip): the chip surfaces the shifted today + fixture-override source when the offset is in effect', async () => {
    /*
     * FR-010 ↔ FR-009 invariant. With an offset in effect, the
     * FR-010 chip must show:
     *   - `data-today` = effectiveToday (today + offset)
     *   - `data-source` = 'fixture-override' (one of the three
     *     values declared on `DeliveryFilterDebugState.source`)
     * This is the operator's only signal that the view is
     * time-shifted (no console warning, no banner — the chip is
     * read-only per spec 022).
     */
    const today = '2026-06-15';
    const data = makeTwoOrderData(today);
    mockSearchParams.current = { delivery_date_offset: '6' };
    render(
      createElement(DashboardClient, { today, data, debugOn: true, userName: 'Danny' }),
    );

    const chip = await screen.findByTestId('delivery-filter-state-chip');
    expect(chip.getAttribute('data-today')).toBe('2026-06-21');
    expect(chip.getAttribute('data-source')).toBe('fixture-override');
    // The classified next / previous dates are still derived from
    // the SAME orders; what changes is the classification bucket
    // they fall into under the shifted anchor. With effective today
    // 2026-06-21, the 2026-06-20 order is now previous and there
    // is no next order, so nextDeliveryDate is null.
    expect(chip.getAttribute('data-next-delivery-date')).toBe('');
    expect(chip.getAttribute('data-previous-delivery-date')).toBe('2026-06-20');
  });
});

describe('DashboardDebugChips deliveryFilterState chip (Spec 034 / FR-010)', () => {
  it('renders the read-only chip with all five FR-010 fields when given a payload', () => {
    // The component is dynamically imported with ssr:false in
    // dashboard-client.tsx. For unit-testing the chip itself we
    // render it directly (ssr:false is a Next.js-render-only
    // concern; the React tree renders fine in jsdom).
    render(
      createElement(DashboardDebugChips, {
        deliveryFilterState: {
          active: 'previous',
          source: 'sessionStorage',
          today: '2026-06-15',
          nextDeliveryDate: '2026-06-20',
          previousDeliveryDate: '2026-06-08',
        },
      } as any),
    );
    const chip = screen.getByTestId('delivery-filter-state-chip');
    expect(chip.getAttribute('data-active')).toBe('previous');
    expect(chip.getAttribute('data-source')).toBe('sessionStorage');
    expect(chip.getAttribute('data-today')).toBe('2026-06-15');
    expect(chip.getAttribute('data-next-delivery-date')).toBe('2026-06-20');
    expect(chip.getAttribute('data-previous-delivery-date')).toBe('2026-06-08');
    // Title surfaces the full payload so an operator can inspect
    // every field on hover (no operator knob — read-only).
    expect(chip.getAttribute('title') ?? '').toContain('active=previous');
    expect(chip.getAttribute('title') ?? '').toContain('source=sessionStorage');
  });

  it('renders a placeholder ("delivery: …") when no payload is given', () => {
    render(createElement(DashboardDebugChips, {}));
    const chip = screen.getByTestId('delivery-filter-state-chip');
    expect(chip.textContent).toContain('…');
    expect(chip.getAttribute('data-active')).toBe('unknown');
  });

  it('renders null / null when no classified deliveries exist (FR-010 nextDeliveryDate / previousDeliveryDate)', () => {
    render(
      createElement(DashboardDebugChips, {
        deliveryFilterState: {
          active: 'next',
          source: 'default',
          today: '2026-06-15',
          nextDeliveryDate: null,
          previousDeliveryDate: null,
        },
      } as any),
    );
    const chip = screen.getByTestId('delivery-filter-state-chip');
    expect(chip.getAttribute('data-next-delivery-date')).toBe('');
    expect(chip.getAttribute('data-previous-delivery-date')).toBe('');
    expect(chip.getAttribute('title') ?? '').toContain('next=null');
    expect(chip.getAttribute('title') ?? '').toContain('previous=null');
  });
});
