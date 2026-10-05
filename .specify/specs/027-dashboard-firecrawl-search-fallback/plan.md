# Implementation Plan: Dashboard Firecrawl Search Fallback for Product Description

Status: Draft
Feature: 027-dashboard-firecrawl-search-fallback
Skill: data-science/meals-check
Revision: 2 (sync-time architecture)

## Summary

Add Firecrawl search as a sync-time tier in the meals-check Python enrichment pipeline (`scripts/sync-dashboard-data.py`). When the Apollo cache extraction (spec 021) returns an empty `description` for a product and no curated-static entry matches, the sync calls Firecrawl's `/v1/search` endpoint with `<cleanName> site:tesco.com` and writes the returned snippet into `products/{tpnc}.json` under a new `firecrawl` sub-object with a 21-day TTL (reusing the existing Apollo TTL). The dashboard read path (`resolveProductInfoForItem`) composes the snippet as the third tier of the Apollo → curated-static → placeholder chain. Disabled by default via `MEALS_FIRECRAWL_FALLBACK` env var; reversible with zero code changes.

This plan is **detailed at Draft time** because the bounded scope is clear from the existing Apollo implementation pattern and the 3-product Firecrawl test on 2026-06-18.

## Technical Context

- **`_fetch_tesco_apollo_cache(tpnc, timeout)`** — `scripts/sync-dashboard-data.py:99`. The existing Apollo extraction. `_fetch_firecrawl_search_snippet(item_name, timeout)` mirrors this function's shape and uses the same timeout + delay env vars.
- **`MEALS_PRODUCT_ENRICHMENT_TIMEOUT_SECONDS`** — existing env var (default 5). Reused for Firecrawl per-item timeout (FR-012).
- **`MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS`** — existing env var (default 0.2). Reused for Firecrawl per-item delay (FR-013).
- **`MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS`** — existing env var (default 21). Reused for Firecrawl TTL (FR-006). Same TTL as Apollo — no new env var.
- **`enrich_order_items_with_product_metadata(...)`** — the existing orchestrator that calls Apollo per item. The new Firecrawl call slots in AFTER Apollo extraction and BEFORE the blob write (FR-014).
- **`apollo_cache_to_product_info(...)`** — the existing function that maps the Apollo `ProductType:<tpnc>` dict to the dashboard's `ProductInfo` shape. The Python sync writes this dict to `products/{tpnc}.json`. The new code merges the `firecrawl: { snippet, lastFetched }` sub-object into the dict before the write.
- **`_fetch_via_hermes_agent(...)`** — the existing Hermes-agent fallback for Apollo. Unrelated to Firecrawl.
- **`resolveProductInfoForItem(item)`** — `lib/dashboard-ui-utils.ts:282`. The dashboard read path. *(Spec 010 Rev 4, 2026-06-22: the curated-static tier is removed. The new chain is Apollo → Firecrawl snippet → placeholder text. The Firecrawl tier is added BEHIND the placeholder, not in place of the removed curated-static.)*
- **`ProductBlob` interface** — `lib/dashboard-sync.ts:73`. Gains one optional field `firecrawl?: { snippet: string; lastFetched: string }`.
- **Firecrawl `/v1/search`** — `POST https://api.firecrawl.dev/v1/search`. Body: `{"query": "<name> site:tesco.com", "limit": 1}`. Bearer auth via `Authorization: Bearer <FIRECRAWL_API_KEY>`. Returns `{success, data: [{url, title, description}], id}`.

## Constitution Check

- **One user story per feature** — satisfied. Seven user stories, all about the sync-time Firecrawl tier for `description`.
- **Closure-not-deletion** — N/A. This is a new spec, not a closed one.
- **FR-NNN required** — satisfied. 18 FRs (FR-001 through FR-018), all `FR-\d{3}`.
- **Skill contract source of truth** — `skill.spec.yaml` will be updated to add the Python test file + remove the Rev 1 artefact paths. The existing `scripts/sync-dashboard-data.py` is the runtime contract for sync; spec 027 extends it additively.
- **Runtime state is declared, not committed** — `FIRECRAWL_API_KEY` is in `~/.hermes/.env`, not committed. `MEALS_FIRECRAWL_FALLBACK` is a runtime env var. The cron job must source the env before invocation (Open Question 4).

## Implementation Phases

### Phase 1 — Python Firecrawl function

- Modify `scripts/sync-dashboard-data.py`:
  - Add `MEALS_FIRECRAWL_FALLBACK` to the module-level env-var constants
  - Add a one-time missing-key warning flag (analogous to Apollo's)
  - Add `def _fetch_firecrawl_search_snippet(item_name: str, timeout: float = PRODUCT_ENRICHMENT_TIMEOUT_SECONDS) -> Optional[str]:`
    - If `MEALS_FIRECRAWL_FALLBACK != '1'`, return `None`
    - If `FIRECRAWL_API_KEY` is missing/empty, log warning once, return `None`
    - Compute `query = f"{clean_name} site:tesco.com"` using the existing `clean_item_name` helper (Python equivalent of TypeScript `cleanItemName`)
    - `urllib.request.Request('https://api.firecrawl.dev/v1/search', data=json.dumps({"query": query, "limit": 1}).encode(), headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "User-Agent": "meals-check-sync/1.0 (danny@houseofthomas)"})`
    - Apply `PRODUCT_ENRICHMENT_TIMEOUT_SECONDS` via `urllib` (existing pattern in Apollo call)
    - POST, parse JSON, return `data[0].description` or `None` (zero hits, malformed JSON, non-2xx)
    - Wrap in try/except; never raise

### Phase 2 — Wire into sync orchestration

- Modify `enrich_order_items_with_product_metadata(...)` (or whichever orchestrator wraps Apollo):
  - After Apollo extraction returns a ProductType dict with empty `description`, call `_fetch_firecrawl_search_snippet(clean_name)`
  - If the call returns a snippet, set `product_dict["firecrawl"] = {"snippet": snippet, "lastFetched": datetime.now(timezone.utc).isoformat()}`
  - If the call returns `None` for zero-hits (HTTP 200 with empty `data`), set `product_dict["firecrawl"] = {"snippet": None, "lastFetched": <now>, "status": "not_found"}` (per Open Question 5)
  - If the call returns `None` for error (HTTP 4xx/5xx, network), do NOT write `firecrawl` to the dict (no record of attempt — Open Question 6)
  - Honour the existing `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` TTL: if the existing blob's `firecrawl.lastFetched` is within TTL, skip the call entirely

### Phase 3 — Dashboard read path composition

- Modify `lib/dashboard-ui-utils.ts:282` (`resolveProductInfoForItem`):
  - In the `generated` (Apollo blob) branch, add `|| productMetadata.firecrawl?.snippet` to the `description` fallback chain. *(Spec 010 Rev 4: the prior `|| productDatabase[normalizedItem]` substring-match tier is removed. The new chain is: Apollo → Firecrawl snippet → placeholder text.)*
  - No other branches change (curated-static and placeholder branches remain as-is)
- Modify `lib/dashboard-sync.ts:73` (`ProductBlob` interface):
  - Add `firecrawl?: { snippet: string | null; lastFetched: string; status?: "ok" | "not_found" }`
  - This is purely additive — existing fields unchanged
- Modify `lib/dashboard-data.ts` if `ProductBlob` is re-exported there (verify via grep)

### Phase 4 — Python unit tests

- New file `scripts/test_firecrawl_search.py`:
  - `unittest`-based, mirroring any existing test patterns in `scripts/test_*.py`
  - Mock `urllib.request.urlopen` with `unittest.mock.patch`
  - Test cases (FR-016):
    - Disabled by default (FR-005)
    - Missing API key fallback (FR-007)
    - Successful search returns first hit's description (FR-004)
    - Zero hits returns None + writes `status: "not_found"` (Open Question 5)
    - HTTP 401/403/429/5xx returns None + logs warning (FR-009)
    - Query contains `site:tesco.com` (FR-003)
    - The scrape endpoint URL `/v1/scrape` does NOT appear in the module (FR-002)
    - Timeout honoured (FR-012)
    - Delay applied after call (FR-013)
  - Reset env vars in `setUp` to avoid cross-test pollution

### Phase 5 — TypeScript unit tests

- Modify `lib/dashboard-ui-utils.test.ts`:
  - Add 4 new vitest cases (FR-017):
    - Apollo populated → `firecrawl` not consulted
    - Apollo empty + curated-static populated → `firecrawl` not consulted
    - Apollo empty + curated-static empty + `firecrawl.snippet` populated → `firecrawl.snippet` returned
    - All three empty → placeholder returned
  - Add a `firecrawl` field to the existing test fixtures where appropriate

### Phase 6 — Documentation

- Update `meals-dashboard/PREVIEW_ENVIRONMENT.md`:
  - Document `MEALS_FIRECRAWL_FALLBACK` (default off)
  - Document the cron-job env-var propagation (Open Question 4)
  - Remove Rev 1's `MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER` (replaced by Apollo's shared TTL)
- Update `data-science/meals-check/SKILL.md` line 46 (the Firecrawl summary):
  - Update the sentence to reflect sync-time architecture
- Update `data-science/meals-check/skill.spec.yaml` `expected_artifacts`:
  - Add `scripts/test_firecrawl_search.py`
  - Remove `lib/firecrawl-description-fallback.ts`, `lib/firecrawl-description-fallback.test.ts`, `app/api/firecrawl-description/route.ts`, `components/firecrawl-description-fetcher.ts` (Rev 1 artefacts)
- Update `references/tesco-firecrawl-fallback-investigation-2026-06-18.md`:
  - Update the "Verdict" section to reflect sync-time architecture as the chosen path

## Files Touched (Rev 2)

| File | Action | Why |
|---|---|---|
| `scripts/sync-dashboard-data.py` | EDIT (additive, ~80 lines) | New `_fetch_firecrawl_search_snippet` + integration into orchestrator |
| `scripts/test_firecrawl_search.py` | NEW | Python unit tests |
| `lib/dashboard-ui-utils.ts` | EDIT (additive, ~5 lines) | New `description` fallback tier |
| `lib/dashboard-sync.ts` | EDIT (additive, ~5 lines) | New optional `firecrawl` field on `ProductBlob` |
| `lib/dashboard-ui-utils.test.ts` | EDIT (~50 lines added) | 4 new vitest cases |
| `meals-dashboard/PREVIEW_ENVIRONMENT.md` | EDIT (replace Rev 1 section) | Document sync-time env vars |
| `data-science/meals-check/SKILL.md` | EDIT (1 line) | Update Firecrawl summary |
| `data-science/meals-check/skill.spec.yaml` | EDIT | Update `expected_artifacts` |
| `references/tesco-firecrawl-fallback-investigation-2026-06-18.md` | EDIT | Update verdict |

## Files NOT Touched (Constitution Invariants)

| File | Why |
|---|---|
| `lib/blob-storage.ts` | Existing reader/writer unchanged; `firecrawl` field rides on existing JSON shape |
| `lib/dashboard-data.ts` | `ProductBlob` interface re-exported; no new fields here |
| `lib/product-database.ts` | *(Spec 010 Rev 4, 2026-06-22: REMOVED.)* The 38-entry static fallback is deleted; spec 027 no longer references it. |
| `components/dashboard-client.tsx` | Modal renders whatever `resolveProductInfoForItem` returns; no client-side fetch needed |
| `lib/runtime-mode.ts` | Spec 024 runtime mode unchanged |
| `lib/debug-mode.ts` | Spec 022 debug mode unchanged |
| `components/demo-mode-banner.tsx` | Spec 024 banner unchanged |
| `app/page.tsx`, `app/layout.tsx` | No layout changes |

## Risks

- **Risk: real-world snippet quality**. The 3-product test showed good snippets, but Tesco's Google snippets may be sparse for long-tail products. **Mitigation**: disabled by default (FR-005), 21-day TTL (FR-006), reversible via env var (NFR-003). Danny can disable after preview observation with zero code changes.
- **Risk: credit cost overrun at first sync**. If `MEALS_FIRECRAWL_FALLBACK=1` is enabled for the first time on a year of orders, every item missing description will trigger a Firecrawl call once. A year of orders with 30% description miss rate × 50 orders × 30 items × 30% = ~450 items × 1 credit = 450 credits burned in one run. **Mitigation**: the 21-day TTL means only the next 21 days of orders need Firecrawl on the first run; older orders are processed without Firecrawl (the TTL filter reads the existing blob, which is absent for older items, so they ALL get Firecrawl — but the cap is bounded by 21 days of new orders going forward). Acceptable cost for a one-time backfill.
- **Risk: `FIRECRAWL_API_KEY` not propagated to cron job**. If the cron job doesn't source the chef profile's `.env`, the sync will silently disable Firecrawl (FR-007). **Mitigation**: verify the cron job shell sources the env during Phase 1 (Open Question 4). Log a clear warning at sync start when the key is missing.
- **Risk: existing product blobs without `firecrawl` key break the dashboard**. **Mitigation**: the new TypeScript field is `firecrawl?: { ... }` — optional, so absent is treated as "no Firecrawl snippet available". The resolver falls through to placeholder for items Apollo + curated-static couldn't cover. Verified by FR-015 and FR-017 test case.

## Promotion Plan

- **Draft → Proposed**: after this plan is reviewed and Python + TypeScript tests pass locally.
- **Proposed → Final**: after Phase 1-6 land on preview, Python tests pass, vitest passes, Danny enables `MEALS_FIRECRAWL_FALLBACK=1` on preview, observes real-world snippet quality over at least one full sync run, and the implementation is merged to main and deployed to production. Per Promotion Criteria block in spec.md.
- **If Danny chooses not to enable on production**: spec 027 stays at Proposed with a CHANGELOG note explaining the opt-out. It does not auto-promote to Final.
