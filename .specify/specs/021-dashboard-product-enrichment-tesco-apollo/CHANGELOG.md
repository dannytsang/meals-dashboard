# Change Log: Dashboard Product Enrichment from Tesco Apollo Cache

Feature ID: `021-dashboard-product-enrichment-tesco-apollo`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits/status-history questions.

## Entries

### 2026-06-23 — Final (admin reconciliation: stale Draft-status note + index.yaml cross-refs)

- Change: Reconciled admin-only drift on 2026-06-23 by the chef profile (Danny's instruction). (a) `tasks.md` top-of-file note flipped from "Draft status — this tasks list is a skeleton" to "Status (2026-06-22) — Final since 2026-06-16", with the historical skeleton note preserved as a quote for audit-chain context. (b) `index.yaml` entry updated: `last_reviewed_at: 2026-06-23`; `related_specs` now includes spec 010 (consumer), spec 027 (Firecrawl fallback for description), spec 032 (product payload endpoint split). Spec body, FRs, plan, and CHANGELOG entry for the cross-ref amendment are unchanged.
- Status after change: Final (unchanged)
- Rationale: Danny asked on 2026-06-23 to fix the admin-only state mismatch between `Final` (status) and "Draft status" (the tasks.md preamble), and to surface the related_specs cross-references so the implementation pick-up list for the coder profile is unblocked. The cross-ref amendment for spec 010 Rev 4 (2026-06-22) is also recorded in `plan.md` and the spec 021 CHANGELOG; this admin reconciliation closes the audit chain on that cross-ref.
- Implementation impact: None. Admin-only change. No runtime code, no test changes, no plan.md body changes. The underlying Phase 2–7 tasks remain pending for the coder profile (T010..T062 in tasks.md). Spec 033 (Vercel Blob advanced operations on/off switch) is deferred.
- Evidence: `index.yaml` diff shows `related_specs: []` → `[010, 027, 032]` and `last_reviewed_at: '2026-06-16'` → `'2026-06-23'`; `tasks.md` diff shows the preamble note flip; validator clean.

### 2026-06-16 — Draft (spike findings captured)

- Change: Created `021-dashboard-product-enrichment-tesco-apollo/` as a Draft feature after the 2026-06-16 spike against `https://www.tesco.com/shop/en-GB/products/<tpnc>`. The spike proved that (a) the product page is server-rendered HTML with a full Apollo cache JSON blob embedded inline at the `"ProductType:<tpnc>":` key, (b) the blob contains every field the dashboard needs (storage, preparation, ingredients, allergens, nutrition, marketing, image, brand, category), and (c) the current search-only enrichment in `scripts/sync-dashboard-data.py` returns zero product links because the URL pattern moved from `/groceries/en-GB/products/<slug>` to `/shop/en-GB/products/<numeric-tpnc>`. Spec captures the proposed replacement: name→tpnc search (cached), product-page fetch, Apollo-cache JSON extraction, stable tpnc-keyed enrichment, atomic cache write, 14-day freshness window, one-shot backfill script, and the no-fabrication invariant.
- Status after change: Draft
- Rationale: Danny asked (2026-06-16) what could be done to improve the data quality of pre-enriched Tesco product metadata feeding the dashboard's product detail overlay (feature `010-dashboard-product-detail`). The previous "what can be done" analysis (also 2026-06-16) was a *design conversation*; this Draft converts the design into a reviewable spec. Ten open questions remain (field-mapping confirmations, cooking-instructions flattening, ingredients as HTML vs plain text, nutrition table shape, backfill scope, tpnc preservation, substitution items, freshness window, tpnc collision, output for the user) — these are blocking items for promotion from Draft to Proposed.
- Implementation impact: None yet (Draft). When promoted to Proposed, expected changes: rewrite `fetch_tesco_product_metadata` and `_extract_tesco_product_metadata` in `/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py`; add `scripts/backfill_tesco_product_metadata.py`; update `scripts/test_product_enrichment.py` with new unit tests; update `skill.spec.yaml` `expected_artifacts:` to include the new backfill script. `lib/product-database.ts` and the dashboard modal are deliberately **not** in this spec's surface (incremental adoption in a follow-up workstream).
- Evidence: Spike notes are the conversation log on 2026-06-16 (three product payloads: Tesco Strawberries & Blueberries 400G, Tesco Mature Cheddar 700G, Tesco Stonebaked The American Pepperoni Pizza 311G — each demonstrating Apollo-cache JSON extraction, all required fields populated, URL pattern change, no rate limit at 1 req/sec). Spike findings will be promoted to `references/tesco-apollo-cache-shape.md` in this spec directory at Proposed time.
