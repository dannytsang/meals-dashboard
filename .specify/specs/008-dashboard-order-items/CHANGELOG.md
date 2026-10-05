# Change Log: Dashboard Order Items

Feature ID: `008-dashboard-order-items`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or “why did this change?” questions.

## Entries

### 2026-06-20 — Finalized search clear button

- Change: Implemented the Order Items by Category search clear button so it appears when the query is non-empty, clears only the search text, restores focus to the search field, and preserves category/matched-state/sort/visible-count state.
- Status after change: Final
- Rationale: Danny requested the clear affordance after the client-side search refinement had already shipped.
- Implementation impact: Dashboard client state and regression tests were updated; the clear control now lives alongside the search input in `components/dashboard-client.tsx` and does not alter the other Order Items controls.
- Evidence: meals-dashboard commit `b91de00` pushed to `origin/main`; `npx vitest run components/auth-signin-page.test.ts components/dashboard-client.test.ts`, `npm test`, and `npm run build` all passed.

### 2026-06-19 — Proposed search clear button

- Change: Reopened the Order Items spec as Proposed to add a clear button for the existing search box. The clear button must empty only the search query, visibly clear the input, preserve category/matched-state/sort/visible-count controls, and keep or return focus to the search field.
- Status after change: Proposed
- Rationale: Danny asked to add a clear button to clear the text in the search box after the client-side search refinement had been specified and implemented.
- Implementation impact: Future dashboard work must add the clear affordance, preserve all non-search controls when clearing, add regression coverage for state preservation/focus, and run dashboard tests/build plus owning-skill validator. No pipeline, schema, cron, or generated-data change is required.
- Evidence: Spec update requested on 2026-06-19; runtime implementation intentionally deferred to coder profile.

### 2026-06-19 — Implemented client-side order-item search

- Change: Implemented the Order Items by Category client-side search input so typing filters the visible list immediately and composes with category chips, matched-state controls, sort controls, and Show all/Collapse.
- Status after change: Final
- Rationale: Danny wanted the proposed search refinement delivered so order items can be narrowed without a submit action or server round-trip.
- Implementation impact: Dashboard client state, a shared visible-order-item derivation helper, and regression tests were updated; the feature now runs in the meals-dashboard repo and is committed in `782f026`.
- Evidence: `npm test -- --run lib/dashboard-ui-utils.test.ts components/dashboard-client.test.ts` (71 tests), `npm test -- --run` (332 tests), `npm run build`, `npm run scan:static-private-data`, and dashboard commit `782f026` pushed to `origin/main`.

### 2026-06-19 — Proposed immediate client-side search

- Change: Reopened the Order Items spec as Proposed to add a search input to the Order Items by Category section. Search must filter immediately as Danny types, compose with matched-state filters, category chips, sort direction, and Show all/Collapse, and keep future dynamic loading or virtualisation as a rendering-window optimisation over the full client-side derived result.
- Status after change: Proposed
- Rationale: Danny asked to add search to Order Items by Category, keep it aligned with existing match/sort/category controls, make it client-side, and consider dynamic item loading as a loading-performance optimisation.
- Implementation impact: Future dashboard work must add transient search state, a search input in the existing controls area, a pure filter/search/sort derivation helper, regression coverage for control composition, and dynamic-loading guardrails; no pipeline, schema, cron, or generated-data change is required.
- Evidence: Spec update requested on 2026-06-19; cross-dashboard search/filter grep found no reusable free-text search input in trips-dashboard; runtime implementation intentionally deferred to coder profile.

### 2026-06-14 — Implemented order item sort directions

- Change: Implemented name ascending/descending and price low-to-high/high-to-low sorting for Order Items by Category, keeping missing prices after priced items in both price directions.
- Status after change: Final
- Rationale: Danny requested implementation of the proposed dashboard meal specs, including the pending order item sorting refinement.
- Implementation impact: Dashboard sort helper, UI controls, and regression tests updated; deployed to Vercel production.
- Evidence: Dashboard commit `9af0547`; `npm test -- --run` (61 tests), `npx tsc --noEmit`, `npm run build` with dummy non-secret auth env, `npm run scan:static-private-data`, independent code review, Vercel production deploy ready in 1m, and owning-skill validator.

### 2026-06-14 — Proposed sort direction controls

- Change: Reopened the Order Items spec as Proposed so item-name sorting supports ascending and descending directions, and price sorting supports low-to-high and high-to-low directions.
- Status after change: Proposed
- Rationale: Danny requested explicit sort-order control for both item name and price rather than single-direction alphabetical/default and price sorts.
- Implementation impact: Future dashboard work must extend the sort UI/state and comparator logic, preserve active category/matched filters and Show all/Collapse behaviour, keep unavailable prices after priced items in either price direction, add regression coverage, and run dashboard tests/build plus owning-skill validator before finalising.
- Evidence: Spec update requested on 2026-06-14; runtime implementation intentionally deferred.

### 2026-06-14 — Implemented controls layout and sorting

- Change: Implemented separated Order Items control groups for categories, match filters, and sorting; default sorting is alphabetical by cleaned display name and price sorting places missing prices last.
- Status after change: Final
- Rationale: Danny wanted the controls to use available width rather than bunching up and to support alphabetical/default plus price sorting.
- Implementation impact: Dashboard UI helpers/component/tests updated; production deployment remains gated by dashboard sync/OIDC environment readiness rather than this display contract.
- Evidence: `npm test -- --run` (58 tests), `npm run build` with dummy non-secret auth env, `npm run scan:static-private-data`, and owning-skill validator passed on 2026-06-14.

### 2026-06-13 — Proposed controls layout and sorting

- Change: Reopened the Order Items spec as Proposed to improve the Order Items by Category controls layout and add item sorting. The controls should use available width in readable groups instead of bunching up, wrap cleanly on narrow widths, default sorting should be alphabetical by cleaned display name, and price sorting should be available for the currently filtered item list.
- Status after change: Proposed
- Rationale: Danny observed the filters were too bunched up and not using the available response/layout width, and asked for sorting with alphabetical default plus price sorting.
- Implementation impact: Future dashboard work must update the controls layout, add sort state/control behaviour, add regression coverage, and run dashboard tests/build plus owning-skill validator before finalising.
- Evidence: Spec update requested on 2026-06-13; runtime implementation intentionally deferred.

### 2026-06-11 — Spec audit: added show-count default, price format, and category icon mapping

- Change: Added acceptance scenarios 7 and 8, updated FR-004 to specify price display format (unit price when qty > 1, total only when qty = 1, italic "(price N/A)" when unavailable), added FR-007 for category icon fallback, and added key entity documentation for Visible Item Count default (10), Price Display Format, and Category Icon Mapping.
- Status after change: Final
- Rationale: Danny ran a fresh build and spec audit. Three implementation details were not captured in the spec: (1) show-all default is 10, (2) price display includes unit price format "{qty}× £{unitPrice}" when qty > 1, (3) category icon is a 16-key emoji mapping used as fallback when no product image is available.
- Implementation impact: Documentation-only. No runtime code change.
- Evidence: `npm run build` (success), `npm test` (43/43 passed), inspected `dashboard-client.tsx` lines 432-434 (price format) and 554-560 (emoji fallback).

### 2026-06-10 — Shared order-item match helper and stale-state cleanup

- Change: Documented helper-level unit coverage for the order-item matched/unmatched word-overlap classifier.
- Status after change: Final
- Rationale: Spec-to-implementation simulation found interactive behaviour without focused tests and stale unused filter state in the dashboard component.
- Implementation impact: Dashboard now uses the shared tested classifier helper and removes unused selected-meal, max-price, label, loading, and dead helper state from the component.
- Evidence: `npm test`, `npm run build`, and owning-skill validator.

### 2026-06-10 — Implementation-first alignment for matched-state heuristic

- Change: Documented the dashboard's exact receipt-item-name to meal-content word-overlap heuristic for matched/unmatched order item filtering.
- Status after change: Final
- Rationale: A second pass from `dashboard-client.tsx` showed matched-state filtering is a local display heuristic, not generated pipeline match data.
- Implementation impact: Documentation-only alignment; no runtime code change.
- Evidence: Inspected `components/dashboard-client.tsx` lines 57-65 and 152-164; owning-skill validator.

### 2026-06-10 — Final current-behaviour capture

- Change: Captured the current meals dashboard `Dashboard Order Items` behaviour as a dedicated feature specification.
- Status after change: Final
- Rationale: Split dashboard UI behaviour out of `004-dashboard-sync` so each spec owns one coherent user-facing capability.
- Implementation impact: Documentation/contract split only; no runtime code change.
- Evidence: Inspected /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 68-77, 152-164, and 430-484 plus lib/item-utils.ts; owning-skill validator.
