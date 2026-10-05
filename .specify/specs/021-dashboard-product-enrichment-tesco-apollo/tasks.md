# Tasks: Dashboard Product Enrichment from Tesco Apollo Cache

**Input**: `.specify/specs/021-dashboard-product-enrichment-tesco-apollo/spec.md`

> **Status (2026-06-22)**: Spec 021 is `Final` (per `index.yaml` and the spec.md `Status:` line, since 2026-06-16). The skeleton-task phrasing below ("This tasks list is a skeleton …") is stale — reconciled on 2026-06-22 by the chef profile (Danny's instruction) to remove the admin-only drift between `Final` (status) and "Draft status" (this note). The historical skeleton note was the original Draft-time scaffolding; the underlying `[ ]` items below remain pending for the coder profile's pick-up. See Phase 8 of spec 010 Rev 4 for the related runtime reconciliation list. The on/off-switch for Vercel Blob advanced operations (spec 033) is deferred.

## Phase 1: Spec authoring (this Draft)

- [x] T001 Write `spec.md`
- [x] T002 Write `plan.md`
- [x] T003 Write `CHANGELOG.md`
- [ ] T004 Add entry to `.specify/specs/index.yaml` with `readiness: needs_clarification` (Draft)
- [ ] T005 Promote `references/tesco-apollo-cache-shape.md` from the spike notes (to be done at Proposed time)
- [ ] T006 Validate: `python /home/hermes/workspace/Hermes-Skills/software-development/spec-driven-skills/scripts/validate_spec_skill.py /home/hermes/workspace/Hermes-Skills/data-science/meals-check`

## Phase 2: Apollo cache extraction helper (Proposed time)

- [ ] T010 Implement `fetch_tesco_apollo_cache(tpnc, timeout)` in `sync-dashboard-data.py`
- [ ] T011 Implement the JSON-walking helper that respects strings and escaped quotes
- [ ] T012 Unit-test `fetch_tesco_apollo_cache` with a fixture HTML snippet

## Phase 3: Field mapping (Proposed time)

- [ ] T020 Implement `apollo_cache_to_product_info(apollo, original_name)` covering FR-007 through FR-010
- [ ] T021 HTML-strip `details.ingredients` (FR-008)
- [ ] T022 Decode `\u002F` and `\u0026` in persisted URLs (FR-009)
- [ ] T023 Add unit tests with the three spike product payloads (golden file)

## Phase 4: Tpnc-keyed cache + freshness (Proposed time)

- [ ] T030 Update `enrich_order_items_with_product_metadata` to consult the cache by both name and `tpnc` keys
- [ ] T031 Implement `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` (default 14) freshness check (FR-011)
- [ ] T032 Atomic cache writes (FR-003)
- [ ] T033 Update unit tests for the new lookup logic

## Phase 5: Backfill script (Proposed time)

- [ ] T040 Create `scripts/backfill_tesco_product_metadata.py`
- [ ] T041 Implement name-based search fallback for old `/groceries/en-GB/products/<slug>` URL shapes
- [ ] T042 Implement `--dry-run`, `--force`, `--limit N` flags
- [ ] T043 Implement `unmatched` field with reason (FR-014)
- [ ] T044 Create `test_backfill_tesco_product_metadata.py`

## Phase 6: Tests + governance (Proposed time)

- [ ] T050 Add tests to `test_product_enrichment.py` for: name→tpnc resolution, Apollo-cache extraction, field mapping, freshness, HTML strip, `\u002F` decode, no-fabrication (FR-015)
- [ ] T051 Update `skill.spec.yaml` `expected_artifacts:` to include the new backfill script
- [ ] T052 Run owning-skill validator + project test suite
- [ ] T053 Capture runtime evidence (live sync, dashboard modal screenshot)

## Phase 7: Backfill (Proposed time)

- [ ] T060 Run the backfill script against a snapshot of the current `tesco_product_metadata_cache.json`
- [ ] T061 Report upgraded / already-complete / unmatched counts to Danny
- [ ] T062 Commit the upgraded cache file
