# Tasks: Dashboard Grocy Pantry Coverage

**Input**: `.specify/specs/020-dashboard-grocy-pantry-coverage/spec.md`

## Phase 1: Spec authoring (this feature)

- [x] T001 Write `spec.md`
- [x] T002 Write `plan.md`
- [x] T003 Write `CHANGELOG.md`
- [x] T004 Update `index.yaml`
- [x] T005 Validate spec with `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check --strict`

## Phase 2: Matcher changes (`tesco_matcher.py`)

- [x] T010 Add Grocy call after order allocation in `match_meal()`:
  - Call `grocy_client.get_products_in_stock()` once per sync
  - For each meal with remaining unmatched items, attempt to match by name (case-insensitive substring) or exact product ID
  - Mark matched items with `source: "grocy"`
- [x] T011 Wrap Grocy call in try/except; on error log a warning and continue with order-only coverage.
- [x] T012 Add focused unit tests:
  - Grocy item matched when order does not cover
  - Order item matched with `source: "order"` even when Grocy also has it (order takes priority)
  - Grocy down → fail soft, sync continues
  - Grocy-matched items don't get `use_by_warning`
  - False-positive case: a Grocy product name that would mistakenly match a different meal item

## Phase 3: Coverage blob schema (`tesco_meal_check.py`)

- [x] T020 Update each `matched_items[]` entry's `source` field default to `"order"`.
- [x] T021 Add focused unit test asserting every `matched_items[]` entry has a `source` field.

## Phase 4: Dashboard

- [x] T030 Update `components/dashboard-client.tsx` meal detail card to render `🏠 In pantry` badge for any `matched_items[]` entry with `source: "grocy"`.
- [x] T031 Add focused tests in `components/meal-list.test.tsx`:
  - `🏠 In pantry` badge rendered for Grocy-matched items
  - No badge for order-matched items
  - No badge for refunded items
  - No badge for manual-override items

## Phase 5: Verification

- [x] T040 `python3 -m unittest test_tesco_matcher -v` passes.
- [ ] T041 `python3 -m unittest test_tesco_meal_check -v` passes.
- [ ] T042 `python3 tesco_meal_check.py --days 30 --output both` runs end-to-end with Grocy configured.
- [ ] T043 `python3 tesco_meal_check.py --days 30 --output both` runs end-to-end with Grocy unconfigured (fail-soft path).
- [x] T044 `npm test -- --run` passes in meals-dashboard.
- [x] T045 `npx tsc --noEmit` clean in meals-dashboard.
- [x] T046 `npm run build` clean in meals-dashboard.
- [x] T047 `npm run scan:static-private-data` clean.
- [ ] T048 Manual smoke: trigger a meal plan with a Grocy-only item → verify `🏠 In pantry` badge.

## Phase 6: Deploy

- [ ] T060 Commit + push scoped changes to meals-check and meals-dashboard.
- [ ] T061 Trigger production meals check + Vercel deployment.
- [ ] T062 Smoke-test production dashboard.

## Requirement-to-Task Mapping

- FR-01 → T010, T012
- FR-02 → T020, T021
- FR-03 → T030, T031
- FR-04 → T010
- FR-05 → T010, T012
- FR-06 → T010, T012
- FR-07 → T011, T012, T043
- FR-08 → T010, T012
- SC-01 → T010, T012, T030, T031, T048
- SC-02 → T010, T012
- SC-03 → T010, T012
- SC-04 → T011, T012, T043
- SC-05 → T010, T012
