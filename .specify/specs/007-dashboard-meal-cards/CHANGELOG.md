# Change Log: Dashboard Meal Cards

Feature ID: `007-dashboard-meal-cards`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or "why did this change?" questions.

## Entries

### 2026-06-16 — Confirmed: collapsed bar % is valid

- Change: Audited FR-025 against the deployed dashboard. Confirmed that the numeric `{avgCoverage}%` on the collapsed aggregate bar (the per-day per-meal-type summary cell) is valid — FR-025 prohibits percentages on individual meal cards and the meal detail overlay, not on aggregate summary cells. Danny confirmed the collapsed bar should show the average coverage percentage as a useful household summary.
- Status after change: Final
- Rationale: Danny clarified that the collapsed aggregate bar shows how many meals are covered across all meal types for the day, which is useful information for the household. The percentage is not misleading in this context.
- Implementation impact: No code change required. The existing implementation is correct.
- Evidence: Audit 2026-06-16 confirmed `{avgCoverage}%` at `components/dashboard-client.tsx:407` is on a collapsed aggregate bar, not an individual meal card, and is valid per FR-025 scope.

- Change: Clarified and implemented that Meal Detail Overlay matched item rows align item name, quantity, and price as columns and show a bottom total of available matched receipt prices.
- Status after change: Final
- Rationale: Danny requested easier scanning of matched item receipt details in Week Meals → Meal Card → matched items, plus a total for the matched ingredients.
- Implementation impact: `components/dashboard-client.tsx` renders matched item rows using a stable grid layout and `lib/item-utils.ts` exposes `calculateMatchedItemsTotal()` for the bottom total; dashboard regression coverage pins the column layout and total helper.
- Evidence: `npm test -- --run` passed 70 tests; `npx tsc --noEmit`, `npm run build`, and `npm run scan:static-private-data` passed on 2026-06-14.

### 2026-06-14 — Removed duplicate Meal Detail Overlay coverage section

- Change: Clarified and implemented that Meal Detail Overlay coverage status appears only as the compact badge near the meal title, not as a repeated `Coverage status` detail block.
- Status after change: Final
- Rationale: Danny noted the status badge under the meal title is the better placement and the repeated section adds noise.
- Implementation impact: `components/dashboard-client.tsx` removes the duplicate section; `components/dashboard-client.test.ts` pins that the overlay still has the title badge while omitting the repeated `Coverage status` text.
- Evidence: `npm test -- --run` passed 67 tests; `npx tsc --noEmit`, `npm run build`, and `npm run scan:static-private-data` passed with valid dummy auth env.

### 2026-06-14 — Implemented simple meal status labels and Expected Items box alignment

- Change: Implemented the final Dashboard Meal Cards Proposed refinements: individual Meal Cards and the Meal Detail Overlay now show simple `Complete`, `Partial`, or `Missing` coverage labels without RAG wording, and Expected Items rows explicitly use full-width boxed alignment matching Matched Items.
- Status after change: Final
- Rationale: Danny requested removal of `Green`/`Amber`/`Red` wording and tighter visual alignment between Expected Items and Matched Items.
- Implementation impact: Dashboard UI helper/component/tests updated; governance tasks and feature status finalised. Production deployment was not performed by this cron run.
- Evidence: `npm test -- --run components/dashboard-client.test.ts lib/dashboard-ui-utils.test.ts` (29 tests), `npm test -- --run` (61 tests), `npm run build`, and owning-skill validator passed on 2026-06-14.

### 2026-06-14 — Proposed Expected Items width alignment

- Change: Extended the Dashboard Meal Cards Proposed refinement so Meal Detail Overlay `Expected Items` row/box backgrounds must line up with the Matched Items row background width.
- Status after change: Proposed
- Rationale: Danny requested that Expected Items background rows align visually with Matched Items backgrounds rather than appearing narrower or offset.
- Implementation impact: Future dashboard UI work must use the same content container width and horizontal padding/alignment for both sections and add regression/visual coverage.
- Evidence: Spec update requested on 2026-06-14; runtime implementation intentionally deferred.

### 2026-06-14 — Proposed simple coverage status wording

- Change: Reopened Dashboard Meal Cards as Proposed so individual Meal Card and Meal Detail Overlay coverage status removes RAG wording and reads only `Missing`, `Partial`, or `Complete`; individual percentages/progress bars remain forbidden.
- Status after change: Proposed
- Rationale: Danny requested that the meal card coverage status remove RAG status wording and use only the three plain status labels.
- Implementation impact: Future dashboard UI work must update the visible status helper/text, keep generated status/score data available for matching and aggregate uses, add regression coverage rejecting `Green`, `Amber`, and `Red` in individual status labels, and run dashboard tests/build plus owning-skill validator before finalising.
- Evidence: Spec update requested on 2026-06-14; runtime implementation intentionally deferred.

### 2026-06-14 — Implemented Expected Items visual parity

- Change: Implemented the Meal Detail Overlay `Expected Items` visual parity requirement: heading now uses the Matched Items-style title treatment, and each expected item renders as its own boxed row rather than inline comma-separated text.
- Status after change: Final
- Rationale: Danny asked for the meals card/detail UI to look better and for Expected Items to match Matched Items.
- Implementation impact: Dashboard UI and regression tests updated; deployed to Vercel production.
- Evidence: Dashboard commit `9af0547`; `npm test -- --run` (61 tests), `npx tsc --noEmit`, `npm run build` with dummy non-secret auth env, `npm run scan:static-private-data`, independent code review, Vercel production deploy ready in 1m, and owning-skill validator.

### 2026-06-14 — Proposed Expected Items visual parity

- Change: Reopened Dashboard Meal Cards as Proposed so the Meal Detail Overlay `Expected Items` section visually matches the Matched Items section: white/title-style heading and one boxed row per expected item/component.
- Status after change: Proposed
- Rationale: Danny requested the meal card/detail UI look better and specifically asked for Expected Items to use the same style as Matched Items, with the title white and each item in its own box.
- Implementation impact: Future dashboard UI work must update the overlay presentation, preserve the existing targeted partial-explanation semantics, avoid restoring the broad Missing Items section, add regression coverage, and run dashboard tests/build plus owning-skill validator before finalising.
- Evidence: Spec update requested on 2026-06-14; runtime implementation intentionally deferred.

### 2026-06-14 — Implemented Expected Items and RAG individual meal status

- Change: Implemented the remaining meal-card/detail refinements: partial detail overlays now show `Expected Items`, compact cards/details use RAG status for individual meals instead of misleading numeric percentages/progress bars, and generated score/status data remains available for aggregate/headline uses.
- Status after change: Final
- Rationale: Danny requested clearer meal-detail wording and non-misleading individual meal status presentation.
- Implementation impact: Dashboard UI/helpers/tests updated; production deployment remains gated by dashboard sync/OIDC environment readiness rather than this display contract.
- Evidence: `npm test -- --run` (58 tests), `npm run build` with dummy non-secret auth env, `npm run scan:static-private-data`, `python3 -m unittest test_tesco_matcher test_tesco_completed_meals -v` (18 tests), Python compile checks, and owning-skill validator passed on 2026-06-14.

### 2026-06-13 — Proposed RAG status for individual meal coverage

- Change: Updated the Proposed meal-card/detail overlay contract to replace individual meal numeric coverage percentages and progress bars with RAG status display: Green/covered, Amber/partial, Red/missing.
- Status after change: Proposed
- Rationale: The generated `coverage_score` is currently a coarse status mapping (`covered=100`, `partial=50`, `missing=0`), not a proportional ingredient calculation; showing `50%` for a roast dinner missing only broccoli is misleading.
- Implementation impact: Future dashboard work must remove individual meal percentage/progress-bar rendering from Meal Cards and the Meal Detail Overlay, show RAG status instead, preserve underlying generated fields for aggregate/headline uses where still needed, and update regression coverage.
- Evidence: Spec update requested on 2026-06-13 after inspecting the roast beef example.

### 2026-06-13 — Proposed Expected Items label for partial meal detail

- Change: Updated the Proposed meal-detail overlay contract so the targeted partial-match explanation section is labelled `Expected Items` rather than `Missing for 100%`.
- Status after change: Proposed
- Rationale: Danny asked for the meal detail section name to be changed to clearer wording.
- Implementation impact: Future dashboard work must rename the overlay heading, update regression coverage to reject `Missing for 100%`, and verify dashboard tests/build plus owning-skill validator before finalising.
- Evidence: Spec update requested on 2026-06-13; runtime implementation intentionally deferred.

### 2026-06-13 — Proposed partial explanation placement and label emoji

- Change: Updated the Proposed meal-card contract so targeted partial-match missing explanations move from compact Week Meals cards into the clicked Meal Detail Overlay, and visible Week Meals labels are prefixed with a label emoji such as `🏷️`.
- Status after change: Proposed
- Rationale: Danny clarified that the compact Week Meals cards are too cramped for missing-explanation text and should keep labels visually identifiable with an emoji prefix; detailed missing context belongs in the detail overlay opened from the meal.
- Implementation impact: Future dashboard work must remove missing-explanation rendering from compact meal cards, render targeted explanations in the overlay for partial meals only, add emoji prefixes to labels, and cover those behaviours with dashboard regressions before finalising.
- Evidence: Spec update requested on 2026-06-13; runtime implementation intentionally deferred.

### 2026-06-13 — Proposed pipeline-owned delivery markers

- Change: Reopened Dashboard Meal Cards as Proposed to require Week Meals delivery markers to render only from generated pipeline delivery metadata, replacing the previous implementation-first contract around `getUpcomingDeliveries(realLatestOrder.delivery_date)`.
- Status after change: Proposed
- Rationale: Danny identified the broader logic problem behind a false delivery marker: the dashboard must render operational delivery facts resolved by the meals-check pipeline, not infer deliveries from fixed Tesco weekdays, latest receipt dates, or frontend reconstruction.
- Implementation impact: Future dashboard work must consume explicit delivery metadata from generated data, remove or bypass the recurring-weekday delivery helper for Week Meals markers, preserve actual delivery-event dates separately from delivery-usable meal-window dates, and add regression coverage for both absent and present delivery events.
- Evidence: Spec update requested on 2026-06-13 after live dashboard diagnosis found the Week Meals marker was generated by hard-coded Tuesday/Saturday assumptions rather than pipeline cache windows.

### 2026-06-13 — Proposed partial-match missing explanations on Meal Cards

- Change: Reopened the meal cards/week grid spec to require partial Meal Cards to show a targeted section stating what is missing to make the meal 100% covered.
- Status after change: Proposed
- Rationale: Danny asked, after inspecting a partial roast dinner, for the Meal Card itself to state what is missing for partial matches.
- Implementation impact: Future dashboard/generator work must emit or derive meal-specific missing explanation metadata for partial Meal Cards, render it only for partial matches, and avoid resurrecting the old broad unrelated Missing Items dump in the overlay.
- Evidence: Spec-only update requested on 2026-06-13; runtime implementation intentionally deferred.


### 2026-06-13 — Proposed completed meal due-date filtering

- Change: Reopened the meal cards/week grid spec to require completed Todoist meals to appear only when their original due date belongs in the displayed dashboard date/window; completed meals must not be shifted or carried forward into another visible date.
- Status after change: Proposed
- Rationale: Danny observed `Duck pancakes, prawn toast, spring rolls` showing on Tuesday 16 July even though its due date was 11 July. That completed task is not a meal for the displayed date and should not appear in Week Meals.
- Implementation impact: Future dashboard data generation must preserve original due dates for completed tasks, filter completed tasks by the dashboard date/window, avoid using completion date as display date, and add regression coverage for the observed example.
- Evidence: Spec-only update requested on 2026-06-13; runtime implementation intentionally deferred.


### 2026-06-13 — Proposed meal detail overlay refinement

- Change: Reopened the meal cards/detail overlay spec as Proposed to remove the visible `Missing Items` section from the Meal Detail Overlay and make matched items clickable into the shared Product Info Modal used by Order Items by Category.
- Status after change: Proposed
- Rationale: Danny clarified that the meal card/detail should focus on matched items and product drill-down; missing items should not be shown there, and matched item detail should reuse the existing product modal interaction.
- Implementation impact: Future dashboard UI work must remove the visible Missing Items block/chips from the meal detail overlay, preserve underlying missing-item data for non-UI uses, and route matched item clicks to the product detail contract in `010-dashboard-product-detail`.
- Evidence: Spec-only update requested on 2026-06-13; runtime implementation intentionally deferred.


### 2026-06-11 — Merged 007-dashboard-weekly-grid and 009-dashboard-meal-detail

- Change: Merged `007-dashboard-weekly-grid` and `009-dashboard-meal-detail` into a single spec `007-dashboard-meal-cards`. The meal detail overlay and the weekly grid card are the same interactive surface — clicking a card opens the overlay — and documenting them separately created drift risk.
- Status after change: Final
- Rationale: Danny requested a spec review to identify simplification opportunities. The weekly grid card and its detail overlay share the same data model, same click interaction, and same display surface. Merging them into one spec removes duplication and keeps the spec contract accurate.
- Implementation impact: Spec 009 (`009-dashboard-meal-detail`) is removed. `007-dashboard-meal-cards` now covers both the weekly grid card display and the click-to-overlay meal detail. SKILL.md and skill.spec.yaml updated to reference the merged spec.
- Evidence: Analyzed both specs and dashboard implementation; confirmed overlay reads from the same in-memory coverage array as the grid card, with no separate data fetch.

### 2026-06-11 — Implemented any-date Todoist completion display (from 007)

- Change: Implemented generated `is_completed`/`completed_at` preservation and weekly-grid completion markers for completed Todoist meals on any generated/displayed date.
- Status after change: Final
- Rationale: The autonomous Proposed-spec implementation run completed the deferred runtime slice while preserving the separation between Todoist task completion and ingredient coverage.
- Implementation impact: The profile-local meals-check script now fetches completed Planned-section tasks over a bounded completion-history window and writes completion metadata to dashboard cache entries; the dashboard sync and data model propagate that metadata; weekly meal cards render a separate `✓ Todoist` marker without changing coverage fields.
- Evidence: `python3 -m unittest test_tesco_completed_meals -v`, `python3 -m py_compile tesco_meal_check.py test_tesco_completed_meals.py`, `python3 -m py_compile /home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py`, `npm test -- --run lib/dashboard-ui-utils.test.ts`, `npm run build`, and owning-skill validator.

### 2026-06-11 — Implemented any-date Todoist completion detail (from 009)

- Change: Implemented meal detail display of Todoist completion metadata for selected meals on any generated/displayed date.
- Status after change: Final
- Rationale: The autonomous Proposed-spec implementation run completed the deferred runtime slice while keeping Todoist task completion separate from ingredient coverage.
- Implementation impact: The dashboard `Meal` data model exposes optional `is_completed` and `completed_at`; the meal detail overlay renders a separate completion badge while preserving the Todoist link, coverage status, coverage score, matched items, and missing items.
- Evidence: `npm test -- --run lib/dashboard-ui-utils.test.ts`, `npm run build`, `python3 -m unittest test_tesco_completed_meals -v`, and owning-skill validator.

### 2026-06-10 — Proposed any-date Todoist completion display (from 007)

- Change: Reopened the weekly grid spec as Proposed so every generated meal can carry and visibly show Todoist completion state regardless of whether the due date is today.
- Status after change: Proposed
- Rationale: Danny clarified that completion state is not a today-only behaviour; if a meal was completed in Todoist, the dashboard should show that fact wherever the meal appears.
- Implementation impact: Future implementation must preserve `is_completed` and optional `completed_at` in generated dashboard meal data and render completion markers without changing ingredient coverage semantics.
- Evidence: Spec-only update requested; runtime implementation intentionally deferred.

### 2026-06-10 — Proposed any-date Todoist completion detail (from 009)

- Change: Reopened the meal detail spec as Proposed so the overlay displays Todoist completion state for the selected meal whenever generated data includes completion metadata, regardless of due date.
- Status after change: Proposed
- Rationale: Danny clarified that completed-in-Todoist status should be visible for any meal, not only meals due today.
- Implementation impact: Future implementation must preserve completion metadata in the selected MealCoverage/Meal data model and show it separately from ingredient coverage.
- Evidence: Spec-only update requested; runtime implementation intentionally deferred.

### 2026-06-10 — Preserve completed current-day meals (from 007)

- Change: Required the meals-check dashboard data generation path to reintroduce completed Todoist Planned-section meals due today, so they remain visible in the dashboard Week Meals grid after completion.
- Status after change: Final
- Rationale: Danny observed that completed meals disappear from Week Meals immediately after being checked off; current-day meals should remain visible for the rest of the day.
- Implementation impact: The profile-local meals-check script now fetches Todoist completed tasks by completion date, filters to Planned-section tasks due today, merges them with active Planned tasks, and leaves past/future completed meals hidden.
- Evidence: `python3 -m unittest test_tesco_completed_meals test_tesco_meal_check_windows -v`, `python3 -m py_compile tesco_meal_check.py test_tesco_completed_meals.py`, live `tesco_meal_check.py --days 30 --output both` sync showing 3 completed planned tasks due today and 12 dashboard meals.

### 2026-06-10 — Average-based collapsed coverage colour (from 007)

- Change: Clarified that collapsed weekly-grid coverage colour is derived from the aggregate average score, not the first meal status.
- Status after change: Final
- Rationale: Spec-to-implementation simulation identified mixed-status collapsed cells as an underspecified edge case.
- Implementation impact: Dashboard collapsed rows now call a tested `deriveCollapsedCoverageColor` helper.
- Evidence: `npm test`, `npm run build`, and owning-skill validator.

### 2026-06-10 — Implementation-first alignment for delivery markers and meal types (from 007)

- Change: Clarified that delivery markers come from `getUpcomingDeliveries(realLatestOrder.delivery_date)` and documented exact meal-type fallback behaviour.
- Status after change: Final
- Rationale: A second pass from implementation showed delivery markers are derived by a dashboard helper, not directly from arbitrary generated delivery rows.
- Implementation impact: Documentation-only alignment; no runtime code change.
- Evidence: Inspected `components/dashboard-client.tsx` lines 49-50, 185-205, 354-356 and `lib/meal-type.ts`; owning-skill validator.

### 2026-06-10 — Final current-behaviour capture (from 007)

- Change: Captured the current meals dashboard `Dashboard Weekly Grid` behaviour as a dedicated feature specification.
- Status after change: Final
- Rationale: Split dashboard UI behaviour out of `004-dashboard-sync` so each spec owns one coherent user-facing capability.
- Implementation impact: Documentation/contract split only; no runtime code change.
- Evidence: Inspected /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 166-220 and 303-428 plus lib/meal-type.ts; owning-skill validator.

### 2026-06-10 — Final current-behaviour capture (from 009)

- Change: Captured the current meals dashboard `Dashboard Meal Detail` behaviour as a dedicated feature specification.
- Status after change: Final
- Rationale: Split dashboard UI behaviour out of `004-dashboard-sync` so each spec owns one coherent user-facing capability.
- Implementation impact: Documentation/contract split only; no runtime code change.
- Evidence: Inspected /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 407-411 and 489-552 plus lib/item-utils.ts; owning-skill validator.
## 2026-06-13

- Removed the visible broad `Missing Items` section from the Meal Detail Overlay.
- Made matched items in the Meal Detail Overlay open the shared Product Info Modal.
- Added completed-meal due-date filtering so completed tasks outside the dashboard-visible date keys are not carried forward into Week Meals.
- Added generated `missing_explanations` / dashboard `missingExplanations` metadata and partial-card rendering for targeted missing components.
- Added regression tests and verified dashboard tests plus production build.
- Moved spec status to Final after implementation and validation.

### 2026-06-13 — Proposed completed-task same-day eligibility

- Change: Reopened the meal cards/week grid spec to require completed-only Todoist meals to pass a same-day completion guard before they are reintroduced into generated Week Meals. Active/incomplete meals continue to use `due.date`; completed-only meals require returned `due.date` in the visible dashboard date/window and `completed_at`, converted to Europe/London, equal to the pipeline run date.
- Status after change: Proposed
- Rationale: Danny observed `Steak, sliced potatoes (frozen), frozen veg` appearing on Monday 15 June even though it originally belonged to 8 June. Todoist's completed-task API returned `due.date = 2026-06-15`, proving that the previous original-due-date assumption was not reliable after due-date changes.
- Implementation impact: Future pipeline work must update completed-task filtering, add timezone-aware `completed_at` comparison, and add regression tests for the steak example plus a same-day completed positive case.
- Evidence: Spec/contract update requested on 2026-06-13 after live dashboard cache inspection; runtime implementation intentionally deferred.

### 2026-06-13 — Implemented completed-task same-day eligibility

- Change: Implemented the completed-only same-day eligibility guard in the meals-check pipeline and promoted the meal cards spec back to Final.
- Status after change: Final
- Rationale: The pipeline now prevents old completed meals being resurrected by Todoist's latest/current returned due date while still preserving same-day completed meal visibility.
- Implementation impact: `_filter_completed_planned_tasks` now requires completed-only tasks to have visible `due.date` and `completed_at` local date equal to the pipeline run date; `completed_at` is converted with `Europe/London`. Regression tests cover the steak exclusion and the late-night BST boundary.
- Evidence: `python3 -m unittest test_tesco_completed_meals test_tesco_meal_check_windows test_tesco_report_display test_tesco_matcher -v`, `python3 -m py_compile tesco_meal_check.py test_tesco_completed_meals.py`, `npm test -- --run lib/dashboard-ui-utils.test.ts`, `npm run build`, live `tesco_meal_check.py --days 30 --output both`, dashboard cache inspection showing `steak_present False`, and owning-skill validator.
