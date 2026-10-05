# Tasks: Dashboard Sync

**Input**: `.specify/specs/004-dashboard-sync/spec.md`

## Phase 1: Brownfield Capture

- [x] T001 [US1] Inspect `tesco_meal_check.py` dashboard cache writing path.
- [x] T002 [US1] Inspect `sync-dashboard-data.py --skip-fetch` dashboard update behaviour.
- [x] T003 [US1] Confirm dashboard sync builds before committing data changes.
- [x] T004 [US1] Confirm Vercel deployment occurs only after committed changes or manual `--force-deploy`.
- [x] T005 [US1] Confirm `--dry-run` avoids commit, push, and deploy side effects.

## Phase 2: Contract Updates

- [x] T010 [US1] Document dashboard sync behaviour in `SKILL.md`.
- [x] T011 [US1] Declare generated dashboard cache and dashboard sync behaviour in `skill.spec.yaml`.
- [x] T012 [US1] Create Final spec and plan artifacts for `.specify/specs/004-dashboard-sync/`.

## Phase 3: Verification

- [x] T020 [US1] Run or document the bounded dashboard dry-run command.
- [x] T021 [US1] Verify generated dashboard cache is treated as runtime state, not committed skill source.
- [x] T022 [US1] Run the spec-driven skill validator for `data-science/meals-check`.

## Phase 4: Implementation Hardening

- [x] T030 [US1] Preserve optional generated substitution metadata in `sync-dashboard-data.py` receipt item output.
- [x] T031 [US1] Verify dashboard tests and build after sync metadata preservation.

## Phase 5: Proposed Delivery Metadata Contract

- [x] T040 [US1] Extend `dashboard_cache.json` generation with explicit pipeline-resolved Tesco delivery metadata for the dashboard visible planning window.
- [x] T041 [US1] Preserve generated delivery metadata through `sync-dashboard-data.py` into `real-data.ts` without requiring frontend delivery reconstruction.
- [x] T042 [US1] Add regression coverage proving a regular Tesco weekday with no actual delivery event is not emitted as a delivery marker source, while an actual pipeline-resolved delivery date is emitted.
- [x] T043 [US1] Run pipeline/dashboard sync tests, `npm run build`, owning-skill validator, and dashboard deploy only after implementation is complete. *(Pipeline/dashboard tests, build/static scan, dry-run sync, and validator passed on 2026-06-14; production deployment completed after scoped commits.)*

## Phase 6: Proposed Tesco Product Enrichment Contract

- [x] T050 [US1] Add a best-effort Tesco product enrichment stage after dashboard/order data is created and before `real-data.ts` is generated/pushed. The stage attempts normal Tesco website search/product pages for each item; HTTP 403/rate limits/no confident match falls back truthfully rather than blocking or fabricating metadata.
- [x] T051 [US1] Preserve generated Tesco product metadata through `dashboard_cache.json`/`sync-dashboard-data.py` into generated dashboard data for receipt/order items.
- [x] T052 [US1] Add caching, timeout/rate-limit controls, and fallback behaviour so failed/unmatched enrichment does not block dashboard generation indefinitely.
- [x] T053 [US1] Add regression coverage for enriched item metadata, missing enrichment fallback, and generated data validity.
- [x] T054 [US1] Run pipeline/dashboard sync tests, `npm run build`, owning-skill validator, and deploy only after implementation is complete.
- [x] T055 [US1] Preserve generated matched-item detail objects, including prices, through `dashboard_cache.json` and `sync-dashboard-data.py` into `realCoverage[].matchedItems` when matched items come from another delivery window.

## Requirement-to-Task Mapping

- FR-001 → T001
- FR-002 → T002, T020, T030, T031
- FR-003 → T003, T020
- FR-004 → T004, T020
- FR-005 → T005, T020
- FR-006 → T011, T021, T022
- FR-007 → T040, T041, T042, T043
- FR-008 → T040, T041, T042, T043
- SC-005 → T042, T043
- FR-009 → T050, T051, T053, T054
- FR-010 → T050, T052, T053, T054
- FR-011 → T055
- SC-006 → T051, T053, T054
