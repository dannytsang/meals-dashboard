# Tasks: Dashboard Order Items

**Input**: `.specify/specs/008-dashboard-order-items/spec.md`

## Phase 1: Brownfield Capture

- [x] T001 [US1] Inspect current dashboard implementation evidence: /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 68-77, 152-164, and 430-484 plus lib/item-utils.ts.
- [x] T002 [US1] Identify generated dashboard data used by this feature.
- [x] T003 [US1] Confirm the feature is UI/client-state behaviour and not a pipeline matching source.

## Phase 2: Contract Updates

- [x] T010 [US1] Create `spec.md`, `plan.md`, `tasks.md`, and `CHANGELOG.md` for `008-dashboard-order-items`.
- [x] T011 [US1] Add `008-dashboard-order-items` artifacts to `skill.spec.yaml` expected artifacts.
- [x] T012 [US1] Update `SKILL.md` dashboard spec list.

## Phase 3: Verification

- [x] T020 [US1] Run the spec-driven skill validator for `data-science/meals-check`.
- [x] T021 [US1] Confirm no runtime dashboard code or generated grocery/order data was changed by this documentation split.

## Phase 4: Implementation Hardening

- [x] T030 [US1] Add helper tests for order-item matched/unmatched classification.
- [x] T031 [US1] Refactor the dashboard order-item list to use the shared classifier helper and remove stale unused filter state.
- [x] T032 [US1] Verify with dashboard tests and build.

## Phase 5: Proposed Controls Layout and Sorting

- [x] T040 [US1] Update Order Items by Category control layout so category chips, matched-state filters, and sort controls use available width in separated readable groups and wrap cleanly on narrow widths.
- [x] T041 [US1] Add a sort control whose default order is alphabetical by cleaned item display name.
- [x] T042 [US1] Add price sorting for the currently filtered item list, placing price-unavailable items after priced items and preserving Show all/Collapse behaviour.
- [x] T043 [US1] Add or update dashboard regression coverage for responsive control layout, alphabetical default sorting, price sorting, and sorting with active category/matched filters.
- [x] T044 [US1] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14; production deployment remains governed by `004-dashboard-sync`/`015-dashboard-oidc-authentication` environment readiness.)*

## Phase 6: Proposed Sort Direction Controls

- [x] T050 [US1] Extend the Order Items by Category sort control so item-name sorting supports ascending and descending order, with item name ascending as the default.
- [x] T051 [US1] Extend price sorting so it supports low-to-high and high-to-low order while keeping unavailable prices after priced items in either direction.
- [x] T052 [US1] Add or update dashboard regression coverage for item-name ascending/descending, price low-to-high/high-to-low, active category/matched filters, unavailable prices, and Show all/Collapse behaviour.
- [x] T053 [US1] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14; deployed to Vercel production in dashboard commit `9af0547`.)*

## Phase 7: Proposed Client-Side Search

- [x] T060 [US1] Add an Order Items by Category search input wired to transient client-side state; update the visible list immediately on every typed/deleted character without submit, navigation, API request, or full reload.
- [x] T061 [US1] Refactor or extend the item derivation helper so category filters, matched-state filter, normalised search query, selected sort, and Show all/Collapse apply in the canonical FR-013 order.
- [x] T062 [US1] Keep dynamic loading/virtualisation, if introduced, as a rendering-window optimisation over the derived result rather than as the source collection for filtering/searching/sorting.
- [x] T063 [US1] Add dashboard regression coverage for search-only, search with active category, search with matched/unmatched filter, search with sort direction, blank-search reset, and Show all/Collapse after search.
- [x] T064 [US1] Run dashboard tests/build and owning-skill validator after implementation is complete.

## Phase 8: Proposed Search Clear Button

- [x] T065 [US1] Add a search clear button that appears or becomes enabled only when search text is non-empty, clears only the search query, visually empties the input, and keeps or returns focus to the search field.
- [x] T066 [US1] Ensure clearing search preserves category, matched-state, sort, and Show all/Collapse state rather than behaving like a broad reset.
- [x] T067 [US1] Add dashboard regression coverage for clear-button visibility/enabled state, focus behaviour, and preservation of active category/matched/sort/visible-count controls; run dashboard tests/build and owning-skill validator after implementation.

## Requirement-to-Task Mapping

- FR-001 → T001, T010, T020
- FR-002 → T001, T010, T020
- FR-003 → T001, T010, T020, T030, T031, T032
- FR-004 → T001, T010, T020
- FR-005 → T001, T010, T020
- FR-006 → T001, T010, T020
- FR-007 → T001, T010, T020
- FR-008 → T040, T043, T044
- FR-009 → T041, T043, T044, T050
- FR-010 → T050, T052, T053
- FR-011 → T051, T052, T053
- FR-012 → T060, T063, T064
- FR-013 → T061, T063, T064
- FR-014 → T062, T063, T064
- FR-015 → T065, T066, T067
- SC-004 → T040, T043, T044
- SC-005 → T041, T043, T044, T050, T052, T053
- SC-006 → T042, T043, T044, T051, T052, T053
- SC-007 → T060, T063, T064
- SC-008 → T061, T063, T064
- SC-009 → T062, T063, T064
- SC-010 → T065, T066, T067
