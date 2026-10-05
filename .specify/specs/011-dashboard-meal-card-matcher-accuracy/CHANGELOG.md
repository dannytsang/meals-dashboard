# Change Log: Dashboard Meal Card Matcher Accuracy

Feature ID: `011-dashboard-meal-card-matcher-accuracy`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or "why did this change?" questions.

## Entries

### 2026-06-14 — Finalised generic expected components for partial meals

- Change: Implemented generic missing-component generation for non-roast partial meals and promoted matcher accuracy back to Final. The salmon/potato/frozen-veg case now emits targeted `missing_components`/dashboard `missing_explanations` instead of an empty Expected Items list.
- Status after change: Final
- Rationale: Dashboard Expected Items should show meal-specific missing components, not broad unmatched-grocery dumps or nothing at all.
- Implementation impact: `tesco_matcher.py` now falls back from `missing_roast_components(...)` to conservative generic components for obvious proteins, `frozen veg`/`veg`, and potatoes; missing generic components prevent an otherwise matched meal from being marked fully covered.
- Evidence: New failing tests were added first for salmon/potato/frozen-veg missing components and for the covered-with-missing-component guard; `python3 -m unittest test_tesco_matcher -v` and the broader meals-check unittest set passed; live cache regeneration showed `missing_explanations` as `["salmon", "frozen veg"]` for the salmon meal; runtime script commit `01d85f6` pushed.

### 2026-06-14 — Proposed generic expected components for partial meals

- Change: Reopened matcher accuracy as Proposed so non-roast partial meals emit targeted `missing_components` for dashboard `Expected Items`.
- Status after change: Proposed
- Rationale: `Salmon (frozen) and potato slices and frozen veg` was partial with `matched_items = ["Tesco Maris Piper Potatoes 2Kg"]` but `missing_explanations = []`, because current missing-component generation is roast-specific.
- Implementation impact: Future matcher work must add generic missing-component extraction for partial component meals, with regression coverage for salmon/potato/frozen-veg and no broad unmatched-grocery dump.
- Evidence: `/home/hermes/.hermes/scripts/data/dashboard_cache.json` generated at `2026-06-14T00:08:03.518889+00:00` shows the salmon meal as `partial` with empty `missing_explanations`.

### 2026-06-13 — Implemented roast-potato raw ingredient flexibility

- Change: Updated matcher accuracy so suitable raw potatoes satisfy roast-potato components for home-cooked roast meals, while potato skins/chips and other false positives remain excluded; added roast-beef guards so burgers are not roast beef and named broccoli keeps the roast dinner partial when absent.
- Status after change: Final
- Rationale: Danny observed that the matcher was too strict because roast potatoes can be made from potatoes. During implementation review, the matcher also over-matched `Tesco 4 Smash Burger 340g` and could mark the roast dinner covered while broccoli was absent, so those accuracy gaps were fixed in the same roast-dinner component model.
- Implementation impact: `tesco_matcher.py` now distinguishes plausible raw potatoes from prepared potato side/snack false positives, excludes wrong-format roast proteins, and checks named roast components before marking a roast dinner covered. `test_tesco_matcher.py` now has focused regressions for the roast beef and roast pork cases.
- Evidence: Red tests failed first for raw potatoes, missing broccoli, and burger exclusion; `python3 -m unittest test_tesco_matcher -v` passed 9 tests; broader meals-check unittest set passed 28 tests; `tesco_meal_check.py --days 30 --output both` regenerated cache, committed/pushed dashboard data, and triggered Vercel production alias `https://meals-dashboard.vercel.app`; cache verification showed the roast beef meal as `partial` with matched beef joint, carrots, and Maris Piper potatoes only.


### 2026-06-11 — Created feature spec as Proposed

- Change: Created `011-dashboard-meal-card-matcher-accuracy` as a standalone feature spec to capture the matched/unmatched item accuracy problem for meal cards.
- Status after change: Proposed (implementation pending in `tesco_matcher.py`)
- Rationale: Danny identified that 009-A broke the spec numbering convention. The matcher accuracy problem is a standalone feature (not a sub-component of 009) and has been given its own sequential number. The exemplar case is "Roast pork, roast potatoes and veg" from the 2026-06-10 dashboard cache.
- Implementation impact: Spec-only addition. Implementation tasks T010–T034 are queued for future implementation sessions.
- Evidence: Analyzed `tesco_matcher.py` lines 267-496 and `dashboard_cache.json` entries for "Roast pork, roast potatoes and veg"; traced matcher output for each incorrect matched item.

### 2026-06-12 — Runtime matcher implementation partially completed

- Change: Added matcher regression coverage and runtime matching fixes for the roast pork exemplar. The corrected matcher now includes only `Tesco Crackling Pork Loin Joint 637G` and `Tesco Large Vegetable Stir Fry 570g` as matches, leaves the meal `partial`, excludes pork fettuccine/noodles/potato skins/Calbee chips, and preserves existing focused matcher regressions.
- Status after change: Proposed (implementation code and isolated verification completed; finalisation blocked by incomplete production dashboard deploy evidence)
- Rationale: The feature requires both runtime matcher accuracy and dashboard/deployment verification. The matcher portion is complete, but the live dashboard deployment step did not finish because the Vercel token was invalid.
- Implementation impact: Modified runtime `tesco_matcher.py` and `test_tesco_matcher.py`; source-governance tasks record completed implementation/test work while leaving dashboard deployment verification unchecked.
- Evidence: `python3 -m unittest test_tesco_matcher -v` passed 5 tests; `python3 -m unittest test_tesco_matcher test_tesco_meal_check_windows test_tesco_report_display test_scheduled_meals_check test_tesco_completed_meals -v` passed 24 tests; `python3 tesco_meal_check.py --days 30 --output both` regenerated cache and pushed dashboard data but Vercel reported `Error: The specified token is not valid`; `npm test && npm run build` passed in `/home/hermes/workspace/meals-dashboard`.

### 2026-06-12 — Finalised (all tasks complete)

- Change: Vercel production deploy completed successfully. All tasks T010–T034 are now done. Spec promoted to Final.
- Status after change: Final
- Rationale: T031 was the only remaining incomplete task — Vercel deploy failure was the blocker that kept the spec Proposed. After Gmail scope fix, the pipeline ran cleanly and Vercel deploy succeeded. All acceptance criteria (SC-001 to SC-005) are satisfied.
- Implementation impact: No additional runtime code changes; dashboard cache regenerated, committed, and deployed to production. Spec is now fully closed.
- Evidence: `python3 -m unittest test_tesco_matcher -v` (5 tests OK); full suite 24 tests OK; `tesco_meal_check.py --days 30 --output both` ran successfully, cache regenerated, dashboard data committed/pushed, Vercel deploy succeeded (38s build) — https://meals-dashboard.vercel.app; `npm run build` passed; skill validator passed with no issues.
