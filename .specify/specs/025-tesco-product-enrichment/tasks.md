# Tasks: Tesco Product Enrichment — Source-of-Truth Investigation (025)

**Input**: `.specify/specs/025-tesco-product-enrichment/spec.md`

> **Status: Draft (2026-06-17) — investigation only**. This spec is a design decision record. The only "task" in `tasks.md` is the diagnostic script (US1) that the Draft itself proposes as Step 1 of `plan.md`. All implementation work for any fallback layer is deferred to follow-up specs that this Draft does not own (see `plan.md` "Step 2 — Decide based on the report").

## Phase 1 — Spec authoring (this Draft)

- [x] T001 Write `spec.md` (Background, candidate sources, architecture, FRs, Open Questions, Promotion Criteria)
- [x] T002 Write `plan.md` (the 6 steps to reach Final)
- [x] T003 Write `CHANGELOG.md` (single Draft entry, today)
- [x] T004 Write `tasks.md` (this file — investigation-only task list)
- [x] T005 Write `references/tesco-product-enrichment-sources.md` (per-source notes)
- [x] T006 Write `scenarios.yaml` + `traceability.yaml`
- [x] T007 Add entry to `.specify/specs/index.yaml` with `status: Draft, readiness: spec_only`
- [x] T008 Update `skill.spec.yaml` `expected_artifacts:` to include this spec directory and its source files
- [x] T009 Validate: `python3 /home/hermes/workspace/Hermes-Skills/software-development/spec-driven-skills/scripts/validate_spec_skill.py /home/hermes/workspace/Hermes-Skills/data-science/meals-check`

## Phase 2 — Diagnostic script (deferred, US1, FR-009 / FR-010)

> Implementation of this phase is what converts this Draft from "design record" to "design record + measured gap". Without this phase running, the Draft cannot promote to Final (per Promotion Criteria block in `spec.md`).

- [ ] T010 Implement `scripts/product_enrichment_gap_classifier.py` with the G1a..G4 mode taxonomy from `spec.md` Background (FR-010). Classifier reads blob contents + sync log; NEVER re-fetches product pages (Open Question 5).
- [ ] T011 Implement `scripts/diagnose_product_enrichment_gaps.py` that walks the last 6 months of order blobs + product blobs from Vercel Blob and produces a JSON + Markdown report (FR-009). Report MUST include counts-by-mode + a sample-of-five names per mode for manual review (US1 Acceptance Scenario 1).
- [ ] T012 Run the diagnostic against real data. Save the report to `references/diagnose-product-enrichment-gaps-{date}.md`. Use it to answer Open Question 1.
- [ ] T013 Decide based on the report (per `plan.md` Step 2): (a) no implementation, (b) follow-up spec for search fix, (c) follow-up spec for parser fix, (d) follow-up spec for OFF integration, (e) mix. Cut the follow-up spec(s) with their own IDs (likely 026+).

## Phase 3 — Curated static extension (deferred, US2, FR-011)

> Only if Danny decides (in Phase 2) that curated static extension is the right first move. Lowest-cost gap-fill; no code changes outside `lib/product-database.ts`.

- [ ] T020 Audit `lib/product-database.ts` existing entries for staleness (e.g. the "Activia Rhubarb" entry is for a product Danny no longer buys). Delete stale entries.
- [ ] T021 Identify the top 10 products Danny buys every week or two from the last 6 months of orders. For each, add a curated entry to `lib/product-database.ts` with `description`, `storage`, `preparation`, `image`, `nutrition` (FR-011).
- [ ] T022 Verify: trigger a sync and confirm that the next sync's `resolveProductInfoForItem` returns the curated data for these items via `findProductInfo` (US2 Acceptance Scenario 4).

## Phase 4 — Optional OFF integration (deferred, US3)

> Only if Danny decides (in Phase 2) that OFF is the right fallback. P3 priority because storage/preparation (Danny's headline ask) are NOT in OFF's schema. Only helps ingredients / allergens / partial nutrition / image.

- [ ] T030 Spot-check OFF coverage on 5 known Danny products via `https://world.openfoodfacts.org/api/v2/product/{gtin}.json` (Open Question 3). If coverage is <50%, drop US3 entirely and document the decision in `references/tesco-product-enrichment-sources.md`.
- [ ] T031 Implement `lib/off-client.ts` with `getOffProduct(gtin: string): Promise<OffProduct>` and a 30-day TTL cache stored inside the product blob under `off` sub-object (FR-003 / FR-004 / FR-005 / FR-007).
- [ ] T032 Wire `lib/dashboard-data.ts` to parallel-fetch OFF when Apollo fields are empty and `gtin` is present (FR-008). Must NOT block the read path on slow / missing OFF.
- [ ] T033 Add env vars `MEALS_OFF_ENRICHMENT`, `MEALS_OFF_ENRICHMENT_MAX_AGE_DAYS=30`, `MEALS_OFF_ENRICHMENT_DELAY_SECONDS=0.5` (FR-005 / FR-006).
- [ ] T034 Verify: deploy to preview, confirm OFF-fetched items render ingredients / allergens / image from OFF in the Product Detail modal (US3 Acceptance Scenarios 6-10).

## Phase 5 — No aggregator escalation (US4, FR-013)

> Codified by absence; no implementation tasks. The architecture diagram in `spec.md` Background does not include any paid aggregator layer.

- [ ] (no tasks; this is a non-feature)

## Phase 6 — Promotion to Final

- [ ] T040 Once Phase 2 has run and Danny has decided, update `spec.md` Status to `Final`, update `index.yaml` to `status: Final, readiness: already_satisfied` (if no follow-up was needed) or `spec_only` (if a follow-up spec owns the implementation).
- [ ] T041 Add a `CHANGELOG.md` entry recording the Final decision and the chosen follow-up path (if any).
- [ ] T042 Re-validate: `python3 /home/hermes/workspace/Hermes-Skills/software-development/spec-driven-skills/scripts/validate_spec_skill.py /home/hermes/workspace/Hermes-Skills/data-science/meals-check`

## Phase 7 — Follow-up specs (out of scope of this spec)

> These are placeholders for follow-up specs that this Draft does NOT own. Each gets its own ID when cut.

- [ ] (potential) `026-improve-tesco-name-search` — owned by separate spec if G1a dominates
- [ ] (potential) `027-tesco-apollo-parser-fixes` — owned by separate spec if G2 dominates
- [ ] (potential) `028-tesco-off-fallback` — owned by separate spec if G3 dominates and Phase 4 is approved