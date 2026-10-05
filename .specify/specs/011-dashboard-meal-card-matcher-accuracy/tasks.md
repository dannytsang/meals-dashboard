# Tasks: Dashboard Meal Card Matcher Accuracy

**Input**: `.specify/specs/011-dashboard-meal-card-matcher-accuracy/spec.md`

## Phase 1: Regression Tests

- [x] T010 [FR-001, FR-005] Add regression tests for "Roast pork, roast potatoes and veg" in `test_tesco_matcher.py`. Tests must verify: (a) `Tesco Crackling Pork Loin Joint 637G` matches, (b) `Tesco Large Vegetable Stir Fry 570g` matches, (c) `Tesco Finest Beef Dripping Roast Potatoes 800G` does NOT match (wrong protein) or is excluded for potato component, (d) `La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g` does NOT match, (e) `Tesco Egg Noodles 300G` does NOT match, (f) `Bannisters Farm 4 Cheese & Bacon Potato Skins 260G` does NOT match, (g) Calbee Hot & Spicy and Seaweed & Salt potato chips do NOT match, (h) status is `partial` not `covered`.

## Phase 2: Matcher Logic Fixes

- [x] T020 [FR-003] Refine `meal_is_pork_dish` override in `tesco_matcher.py` (line 349-351) to only trigger when the substantive hit is the primary protein component of the meal, not when it's a side dish or unrelated ready-made dish.
- [x] T021 [FR-001] Tighten ready-made dish protein check: require the protein word to represent the primary dish identity, not just appear in the product name. A pasta sauce with "pork" in the name is not a roast pork dish.
- [x] T022 [FR-002] Add minimum component coverage requirements for side dishes: a potato product must meaningfully cover "potato" in the meal components, not just contain the word "potato" in a snack context (chips, potato skins).
- [x] T023 [FR-004] Gate fuzzy match threshold: items that only get hits on generic meal words without protein or primary component support must not cross the threshold.

## Phase 3: Verification

- [x] T030 Run `python3 -m unittest test_tesco_matcher -v` from `/home/hermes/.hermes/scripts` and confirm all new and existing tests pass.
- [x] T031 Run `python3 tesco_meal_check.py --days 30 --output both` from `/home/hermes/.hermes/scripts`; verify dashboard cache reflects corrected matched/missing items. ✓ 2026-06-12: pipeline ran, cache saved, dashboard data committed/pushed, Vercel production deploy succeeded — https://meals-dashboard.vercel.app.
- [x] T032 Run `npm test` and `npm run build` in `/home/hermes/workspace/meals-dashboard`; confirm dashboard builds successfully.
- [x] T033 Validate meals-check skill with `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.
- [x] T034 Update CHANGELOG.md for spec 011.

## Phase 4: Proposed Roast-Potato Flexibility

- [x] T050 [FR-006, FR-007] Add failing regression tests showing raw potatoes cover roast potatoes for home-cooked roast meals while potato skins/chips remain excluded.
- [x] T051 [FR-006, FR-008] Refine `tesco_matcher.py` so suitable raw potatoes satisfy roast-potato coverage-status requirements without requiring `roast` in the product name.
- [x] T052 [FR-007] Verify existing roast pork false-positive exclusions still pass.
- [x] T053 [FR-006, FR-007, FR-008] Run matcher and broader meals-check regression tests after implementation.
- [x] T054 [FR-006, FR-007, FR-008] Regenerate dashboard cache/sync and verify the roast beef case updates as expected, if live pipeline credentials are available.
- [x] T055 Update CHANGELOG.md and promote the spec back to Final once implementation and verification evidence are complete.
- [x] T056 [FR-009] Add and pass regression coverage excluding burgers from roast beef matches.
- [x] T057 [FR-010] Add and pass regression coverage keeping roast beef partial when named broccoli is absent.

## Requirement-to-Task Mapping

- FR-001 → T010, T021
- FR-002 → T010, T022
- FR-003 → T010, T020
- FR-004 → T010, T023
- FR-005 → T010, T030, T031
- FR-006 → T050, T051, T053, T054
- FR-007 → T050, T052, T053, T054
- FR-008 → T051, T053, T054
- FR-009 → T056, T053, T054
- FR-010 → T057, T053, T054

## Phase 5: Proposed Generic Expected Components for Partial Meals

- [x] T060 [FR-011, FR-012] Add failing matcher regression coverage for `Salmon (frozen) and potato slices and frozen veg` where only a potato item is matched and `missing_components` should include salmon/fish plus frozen veg expectations.
- [x] T061 [FR-011, FR-012] Extend `tesco_matcher.py` missing-component generation beyond roast-only `missing_roast_components()` so partial non-roast component meals emit targeted expected components.
- [x] T062 [FR-011, FR-012] Ensure generated expected components are meal-specific labels and not broad unmatched-grocery dumps.
- [x] T063 [FR-011, FR-012] Regenerate dashboard cache and verify the salmon/potato/frozen-veg meal has non-empty `missing_explanations` for dashboard `Expected Items`.
- [x] T064 [FR-011, FR-012] Run matcher tests, dashboard sync/tests as needed, and owning-skill validator before promoting back to Final.

## Additional Mapping

- FR-011 → T060, T061, T062, T063, T064
- FR-012 → T060, T061, T062, T063, T064
- SC-010 → T060, T063, T064
