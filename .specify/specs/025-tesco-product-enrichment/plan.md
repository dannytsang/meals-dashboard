# Plan: Tesco Product Enrichment — Source-of-Truth Investigation (025)

**Input**: `.specify/specs/025-tesco-product-enrichment/spec.md`

> **Status: Draft (2026-06-17) — investigation only**. This spec exists to record the design decision process for the "missing picture / description / storage / preparation" gap Danny reported on 2026-06-17. It is not an implementation plan. The "plan" below is the plan for how this Draft will reach Final, not a plan for code changes.

## Plan for this Draft to reach Final

### Step 1 — Confirm the gap size (P1, US1, FR-009 / FR-010)

- Implement `scripts/diagnose_product_enrichment_gaps.py` + `scripts/product_enrichment_gap_classifier.py`.
- The classifier reads the order blobs + product blobs from Vercel Blob and assigns each fall-through (item without `productBlobPath` OR item with stale `productBlobPath`) to a `GapMode` (G1a..G4).
- The diagnostic produces a counts-by-mode report covering the last 6 months of orders.
- **Output**: a JSON + Markdown report. Used to answer Open Question 1.

### Step 2 — Decide based on the report (gate)

Read the report. Pick one of:

- **(a) Gap is small (<5% of items)**: spec closes with no implementation. Promote to Final.
- **(b) G1 dominates (name→tpnc search misses)**: cut a separate spec (e.g. `026-improve-tesco-name-search`) that owns the fix to the search regex / pagination handling / retry-on-403. This spec stays Draft until 026 is Final or explicitly closed.
- **(c) G2 dominates (Apollo extraction fails on real product pages)**: cut a separate spec for parser fixes / retry-on-403 / fallback to HTML regex. This spec stays Draft until that is Final or closed.
- **(d) G3 dominates (Apollo fields empty for known products)**: cut a separate spec for OFF integration (US3 / FR-003..FR-008 / NFR-002). This spec stays Draft until that is Final or closed.
- **(e) Mix of G3 + repeated buys not in Apollo**: spec is partially satisfied by curated static extension (US2 / FR-011) and partially by OFF. Cut both follow-ups.

### Step 3 — Curated static extension (P2, US2, FR-011)

- Lowest-cost gap-fill. Edit `lib/product-database.ts` for the products Danny buys every week or two.
- No code changes outside the data file.
- Output: more items in the modal render useful storage / preparation text.

### Step 4 — Optional OFF integration (P3, US3)

- New `lib/off-client.ts` with 30-day TTL cache stored inside `products/{tpnc}.json` under `off` sub-object (FR-004).
- Dashboard read path parallel-fetches OFF when Apollo fields are empty and `gtin` is present (FR-003).
- New env vars: `MEALS_OFF_ENRICHMENT`, `MEALS_OFF_ENRICHMENT_MAX_AGE_DAYS`, `MEALS_OFF_ENRICHMENT_DELAY_SECONDS` (FR-005 / FR-006).
- New `User-Agent` header per FR-007.
- If OFF coverage on UK Tesco private-label products proves poor (Open Question 3), drop US3 entirely and accept G3 for those products.

### Step 5 — No aggregator escalation (US4, FR-013)

- Codified by absence: architecture diagram in `spec.md` Background does not include any paid aggregator layer.
- If a future spec is proposed that adds an aggregator, this spec's `references/tesco-product-enrichment-sources.md` must be re-reviewed and the architecture diagram updated with a justification for the change.

### Step 6 — Promote to Final

- Spec is Final when the gap is measured (Step 1) and either (a) Danny decides no implementation is needed, or (b) the chosen follow-up spec(s) are Final / Closed.
- This spec's `Status: Final` does **not** require any code to ship; it requires the design decision to be made and recorded (per Promotion Criteria block in `spec.md`).

## Risks & Mitigations

- **Risk: OFF coverage on UK Tesco private-label is poor.** Mitigation: spot-check 5 known Danny products against OFF before committing to US3 (Open Question 3). If coverage is <50%, drop US3.
- **Risk: diagnostic script (US1) is slow because it re-fetches product pages.** Mitigation: classifier MUST work from blob contents + sync log only; no re-fetch (FR-010, Open Question 5).
- **Risk: adding OFF as a fallback makes the dashboard slower.** Mitigation: OFF fetch is in the read path, parallel with the existing Apollo blob read (FR-008). If OFF is slow or unavailable, the dashboard renders Apollo + placeholder, progressively enhances.
- **Risk: curated static (US2) goes stale.** Mitigation: `lib/product-database.ts` already shows staleness (e.g. the "Activia Rhubarb" entry is for a product Danny no longer buys). The fix is editorial — Danny deletes stale entries when he notices them. No automated staleness check.
- **Risk: legal exposure on Apollo scraping grows over time.** Mitigation: the existing pipeline is already low-volume; the architecture diagram explicitly stops at OFF + curated static + placeholder and does not escalate. If Tesco changes their ToS or starts blocking, the fallback chain absorbs the loss without a code change.
- **Risk: scope creep — someone proposes Edamam, USDA, or an aggregator as "just one more fallback layer".** Mitigation: FR-013 explicitly excludes paid APIs and aggregators. Adding any of them requires a separate spec that re-opens this one.
- **Risk: the diagnostic script's classifier is wrong about the failure mode.** Mitigation: the report includes a sample-of-five names per mode for manual review (US1 / Acceptance Scenario 1). Danny can spot-check the classifier's assignments.

## See Also

- `spec.md` — Background, candidate sources, architecture diagram, requirements.
- `tasks.md` — delivery checklist (mostly "no implementation tasks").
- `references/tesco-product-enrichment-sources.md` — per-source notes (URLs, fields, ToS, rate limits).
- `CHANGELOG.md` — design history.
- Spec 021 — production Apollo path that this Draft investigates as a fallback source.
- Spec 010 — Product Detail modal that consumes the resolved product info.
- Spec 016 / 017 — Blob storage layout and read path.