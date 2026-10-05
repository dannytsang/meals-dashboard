---
name: dashboard-firecrawl-search-fallback
description: "Add Firecrawl's Google-indexed search endpoint as a sync-time `description` enrichment tier in the meals-check Python pipeline (`scripts/sync-dashboard-data.py`), invoked when the existing Apollo cache extraction (spec 021) returns an empty `description` field. The snippet lands in `products/{tpnc}.json` with a 21-day TTL, bounded by the existing Apollo TTL. The dashboard read path reads the snippet as part of `resolveProductInfoForItem`'s Apollo → curated-static → Firecrawl → placeholder chain (spec 025 per-field fallback principle). No client-side fetch, no read-time budget, no Route Handler. Architecture pivot from Rev 1's read-time Route Handler design — Danny directed sync-time on 2026-06-18."
---

# Feature Specification: Dashboard Firecrawl Search Fallback for Product Description

Feature ID: `027-dashboard-firecrawl-search-fallback`

Feature Name: Dashboard Firecrawl Search Fallback for Product Description

Target Skill: `data-science/meals-check`

Created: 2026-06-18

> **Rev 2 (2026-06-18)**: Architecture pivot from read-time to sync-time. Danny redirected on 2026-06-18: "i want the product data to be gathered during the pipeline run i.e in meals check. The firecrawl fall back should be used as part of that". Rev 1's read-time Route Handler design is reverted (commit `1a9c226` on `meals-dashboard` `preview` branch reverts `29e86c3`). Rev 2 moves Firecrawl into the Python sync pipeline as a new tier of the existing per-field fallback chain, with the snippet cached in `products/{tpnc}.json` under `firecrawl.snippet` and a 21-day TTL matching the existing Apollo TTL. This **reverses** the Rev 1 "don't update the blob storage" hard constraint — Danny explicitly directed that the snippet be written to the blob. See CHANGELOG.md Rev 2 entry for full reasoning.

Status: Final

Change history: CHANGELOG.md

> **Rev 3 (2026-06-22, static-DB cross-ref amendment)**: Spec 010 Rev 4 removes the static `lib/product-database.ts` substring-match fallback from the consumer contract. The fallback chain in `resolveProductInfoForItem` is now: Apollo blob → Firecrawl snippet → placeholder text. Tier 2 (the static map) is removed entirely. This Rev 3 amends the spec to match. Spec 027's source-of-truth remains Apollo (S1) + Firecrawl (S7); the consumer no longer has a hand-coded map. Status stays `Final` (the implementation has not changed; this is a consumer-contract cross-ref amendment).
> **Rev 2 (2026-06-18)**: Architecture pivot from read-time to sync-time. Danny redirected on 2026-06-18: "i want the product data to be gathered during the pipeline run i.e in meals check. The firecrawl fall back should be used as part of that". Rev 1's read-time Route Handler design is reverted (commit `1a9c226` on `meals-dashboard` `preview` branch reverts `29e86c3`). Rev 2 moves Firecrawl into the Python sync pipeline as a new tier of the existing per-field fallback chain, with the snippet cached in `products/{tpnc}.json` under `firecrawl.snippet` and a 21-day TTL matching the existing Apollo TTL. This **reverses** the Rev 1 "don't update the blob storage" hard constraint — Danny explicitly directed that the snippet be written to the blob. See CHANGELOG.md Rev 2 entry for full reasoning.

## Background

The dashboard's Product Detail modal (spec 010) renders five fields from `resolveProductInfoForItem` (`lib/dashboard-ui-utils.ts:282`): `title`, `description`, `storage`, `preparation`, `image`, `nutrition`. The current fallback chain when the Apollo cache blob (`products/{tpnc}.json`, spec 021) is missing or has empty fields is:

1. Apollo blob from Vercel Blob (spec 021 read path)
2. *(Removed in spec 010 Rev 4, 2026-06-22)* `lib/product-database.ts` — was a hand-curated dictionary of ~20 products Danny buys repeatedly. The 38-entry static map is deleted; the dashboard no longer has a hand-coded substring-match fallback. See spec 010 Rev 4 CHANGELOG and AS-024.
3. Placeholder string ("Product information not available in generated data." — *(spec 010 Rev 4, 2026-06-22)* the placeholder text is updated to drop the "or the local product database" clause since the local product database is removed. The truthful state is "if we have the data, show it; if we don't, say so".)

When the placeholder fires for `description`, the modal shows the literal placeholder text. Danny reports this happens on a material fraction of items. Spec 025 (Draft investigation) surveyed candidate sources and identified Firecrawl search snippets as the cheapest fill for the `description` field specifically.

On 2026-06-18 Danny tested Firecrawl against 3 real Tesco products (`references/tesco-firecrawl-fallback-investigation-2026-06-18.md`):

| Test target | Firecrawl search | Firecrawl scrape |
|---|---|---|
| Tesco British Semi Skimmed Milk 2.272L (tpnc 254656543) | 1/1 returned real URL (snippet: storage instructions, net contents) | 0/3 OK (always 403 from Akamai) |
| Tesco Large Free Range Eggs 12 Pack (tpnc 260298456) | 1/1 returned real URL (snippet: price, allergen/hen-welfare description) | 2/3 OK after retries |
| Tesco Finest Wholemeal Loaf 800G (tpnc 300134377) | 1/1 returned real URL (snippet: recipe description, kibbled rye/oatbran) | 1/1 OK, 15 KB markdown |

The search endpoint is **3/3 reliable**, costs ~1 credit per query, and returns ~200 chars of pre-rendered description text. The scrape endpoint is 1/3 first-try reliable and is explicitly out of scope.

### Architecture decision — sync-time, not read-time (Rev 2)

On 2026-06-18 Danny explicitly redirected from Rev 1's read-time Route Handler design to a **sync-time architecture**:

> "i want the product data to be gathered during the pipeline run i.e in meals check. The firecrawl fall back should be used as part of that"

This is the correct architecture for three reasons:

1. **Cost bounded by item count, not render count.** Rev 1 burned ~1 Firecrawl credit per modal open. If Danny opens 30 modals in a session for 30 distinct items, Rev 1 burned 30 credits. Rev 2 burns ~1 credit per unique item per 21-day TTL — across an entire dashboard browsing session, that's at most ~30 credits total (and only if 30 distinct items all need Firecrawl on the same day). Over a 21-day window, the same 30 items cost ~30 credits total — not ~30 × number-of-renders.
2. **Snippets cached in the blob the dashboard already reads.** The dashboard's read path is `resolveProductInfoForItem` which composes Apollo + curated-static + placeholder. Adding Firecrawl as a third tier of that composition is one extra null-check. No client-side fetch, no per-render budget, no Route Handler.
3. **No client-side API key risk.** Sync runs server-side on the meals-check cron (no browser involved). The `FIRECRAWL_API_KEY` is read from the meals-check Python process env, never bundled into client code. Rev 1's Route Handler was already server-side for the key, but it was still a per-render HTTP proxy. Rev 2's sync-time approach eliminates even that overhead.

### Reversal of Rev 1 hard constraint — "don't update the blob storage"

Rev 1 codified Danny's 2026-06-18 message "Don't update the blob storage in the meals dashboard" as FR-008 (no writes to `products/{tpnc}.json`). Rev 2 **reverses** this constraint at Danny's explicit direction: the snippet MUST be written to `products/{tpnc}.json` under a new `firecrawl` sub-object so the dashboard read path can find it without any per-render work.

The new blob shape (additive change, backward-compatible):

```json
{
  "tpnc": "260298456",
  "title": "Tesco Large Free Range Eggs 12 Pack",
  "description": "",
  "imageUrl": "https://...",
  "lastFetched": "2026-06-18T19:30:00Z",
  "source": "tesco.com",
  ...
  "firecrawl": {
    "snippet": "12 Large class A free range eggs. Some of our free range packs may contain white eggs...",
    "lastFetched": "2026-06-18T19:30:00Z"
  }
}
```

Existing product blobs (without the `firecrawl` key) continue to work unchanged — `firecrawl.snippet` simply evaluates to undefined and the resolver falls through. The `firecrawl` sub-object is OPTIONAL on read and ADDITIVE on write. No existing field is removed or renamed. The `ProductBlob` TypeScript interface (in `lib/dashboard-sync.ts:73`) gains one optional field.

### What this spec does NOT do

- **Does not replace Apollo.** Spec 021 remains primary. Firecrawl is consulted only when Apollo returns empty `description` AND curated-static has no match.
- **Does not fill `storage`, `preparation`, `nutrition`.** Firecrawl search snippets don't reliably contain these fields for Tesco products. OFF (Open Food Facts) was the recommended source for those (spec 025 S3) and is a separate future spec.
- **Does not scrape product pages.** Only the Firecrawl `/v1/search` endpoint is called. The `/v1/scrape` endpoint remains out of scope.
- **Does not require a Route Handler.** Sync-time runs server-side on the meals-check cron. The dashboard read path is unchanged — it composes `description` from Apollo → curated-static → Firecrawl → placeholder.
- **Does not change the `DashboardDataReader` interface.** The `firecrawl` field rides on the existing `ProductBlob` shape.
- **Does not require new secrets at runtime.** The `FIRECRAWL_API_KEY` is read from the existing chef-profile env. For local sync runs, it's read from `~/.hermes/.env` (already configured per memory). For production cron runs, it must be added to the cron job's env (see Open Question 4).

## Relationship to Spec 025

Spec 025 (`025-tesco-product-enrichment`, Draft, on HOLD per Danny 2026-06-18) surveyed alternative product enrichment sources and identified Firecrawl search as the only durable cheap win. Spec 027 Rev 2 is the **bounded implementation** of that single win. Spec 025 stays as the rationale and the comparison matrix; spec 027 owns the code.

## Relationship to Spec 021

Spec 021 (`021-dashboard-product-enrichment-tesco-apollo`, Final) is the production product data source. Spec 027 Rev 2 is a **fallback tier behind spec 021**, not a replacement. The architectural layering per spec 025's diagram is unchanged except for adding a Firecrawl tier specifically for the `description` field, populated at sync time:

```
For each GroceryItem with a tpnc:
  ┌─ Apollo cache extraction (spec 021) ──────────────────────────────┐
  │     → write products/{tpnc}.json with all Apollo fields           │
  │     → if description is populated, Firecrawl tier is NOT consulted │
  └────────────────────────────────────────────────────────────────────┘
  ┌─ Firecrawl search fallback (NEW IN 027 Rev 2) ────────────────────┐
  │     → if Apollo description is empty:                             │
  │       POST https://api.firecrawl.dev/v1/search                    │
  │       query: "<clean item name> site:tesco.com"                   │
  │       take first hit's description snippet                        │
  │     → write products/{tpnc}.json with firecrawl.snippet           │
  │     → if Apollo fails entirely, write products/{tpnc}.json        │
  │       with ONLY firecrawl.snippet populated                       │
  └────────────────────────────────────────────────────────────────────┘
```

The dashboard read path (`resolveProductInfoForItem`) composes `description` from Apollo → curated-static → Firecrawl → placeholder:

```ts
description = apollo.description
          || curatedStatic.description
          || productBlob.firecrawl?.snippet
          || PLACEHOLDER_DESCRIPTION
```

This honours spec 025's per-field fallback principle: Apollo partial success is preserved (Apollo description populated → Firecrawl not consulted). Curated-static priority is preserved (curated-static description populated → Firecrawl not consulted). Firecrawl is consulted only when both upstream sources have empty description.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sync enriches a product with empty Apollo description (Priority: P1)

As Danny, when the meals-check sync runs against an order whose Apollo cache extraction returned an empty `description` field (and no curated-static match exists), I want the sync script to fetch a Firecrawl search snippet and write it to `products/{tpnc}.json` under the `firecrawl` sub-object, so that on the next dashboard render, the Product Detail modal shows a real description sentence instead of the literal placeholder string.

**Why this priority**: The headline user ask. The whole point of this spec.

**Independent Test**: Mock an Apollo cache extraction that returns `{ tpnc: "260298456", description: "", ... }` and a curated-static dictionary that has no match. Run the sync enrichment. Confirm the write to `products/{tpnc}.json` includes `firecrawl: { snippet: "12 Large class A free range eggs...", lastFetched: <now> }`. Confirm the dashboard read path then renders that snippet in the modal.

**Acceptance Scenarios**:
1. Given an order item whose Apollo extraction returns empty `description` AND no curated-static match, When the meals-check sync runs, Then the sync calls `POST https://api.firecrawl.dev/v1/search` with body `{"query": "<cleanName> site:tesco.com", "limit": 1}`, takes the first hit's `description`, and writes it to `products/{tpnc}.json` under `firecrawl.snippet` along with `firecrawl.lastFetched` (current ISO timestamp). The Apollo blob write also includes all other Apollo fields (spec 021 fields unchanged).
2. Given an order item whose Apollo extraction returns empty `description` AND no curated-static match, When the Firecrawl search returns zero hits, Then the sync writes `products/{tpnc}.json` WITHOUT a `firecrawl` key (or with `firecrawl: { snippet: null, lastFetched: <now>, status: "not_found" }` — see Open Question 5). No exception is raised. The sync completes normally.
3. Given an order item whose Apollo extraction returns empty `description` AND no curated-static match, When the Firecrawl API returns 401/403/429/5xx, Then the sync logs a warning with the HTTP status code, writes `products/{tpnc}.json` WITHOUT a `firecrawl` key, and continues with the rest of the sync. No exception is raised.

### User Story 2 — Dashboard renders the Firecrawl snippet (Priority: P1)

As Danny, when I open the Product Detail modal for an item whose Apollo blob has empty `description` AND no curated-static match AND Firecrawl snippet IS populated, I want the modal to show the Firecrawl snippet as the description, instead of the placeholder string.

**Why this priority**: The user's UX ask. Without this, the sync-time work is invisible to Danny.

**Independent Test**: Manually write a product blob at `products/{tpnc}.json` with empty `description` and a populated `firecrawl.snippet`. Open the dashboard. Open the Product Detail modal for that item. Confirm the modal shows the snippet text, not the placeholder string.

**Acceptance Scenarios**:
4. Given a `products/{tpnc}.json` blob with empty `description` AND a populated `firecrawl.snippet` AND no curated-static match, When the dashboard renders the Product Detail modal, Then `resolveProductInfoForItem` returns the `firecrawl.snippet` as the description field. The modal renders the snippet verbatim.
5. Given a `products/{tpnc}.json` blob with empty `description` AND a populated `firecrawl.snippet`, When the dashboard renders, Then the modal does NOT show the placeholder string ("Product information not available in generated data or the local product database.").

### User Story 3 — Apollo partial success is preserved (Priority: P1)

As Danny, when an item's Apollo extraction returns populated `description`, I want the sync to NOT call Firecrawl for that item, so I don't burn credits on items Apollo already covers.

**Why this priority**: Spec 025's per-field fallback principle. Apollo partial success beats Firecrawl full coverage for the fields Apollo covers.

**Independent Test**: Mock an Apollo extraction that returns `{ tpnc: "254992204", description: "Tesco British Semi Skimmed Milk", ... }`. Run the sync. Confirm the sync does NOT call Firecrawl (mock fetch and assert zero calls). Confirm the product blob has `description` populated and NO `firecrawl` key.

**Acceptance Scenarios**:
6. Given an order item whose Apollo extraction returns populated `description`, When the meals-check sync runs, Then the sync does NOT call Firecrawl. The product blob is written with `description` from Apollo and NO `firecrawl` key.

### User Story 4 — Curated-static priority is preserved (Priority: P2)

As Danny, when an item's curated-static dictionary has a populated `description`, I want the sync to NOT call Firecrawl for that item, so I don't burn credits on items already covered by hand curation.

**Why this priority**: Curated-static is the cheapest, most accurate source. Firecrawl is the last fallback. Ordering matters.

**Independent Test**: Add a curated-static entry for a new item with populated `description`. Add the item to a test order. Run the sync. Confirm the sync does NOT call Firecrawl for that item.

**Acceptance Scenarios**:
7. Given an order item whose Apollo extraction returns empty `description` AND `lib/product-database.ts` has an entry with populated `description`, When the meals-check sync runs, Then the sync does NOT call Firecrawl. The curated-static description is rendered at modal time. The product blob may or may not have a `firecrawl` key depending on Apollo's other fields, but no Firecrawl API call is made.

### User Story 5 — 21-day TTL is honoured (Priority: P1)

As Danny, when the sync runs against an item whose `products/{tpnc}.json` already has a `firecrawl.snippet` populated within the last 21 days, I want the sync to NOT re-fetch from Firecrawl for that item, so I don't burn credits on items that already have fresh snippets.

**Why this priority**: Sync-time architecture's cost benefit relies on the TTL. Without TTL, every sync re-fetches every item — burning credits indefinitely.

**Independent Test**: Manually write a product blob with `firecrawl.snippet` populated and `firecrawl.lastFetched` within the last 21 days. Add the item to a test order. Run the sync. Confirm the sync does NOT call Firecrawl for that item (existing snippet is reused).

**Acceptance Scenarios**:
8. Given a `products/{tpnc}.json` blob with `firecrawl.snippet` populated AND `firecrawl.lastFetched` within the last `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` (default 21), When the meals-check sync runs, Then the sync does NOT call Firecrawl. The existing snippet is preserved in the rewritten blob.
9. Given a `products/{tpnc}.json` blob with `firecrawl.snippet` populated AND `firecrawl.lastFetched` older than 21 days, When the meals-check sync runs, Then the sync DOES call Firecrawl. The new snippet replaces the old one (or is written alongside, depending on Open Question 5 resolution).

### User Story 6 — Firecrawl is disabled by default; no orphan blob writes (Priority: P1)

As Danny, when `MEALS_FIRECRAWL_FALLBACK` is unset (the default), I want the sync to behave exactly as it did before this spec — no Firecrawl calls, no `firecrawl` keys in product blobs, no schema changes to existing fields. The `firecrawl` key is simply absent from all writes.

**Why this priority**: Reversibility is the spec's safety net. If Danny disables the feature after preview observation, the blob state must remain clean.

**Independent Test**: Set `MEALS_FIRECRAWL_FALLBACK=0`. Run the sync against a fresh order. Confirm zero Firecrawl calls. Confirm all product blobs written during the sync have NO `firecrawl` key. Confirm the existing `description` field flow is unchanged.

**Acceptance Scenarios**:
10. Given `MEALS_FIRECRAWL_FALLBACK` is unset or set to `0`, When the meals-check sync runs, Then the sync does NOT call Firecrawl. The `firecrawl` key is absent from all product blobs written during the sync. Apollo + curated-static fallback chain runs unchanged.
11. Given `MEALS_FIRECRAWL_FALLBACK=1` but `FIRECRAWL_API_KEY` is missing from the sync process env, When the sync runs, Then a one-time warning is logged at sync start and the sync behaves as if `MEALS_FIRECRAWL_FALLBACK=0`. No exception is raised. No `firecrawl` keys are written.

### User Story 7 — Spec 021 fields are unchanged (Priority: P1, non-feature)

As Danny, I want the existing Apollo-extracted fields (title, description, storage, preparation, ingredients, allergens, nutrition, brand, category, imageUrl, productUrl, gtin, tpnb, tpnc, lastFetched, source) to remain unchanged in the product blob. The `firecrawl` sub-object is purely additive — no existing field is removed, renamed, or repurposed.

**Why this priority**: Spec 021 is Final and production-deployed. Spec 027 must not break it.

**Independent Test**: Run the sync against a fresh order with `MEALS_FIRECRAWL_FALLBACK=1`. Inspect the written `products/{tpnc}.json` blobs. Confirm all spec 021 fields are present and unchanged. Confirm only the additive `firecrawl` sub-object is new.

**Acceptance Scenarios**:
12. Given the implementation, When the sync runs with `MEALS_FIRECRAWL_FALLBACK=1`, Then `products/{tpnc}.json` blobs contain all spec 021 fields (title, description, storage, preparation, ingredients, allergens, nutrition, brand, category, imageUrl, productUrl, gtin, tpnb, tpnc, lastFetched, source) PLUS an optional `firecrawl` sub-object. No existing field is removed, renamed, or has its type changed.

## Functional Requirements

- **FR-001**: The Firecrawl sync-time tier MUST be triggered only when the Apollo cache extraction (spec 021) returns an empty `description` field AND no curated-static entry in `lib/product-database.ts` has a populated `description`. Apollo partial success (Apollo description populated) and curated-static priority MUST bypass the Firecrawl call entirely.
- **FR-002**: The Firecrawl sync-time tier MUST call `POST https://api.firecrawl.dev/v1/search` (the search endpoint), NOT `POST https://api.firecrawl.dev/v1/scrape` (the scrape endpoint). Any implementation that calls the scrape endpoint violates this spec.
- **FR-003**: The Firecrawl search query MUST be `<cleanItemName> site:tesco.com`, where `cleanItemName` is the cleaned order item name. The `site:tesco.com` operator is mandatory to filter to Tesco results.
- **FR-004**: The Firecrawl tier MUST take the first hit's `description` field from the search response as the snippet. If the response has zero hits, the tier MUST skip the Firecrawl write (or write a `not_found` status — see Open Question 5).
- **FR-005**: The Firecrawl sync-time tier MUST be disabled by default. The tier MUST only activate when `MEALS_FIRECRAWL_FALLBACK=1` is set in the sync process environment. When unset or set to `0`, the sync behaves exactly as before this spec — no Firecrawl calls, no `firecrawl` keys in product blobs.
- **FR-006**: The Firecrawl tier MUST honour the existing `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` TTL (default 21). When a `products/{tpnc}.json` blob already has `firecrawl.snippet` populated AND `firecrawl.lastFetched` is within the TTL window, the sync MUST NOT call Firecrawl. When the timestamp is older than the TTL, the sync MUST call Firecrawl and update both `snippet` and `lastFetched`.
- **FR-007**: The Firecrawl tier MUST read the API key from the sync process env (`FIRECRAWL_API_KEY`). If the env var is missing or empty, the tier MUST log a one-time warning at sync start and behave as if `MEALS_FIRECRAWL_FALLBACK=0` (no Firecrawl calls, no `firecrawl` keys). No exception is raised.
- **FR-008**: The Firecrawl tier MUST write the snippet to `products/{tpnc}.json` under a new `firecrawl` sub-object with shape `{ snippet: string, lastFetched: string }`. The sub-object is OPTIONAL on read (existing product blobs without it must continue to work) and ADDITIVE on write (no existing fields are touched). The `ProductBlob` TypeScript interface (in `lib/dashboard-sync.ts:73`) MUST gain one optional field `firecrawl?: { snippet: string; lastFetched: string }`.
- **FR-009**: The Firecrawl tier MUST log a warning (with HTTP status code and item name) when the Firecrawl API returns a non-2xx status. The tier MUST NOT throw; the sync continues with the rest of the items. The exception is a missing/empty `FIRECRAWL_API_KEY`, which logs once at sync start (FR-007).
- **FR-010**: The Firecrawl call MUST be implemented as a new Python function `_fetch_firecrawl_search_snippet(item_name: str, timeout: float) -> Optional[str]` in `scripts/sync-dashboard-data.py`. The function returns `None` when (a) the tier is disabled, (b) the API key is missing, (c) the API returns non-2xx, (d) the response has zero hits, or (e) the network times out. It returns the first hit's `description` string otherwise.
- **FR-011**: The Firecrawl call MUST use only Python stdlib (`urllib`, `json`, `time`). No new pip dependencies. No `requests` (already in `python_packages` but unused here — keep spec 021's `urllib` precedent).
- **FR-012**: The Firecrawl call MUST respect a per-item timeout (`MEALS_PRODUCT_ENRICHMENT_TIMEOUT_SECONDS`, default 5 seconds, same env var as the Apollo call). The function MUST abort cleanly on timeout and return `None`.
- **FR-013**: The Firecrawl call MUST respect a per-item delay (`MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS`, default 0.2s, same env var as the Apollo call). The delay is applied AFTER each Firecrawl call to avoid bursting Firecrawl's rate limiter.
- **FR-014**: The sync script MUST compose `firecrawl.snippet` into the `resolveProductInfoForItem` chain on the dashboard side. The composition order is `apollo.description || curatedStatic.description || productBlob.firecrawl?.snippet || placeholder`. The `lib/dashboard-ui-utils.ts:282` function MUST be updated to consult `firecrawl.snippet` as the third tier.
- **FR-015**: The sync script MUST remain backward-compatible. Product blobs written before this spec (without a `firecrawl` key) MUST continue to work unchanged. The `firecrawl` key absence MUST be treated as "no Firecrawl snippet available" — the resolver falls through to placeholder.
- **FR-016**: The implementation MUST add Python unit tests for `_fetch_firecrawl_search_snippet` in `scripts/test_firecrawl_search.py`. Test cases MUST cover: disabled-by-default (FR-005); missing API key fallback (FR-007); successful search returns first hit's description (FR-004); zero hits returns None (FR-004); HTTP 401/403/429/5xx returns None + logs warning (FR-009); the query contains `site:tesco.com` (FR-003); the scrape endpoint URL `/v1/scrape` does NOT appear in the sync script (FR-002); per-item delay and timeout are honoured (FR-012, FR-013).
- **FR-017**: The implementation MUST add TypeScript unit tests for the `firecrawl.snippet` composition in `lib/dashboard-ui-utils.test.ts`. Test cases MUST cover: Apollo populated → Firecrawl not consulted (FR-001, FR-014); Apollo empty + curated-static populated → Firecrawl not consulted (FR-001, FR-014); Apollo empty + curated-static empty + firecrawl.snippet populated → firecrawl.snippet returned (FR-014); all three empty → placeholder (FR-015).
- **FR-018**: The implementation MUST NOT add any new Vercel Blob namespaces. The `firecrawl` sub-object lives inside the existing `products/{tpnc}.json` blob. No new `firecrawl/{tpnc}.json` namespace.

## Non-Functional Requirements

- **NFR-001**: The Firecrawl call MUST complete in under 5 seconds per item (the existing `MEALS_PRODUCT_ENRICHMENT_TIMEOUT_SECONDS` ceiling). On timeout, the function returns `None` and the sync continues. No item is left in a half-written state.
- **NFR-002**: The Firecrawl tier MUST NOT introduce any runtime exception path. Every failure mode (missing key, HTTP error, zero hits, timeout, network error) MUST return `None` and log a warning. The sync MUST NEVER fail because the Firecrawl tier failed.
- **NFR-003**: The Firecrawl tier MUST be reversible. Setting `MEALS_FIRECRAWL_FALLBACK=0` MUST restore the pre-spec sync behaviour with zero code changes. Existing product blobs continue to render correctly (the `firecrawl` key is simply absent).
- **NFR-004**: The Firecrawl tier MUST NOT block the sync. A 5-second Firecrawl call on a single item adds at most 5 seconds + 0.2s delay to that item's sync time. For an order with 30 items where 10 need Firecrawl, the total added sync time is ~52 seconds (10 × 5.2s). This is acceptable per-item given that the order is being processed offline (cron) and the user does not perceive the latency.
- **NFR-005**: The Firecrawl tier MUST NOT add to the dashboard bundle size. The Python sync runs server-side; the dashboard read path is a small change to `resolveProductInfoForItem` that adds one null-check. The bundle impact is <100 bytes gzipped.
- **NFR-006**: The Firecrawl tier MUST identify itself via the `User-Agent` header on every Firecrawl API request, in the form `meals-check-sync/<version> (<contact>)`. This is consistent with the Apollo call's existing `User-Agent`.

## Key Entities

- **ProductBlob** (spec 021, extended): the `products/{tpnc}.json` blob. Adds one optional field `firecrawl?: { snippet: string; lastFetched: string }`. All existing fields unchanged. The TypeScript interface gains this one field; the Python dict write logic adds the sub-object only when Firecrawl returns a snippet.
- **FirecrawlSearchHit** (new): the shape returned by `https://api.firecrawl.dev/v1/search` for one result. Fields used: `url` (not consumed — TPNC comes from the order), `title` (not consumed), `description` (the snippet). Shape:
  ```python
  class FirecrawlSearchHit(TypedDict):
      url: str
      title: str
      description: str
  ```
- **FirecrawlSyncTier** (new): the new Python function `_fetch_firecrawl_search_snippet` in `scripts/sync-dashboard-data.py`. Returns `Optional[str]`. The sync orchestration in `enrich_order_items_with_product_metadata` consults this function after Apollo extraction and before the blob write.
- **ResolvedProductInfo** (existing, extended): the shape rendered by the modal. The `description` field is now filled via the extended chain `apollo.description || curatedStatic.description || firecrawl.snippet || placeholder`.

## Contract Impact

- **Python surface** (in `scripts/sync-dashboard-data.py`):
  - New function `_fetch_firecrawl_search_snippet(item_name: str, timeout: float) -> Optional[str]`
  - Modified function `enrich_order_items_with_product_metadata` (or whichever orchestrator wraps Apollo extraction) to call Firecrawl after Apollo if `description` is empty
  - Modified blob write to include `firecrawl` sub-object when Firecrawl returns a snippet
- **TypeScript surface** (in `lib/dashboard-ui-utils.ts`):
  - Modified function `resolveProductInfoForItem` to consult `productBlob.firecrawl?.snippet` as the third tier of the `description` fallback chain
  - Modified `ProductBlob` interface in `lib/dashboard-sync.ts` to add one optional field
- **New tests**:
  - `scripts/test_firecrawl_search.py` (Python unit tests for the sync-tier function)
  - New vitest cases in `lib/dashboard-ui-utils.test.ts` for the composition
- **New env vars**:
  - `MEALS_FIRECRAWL_FALLBACK` (default off) — operator-only
  - `FIRECRAWL_API_KEY` — already in `~/.hermes/.env` per memory; must be added to the cron job's env for production (Open Question 4)
- **Modified env vars**: `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` (default 21) is reused for Firecrawl TTL — no new env var
- **No new npm dependencies** (FR-011, NFR-005)
- **No new Vercel Blob namespaces** (FR-018)
- **No new Python dependencies** (FR-011)

## Open Questions

1. **What is the Firecrawl response shape on timeout vs. HTTP error?** The Python `_fetch_firecrawl_search_snippet` must distinguish these to log useful warnings. The current implementation returns `None` for both — distinguish them in the warning message? Defer until observed in practice.

2. **Should the Firecrawl snippet be sanitised before writing to the blob?** Firecrawl search snippets are Google's pre-rendered text, which may contain trailing ellipses (`...`), HTML entities, or sentence fragments. For the initial implementation, write the snippet as-is and let the modal render it. If malformed snippets show up in practice, add a `_normalizeSnippet` helper in a follow-up. Defer until observed.

3. **Should the sync rate-limit across ALL Firecrawl calls (Apollo + Firecrawl) or just Firecrawl?** Spec 021's `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS=0.2` is per-item. Apply the same delay after Firecrawl. The existing delay is sufficient — no new rate-limit knob needed. **Default decision**: apply the same per-item delay after Firecrawl.

4. **How does `FIRECRAWL_API_KEY` get to the production cron?** The meals-check cron jobs (per `skill.spec.yaml` runtime section) run under the `chef` profile. The chef profile's `.env` already has `FIRECRAWL_API_KEY`. The cron job invocation reads `~/.hermes/profiles/chef/.env` via the existing `source ~/.hermes/.env` pattern (per memory note "Vercel env vars ... never log secrets"). Verify the cron shell sources the chef env, not just the default profile env. **Defer to implementation**: open the cron job command in `chef/cron/jobs.json` and confirm the env source path during Phase 1.

5. **On zero Firecrawl hits, write `firecrawl: { snippet: null, lastFetched: <now>, status: "not_found" }` or omit the `firecrawl` key entirely?** Writing `status: "not_found"` lets the sync skip the API on every subsequent run for items Firecrawl has no data for (avoids re-burning credits). Omitting the key means the sync re-tries every 21 days. **Default decision**: write `status: "not_found"` to avoid credit waste. The dashboard read path ignores `status` — only `snippet` matters for rendering.

6. **What happens when Apollo extraction succeeds but the resulting blob write fails (network error to Vercel Blob)?** The existing Apollo write path handles this with a warning + continue (per spec 021). The Firecrawl tier inherits this behaviour — a Firecrawl call followed by a failed blob write means we lose the snippet. Acceptable; next sync retries. Defer.

## Verification Plan

- **Python unit tests** (`scripts/test_firecrawl_search.py`): cover FR-002 through FR-013, FR-016, NFR-001, NFR-002. Mock `urllib.request` with `unittest.mock`. Assert the right URL is called, the right query is sent, the right response shape is consumed.
- **TypeScript unit tests** (`lib/dashboard-ui-utils.test.ts`): cover FR-014, FR-015, FR-017. Add cases for the four-way composition (Apollo populated / curated-static populated / firecrawl populated / placeholder fall-through).
- **Sync integration test** (manual, dry-run mode): run `python3 scripts/sync-dashboard-data.py` with `MEALS_FIRECRAWL_FALLBACK=1` and a known fixture order that has an item with empty Apollo description. Inspect the written `products/{tpnc}.json` blob. Confirm the `firecrawl.snippet` is populated.
- **Dashboard integration test** (manual): write a fixture blob with empty `description` and a populated `firecrawl.snippet`. Open the dashboard. Open the modal for that item. Confirm the snippet renders.
- **TTL test** (manual): write a fixture blob with `firecrawl.lastFetched` 25 days ago. Run the sync. Confirm the Firecrawl call is made (timestamp is older than 21-day TTL). Repeat with 5-day-old timestamp. Confirm the call is NOT made.
- **Disabled-by-default test** (manual): unset `MEALS_FIRECRAWL_FALLBACK`. Run the sync. Confirm zero Firecrawl calls. Confirm zero `firecrawl` keys in any written blob.
- **No-blob-namespace regression test**: `git diff main` against the implementation branch. Confirm zero changes outside the existing `products/{tpnc}.json` blob namespace. No new `firecrawl/{tpnc}.json` namespace.

## Reference Material

- `references/tesco-firecrawl-fallback-investigation-2026-06-18.md` — the 3-product test report from 2026-06-18 that established Firecrawl search is the only durable win. Source of the field coverage / cost / reliability table in this spec's Background.
- Spec 021 — Apollo cache extraction (`scripts/sync-dashboard-data.py:_fetch_tesco_apollo_cache`); the primary `description` source. The Firecrawl tier sits AFTER Apollo in the same `enrich_order_items_with_product_metadata` orchestrator.
- Spec 025 — Source-of-truth investigation. Identified Firecrawl search as the only durable cheap win for `description`. This spec is the implementation of that single win.
- Spec 010 — Product Detail modal (`lib/dashboard-ui-utils.ts:282`). The composition chain change lives here.
- Spec 008 — Order Items list that surfaces Product Detail modals. The per-item TTL ensures the dashboard never sees stale Firecrawl snippets.
- `scripts/sync-dashboard-data.py:_fetch_tesco_apollo_cache` — the existing Apollo extraction that the Firecrawl tier follows.
- `lib/dashboard-ui-utils.ts:282` — `resolveProductInfoForItem` (the function this spec extends).
- `lib/dashboard-sync.ts:73` — the `ProductBlob` interface (gains one optional `firecrawl` field).
- `https://api.firecrawl.dev/v1/search` — Firecrawl search endpoint. Body: `{"query": "...", "limit": 1}`. Returns `{success, data: [{url, title, description}], id}`.

## Promotion Criteria for Final

This spec is at `Status: Final, readiness: already_satisfied` now that the implementation is **deployed to the production meals-dashboard Vercel environment** and the following are verified:

- [ ] Python unit tests pass (`python3 scripts/test_firecrawl_search.py`).
- [ ] TypeScript unit tests pass (`npx vitest run lib/dashboard-ui-utils.test.ts`).
- [ ] Sync integration test confirms Firecrawl snippet is written to `products/{tpnc}.json` when `MEALS_FIRECRAWL_FALLBACK=1` and Apollo description is empty.
- [ ] Dashboard integration test confirms `resolveProductInfoForItem` returns `firecrawl.snippet` when Apollo + curated-static are both empty.
- [ ] TTL test confirms sync does NOT re-fetch when `firecrawl.lastFetched` is within 21 days.
- [ ] Disabled-by-default test confirms zero Firecrawl calls and zero `firecrawl` keys when env var is unset.
- [ ] No-blob-namespace regression test passes: `git diff main` shows no new blob namespace beyond `products/{tpnc}.json`.
- [ ] Danny has enabled `MEALS_FIRECRAWL_FALLBACK=1` on production Vercel env (operator decision; the spec does not force this) and observed real-world snippet quality over at least one full sync run with the tier active.
- [ ] Preview-only deployment is NOT sufficient — production evidence required per the spec-driven-skills convention.

This aligns with Danny's 2026-06-17 rule: "the code should end up in production so its not finalised until its in production". If Danny chooses not to enable the feature on production after preview deployment (e.g. real-world snippet quality is poor), spec 027 stays at Proposed with a CHANGELOG note explaining the opt-out — it does not auto-promote.
