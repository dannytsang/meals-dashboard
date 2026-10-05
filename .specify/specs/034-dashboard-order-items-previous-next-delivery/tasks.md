# Tasks: Dashboard Order Items — Previous / Next Delivery

Status: Draft
Feature: 034-dashboard-order-items-previous-next-delivery
Skill: data-science/meals-check

Tasks are sequenced by phase. A task is "done" when its acceptance criteria pass and the diff matches the listed file paths. Phases 1-5 are owned by the **coder profile** (per Danny's standing 2026-06-26 rule); Phase 6 (deployment gate) is the chef-profile re-verification.

## Phase 1 — Pure derivation helper (TDD red → green)

- [ ] **T010** [FR-001, FR-012] Add unit tests for `classifyOrderItemsByDelivery(items, orders, deliveryWindows, today)` in a new `lib/item-utils.test.ts` describe block (or extend the existing one if it exists). Cover:
  - `test_classify_single_next_order`: one order with `deliveryDate == today + 2` → next, not previous, not pending.
  - `test_classify_single_previous_order`: one order with `deliveryDate == today - 7` → previous, not next, not pending.
  - `test_classify_mixed_previous_and_next`: one previous + one next → both buckets populated, All would yield both.
  - `test_classify_pending_next_with_window_only`: `deliveryWindow.date == today + 2`, no matching `OrderBlob` → pending-next entry with `order: null`.
  - `test_classify_today_is_next`: order with `deliveryDate == today` → next (the comparison is `deliveryDate >= today`).
  - `test_classify_handles_malformed_delivery_date`: order with `deliveryDate === 'not-a-date'` → excluded silently, no throw.
  - `test_classify_handles_cancelled_status`: order with `status: 'cancelled'` → still classified (next or previous by date) with `status` exposed in the group.
  - `test_classify_sorts_within_bucket_ascending`: two previous orders → sorted earliest first within the `previous` bucket.
  - **Acceptance criterion**: `npm run test -- item-utils` shows all new tests RED before Phase 1 implementation; GREEN after Phase 1 implementation.

- [ ] **T020** [FR-001] Implement `classifyOrderItemsByDelivery` in `lib/item-utils.ts`. Pure function, no React state, no side effects. Signature per `plan.md` Phase 1.
  - **Acceptance criterion**: T010's tests pass green.
  - **Acceptance criterion**: function exports a non-default export named `classifyOrderItemsByDelivery`.

## Phase 2 — Component integration

- [ ] **T030** [FR-002] Add `useState<'previous' | 'next' | 'all'>('next')` for the section-level delivery filter in `components/dashboard-client.tsx`. Wire the state default to `next` per FR-002.
  - **Acceptance criterion**: the section renders only next-delivery items on first load.

- [ ] **T031** [FR-003] Add the two `useEffect`s for sessionStorage persistence. Key: `meals-dashboard:order-items-delivery-filter`. Hydrate on first render; persist on every change. No-ops if `typeof window === 'undefined'` (SSR safety).
  - **Acceptance criterion**: reload-the-page preserves the user's last filter choice within the same session.

- [ ] **T032** [FR-008] Add the `useMemo` derivation that calls `classifyOrderItemsByDelivery` with the new `validOrders` prop, the existing `deliveryWindows` prop, and the existing `today` value. Insert the result into the existing pipeline as the FIRST stage per FR-008.
  - **Acceptance criterion**: the visible item list reflects the delivery filter FIRST, then category / match / search / sort.

- [ ] **T033** [FR-002] Add the three filter chips (All / Previous / Next) to the controls grid in `dashboard-client.tsx`. Place them after the existing Sort column (or in a new row below if the existing grid is already at maximum width — fall back to a flex-wrap layout per spec 008 FR-008's wrap behaviour).
  - **Acceptance criterion**: the three chips are visible, clickable, and mutually exclusive.

- [ ] **T034** [FR-004] Add the per-item delivery badge. New local component `DeliveryBadge` in `components/delivery-badge.tsx` (separate file for testability and to keep `dashboard-client.tsx` from growing further). Props: `classification: 'previous' | 'next' | 'pending'`, `deliveryDate: string`, optional `deliverySlot?: string`. Renders the pill with the colour and icon per FR-004 + NFR-003.
  - **Acceptance criterion**: each item row shows the badge to the LEFT of the price column.
  - **Acceptance criterion**: badge has `aria-label` matching FR-004's shape.

- [ ] **T035** [FR-005] Add the per-delivery sub-heading. When the All filter is active and more than one order is visible, insert `<div role="heading" aria-level="4">Delivery {DD MMM YYYY} · {slot}{status ? ` (${status})` : ''}</div>` between orders in the item-list container.
  - **Acceptance criterion**: NFR-004's screen-reader navigation is preserved (the new heading is `aria-level="4"`, not `<h4>`).

- [ ] **T036** [FR-006] Add the Pending next delivery placeholder row. When the Next filter is active and `next` is empty, render a single placeholder with the `Pending` badge per FR-004 and the text "Pending next delivery — no order email received yet" (or with the optional "(expected {DD MMM})" suffix if Open Question 3 is resolved in favour).
  - **Acceptance criterion**: the placeholder renders in place of (not in addition to) the empty item list.

## Phase 3 — Loader surface change

- [ ] **T040** [FR-008] Add `validOrders: OrderBlob[]` to the `DashboardData` interface in `lib/dashboard-data.ts:57-65`. Update `getDashboardData` to expose the full `validOrders` array (currently filtered to `latestOrder`). The `latestOrder` field stays unchanged for backward compatibility with all other consumers.
  - **Acceptance criterion**: TypeScript compilation succeeds; no other consumer breaks.
  - **Acceptance criterion**: `validOrders` is exposed alongside `latestOrder` in the page prop type.

## Phase 4 — Debug-mode chip + regression tests

- [ ] **T050** [FR-010] Add the `deliveryFilterState` chip to `components/dashboard-debug-chips.tsx`. Read the active filter, the source (`sessionStorage` / `default` / `fixture-override`), the current `today`, and the next / previous delivery dates from props.
  - **Acceptance criterion**: the chip renders in the debug-mode panel with all five fields per FR-010.

- [ ] **T051** [FR-012] Add the seven Vitest assertions from spec.md FR-012 to `components/dashboard-client.test.tsx` (or a new sibling file). Use the existing fixture from `lib/fixtures/dashboard-fixture.json` if it has two orders; otherwise extend the fixture generator per Phase 4a.
  - **Acceptance criterion**: `npm run test -- dashboard-client` shows the seven assertions GREEN.
  - **Acceptance criterion**: the existing `describe('Order Items by Category')` tests still pass (no regression).

- [ ] **T052** [FR-012, FR-010] Add a two-delivery fixture to `lib/fixtures/dashboard-fixture.json` if one does not exist. Modify `lib/fixtures/scripts/generate-fixture.mjs` to emit a fixture with one previous order (7 days ago) and one next order (+2 days), so the regression test has the two-order shape it needs.
  - **Acceptance criterion**: the generated fixture contains two orders with the expected `deliveryDate` values; `npm run test -- dashboard-client` passes the new assertions against it.

## Phase 5 — Time-machine smoke test (debug-only)

- [ ] **T060** [FR-009] Add a `?delivery_date_offset=N` query param handler in the dashboard's debug-mode path. Gate on the existing `debugCookie` from `lib/debug-cookie.ts`. The handler shifts the `today` value by N days for testing purposes only. No-op when debug mode is off.
  - **Acceptance criterion**: with `?delivery_date_offset=1` and debug mode on, the dashboard renders as if `today` is one day later; the Next items are now classified as Previous.
  - **Acceptance criterion**: with `?delivery_date_offset=1` and debug mode OFF, the param is ignored (no shift).

## Phase 6 — End-to-end verification + production deploy

- [ ] **T070** [FR-001..FR-012, NFR-001..NFR-004] Run the full verification suite per spec.md Verification Plan:
  - `npm run test` — all Vitest assertions green, including the seven new ones from T051.
  - `python3 -m unittest test_tesco_matcher -v` — green, no matcher regression.
  - `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — `No issues found.`.
  - `grep -r "deliveryFilter\|classifyOrderItemsByDelivery\|DeliveryBadge" components/ lib/ app/` — returns only the files in the Module Surface section.
  - `cd /home/hermes/workspace/meals-dashboard && npm run dev` — local preview.
  - Danny exercises the preview URL on three dates (delivery day, day-after, no-future-blob day) and signs off.
  - Vercel production deploy + Danny re-verifies on the production URL.
  - All eight Promotion Criteria items checked off.
- **Acceptance criterion**: spec status flips from `Draft` → `Final` and `readiness` flips from `spec_only` → `already_satisfied` in `index.yaml` and `skill.spec.yaml` in the chef-profile commit.