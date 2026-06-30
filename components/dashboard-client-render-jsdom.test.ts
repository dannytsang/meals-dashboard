/**
 * Spec 010 Rev 4 (FR-003) + Rev 5 (FR-010) + Rev 5.1 (FR-011) —
 * component-level jsdom rendering verification.
 *
 * Dispatched from the chef profile (option B). Five scenarios target
 * actual React component rendering under @testing-library/react +
 * jsdom (not source-string matches like the existing dashboard-client
 * static tests).
 *
 *  1. Modal renders truthful placeholder when item.productMetadata
 *     is null or its description is empty (no deleted-strings leak).
 *  2. DebugProductResolutionChip is ABSENT when debugOn is false.
 *  3. Chip is PRESENT and shows apollo + ✓ match when payload is
 *     apollo + paths agree.
 *  4. Chip shows ✗ found <actual> when itemBlobPath is drifted.
 *  5. Chip shows (unknown — tpnc not resolved) when itemTpnc is null.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DashboardClient } from './dashboard-client';
import type { DashboardData } from '@/lib/dashboard-data';
import type { ProductResolutionDebugPayload } from '@/lib/debug-observability';
import type { OrderBlob } from '@/lib/dashboard-sync';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  // Spec 034 / FR-009 — dashboard-client now calls useSearchParams
  // to read the optional ?delivery_date_offset=N param. The jsdom
  // scenarios in this file do not exercise the time-machine path,
  // so the mock just returns an empty URLSearchParams — same shape
  // Next.js returns when no query params are present.
  useSearchParams: () => new URLSearchParams(),
}));

function makeBaseData(overrides?: Partial<DashboardData>): DashboardData {
  // Spec 034 / FR-008 — the Order Items by Category section now
  // classifies items via `validOrders` (via `classifyOrderItemsByDelivery`)
  // rather than reading `latestOrder.items` directly. The spec 010
  // scenarios below put the test order in `latestOrder` (which the modal
  // path still uses via `transformCachedOrderSafely`), so we mirror the
  // same shape into `validOrders` here. When a test overrides
  // `latestOrder` only, the mirror is recomputed inside `makeBaseData`
  // before the `...overrides` spread — but the simpler shape below just
  // emits an empty `validOrders` for the default case; tests that need
  // items in the row renderer override `validOrders` directly (scenarios
  // 1a/1b/2-5 all rely on the same default `Tesco Blueberries 150G`
  // item being classified as 'next' so it appears in the Order Items
  // list under the default Next filter).
  const today = '2026-06-12';
  const defaultOrder: OrderBlob = {
    orderNumber: '123',
    deliveryDate: today,
    deliverySlot: 'Evening',
    orderTotal: 5.55,
    items: [
      { name: 'Tesco Blueberries 150G', quantity: 1, price: 2, category: 'Fresh' },
    ],
    substitutions: [],
    unavailable: [],
    shortLifeItems: [],
  };
  const base: DashboardData = {
    coverage: [
      {
        meal: { id: '1', content: 'Broccoli pasta', date: '2026-06-12', labels: [], section: 'Planned' },
        status: 'covered',
        coverageScore: 100,
        matchedItems: [],
        missingItems: [],
      },
    ],
    deliveryWindows: [],
    latestOrder: defaultOrder as unknown as DashboardData['latestOrder'],
    mealsCheckSummary: null,
    dataGeneratedAt: '2026-06-12T00:00:00Z',
    uiUpdatedAt: '2026-06-12T00:00:00Z',
    loadError: null,
    products: {},
    validOrders: [defaultOrder],
  };
  // If the caller overrides `latestOrder` but not `validOrders`, mirror
  // the new latestOrder into validOrders so the row renderer can find
  // the items via the spec 034 classification pipeline.
  const merged: DashboardData = {
    ...base,
    ...overrides,
  };
  if (overrides && overrides.latestOrder && !overrides.validOrders) {
    merged.validOrders = [overrides.latestOrder as unknown as OrderBlob];
  }
  return merged;
}

const basePayload: ProductResolutionDebugPayload = {
  itemName: 'Tesco Blueberries 150G',
  itemTpnc: '12345',
  itemBlobPath: 'products/12345.json',
  title: 'Tesco Blueberries 150G',
  description: 'A punnet of blueberries.',
  storage: 'Keep refrigerated.',
  preparation: 'Rinse before eating.',
  ingredients: 'Blueberries.',
  allergens: 'None.',
  nutrition: 'Energy 45kcal per 100g.',
  image: 'https://example.test/blueberries.jpg',
  productSource: 'apollo',
  descriptionSource: 'apollo',
  fieldSources: { description: 'apollo', image: 'apollo', storage: 'apollo', preparation: 'apollo' },
  freshness: { lastFetched: '2026-06-12T00:00:00Z', firecrawlLastFetched: undefined },
  provenance: { generated: true, local: false, firecrawl: false, firecrawlStatus: null },
  expectedProductBlobPath: 'products/12345.json',
  productBlobPathMatch: true,
};

function mockFetchJson(payload: ProductResolutionDebugPayload | null) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/debug/product-resolution')) {
      if (payload === null) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
}

function openModalForFirstItem() {
  // The "Order Items" panel renders each unmatched item as a clickable
  // div with the product name inside a span. Click it to open the
  // product info modal (sets `selectedItem` state).
  const item = screen.getByText('Tesco Blueberries 150G');
  fireEvent.click(item);
}

describe('DashboardClient modal truthful placeholder (Spec 010 Rev 4 / FR-003) — jsdom', () => {
  beforeEach(() => {
    // Default: debug off, no fetch mock needed
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it('Scenario 1a: modal renders "Product information not available in generated data." when productMetadata is absent', async () => {
    const data = makeBaseData({
      latestOrder: {
        orderNumber: '123',
        deliveryDate: '2026-06-12',
        deliverySlot: 'Evening',
        orderTotal: 5.55,
        items: [
          { name: 'Unknown Snack Pack', quantity: 1, price: 2, category: 'Fresh' },
        ],
        substitutions: [],
        unavailable: [],
        shortLifeItems: [],
      },
    });
    render(createElement(DashboardClient, { today: '2026-06-12', data, userName: 'Danny' }));
    fireEvent.click(screen.getByText('Unknown Snack Pack'));

    const html = document.body.innerHTML;
    expect(html).toContain('Product information not available in generated data.');
    // No deleted-strings leak
    expect(html).not.toMatch(/curated-static/);
    expect(html).not.toMatch(/productDatabase/);
    expect(html).not.toMatch(/findProductInfo/);
  });

  it('Scenario 1b: modal renders the truthful placeholder when productMetadata.description is empty string', async () => {
    const data = makeBaseData({
      latestOrder: {
        orderNumber: '123',
        deliveryDate: '2026-06-12',
        deliverySlot: 'Evening',
        orderTotal: 5.55,
        items: [
          {
            name: 'Empty Desc Item',
            quantity: 1,
            price: 2,
            category: 'Fresh',
            productMetadata: {
              title: 'Empty Desc Item',
              description: '',
            },
          },
        ],
        substitutions: [],
        unavailable: [],
        shortLifeItems: [],
      },
    });
    render(createElement(DashboardClient, { today: '2026-06-12', data, userName: 'Danny' }));
    fireEvent.click(screen.getByText('Empty Desc Item'));

    const html = document.body.innerHTML;
    expect(html).toContain('Product information not available in generated data.');
    expect(html).not.toMatch(/curated-static/);
    expect(html).not.toMatch(/productDatabase/);
    expect(html).not.toMatch(/findProductInfo/);
  });
});

describe('DashboardClient debug chip gate (Spec 010 Rev 5 / FR-010) — jsdom', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Scenario 2: DebugProductResolutionChip is ABSENT from the rendered DOM when debugOn is false (regardless of payload)', async () => {
    const data = makeBaseData();
    // Even with debugOn=false the fetch should never be issued, but we
    // mock it just in case to assert no payload is rendered.
    const fetchSpy = mockFetchJson(basePayload);

    render(createElement(DashboardClient, { today: '2026-06-12', data, userName: 'Danny', debugOn: false }));
    fireEvent.click(screen.getByText('Tesco Blueberries 150G'));

    // The modal should be open but the chip must NOT be present.
    // Give React a tick to apply any state updates from the effect.
    await new Promise((r) => setTimeout(r, 50));

    expect(document.body.querySelector('[data-testid="product-resolution-chip"]')).toBeNull();

    // Fetch should never have been called when debugOn is false (the
    // useEffect short-circuits).
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('DashboardClient debug chip rendering (Spec 010 Rev 5 / Rev 5.1) — jsdom', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Scenario 3: chip is PRESENT and renders apollo + ✓ match when paths agree', async () => {
    mockFetchJson(basePayload);
    const data = makeBaseData();
    const { container } = render(
      createElement(DashboardClient, { today: '2026-06-12', data, userName: 'Danny', debugOn: true })
    );
    openModalForFirstItem();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="product-resolution-chip"]')).not.toBeNull();
    });

    const chip = container.querySelector('[data-testid="product-resolution-chip"]') as HTMLElement;
    expect(chip).toBeTruthy();
    // descriptionSource label visible
    expect(chip.textContent).toMatch(/descriptionSource/);
    expect(chip.textContent).toMatch(/apollo/);
    // expected-vs-actual block: ✓ match (using unicode ✓)
    expect(chip.textContent).toMatch(/✓\s*match/);
  });

  it('Scenario 4: chip shows ✗ found <actual> when itemBlobPath is drifted', async () => {
    const driftedPayload: ProductResolutionDebugPayload = {
      ...basePayload,
      itemTpnc: '12345',
      itemBlobPath: 'products/legacy/12345.json',
      expectedProductBlobPath: 'products/12345.json',
      productBlobPathMatch: false,
    };
    mockFetchJson(driftedPayload);
    const data = makeBaseData();
    const { container } = render(
      createElement(DashboardClient, { today: '2026-06-12', data, userName: 'Danny', debugOn: true })
    );
    openModalForFirstItem();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="product-resolution-chip"]')).not.toBeNull();
    });

    const chip = container.querySelector('[data-testid="product-resolution-chip"]') as HTMLElement;
    expect(chip.textContent).toMatch(/✗\s*found\s+products\/legacy\/12345\.json/);
  });

  it('Scenario 5: chip shows "(unknown — tpnc not resolved)" when itemTpnc is null and expectedProductBlobPath is null', async () => {
    const nullTpncPayload: ProductResolutionDebugPayload = {
      ...basePayload,
      itemTpnc: null,
      itemBlobPath: null,
      descriptionSource: 'placeholder',
      productSource: 'placeholder',
      fieldSources: { description: 'placeholder', image: 'placeholder', storage: 'placeholder', preparation: 'placeholder' },
      provenance: { generated: false, local: false, firecrawl: false, firecrawlStatus: null },
      expectedProductBlobPath: null,
      productBlobPathMatch: null,
    };
    mockFetchJson(nullTpncPayload);
    const data = makeBaseData();
    const { container } = render(
      createElement(DashboardClient, { today: '2026-06-12', data, userName: 'Danny', debugOn: true })
    );
    openModalForFirstItem();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="product-resolution-chip"]')).not.toBeNull();
    });

    const chip = container.querySelector('[data-testid="product-resolution-chip"]') as HTMLElement;
    // The unknown-tpnc label is rendered.
    expect(chip.textContent).toMatch(/unknown\s+—\s+tpnc not resolved/);
    // The em-dash in the spec is U+2014 — confirm.
    expect(chip.textContent).toContain('—');
    // expectedProductBlobPath displays as null (rendered as the literal string 'null'
    // OR — per the source — the entire (unknown — tpnc not resolved) sub-block, with
    // no `✓ match` or `✗ found <actual>` showing.
    expect(chip.textContent).not.toMatch(/✓\s*match/);
    expect(chip.textContent).not.toMatch(/✗\s*found/);
  });
});