# Change Log: Dashboard Sync

Feature ID: `004-dashboard-sync`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or “why did this change?” questions.

## Entries

### 2026-06-14 — Migrate dashboard data from git-committed to Vercel Blob

- Change: Migrated dashboard data storage from git-committed `lib/real-data.ts` to Vercel Blob. Dashboard data is now POSTed from Hermes to the dashboard's private `/api/dashboard-data` API route and stored in Vercel Blob. Dashboard reads from Blob at server-side runtime. `lib/real-data.ts` is added to `.gitignore`. Dashboard GitHub repo no longer contains private meal/order/receipt data.
- Status after change: Final
- Rationale: Danny identified that the public GitHub repository contained private Tesco order data (order numbers, item names, prices, delivery dates, meal plans). Migration to Vercel Blob removes private data from the public git history while keeping the dashboard fully independent and self-hosted on Vercel.
- Implementation impact: `sync-dashboard-data.py` replaced git-commit step with HTTP POST to dashboard API; dashboard API route writes to Vercel Blob; `lib/dashboard-data.ts` reads from Blob instead of `lib/real-data.ts`; `lib/real-data.ts` added to `.gitignore` and removed from git.
- Dependencies: Vercel Blob store `meals-dashboard-blob` must be connected to the Vercel project; `BLOB_READ_WRITE_TOKEN` and `DASHBOARD_DATA_SECRET` must be configured as Vercel environment variables.
- Evidence: Spec `004-dashboard-sync` updated to reflect new architecture; implementation pending.

### 2026-06-14 — Preserved matched-item receipt details through dashboard sync

- Change: Added and implemented a sync contract requiring generated matched-item receipt details, including prices, to flow from meals-check cache into `realCoverage[].matchedItems` even when the matched item belongs to a different delivery window than the visible receipt.
- Status after change: Final
- Rationale: Danny observed Meal Detail Overlay matched items such as `Tesco British Beef Medium Roasting Joint 0.868KG` showing `price N/A` while some same-window items such as hash browns had prices. The missing prices were caused by string-only matched-item cache entries plus sync attempting to recover prices only from the visible receipt items.
- Implementation impact: `tesco_meal_check.py` now writes matched items as detail objects; `sync-dashboard-data.py` preserves dict matched items and remains backward compatible with old string-only cache entries.
- Evidence: `python3 -m unittest test_tesco_completed_meals test_tesco_matcher test_tesco_meal_check_windows test_tesco_report_display test_scheduled_meals_check -v` passed 38 tests; `python3 -m unittest scripts/test_product_enrichment.py -v` passed 4 tests; production data probe showed roast beef matched item modal prices as £13.02, £0.69, and £1.80.

### 2026-06-14 — Finalised Tesco product enrichment and dashboard sync contract

- Change: Implemented the best-effort Tesco product enrichment stage in dashboard sync, with product-link confidence gating, cache reuse, timeout/rate-limit controls, and truthful fallbacks for HTTP 403/rate limits/no confident match. Promoted Dashboard Sync back to Final after verification.
- Status after change: Final
- Rationale: Danny asked to implement the Proposed dashboard specs. Product enrichment is now bounded and optional: generated metadata is preserved when confidently found, but unresolved items remain unchanged rather than blocking or fabricating details.
- Implementation impact: `/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py` enriches receipt items before generated `real-data.ts`; `/home/hermes/.hermes/scripts/data/tesco_product_metadata_cache.json` is runtime cache state and must not be committed.
- Evidence: `python3 -m unittest scripts/test_product_enrichment.py -v` passed 3 tests; `python3 scripts/sync-dashboard-data.py --skip-fetch --dry-run` resolved the current cache without side effects; dashboard tests/build/static scan passed; owning-skill validator passed; dashboard commits `df3f200` and `cc85cd4` pushed; Vercel production deployment aliased `https://meals-dashboard.vercel.app`.

### 2026-06-14 — Use normal Tesco website search for enrichment

- Change: Clarified that product enrichment should try normal Tesco website search/product pages for receipt items and treat HTTP 403/rate limits/no confident match as fallback outcomes rather than a permanent provider blocker. Removed the implication that a separate approved provider/source is required before implementation can continue.
- Status after change: Proposed
- Rationale: Danny clarified that the skill should search the Tesco website to try to find each item, not stop because unauthenticated search may return 403.
- Implementation impact: Implement T050–T054 as bounded best-effort website search with caching, timeouts, rate limits, confidence checks, and truthful fallback metadata; do not fabricate data or attempt credential theft/CAPTCHA evasion/security-control circumvention.
- Evidence: Danny correction on 2026-06-14 after the daily Proposed-spec implementation job reported Dashboard Sync blocked by Tesco HTTP 403.

### 2026-06-14 — Tesco enrichment source remains blocked

- Change: Recorded that the pre-push Tesco product enrichment stage remains Proposed rather than implemented. The dashboard now preserves and consumes generated product metadata when present, but a compliant Tesco enrichment source is still required for automatic metadata creation.
- Status after change: Proposed
- Rationale: A direct unauthenticated Tesco grocery search probe returned HTTP 403; the spec forbids bypassing Tesco access controls, CAPTCHA, robots controls, or fabricating product data.
- Implementation impact: Do not mark T050–T054 complete until a permitted Tesco data source, authenticated export, API, or approved alternative enrichment source exists.
- Evidence: `python3` `urllib.request` probe of `https://www.tesco.com/groceries/en-GB/search?query=Tesco%20Blueberries%20500G` returned `HTTPError HTTP Error 403: Forbidden` on 2026-06-14.

### 2026-06-13 — Proposed Tesco product enrichment before dashboard push

- Change: Reopened Dashboard Sync to add a best-effort Tesco product enrichment stage after dashboard/order data is created and before generated dashboard data is pushed.
- Status after change: Proposed
- Rationale: Danny observed that product detail is slow when opened and suggested using Tesco, the primary shopping source, during the data-generation path rather than searching at modal-open time.
- Implementation impact: Future implementation must enrich receipt/order items with optional Tesco product metadata, preserve it through `dashboard_cache.json` and `real-data.ts`, add caching/timeouts/rate limits, preserve fallback behaviour, and verify sync/build/deploy.
- Evidence: Spec update requested on 2026-06-13; runtime implementation intentionally deferred.

### 2026-06-13 — Proposed pipeline-owned delivery metadata for dashboard

- Change: Reopened Dashboard Sync as Proposed to require generated dashboard data to expose pipeline-resolved Tesco delivery metadata for dashboard delivery markers.
- Status after change: Proposed
- Rationale: Danny identified a fundamental logic problem: the dashboard must not reconstruct operational delivery facts from hard-coded recurring weekdays or a single receipt delivery date. Delivery markers are event facts owned by the meals-check pipeline/calendar resolution.
- Implementation impact: Future implementation must extend dashboard cache/`real-data.ts` with explicit delivery metadata, preserve it through sync, and add regression coverage that regular Tesco weekdays without actual delivery events do not produce markers.
- Evidence: Spec update requested on 2026-06-13 after live dashboard showed a false delivery marker for a regular Saturday while pipeline cache had next delivery on 2026-06-16.

### 2026-06-10 — Preserve generated substitution metadata

- Change: Clarified that dashboard sync preserves optional receipt item substitution metadata when present in the generated cache.
- Status after change: Final
- Rationale: Product detail now has a real data path for generated substitution metadata rather than a dead UI-only field.
- Implementation impact: `sync-dashboard-data.py` preserves `substitutedWith`/`substituted_with`/`substitution` item metadata into `real-data.ts`.
- Evidence: `npm test`, `npm run build`, and owning-skill validator.

### 2026-06-10 — Split dashboard UI behaviours into dedicated specs

- Change: Trimmed this feature back to dashboard cache/sync/deploy scope and moved current dashboard UI behaviours into separate feature specs.
- Status after change: Final
- Rationale: Keep one coherent user-facing capability per feature spec rather than letting `004-dashboard-sync` become a catch-all dashboard UI contract.
- Implementation impact: Documentation/contract split only; no runtime code change.
- Evidence: Inspected `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx` and dashboard support libraries; owning-skill validator.

### 2026-06-10 — Documented meal-card detail interaction

- Change: Added the existing dashboard meal-card click-to-detail interaction to the Dashboard Sync feature spec, plan, tasks, and requirement traceability.
- Status after change: Final
- Rationale: The implementation already exposes meal-level detail from current generated dashboard data, but the Final brownfield spec only described sync/deploy behaviour.
- Implementation impact: Documentation/contract alignment only; no runtime code change.
- Evidence: Inspected `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx`; owning-skill validator.

### 2026-06-08 — Standards alignment

- Change: Initialised feature-level changelog and aligned spec-governance artifacts with the current standard.
- Status after change: Final
- Rationale: Preserve auditability for feature-level governance and standards review.
- Implementation impact: None; documentation-governance only.
- Evidence: Owning-skill validator and repo-wide standards review.

### 2026-06-04 — Final current-behaviour capture

- Change: Captured implemented brownfield behaviour as a Final feature specification with plan and task traceability.
- Status after change: Final
- Rationale: Preserve auditability for feature-level governance and standards review.
- Implementation impact: Documentation contract captured current behaviour.
- Evidence: Owning-skill validator and repo-wide standards review.
