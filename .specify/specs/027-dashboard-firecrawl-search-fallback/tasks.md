# Tasks: Dashboard Firecrawl Search Fallback for Product Description

Status: Draft
Feature: 027-dashboard-firecrawl-search-fallback
Skill: data-science/meals-check
Revision: 2 (sync-time architecture)

Tasks are sequenced by phase. A task is "done" when its acceptance criteria pass and the diff matches the listed file paths. Rev 1 read-time tasks are superseded — see plan.md for the implementation shape.

## Phase 1 — Python Firecrawl function

- [ ] **T001** — In `scripts/sync-dashboard-data.py`, add `_fetch_firecrawl_search_snippet(item_name: str, timeout: float = PRODUCT_ENRICHMENT_TIMEOUT_SECONDS) -> Optional[str]`.
  - Honours `MEALS_FIRECRAWL_FALLBACK` (default off, FR-005).
  - Honours `FIRECRAWL_API_KEY`; missing key → log once, return None (FR-007).
  - POSTs to `https://api.firecrawl.dev/v1/search` with `{query: f"{clean_name} site:tesco.com", limit: 1}` (FR-003).
  - Returns `data[0].description` or `None` (FR-004).
  - 5-second timeout via `PRODUCT_ENRICHMENT_TIMEOUT_SECONDS` (NFR-001).
  - Wrap in try/except; never raise (NFR-002).
  - Logs warning on non-2xx (FR-009).
  - User-Agent: `meals-check-sync/1.0 (danny@houseofthomas)` (NFR-006).
  - Does NOT call `/v1/scrape` (FR-002).
  - Uses only stdlib (`urllib`, `json`, `time`) (FR-011).

## Phase 2 — Wire into sync orchestration

- [ ] **T002** — Modify `enrich_order_items_with_product_metadata(...)` in `scripts/sync-dashboard-data.py`.
  - After Apollo extraction returns a ProductType dict with empty `description`, call `_fetch_firecrawl_search_snippet(clean_name)`.
  - On non-None return: set `product_dict["firecrawl"] = {"snippet": snippet, "lastFetched": <now>}`.
  - On zero-hits return: set `product_dict["firecrawl"] = {"snippet": None, "lastFetched": <now>, "status": "not_found"}` (Open Question 5).
  - On HTTP error / network error: do NOT write `firecrawl` key (no record).
  - Honour `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` TTL: if existing blob has `firecrawl.lastFetched` within TTL, skip the call (FR-006).
  - Apply `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS` delay after each Firecrawl call (FR-013).

## Phase 3 — Dashboard read path composition

- [ ] **T003** — Edit `lib/dashboard-ui-utils.ts:282` (`resolveProductInfoForItem`).
  - In the `generated` (Apollo blob) branch, add `|| productMetadata.firecrawl?.snippet` to the `description` fallback chain.
  - No other branches change.

- [ ] **T004** — Edit `lib/dashboard-sync.ts:73` (`ProductBlob` interface).
  - Add `firecrawl?: { snippet: string | null; lastFetched: string; status?: "ok" | "not_found" }`.
  - No existing fields removed, renamed, or repurposed.

- [ ] **T005** — If `ProductBlob` is re-exported from `lib/dashboard-data.ts`, propagate the new field. Verify via grep.

## Phase 4 — Python unit tests

- [ ] **T006** — Create `scripts/test_firecrawl_search.py`.
  - `unittest.mock.patch` on `urllib.request.urlopen`.
  - Cover all cases listed in plan.md Phase 4 (FR-016).
  - Reset env vars in `setUp`.

## Phase 5 — TypeScript unit tests

- [ ] **T007** — Edit `lib/dashboard-ui-utils.test.ts`.
  - Add 4 new vitest cases for the four-way composition (FR-017).
  - Add `firecrawl` field to test fixtures where appropriate.

## Phase 6 — Documentation

- [ ] **T008** — Edit `meals-dashboard/PREVIEW_ENVIRONMENT.md`.
  - Replace Rev 1 Firecrawl section with sync-time equivalent.
  - Document `MEALS_FIRECRAWL_FALLBACK` (default off).
  - Document `FIRECRAWL_API_KEY` env-var propagation to cron job.

- [ ] **T009** — Edit `data-science/meals-check/SKILL.md` line 46.
  - Update Firecrawl summary to reflect sync-time architecture.

- [ ] **T010** — Edit `data-science/meals-check/skill.spec.yaml` `expected_artifacts`.
  - Add `scripts/test_firecrawl_search.py`.
  - Remove Rev 1 artefacts: `lib/firecrawl-description-fallback.ts`, `lib/firecrawl-description-fallback.test.ts`, `app/api/firecrawl-description/route.ts`, `components/firecrawl-description-fetcher.ts`.

- [ ] **T011** — Edit `references/tesco-firecrawl-fallback-investigation-2026-06-18.md`.
  - Update the "Verdict" section to reflect sync-time architecture.

## Phase 7 — Verification

- [ ] **T012** — Run `python3 scripts/test_firecrawl_search.py`. Confirm all tests pass.
- [ ] **T013** — Run `npx vitest run lib/dashboard-ui-utils.test.ts -v`. Confirm new cases pass + no regression.
- [ ] **T014** — Run `npx tsc --noEmit`. Confirm clean.
- [ ] **T015** — Run a dry-run sync against a fixture order with `MEALS_FIRECRAWL_FALLBACK=1`. Confirm `products/{tpnc}.json` blobs have `firecrawl.snippet` populated when Apollo `description` was empty.
- [ ] **T016** — `git diff main` against the implementation branch. Confirm:
  - `scripts/sync-dashboard-data.py` has additive changes (new function + integration, no removed logic).
  - `lib/dashboard-ui-utils.ts` has one small additive edit in `resolveProductInfoForItem`.
  - `lib/dashboard-sync.ts` has one new optional field on `ProductBlob`.
  - One new file: `scripts/test_firecrawl_search.py`.
  - `lib/dashboard-ui-utils.test.ts` has 4 new test cases.
  - **NOT touched**: `lib/blob-storage.ts`, `lib/dashboard-data.ts` (unless re-exporting), `lib/product-database.ts`, `components/dashboard-client.tsx`, `app/page.tsx`, `app/layout.tsx`.

## Phase 8 — Deployment (Proposed → Final gate)

- [ ] **T017** — Deploy to preview with `MEALS_FIRECRAWL_FALLBACK=1`. Trigger a sync run. Confirm `products/{tpnc}.json` blobs have `firecrawl.snippet` populated for items where Apollo `description` was empty.
- [ ] **T018** — Open the dashboard. Open the Product Detail modal for an item where Apollo `description` was empty. Confirm the modal shows the Firecrawl snippet.
- [ ] **T019** — Disable via `MEALS_FIRECRAWL_FALLBACK=0`. Run sync again. Confirm zero `firecrawl` keys are added to product blobs.
- [ ] **T020** — Set `firecrawl.lastFetched` to 25 days ago on a fixture blob. Run sync. Confirm Firecrawl is called (timestamp is older than 21-day TTL). Set it to 5 days ago. Run sync. Confirm Firecrawl is NOT called.
- [ ] **T021** — Open PR for review. After merge to main, confirm Vercel production deploy succeeds.
- [ ] **T022** — Danny observes real-world snippet quality over at least one full sync run with the tier enabled on production. If quality is acceptable, enable on production Vercel env (and propagate `FIRECRAWL_API_KEY` to the cron job's env). If not, leave `MEALS_FIRECRAWL_FALLBACK` unset on production and update spec 027's CHANGELOG.md with an opt-out note.
- [ ] **T023** — Once production evidence is captured, update spec 027 status to `Final` in `index.yaml` AND `spec.md`. Verify both files moved atomically (per spec-driven-skills convention).
