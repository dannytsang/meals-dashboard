---
name: dashboard-order-items-previous-next-delivery
description: "Show Order Items by Category with each item tagged as previous or next delivery, derived at render time from deliveryDate vs today without any data sync. Adds an All / Previous / Next filter that defaults to Next so the section always reflects the next-upcoming delivery until the day of, then auto-flips to Previous the day after."
---

# Feature Specification: Dashboard Order Items — Previous / Next Delivery

Feature ID: `034-dashboard-order-items-previous-next-delivery`

Feature Name: Dashboard Order Items — Previous / Next Delivery

Target Skill: `data-science/meals-check`

Created: 2026-06-30

Status: Final

Change history: CHANGELOG.md

## Background

The current "Order Items by Category" section on the meals dashboard (captured in spec 008, lines 68-77, 152-164, 430-484 of `components/dashboard-client.tsx`, with pipeline derivation in `lib/dashboard-data.ts:280-282`) consumes a single `latestOrder: TescoReceipt | null` field — the order blob with the latest `deliveryDate`. There is no UI affordance to inspect items from a *specific* delivery window, and no visual indicator showing whether the items in the list are still upcoming or already delivered.

Danny asked on 2026-06-30 for three things, all derived from a single data assumption:

1. Each visible item must show an indicator of whether it belongs to the **previous** or **next** delivery.
2. A new filter must let Danny switch between **All / Previous / Next** items within the Order Items by Category section.
3. The default view must be **Next** — so on a normal day the section answers "what is coming?".

The harder part Danny flagged is the *time-dependent* behaviour: today, items in the order due today are "Next"; tomorrow, those same items are "Previous". This must happen automatically, without a data sync, without a deploy, and without pipeline changes.

### Why a sync-free auto-flip is achievable on this stack

This is achievable because the dashboard already loads **every order blob in the visible manifest window**, not just the latest one. `lib/dashboard-data.ts:202` (`getDashboardData`) does `Promise.all([..., Promise.all(orderPaths.map((p) => reader.readJsonBlob<OrderBlob>(p)))])`, and `orderPaths` is built from `coverageDeliveryDates` (lines 144-170) plus a windowed set of historical orders. Each fetched order has a `deliveryDate` field (`OrderBlob` interface in `lib/dashboard-sync.ts:72-86`) and the consumer-side code already knows `today` (rendered as a server-injected ISO date and exposed in the client as the `today` variable used throughout `dashboard-client.tsx`).

Concretely, the entire feature is **pure derivation at render time**:

- An order is **Previous** if `deliveryDate < today`.
- An order is **Next** if `deliveryDate >= today` AND an order blob exists for it.
- An order is **Pending Next** if `deliveryDate >= today` AND no order blob exists yet (the gap Danny asked about).
- All orders in `deliveryWindows` (the merged list already exposed to the client) participate; no new fetch path is required.

This means the auto-flip from Next → Previous happens at the *next render*, which for the meals dashboard means the next page load (server component re-runs `getDashboardData`). Danny's "without a data sync" requirement is satisfied because the sync is the loader; the loader already runs on every page load via the Next.js server component model. No new cron, no new pipeline step, no new Vercel Blob write.

### The "gap" question — honest answer

Danny's second concern is the gap between *the next order becoming the previous one* and *a future order becoming the new next one*. The honest answer: until the Tesco order email arrives and the next `tesco_meal_check.py` cron runs and writes a new order blob, there is no next order blob. The dashboard can either:

- (A) Render an empty Next list with a truthful "Pending next delivery — no order email received yet" placeholder row (recommended).
- (B) Fabricate a next-delivery section by guessing contents from the meal plan.

(A) is correct. (B) is dishonest; the dashboard's matcher is for ground-truth grocery coverage, not meal-plan extrapolation. (A) is what this spec implements.

### What this spec is *not*

- **Not** a pipeline or cron change. `tesco_meal_check.py`, `tesco_email_parser.py`, and the email-action monitor cron are untouched.
- **Not** a schema change to `OrderBlob`, `TescoReceipt`, or `DeliveryWindow`. Existing fields are reused.
- **Not** a manual override path. The classification (previous / next / pending-next) is automatic from `deliveryDate` vs `today`. There is no UI to override it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Order Items show Previous / Next indicator and a per-delivery filter (Priority: P1)

As Danny, I want each item in the Order Items by Category section to show a Previous / Next indicator and a section-level filter to switch between All / Previous / Next, so that on any given day I can immediately tell whether the groceries in the list are coming up or already on the kitchen counter.

**Why this priority**: This is the single feature Danny asked for in the 2026-06-30 conversation. The Order Items by Category section is the practical grocery review surface (per spec 008 US-1); without a Previous / Next signal Danny has to cross-reference the delivery date manually against the calendar to know which items are which.

**Independent Test**: Render the dashboard with a fixture containing three orders (a previous order dated 7 days ago, the current next order dated +2 days, and a future order dated +9 days), verify each item in the Order Items by Category section carries a Previous or Next badge tied to its order's `deliveryDate`, verify the section filter defaults to "Next" and switching to "Previous" or "All" updates the list without a page reload, and verify the auto-flip behaviour by changing the rendered `today` to one day after the next order's `deliveryDate` (Next → Previous) and to a date with no next order blob (renders the Pending next delivery placeholder row).

**Acceptance Scenarios**:

1. Given the dashboard has loaded at least one order with `deliveryDate < today`, When the Order Items by Category section renders in its default state, Then the previous-order items are NOT shown (default is Next) and a "Previous delivery ({date})" indicator is absent (because Previous is hidden by default).
2. Given the dashboard has loaded at least one order with `deliveryDate >= today`, When the Order Items by Category section renders in its default state, Then the next-order items are shown and each item row carries a "Next delivery ({date})" badge on the right-hand side of the row, with a visually distinct colour (use `--accent-blue` for Next to match the existing Delivery chip on the Week Meals grid at `dashboard-client.tsx:503`).
3. Given the user clicks the Previous filter chip, When the section re-renders, Then only items from orders where `deliveryDate < today` are shown, the Next badge disappears, and a "Previous delivery ({date})" badge replaces it on each item, using `--accent-emerald` (the delivered/done colour already used elsewhere in the dashboard).
4. Given the user clicks the All filter chip, When the section re-renders, Then items from BOTH previous and next orders are shown, grouped by delivery with a small section header per delivery date ("Delivery {date}" rendered as a sub-heading above its items), and each item carries the appropriate badge.
5. Given the user clicks the Next filter chip, When the section re-renders, Then only items from orders where `deliveryDate >= today` are shown, each item carries the Next badge, and orders without any items (the Pending Next case) render a single placeholder row with text "Pending next delivery — no order email received yet".
6. Given the order list contains TWO future orders (e.g. an in-flight next order with a confirmed email + a further-future order that only exists in the meals-check summary windows), When the Next filter is active, Then items from BOTH future orders are shown, each grouped under its own delivery date sub-heading, with a Next badge carrying that order's specific `deliveryDate`.
7. Given the dashboard renders at a `today` value of `T+1` (one day after the only next order's `deliveryDate`), When the Order Items by Category section renders in its default state, Then the items that were "Next" at `T` are now classified as "Previous" and are hidden by default; the dashboard does NOT need a data sync or refresh to perform this reclassification.
8. Given the dashboard renders at a `today` value with NO order blob having `deliveryDate >= today`, When the section renders in its default state, Then the section shows a single placeholder row "Pending next delivery — no order email received yet" and the All / Previous / Next filter chips remain functional (Previous shows items, All shows items + the placeholder).
9. Given the section's delivery filter is set to Previous, Next, or All, When the user changes the section's existing controls (search query, category chips, match filter, sort), Then the new filter composes with those controls exactly as the existing pipeline specifies in spec 008 — the new filter is the FIRST stage of the pipeline, before category / match / search / sort.
10. Given a previous delivery contains items that should not appear in the active Next view, When the user switches from Previous to Next, Then the items disappear and the visible count changes accordingly; switching back to Previous restores them. The category / search / match / sort state survives the filter switch (per spec 008's pipeline invariant).
11. Given an item has no associated order blob (defensive case — should not occur in practice but the dashboard should not crash), When the section renders, Then the item is omitted from both Previous and Next views and a single debug chip in the dashboard's debug-mode panel reports `items_without_order_blob: N` for visibility.
12. Given the order has a `status` of `cancelled` / `superseded` / `refunded` (per spec 018), When the section renders, Then the items from that order are still shown under whichever filter applies, but the section sub-heading for that delivery reads "Delivery {date} (cancelled)" / "(superseded)" / "(refunded)" so the user can see at a glance the order is no longer active.
13. Given the order has a `deliverySlot` field (e.g. "20:00-21:00"), When the section renders an order sub-heading under the All filter, Then the sub-heading reads "Delivery {date} · {slot}" so the slot window is visible alongside the date.
14. Given the Next filter is active and no order blob exists for any `deliveryDate >= today` AND `mealsCheckSummary.windows.next_delivery` is present and is `>= today`, When the section renders the Pending next delivery placeholder, Then the placeholder text reads exactly "Pending next delivery — no order email received yet (expected {DD MMM})" with the `{DD MMM}` derived from `mealsCheckSummary.windows.next_delivery`; if `next_delivery` is absent or in the past, the placeholder renders without the parenthetical.
15. Given an order with `deliverySlot` "20:00-21:00" and `deliveryDate` "2026-07-02", When the section renders the per-item badge for an item from that order, Then the badge reads "Next · 02 Jul" exactly (date only, no slot, no time). When the section renders the sub-heading under the All filter, Then the sub-heading reads "Delivery 02 Jul 2026 · 20:00-21:00" (date + slot). When the All filter is active and the sub-heading is rendered, Then the sub-heading is a plain `<div>` (NOT a `<button>`, NOT an accordion); clicking the sub-heading does NOT collapse or expand its items. The only expand/collapse affordance in the section is the existing Show all / Collapse button.

### Edge Cases

- No order blobs at all → render the existing empty state (spec 008 FR-005 baseline).
- Exactly one order with `deliveryDate == today` → that order is Next (not Previous). The comparison is `deliveryDate >= today` for Next, `deliveryDate < today` for Previous. This means a delivery arriving *today* is still "Next" until tomorrow's render.
- Order blob fetched but `items` array empty (substitutions + unavailable only) → the section sub-heading still appears under All, but the placeholder row "Delivery {date} — no items in order" replaces the empty item list. Previous / Next filter chips behave normally.
- `today` injected as midnight UTC vs midnight local — the dashboard already canonicalises this in `lib/date-utils.ts` (the `today` value used throughout `dashboard-client.tsx` is a local-time ISO date). This spec does NOT change `today` derivation; it uses the existing `today` variable.
- The order's `deliveryDate` is malformed (not a valid ISO date) → defensive guard: that order is excluded from both Previous and Next views; the section's debug chip reports `orders_with_malformed_delivery_date: N`.
- The order list includes a future-dated order blob (e.g. an unusually early order email for a delivery 3 weeks out) → that order is Next; items render with a Next badge carrying that far-future date. The dashboard does not pre-emptively move it to a "further future" bucket.
- A delivery date is duplicated across multiple order blobs (e.g. an order amended after the initial email) → items from all matching order blobs are rendered together under the same delivery date sub-heading; duplicates are NOT de-duplicated at the item level (the meal coverage matcher may legitimately see the same product twice, e.g. an amended quantity).

## Functional Requirements

- **FR-001**: The Order Items by Category section MUST classify every loaded order blob at render time as one of three states based on `deliveryDate` vs `today`:
  - `previous` when `deliveryDate < today`,
  - `next` when `deliveryDate >= today` AND the order blob exists,
  - `pending-next` when `deliveryDate >= today` AND no order blob exists (derived from `deliveryWindows` entries that have no matching `OrderBlob` in `orderResults`).
  The classification is pure derivation; no new fields are added to `OrderBlob` or `TescoReceipt` and no pipeline writes are introduced.

- **FR-002**: The Order Items by Category section MUST expose a section-level delivery filter with three mutually exclusive options: `previous`, `next`, `all`. The filter MUST be implemented as a stateful client component (the same pattern used for the existing category / match / sort controls), and the default value on first render MUST be `next`.

- **FR-003**: The section MUST persist the user's last-chosen delivery filter across page reloads within the same browser session using `sessionStorage` (key: `meals-dashboard:order-items-delivery-filter`, value: one of `previous` / `next` / `all`, default `next` when the key is absent). The persistence MUST NOT survive a new browser session, MUST NOT introduce a URL query parameter (which would conflict with the existing fixture-mode URL params), and MUST be ignored when debug mode is active and a fixture's `forceDeliveryFilter` override is set.

- **FR-004**: Each item row in the Order Items by Category section MUST display a delivery badge on the right-hand side of the row, immediately to the LEFT of the price column. The badge MUST be a small pill (matching the existing OrderStatusBadge at `components/order-status-badge.tsx`) with one of three label shapes:
  - `Next · {DD MMM}` (e.g. `Next · 02 Jul`) — coloured `--accent-blue`,
  - `Prev · {DD MMM}` (e.g. `Prev · 25 Jun`) — coloured `--accent-emerald`,
  - `Pending` — coloured `--accent-amber`, only shown on the placeholder row.
  The badge MUST be `aria-label`-annotated (e.g. `aria-label="Next delivery on 02 Jul"`) for screen-reader users.

- **FR-005**: When the All filter is active and more than one order is visible, the section MUST render a small sub-heading above each order's items reading `Delivery {DD MMM YYYY} · {slot}` (e.g. `Delivery 02 Jul 2026 · 20:00–21:00`). When the order has a non-`active` status (cancelled / superseded / refunded per spec 018), the sub-heading MUST append that status in parentheses: `Delivery 02 Jul 2026 · 20:00–21:00 (cancelled)`. The sub-heading MUST render between the existing category chips and the item rows, and MUST NOT be repeated for the same delivery date even if multiple order blobs exist for that date (per edge case above).

- **FR-006**: When the Next filter is active and no order blob exists for any `deliveryDate >= today`, the section MUST render a single placeholder row in place of the item list, reading `Pending next delivery — no order email received yet`, with the `Pending` badge from FR-004. If `mealsCheckSummary.windows.next_delivery` is available and is `>= today`, the placeholder MUST append the expected date as `(expected {DD MMM})` (e.g. `Pending next delivery — no order email received yet (expected 03 Jul)`); if `next_delivery` is absent or in the past, the placeholder MUST render without the parenthetical. The placeholder MUST NOT count toward the Show all / Collapse count (FR-007) and MUST be replaced by the actual item rows as soon as the next `tesco_meal_check.py` cron publishes a new order blob.

- **FR-007**: The existing Show all / Collapse behaviour from spec 008 FR-005 MUST apply to the filtered + sorted item set after the delivery filter has been applied. The visible-count window MUST operate per-delivery when the All filter is active and more than one delivery is visible: the section shows the top N items from the *earliest* delivery first, with the next delivery's items hidden until Show all is clicked. When only one delivery is visible (Previous or Next filter with exactly one matching order), the existing single-window behaviour from spec 008 FR-005 applies unchanged.

- **FR-008**: The delivery filter MUST compose with the existing search / category / match / sort pipeline from spec 008 as the FIRST stage. The revised pipeline is:
  1. Apply the delivery filter (`previous` / `next` / `all`) — new step.
  2. Apply the category chips and match-state filter (spec 008 step 1).
  3. Apply the normalised search query over cleaned item names + relevant item metadata (spec 008 step 2).
  4. Apply the selected sort (spec 008 step 3).
  5. Apply the visible-count window, with the per-delivery grouping from FR-007 (spec 008 step 4, modified).
  The implementation MUST NOT alter steps 2-5 of the existing pipeline; the delivery filter is prepended.

- **FR-009**: The auto-flip behaviour MUST be a pure derivation at render time. There MUST be no `useEffect` that watches `today` and triggers a state change; no `setInterval` that polls the current date; no client-side timer that re-flips the badge after midnight. The classification reads `today` at the moment of render, and a re-render (page reload, Next.js `router.refresh()`, or state change triggered by another component) is what performs the reclassification. This is consistent with the meals dashboard's existing server-component-on-reload model and avoids the time-zone ambiguity of client-side timers.

- **FR-010**: The dashboard's debug-mode `BlobReadFreshness` panel and `ItemsByCategoryDebug` panel MUST each gain a new field `deliveryFilterState: { active: 'previous'|'next'|'all', source: 'sessionStorage'|'default'|'fixture-override', today, nextDeliveryDate, previousDeliveryDate }` so an operator can verify the filter is reading the expected values at a glance. The field MUST be rendered as a read-only chip in the existing chip list, with no operator-facing knob (per spec 022's debug-mode-is-read-only rule).

- **FR-011**: The meals-check skill's `skill.spec.yaml` MUST be updated to add spec 034 to the `expected_artifacts` list under the dashboard-UI features group, alongside spec 008, 010, and 031. The `index.yaml` entry for spec 034 MUST be added in the same chef-profile commit as the spec body (per the spec-driven-skills `index.yaml` discipline).

- **FR-012**: A regression test in `components/dashboard-client.test.tsx` (or a new sibling file) MUST assert the following pipeline behaviours:
  - With two order fixtures (one previous, one next), the default render shows only the next order's items.
  - Setting the delivery filter to `previous` shows only the previous order's items.
  - Setting the delivery filter to `all` shows both, grouped under sub-headings.
  - Changing the fixture's `today` to one day after the next order's `deliveryDate` reclassifies that order's items as Previous.
  - With no future order blob, the Next filter renders the Pending next delivery placeholder row.
  - The delivery filter composes correctly with category chips, match filter, search query, and sort (verified by inspecting the `displayItems` pipeline output).
  These tests MUST slot into the existing `describe('Order Items by Category')` block where one exists, or a new `describe` block of the same name in a sibling file.

## Non-Functional Requirements

- **NFR-001**: The classification derivation MUST add no measurable render-time overhead. The current `lib/dashboard-data.ts` loader runs `validOrders.sort(...)` once and picks the latest; the new derivation runs an O(n) classification over the same `validOrders` array plus an O(m) cross-reference with `deliveryWindows` for the pending-next case, where n is the number of visible-window order blobs (≤ 4 in practice) and m is the number of delivery-window entries (≤ 4). Total added work: ≤ 16 comparisons per render. No new fetches, no new blob reads.
- **NFR-002**: The sessionStorage persistence from FR-003 MUST NOT survive a browser close and MUST NOT leak across browser profiles. The `sessionStorage` API satisfies both; do not migrate to `localStorage` for "convenience" — it would cause stale-filter problems across multi-day sessions.
- **NFR-003**: The badge MUST be visually distinguishable for users with red-green colour blindness. Use both colour AND an icon (Next → ↓ arrow; Prev → ✓ checkmark; Pending → ⏱ clock) so the badge is colour-blind-safe. The implementation MUST use the existing icon set from `lucide-react` already imported elsewhere in the dashboard; no new icon library.
- **NFR-004**: The sub-heading from FR-005 MUST NOT introduce a new heading level that breaks the existing screen-reader navigation order. The sub-heading is a `<div>` with `role="heading"` and `aria-level="4"`; it MUST NOT be an `<h4>` because that would push the section's main heading (currently `<h3>`) out of the navigation tree.

## Key Entities

- **Delivery Classification** (new): a runtime value `'previous' | 'next' | 'pending-next'` derived per-order-blob at render time. Lives in component state only; not persisted to `OrderBlob`, `TescoReceipt`, `DeliveryWindow`, or any blob.
- **Delivery Filter State** (new): a single client-side state value in the Order Items by Category section, type `'previous' | 'next' | 'all'`, default `'next'`, persisted to `sessionStorage` per FR-003.
- **Delivery Badge** (new): the per-item pill rendered on the right-hand side of each item row. Shape per FR-004. Lives in component render only.
- **Delivery Sub-Heading** (new): the per-delivery heading rendered when the All filter surfaces multiple orders. Shape per FR-005. Lives in component render only.
- **Pending Next Placeholder** (new): the single placeholder row rendered when no future order blob exists. Shape per FR-006. Lives in component render only.
- **`OrderBlob.deliveryDate`** (existing, reused): the canonical delivery-date field on the order blob. Already used in `dashboard-data.ts:280-282` for the latest-order sort; this spec reuses it for the per-order classification.
- **`DeliveryWindow.date`** (existing, reused): the canonical delivery-date field on the delivery-window summary. Already merged into the merged `deliveryWindows` array at `dashboard-data.ts:316-330`. Used in FR-001's pending-next detection (a `deliveryWindow.date >= today` with no matching `OrderBlob` is pending-next).
- **`today`** (existing, reused): the dashboard's already-canonicalised local-time ISO date string, computed server-side and injected as a prop. Already used in `dashboard-client.tsx` for the Week Meals grid (line 414, line 486), the manual override path (line 132), and other places. This spec reuses it for the per-order classification.

## Contract Impact

- **Module surface**:
  - `components/dashboard-client.tsx` — new section-level state for delivery filter; new `useMemo` derivation of per-order classification; new badge / sub-heading / placeholder JSX. Estimated diff: 80-120 lines added, 0 lines removed.
  - `lib/item-utils.ts` (existing pipeline) — new exported helper `classifyOrderItemsByDelivery(items, orders, deliveryWindows, today)` returning `{ previous: OrderGroup[], next: OrderGroup[], pendingNext: Date[] }`. The function is pure and unit-testable.
  - `components/dashboard-client.test.tsx` or new sibling — regression tests per FR-012.
- **Untouched files** (so reviewers can grep-confirm):
  - `lib/dashboard-data.ts` — no loader changes. The classification is client-side; the loader continues to expose `latestOrder`, `deliveryWindows`, etc. unchanged.
  - `lib/dashboard-sync.ts` — no schema changes.
  - `lib/meals-data.ts` — no type changes.
  - `lib/blob-storage.ts` — no read-path changes.
  - `app/page.tsx`, `app/api/*`, `middleware.ts`, `next.config.ts` — untouched.
  - All Python pipeline scripts under `/home/hermes/.hermes/scripts/` (`tesco_meal_check.py`, `tesco_matcher.py`, `tesco_email_parser.py`, `tesco_report.py`) — untouched.
  - All cron wrappers, the email-action monitor, the meals-hook — untouched.
- **New env vars**: None.
- **No new secrets at runtime**: confirmed.
- **No new Vercel Blob namespaces**: confirmed.

## Open Questions

_None — all three open questions were resolved by Danny on 2026-06-30. See the **Clarifications** section below._

## Verification Plan

- **Unit tests** (FR-012): add the seven pipeline assertions to `components/dashboard-client.test.tsx` (or a new sibling). Use the existing test fixtures in `lib/fixtures/dashboard-fixture.json`; if a two-delivery fixture does not exist, extend the fixture generator at `lib/fixtures/scripts/generate-fixture.mjs` to emit one for the regression test (per the fixture-authoring conventions documented in spec 024).
- **Integration smoke test**: spin up the dashboard on `npm run dev` against the live `dashboard_cache.json`, load `http://localhost:3000`, verify (a) the Order Items by Category section shows only the next-delivery items by default, (b) each item carries a Next badge with the next-delivery date, (c) clicking the Previous chip switches to the previous-delivery items with a Prev badge, (d) clicking All shows both grouped under sub-headings, (e) reloading the page preserves the filter via sessionStorage.
- **Time-machine smoke test** (FR-007, FR-009): add a temporary `?delivery_date_offset=1` query param to the dashboard's debug mode that shifts the `today` value by N days for testing purposes only; verify that with offset=1 the items previously classified as Next are now classified as Previous. **The query param MUST be debug-only and stripped from the URL when debug mode is off**; it MUST NOT be exposed in production. The implementation can use the existing `debugCookie` from `lib/debug-cookie.ts` to gate the param.
- **Pipeline regression test**: `python3 -m unittest test_tesco_matcher -v` from `/home/hermes/.hermes/scripts` — confirm no matcher regressions (the spec touches the dashboard UI, not the pipeline, but a green run is the cheapest assurance that nothing leaked).
- **Spec validator**: `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — must end with `No issues found.`.
- **Bundle invariant**: `grep -r "deliveryFilter\|classifyOrderItemsByDelivery\|PreviousDeliveryBadge\|NextDeliveryBadge" components/ lib/ app/` — must return only the files listed under "Module surface" above. If the grep returns a Python file or a cron wrapper, that is a scope leak and MUST be reverted.

## Reference Material

- **Spec 008** (`008-dashboard-order-items/spec.md`) — the parent spec. The pipeline in spec 008 is extended (not replaced) by FR-008 above; the search / category / match / sort stages are unchanged. The Show all / Collapse behaviour in spec 008 is extended by FR-007 above.
- **Spec 016** (`016-dashboard-blob-storage-layout/spec.md`) — defines the order blob path scheme `orders/{date}/{num}.json` and the manifest entries. This spec reuses the existing fetch path and adds no new blob namespaces.
- **Spec 017** (`017-dashboard-blob-read-path/spec.md`) — the read path that fetches every visible-window order blob. The new classification runs on top of this read path's output.
- **Spec 018** (`018-dashboard-order-status-tracking/spec.md`) — defines the `OrderBlob.status` field (`active` / `cancelled` / `superseded` / `refunded`) and the badge colour mapping. FR-005 of this spec reuses the status field for the sub-heading parenthetical; no change to spec 018.
- **Spec 024** (`024-dashboard-static-fixture-mode-for-preview/spec.md`) — defines the static fixture mode that the verification plan's fixture-based regression test relies on. The fixture generator at `lib/fixtures/scripts/generate-fixture.mjs` is extended (not replaced) to emit a two-delivery fixture.
- **Spec 022** (`022-dashboard-debug-mode/spec.md`) — the debug-mode-only `?delivery_date_offset=` query param in the verification plan follows spec 022's debug-only-read-only rule. No operator-facing knob is exposed.
- **`components/dashboard-client.tsx:68-77, 152-164, 430-484, 585-700`** — current Order Items by Category section, controls, search input, category chips, match filter, sort buttons, and item rows. This spec's diff lands inside this section.
- **`lib/dashboard-data.ts:202, 280-282, 316-330`** — the loader's order-blob fetch, latest-order sort, and deliveryWindows merge. This spec adds a client-side classification layer on top of these existing surfaces; no loader changes.
- **`lib/dashboard-sync.ts:72-86`** — the `OrderBlob` interface. This spec reuses `deliveryDate` (line 74) without modification.
- **`lib/meals-data.ts:183-189`** — the `DeliveryWindow` interface. This spec reuses `date` (line 184) without modification.

## Promotion Criteria for Final

This spec remains at `Status: Proposed, readiness: spec_only` until the implementation is **deployed to the production meals-dashboard Vercel environment** with the regression tests passing in CI and the time-machine smoke test verified by Danny on the preview URL.

The status flips to `Final` and `readiness` to `already_satisfied` only when **all** of the following are verified against the production deployment:

- [ ] `npm run test` (Vitest) passes with the seven pipeline assertions from FR-012 added.
- [ ] `python3 -m unittest test_tesco_matcher -v` still passes (no matcher regression).
- [ ] `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` ends with `No issues found.`.
- [ ] The bundle-invariant grep returns only the four files listed under "Module surface" above (no scope leak).
- [ ] Vercel dashboard `https://meals-dashboard.vercel.app` shows the new badge / filter / sub-heading on the production deployment.
- [ ] Danny exercises the production URL on (a) the day of a delivery, (b) the day after a delivery, and (c) a day with no upcoming order blob, and confirms the auto-flip behaviour matches the spec.
- [ ] The `BlobReadFreshness` and `ItemsByCategoryDebug` debug panels show the new `deliveryFilterState` field per FR-010.
- [ ] The three Open Questions resolved on 2026-06-30 are reflected in the implementation (no collapsible sub-headings, date-only badge, expected-date placeholder per FR-006).

This rule aligns with the spec-driven-skills convention that `Final` status reflects verified runtime evidence in the live consumer deployment, not a closed task checklist. Danny confirmed on 2026-06-17: "the code should end up in production so its not finalised until its in production".

## Clarifications

### Session 2026-06-30 — All-filter sub-heading collapsibility, badge slot window, pending placeholder expected date

- Q: Should the All filter's sub-headings be independently collapsible? → A: **No.** The existing single Show all / Collapse button covers the whole-section case; per-delivery collapsing is YAGNI complexity that conflicts with the dashboard's existing single-window UX. The sub-heading is a visual divider, not a collapsible accordion. Codified in FR-005 ("a small sub-heading", no `aria-expanded` / no collapse affordance).
- Q: Should the per-item badge include the slot window inline (`Next · 02 Jul · 20:00`) or only on the All-filter sub-heading? → A: **Date only on the badge, slot on the sub-heading.** The per-item badge must stay compact because rows are dense; the slot window appears on the sub-heading where there is room (FR-005). FR-004's badge shape (`Next · {DD MMM}`) is the canonical format — slot is omitted by design.
- Q: Should the Pending next delivery placeholder show the expected date from `mealsCheckSummary.windows.next_delivery`? → A: **Yes.** When `next_delivery >= today`, append `(expected {DD MMM})` to the placeholder text (FR-006). When `next_delivery` is absent or in the past, render without the parenthetical. The summary window is already exposed via `DashboardBlobData.mealsCheckSummary`, so this is a zero-cost rendering decision that closes the gap honestly.