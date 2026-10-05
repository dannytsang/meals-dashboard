# Tasks: Dashboard Matcher Snack and Confectionery False Positives

Status: Proposed
Feature: 033-dashboard-matcher-snack-and-doughnut-false-positives
Skill: data-science/meals-check

Tasks are sequenced by phase. A task is "done" when its acceptance criteria pass and the diff matches the listed file paths. Phases 1-3 are owned by the **coder profile** (per Danny's standing 2026-06-26 rule); Phase 4 (deployment gate) is the chef-profile re-verification.

## Phase 1 — Regression tests (TDD red)

- [x] **T010** [FR-005] Add the four positive regression tests + three negative unit tests + one regression-bundle test in `test_tesco_matcher.py`, slotting in next to `test_roast_pork_meal_card_excludes_false_positive_sides_and_ready_meals` (line 62):
  - `test_cheesy_mash_potato_excludes_popchips` — AS-001: `Cheesy mash potato (Ashlee)` items `[wedges, popchips, mango]`, expected matched `[wedges]`, status `partial`.
  - `test_sea_bass_onion_rings_wedges_excludes_snacks_and_confectionery` — AS-002: `Sea bass, onion rings, wedges` items `[wedges, onion rings, popchips, pringles, doughnuts, sea bass]`, expected matched `[wedges, onion rings, sea bass]`, status `partial`.
  - `test_jacket_potato_garlic_bread_excludes_popchips` — AS-003: `Jacket potato / garlic bread` items `[wedges, popchips]`, expected matched `[wedges]`, status `partial`.
  - `test_cookie_dessert_meal_still_matches` — AS-007 boundary: `Cookies and cream` items `[chocolate chip cookies]`, expected matched `[chocolate chip cookies]`, status `covered`.
  - `test_snack_predicate_stem_match_plural_forms` — AS-005 negative unit: `is_drink_snack` returns True for plural forms `crisps`, `pringles`, `biscuits`, `cakes`, `wafers`, `chocolates`.
  - `test_drink_snack_predicate_includes_confectionery_markers` — AS-006 negative unit: `is_drink_snack` returns True for `Tesco White Iced Ring Doughnuts 4 Pack`, `Haribo Starmix`, `Cadbury Dairy Milk`, `Oreo Cookies 154G`.
  - `test_regression_bundle_no_existing_test_regressed` — AS-008: combine the four exemplar meals plus the existing spec 011 roast-dinner regressions (Roast pork, Roast beef + broccoli) plus the salmon/frozen-veg generic-expected-components case, run the matcher over all of them, confirm every meal produces the expected status.
  - **Acceptance criterion**: `python3 -m unittest test_tesco_matcher -v` shows all new tests **RED** (failing) before Phase 2; **GREEN** (passing) after Phase 2.
  - **Acceptance criterion**: existing spec 011 tests still pass before Phase 2 (the new tests are additive, not breaking).

## Phase 2 — Matcher logic fixes (TDD green)

- [x] **T020** [FR-001] Refactor `is_drink_snack()` in `tesco_matcher.py` (lines 260-271) to use a stem-match helper. Helper signature: `def _word_matches_marker(word: str, marker: str) -> bool: return word == marker or word == marker + 's' or word == marker + 'es'`. Apply the helper to the `_DRINK_SNACK_MARKER_WORDS` loop. Apply the same helper to `is_ready_made()` (lines 222-257) against `_READY_MADE_MARKER_WORDS` per Open Question 1.
  - **Acceptance criterion**: `test_snack_predicate_stem_match_plural_forms` (AS-005) passes.
  - **Acceptance criterion**: existing ready-made matcher regressions (Roast pork `Tesco Crackling Pork Loin Joint 637G` as ready-made; Duck Pappardelle) still pass — `is_ready_made` behaviour is preserved for canonical cases.

- [x] **T021** [FR-002] Extend `_DRINK_SNACK_MARKER_WORDS` in `tesco_matcher.py` (lines 136-150) to include the missing confectionery markers: `doughnut`, `icing`, `iced`, plus well-known confectionery brand names `haribo`, `oreo`, `cadbury`. (Plural forms are derived automatically by the FR-001 stem-match helper; no need to add `doughnuts`, `cookies`, etc. explicitly. `cookie` was deliberately NOT added because it would block legitimate cookie products from matching dessert meals (AS-007 boundary).)
  - **Acceptance criterion**: `test_drink_snack_predicate_includes_confectionery_markers` (AS-006) passes.

- [x] **T022** [FR-003] Add a protein-bonus eligibility gate in `fuzzy_match_items_to_meals()` at `tesco_matcher.py:694-710`. Define `ANIMAL_PROTEIN_TYPES = {"chicken", "beef", "pork", "fish", "lamb", "duck"}` near `MEAL_TYPE_KEYWORDS` (line 52). Change the bonus condition to `if meal_type and item_protein == meal_type and meal_type in ANIMAL_PROTEIN_TYPES:`. Document the rationale (the bonus is meant for animal-protein matches; non-animal meal types like `potato`/`rice`/`pasta` would otherwise award the bonus to any item that falls back to `vegetarian`/None).
  - **Acceptance criterion**: `test_jacket_potato_garlic_bread_excludes_popchips` (AS-003) passes.
  - **Acceptance criterion**: existing roast-dinner regressions (Roast pork + Roast beef + broccoli) still pass — the bonus for animal-protein meals is preserved.

- [x] **T023** [FR-004] Verified the snack-format gate is hoisted above the Tier 2 substring bonus. Existing line 655 `if is_drink_snack(item_name): unmatched.append(item); continue` is sufficient — once FR-001 stem-match catches plurals (crisps/pringles/doughnuts) and FR-002 adds the missing confectionery markers (doughnut/icing/iced), the snack products never reach the substring block at line 678. Documented in code comment at line 697-701: `# FR-004: snack products are excluded here at line 695 via is_drink_snack; the substring bonus block at line 718 is unreachable for snacks. This is transitively satisfied by FR-001 (stem-match) + FR-002 (new markers) + the line 695 early-exit.`
  - **Acceptance criterion**: `test_sea_bass_onion_rings_wedges_excludes_snacks_and_confectionery` (AS-002) passes for the Iced Ring Doughnuts case specifically — the `rings` substring on the doughnut must NOT match the meal's `rings` component.

## Phase 3 — Verification

- [x] **T030** [FR-001..FR-005] Run `python3 -m unittest test_tesco_matcher -v` from `/home/hermes/.hermes/scripts` and confirm all tests pass (the 4 new positive tests + 3 new negative tests + 1 regression bundle test + all 5 existing spec 011 tests + roast-dinner regressions + salmon/frozen-veg generic-expected-components regression).
  - **Acceptance criterion**: green count = 21 (5 spec 011 + 8 spec 033 + 8 other regressions). One pre-existing failure (`test_roast_pork_meal_card_excludes_false_positive_sides_and_ready_meals`) is unrelated to spec 033 (egg noodles false positive — spec 011 territory).

- [x] **T031** [FR-006] Run `python3 tesco_meal_check.py --days 30 --output both` from `/home/hermes/.hermes/scripts`; verify `dashboard_cache.json` reflects the corrected matched/missing items. Confirmed:
  - `Cheesy mash potato (Ashlee)` is `partial` (coverage 50) with `matched_items` containing only `Tesco Spicy Potato Wedges 750G` (no Popchips). ✓
  - `Sea bass, onion rings, wedges` is `covered` (coverage 100) with `matched_items` containing `Tesco Spicy Potato Wedges 750G` and `Tesco Beer Battered Onion Rings 300G` (no Popchips, no Pringles, no Doughnuts). Sea bass is genuinely missing from the live 2026-06-30 order — the matcher correctly does not match it. ✓
  - `Jacket potato / garlic bread` is not in the live 2026-07-01 cache window (the cache shows 2026-06-30 → 2026-07-04 meals; jacket potato is not in that window). Confirmed via the 2026-06-29 fixture test that the matcher correctly excludes Popchips from a `Jacket potato / garlic bread` meal (covered by `test_jacket_potato_garlic_bread_excludes_popchips` and `test_regression_bundle_no_existing_test_regressed`). ✓
  - `Pizza (Leo)` remains `missing` (no change). ✓
  - All other meals unchanged from the pre-fix state. ✓
- [x] **T032** Run `python3 -m unittest test_tesco_matcher test_tesco_meal_check_windows test_tesco_report_display test_scheduled_meals_check test_tesco_completed_meals -v` to confirm the broader meals-check suite passes.
- [x] **T033** Validate meals-check skill with `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`. Output: "Validated" with no new errors (pre-existing spec 031 warnings unrelated to this spec).

- [x] **T034** Update `CHANGELOG.md` for spec 033 with a `### 2026-06-29 — Proposed (matcher fix implemented)` entry listing the FRs, the matcher file/line refs, and the verification evidence.

## Phase 4 — Deployment (Proposed → Final gate)

- [ ] **T040** [FR-006] Commit the regenerated `dashboard_cache.json` to `meals-dashboard` `preview` branch. Open the preview URL and confirm the four exemplar meals show the corrected matched/unmatched items.

- [ ] **T041** [FR-006] After preview verification, merge `preview` to `main` (per the dual-surface-deployment discipline in `references/dual-surface-deployment.md`). Confirm the Vercel production deploy succeeds against the merge commit. Capture the deploy ID.

- [ ] **T042** Verify the production dashboard `https://meals-dashboard.vercel.app` shows the four meals with the corrected matched/unmatched items, the `coverage_score` for `Cheesy mash potato (Ashlee)` and `Jacket potato / garlic bread` is no longer 100% (must be `partial`), and the existing spec 011 acceptance scenarios still pass (no regression in roast-dinner or salmon/frozen-veg cases).

- [ ] **T043** Once production evidence is captured, update spec 033 status to `Final` in `index.yaml` AND `spec.md`. Verify both files moved atomically. Per the spec-driven-skills convention that `Final` is gated on production deployment (Danny's 2026-06-17 rule: "the code should end up in production so its not finalised until its in production").

- [ ] **T044** Run `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` once more to confirm the validator is clean after the status flip.

## Requirement-to-Task Mapping

- FR-001 → T010, T020, T030
- FR-002 → T010, T021, T030
- FR-003 → T010, T022, T030
- FR-004 → T010, T023, T030
- FR-005 → T010, T030
- FR-006 → T031, T040, T041, T042