# Tasks: Dashboard Meal Cards

**Input**: `.specify/specs/007-dashboard-meal-cards/spec.md`

## Phase 1: Brownfield Capture

This feature began as a brownfield capture. The original merge of `007-dashboard-weekly-grid` and `009-dashboard-meal-detail` is complete.

## Phase 2: Proposed Meal Detail Refinement

- [x] T060 [US2] Remove the visible `Missing Items` section/chips from the Meal Detail Overlay while preserving underlying missing-item data for pipeline/report uses.
- [x] T061 [US2] Make matched item rows in the Meal Detail Overlay clickable when they have sufficient order/product metadata.
- [x] T062 [US2] Route matched item clicks to the shared Product Info Modal governed by `010-dashboard-product-detail`, not a separate modal implementation.
- [x] T063 [US2] Add or update dashboard tests for no Missing Items section in meal detail and matched-item-to-product-modal behaviour.
- [x] T064 [US2] Run dashboard tests/build and owning-skill validator after implementation.

## Phase 3: Completed Meal Due-Date Filtering

- [x] T070 [US1] Update dashboard data generation so completed Todoist meals are included only when their original due date belongs in the displayed dashboard date/window.
- [x] T071 [US1] Ensure completed meal display uses original Todoist due date, not completion date and not shifted/carried-forward display dates.
- [x] T072 [US1] Add regression coverage for `Duck pancakes, prawn toast, spring rolls` due 11 July not appearing under Tuesday 16 July.
- [x] T073 [US1] Verify completed in-window meals still show completion state and do not alter ingredient coverage.
- [x] T074 [US1] Run dashboard/pipeline tests, build if needed, and owning-skill validator after implementation.

## Phase 4: Historical Partial-Match Missing Explanation Implementation

The original partial-explanation implementation is complete but partly superseded by Phase 7: generated explanation metadata remains useful, but the compact Week Meals card placement must move to the Meal Detail Overlay.

- [x] T080 [US1] Extend generated MealCoverage/dashboard data with targeted partial-match missing explanation metadata when `status = partial`.
- [x] T081 [US1] Render a clearly labelled missing-explanation section on partial Meal Cards in the expanded Week Meals grid. *(Superseded by T110/T111: remove from compact card and render in detail overlay instead.)*
- [x] T082 [US1] Ensure covered/external/missing/unexplained meal cards do not show the partial-only missing-explanation section.
- [x] T083 [US1] Add regression coverage using a partial roast dinner so the explanation identifies meal-specific blockers such as broccoli/roast potatoes rather than unrelated unmatched groceries.
- [x] T084 [US1] Run dashboard/generator tests, build if needed, and owning-skill validator after implementation.

## Phase 5: Proposed Completed Meal Same-Day Eligibility

- [x] T090 [US1] Update completed-task filtering so active/incomplete Planned meals are included by `due.date`, while completed-only Planned meals require both visible-window `due.date` and `completed_at` local date equal to the pipeline run date.
- [x] T091 [US1] Convert Todoist `completed_at` timestamps to the pipeline local timezone (`Europe/London`) before comparing with the run date.
- [x] T092 [US1] Add regression coverage proving `Steak, sliced potatoes (frozen), frozen veg` with returned `due.date = 2026-06-15` and `completed_at = 2026-06-11` is excluded from a 2026-06-13 generated Week Meals window.
- [x] T093 [US1] Add/keep positive regression coverage proving a completed meal with visible-window `due.date` and same-local-day `completed_at` is included and marked complete without changing coverage fields.
- [x] T094 [US1] Run pipeline/dashboard tests, build if needed, owning-skill validator, and dashboard sync only after implementation is complete.

## Phase 6: Proposed Pipeline-Owned Delivery Markers

- [x] T100 [US1] Replace Week Meals delivery marker source so markers render from generated pipeline delivery metadata rather than `getUpcomingDeliveries(realLatestOrder.delivery_date)` or hard-coded Tesco weekdays.
- [x] T101 [US1] Ensure marker display uses actual delivery event dates while preserving delivery-usable meal-window semantics for coverage.
- [x] T102 [US1] Add dashboard regression coverage proving a regular Tesco weekday with no generated delivery event shows no Delivery marker.
- [x] T103 [US1] Add dashboard regression coverage proving an actual pipeline-resolved delivery date in the visible grid shows a Delivery marker.
- [x] T104 [US1] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14; production deployment remains governed by `004-dashboard-sync`/`015-dashboard-oidc-authentication` environment readiness.)*

## Phase 7: Proposed Partial Explanation Placement and Label Emoji

- [x] T110 [US1] Remove targeted missing-explanation rendering from compact Week Meals cards while preserving generated explanation metadata.
- [x] T111 [US2] Render targeted missing explanations in the clicked Meal Detail Overlay for partial meals only when reliable metadata exists.
- [x] T112 [US1] Prefix each visible Week Meals card label with a label emoji such as `🏷️` while preserving label text and filtering behaviour.
- [x] T113 [US1/US2] Add regression coverage proving compact partial cards do not show the explanation, partial detail overlays do show it, non-partial overlays do not show misleading explanations, and labels have the emoji prefix.
- [x] T114 [US1/US2] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14; production deployment remains governed by `004-dashboard-sync`/`015-dashboard-oidc-authentication` environment readiness.)*

## Phase 8: Proposed Expected Items Label

- [x] T120 [US2] Rename the Meal Detail Overlay targeted partial-match section heading from `Missing for 100%` to `Expected Items`.
- [x] T121 [US2] Add or update dashboard regression coverage proving partial overlays use `Expected Items` and do not render `Missing for 100%`.
- [x] T122 [US2] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14; production deployment remains governed by `004-dashboard-sync`/`015-dashboard-oidc-authentication` environment readiness.)*

## Phase 9: Proposed RAG Status for Individual Meals

- [x] T130 [US1/US2] Replace individual Meal Card numeric coverage percentages with RAG status display: Green/covered, Amber/partial, Red/missing or uncovered.
- [x] T131 [US2] Replace Meal Detail Overlay numeric coverage percentage/progress bar with the same RAG status display while preserving matched items and `Expected Items`.
- [x] T132 [US1/US2] Keep generated status/score data available for existing aggregate/headline uses, but prevent `coverage_score` being rendered as an individual meal percentage where it implies proportional ingredient completeness.
- [x] T133 [US1/US2] Add or update dashboard regression coverage proving individual Meal Cards and Meal Detail Overlay do not show misleading numeric percentages/progress bars and do show the correct RAG status.
- [x] T134 [US1/US2] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14; production deployment remains governed by `004-dashboard-sync`/`015-dashboard-oidc-authentication` environment readiness.)*

## Phase 10: Proposed Expected Items Visual Style

- [x] T140 [US2] Update the Meal Detail Overlay `Expected Items` section title to use the same white/title visual treatment as the Matched Items section title.
- [x] T141 [US2] Render each expected item/component in its own row/box using the same visual language as Matched Items, rather than plain inline text.
- [x] T142 [US2] Add or update dashboard regression coverage proving partial overlays render `Expected Items` with Matched Items-style heading and boxed item rows, without restoring the broad Missing Items section.
- [x] T143 [US2] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14; deployed to Vercel production in dashboard commit `9af0547`.)*

## Phase 11: Proposed Simple Coverage Status Text

- [x] T150 [US1/US2] Replace visible individual Meal Card coverage status text so it reads only `Complete`, `Partial`, or `Missing`, with `covered`/external-covered mapping to `Complete`.
- [x] T151 [US2] Replace Meal Detail Overlay visible coverage status text so it reads only `Complete`, `Partial`, or `Missing`.
- [x] T152 [US1/US2] Ensure individual Meal Cards and Meal Detail Overlay do not show RAG wording (`Green`, `Amber`, `Red`) and do not restore numeric percentages/progress bars.
- [x] T153 [US1/US2] Add or update dashboard regression coverage for the simple coverage-status labels and absence of RAG wording.
- [x] T154 [US1/US2] Run dashboard tests/build and owning-skill validator after implementation is complete. *(Passed on 2026-06-14: targeted dashboard tests, full dashboard test suite, production build, and owning-skill validator.)*
- [x] T155 [US2] Align the Meal Detail Overlay `Expected Items` row/box background width with the Matched Items row background width, using the same content container width and horizontal padding/alignment.
- [x] T156 [US2] Add or update dashboard regression/visual assertions for Expected Items and Matched Items width alignment.

## Phase 12: Matched Item Column Alignment and Total

- [x] T160 [US2] Render Meal Detail Overlay matched item rows with stable aligned columns for name, quantity, and price.
- [x] T161 [US2] Add a matched-items total row summing available generated/receipt matched-item prices without fabricating unavailable prices.
- [x] T162 [US2] Add or update dashboard regression coverage for the matched-item columns and total helper.
- [x] T163 [US2] Run dashboard tests, type-check, build, static-private-data scan, and owning-skill validator after implementation.

## Requirement-to-Task Mapping

Proposed implementation tasks are listed above. Existing brownfield capture tasks remain complete.

Historical task tracking from predecessor specs:
- FR-001 → T001 (007), T001 (009) — both complete
- FR-002 → T001 (007), T001 (009) — both complete
- FR-003 → T001 (007), T001 (009) — both complete
- FR-004 → T001 (007), T001 (009) — both complete
- FR-005 → T001, T030, T031, T032 (007) — all complete
- FR-006 → T001 (007), T001 (009) — both complete
- FR-007 → T050, T051, T053 (007), T030, T031, T032 (009) — all complete
- FR-008 → T052, T053 (007), T030, T032 (009) — all complete
- FR-009 → T050, T051 (007) — all complete
- FR-010 → T001 (007) — complete
- FR-011 → T001 (009) complete for old behaviour; T060, T063, T064 for Proposed missing-items removal; T160, T161, T162, T163 for matched item column alignment and total
- FR-012 → T031, T032 (009) — all complete
- FR-013 → T001 (009) — complete
- FR-014 → T061, T063, T064
- FR-015 → T062, T063, T064
- FR-016 → T070, T072, T074
- FR-017 → T090, T091, T092, T093, T094
- FR-021 → T090, T091, T092, T093, T094
- SC-011 → T092, T094
- FR-005 → T100, T102, T103, T104
- FR-022 → T100, T102, T104
- FR-023 → T101, T103, T104
- SC-012 → T102, T103, T104
- FR-018 → T110, T113, T114
- FR-019 → T111, T113, T114
- FR-020 → T111, T113, T114
- FR-024 → T112, T113, T114
- SC-010 → T110, T111, T113, T114
- FR-019 → T120, T121, T122
- FR-020 → T120, T121, T122
- SC-010 → T120, T121, T122
- FR-025 → T130, T131, T132, T133, T134
- FR-026 → T140, T141, T142, T143, T155, T156
- FR-011 → T131, T133, T134, T140, T141, T142, T143
- SC-003 → T130, T133, T134
- SC-005 → T131, T133, T134
- SC-010 → T140, T141, T142, T143

- FR-027 → T150, T151, T152, T153, T154
- FR-025 → T150, T151, T152, T153, T154
- FR-011 → T151, T152, T153, T154
- SC-003 → T150, T152, T153, T154
- SC-005 → T151, T152, T153, T154
- FR-026 → T155, T156
- SC-010 → T155, T156
