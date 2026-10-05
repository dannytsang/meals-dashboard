---
name: dashboard-product-enrichment-tesco-apollo
description: "Replace the search-page Tesco product enrichment in sync-dashboard-data.py with stable tpnc-keyed product blobs written to Vercel Blob. Product metadata (title, image, description, storage, preparation, ingredients, allergens, nutrition, brand, category) is stored as one immutable blob per tpnc. Order blobs carry only a productBlobPath reference. The dashboard read path composes product data at read time. This decouples product data lifecycle from order data lifecycle, keeping blob storage immutable and TTL-manageable independently."
---

# Feature Specification: Dashboard Product Enrichment from Tesco Apollo Cache

Feature ID: `021-dashboard-product-enrichment-tesco-apollo`

Feature Name: Dashboard Product Enrichment from Tesco Apollo Cache — Separate Product Blob Architecture

Target Skill: `data-science/meals-check`

Created: 2026-06-16

Status: Final

Change history: CHANGELOG.md

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Enriched Product Data at Read Time (Priority: P1)

As Danny, I want product metadata (description, storage, preparation, ingredients, allergens, nutrition, brand, category) to be stored as separate product blobs in Vercel Blob, keyed by tpnc, so that:
- A product's data is fetched from Tesco once and reused across all orders without re-fetching
- The order blob is not mutated when a product's metadata is refreshed
- Product data can be refreshed independently by TTL without touching order history
- The dashboard reads and composes product data at read time from the product blobs

**Acceptance Scenarios**:

1. Given a receipt item's tpnc is already known (from a prior enrichment), When the dashboard read path runs, Then it reads `products/{tpnc}.json` from blob storage and uses that as the `productMetadata` without making any network request to Tesco.

2. Given a receipt item's tpnc is not yet known, When the enrichment pipeline runs, Then it searches Tesco for the item name, resolves the tpnc, fetches the product page, writes `products/{tpnc}.json` to blob storage, and records the `productBlobPath` on the item.

3. Given a product blob's `lastFetched` is older than the freshness window (default 21 days), When the enrichment pipeline runs, Then it re-fetches the product page and overwrites `products/{tpnc}.json` with fresh data, without touching the order blob.

4. Given a product blob's `lastFetched` is within the freshness window, When the enrichment pipeline runs, Then it uses the existing `products/{tpnc}.json` without making a network request to Tesco.

5. Given Tesco returns a non-200 status, network error, or missing `ProductType:<tpnc>` entity, When the enrichment runs, Then it logs a warning, does not write a product blob, and does not crash the sync.

6. Given the dashboard read path encounters an item with a `productBlobPath` that does not exist in blob storage, When it composes the data, Then it falls back gracefully: no product metadata shown, no error thrown.

### User Story 2 — Backfill Existing Cache Entries (Priority: P2)

As Danny, I want a backfill script to populate product blobs for all items already in the product metadata cache, so the dashboard shows rich product data for past orders as soon as the backfill completes.

**Acceptance Scenarios**:

1. Given a cache entry has a `productUrl` of the form `https://www.tesco.com/shop/en-GB/products/<tpnc>`, When the backfill runs, Then it parses the tpnc from the URL, fetches the product page, extracts the Apollo cache blob, and writes `products/{tpnc}.json`.

2. Given a cache entry has no tpnc (old `/groceries/en-GB/products/<slug>` URL form), When the backfill runs, Then it falls back to a name-based search to resolve the tpnc before the product-page fetch.

3. Given a cache entry's product page fetch fails or returns no `ProductType:<tpnc>` entity, When the backfill runs, Then it records the entry as `unmatched` with a reason string in the backfill summary, and leaves the original cache entry unchanged.

4. Given the backfill has processed all entries, When the script exits, Then it prints a summary line showing upgraded / already-complete / unmatched counts and exits 0.

5. Given the backfill is run a second time, When it processes an already-upgraded entry, Then it skips the entry (no network request) unless `--force` is passed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The enrichment pipeline MUST be implemented as a replacement for the existing `fetch_tesco_product_metadata` / `enrich_order_items_with_product_metadata` functions in `/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py`. The new code writes `products/{tpnc}.json` blobs to Vercel Blob instead of embedding `productMetadata` in order blobs. The function signature of `enrich_order_items_with_product_metadata` is preserved; callers do not change.

- **FR-002**: Each `products/{tpnc}.json` blob MUST contain all of the following fields: `tpnc` (string), `gtin` (string|null), `tpnb` (string|null), `title` (string), `description` (string), `storage` (string), `preparation` (string), `ingredients` (string), `allergens` (string), `nutrition` (string, markdown table), `brand` (string), `category` (string), `imageUrl` (string), `productUrl` (string), `source` (string, value `"tesco.com"`), and `lastFetched` (string, ISO 8601 timestamp with timezone).

- **FR-003**: The `products/` manifest (`meta/products-manifest-{hash}.json`) MUST be updated whenever any product blob is written or refreshed. The manifest maps `{tpnc}` to `{blobPath}` and is itself content-addressed. The top-level `pointers/latest.json` is updated to include `productsManifestPath` alongside the existing `manifestPath`.

- **FR-004**: Order blobs MUST NOT contain embedded `productMetadata` dicts. Instead, each `GroceryItem` in an order blob MUST contain `tpnc` (when product data exists) and MAY omit both `productBlobPath` and `productMetadata` entirely. The order blob is immutable once written.

- **FR-005**: The dashboard read path (`lib/dashboard-data.ts` / `getDashboardData`) MUST read product blobs at read time: for each visible order item with a `tpnc`, it derives `products/{tpnc}.json` and fetches that blob, returning a `products` map keyed by tpnc. Missing product blobs resolve to `null`. This is done in parallel with order/coverage blob fetches.

- **FR-006**: The dashboard TypeScript client MUST surface `tpnc` (and no longer require `productBlobPath`) in the `GroceryItem` interface in `lib/meals-data.ts`. The `GeneratedProductMetadata` interface remains for the resolved product info shape used by the modal.

- **FR-007**: The product-page fetch MUST extract the `ProductType:<tpnc>` entity from the embedded Apollo cache JSON by searching the HTML for `"ProductType:<tpnc>":` and then JSON-parsing the following value object. The parser MUST use a brace-counter to find the closing `}` and handle nested strings correctly.

- **FR-008**: The enrichment MUST map Apollo cache fields to the `ProductBlob` shape as follows: `prod.title` → `title`; `prod.description` + `prod.details.productMarketing` (joined) → `description`; `prod.details.storage` + `prod.details.freezingInstructions` (appended for frozen) → `storage`; `prod.details.preparationAndUsage` + flattened `prod.details.cookingInstructions.{oven,microwave,grill}.{chilled,frozen}` → `preparation`; `prod.media.images[0].url` (unmasked, unescaped) → `imageUrl`; `prod.details.ingredients` (HTML-stripped, list joined with `, `) → `ingredients`; `prod.details.allergens[].values` (flattened) → `allergens`; `prod.details.nutrition[]` (rendered as markdown table) → `nutrition`; `prod.brandName` → `brand`; `prod.departmentName / prod.aisleName / prod.shelfName` → `category`; `prod.tpnc` → `tpnc`; `prod.gtin` → `gtin`; `prod.tpnb` → `tpnb`.

- **FR-009**: The enrichment MUST strip HTML tags from `details.ingredients` before persisting: regex `re.sub(r"<[^>]+>", " ", s)` then collapse whitespace.

- **FR-010**: The enrichment MUST decode `\u002F` to `/` and `\u0026` to `&` in all URL fields before persisting.

- **FR-011**: The enrichment MUST NOT fabricate any field. If a field is absent in the Apollo cache, the corresponding `ProductBlob` field is left as empty string (or `null` for `tpnc`/`gtin`/`tpnb`).

- **FR-012**: The enrichment MUST respect a freshness window: product blobs with `lastFetched` newer than `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` (default 21 days) are used without a network request. Product blobs older than the window are re-fetched and the blob is overwritten with updated `lastFetched`. The `productsManifestPath` is updated on every product blob write.

- **FR-013**: The enrichment MUST log a warning (using `print(f"  ⚠ …")`) on any non-200 response, network error, JSON parse failure, or missing `ProductType:<tpnc>` entity. It MUST NOT raise an exception out of the per-item try/except and MUST NOT write a product blob on failure.

- **FR-014**: The backfill script (`/home/hermes/workspace/meals-dashboard/scripts/backfill_tesco_product_metadata.py`) MUST accept `--dry-run`, `--force`, and `--limit N` flags. For each cache entry, it resolves the tpnc (from URL or name search), fetches the product page, writes `products/{tpnc}.json`, and updates the products manifest. It MUST print a summary line and exit 0 on success.

- **FR-015**: The backfill script MUST record an `unmatched` field (non-empty reason string) for any entry that cannot be upgraded, so the operator can see which items were left alone. Original cache entry is preserved.

- **FR-016**: The enrichment MUST honour `MEALS_PRODUCT_ENRICHMENT=0` as a kill switch (skip all enrichment, write no product blobs) and `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS` as a rate limit knob.

- **FR-017**: The dashboard modal (`components/dashboard-client.tsx`) MUST render `Storage`, `Preparation`, `Ingredients`, `Allergens` (amber warning style), and `Nutrition` (markdown table) as separate sections, sourced from the resolved `productMetadata` shape. Additionally, it MUST display a TTL badge showing: the `lastFetched` date (formatted as "Fetched {date}") when `lastFetched` is present; and a "Refreshes {date}" badge (or "Refresh overdue" amber badge when expired) computed client-side as `lastFetched + PRODUCT_METADATA_TTL_DAYS`. The `expiresAt` value is NOT stored in the blob — it is derived at render time so that changes to `PRODUCT_METADATA_TTL_DAYS` take effect immediately without a blob rewrite.

### Non-Functional Requirements

- **NFR-001**: A product page fetch (including network, parse, and blob write) MUST complete in under 2 seconds on average. Sync runtime increase per item MUST be under 1 second.
- **NFR-002**: No new Python or Node dependencies. Uses only `urllib`, `re`, `json` (Python stdlib) and existing project dependencies.
- **NFR-003**: Each product blob is approximately 2–15 KB. At 500 unique products, total product blob storage is under 8 MB — well within the 500 MB Vercel Blob limit.
- **NFR-004**: The enrichment writes only to Vercel Blob (products + manifest); it does not write to the local `tesco_product_metadata_cache.json` file (local cache is deprecated; product blobs are the source of truth in Vercel Blob).

### Key Entities

- **ProductBlob**: Written to `products/{tpnc}.json` in Vercel Blob. Contains all fields from FR-002 plus `lastFetched`. One blob per tpnc. Immutable once written; overwritten on TTL expiry re-fetch.

- **ProductsManifest**: Written to `meta/products-manifest-{hash}.json`. Maps `{tpnc}` → `{blobPath}`. Content-addressed by hash of its contents. Referenced from `pointers/latest.json` as `productsManifestPath`.

- **GroceryItem (updated)**: Each item in an order blob carries `tpnc?: string` (with optional `productBlobPath`/`productMetadata` retained only for legacy transition compatibility). The dashboard read path derives `products/{tpnc}.json` from `tpnc` and uses the fetched blob as the resolved product metadata.

- **ResolvedProductInfo (unchanged)**: The modal-facing shape assembled at read time from the product blob. Fields: `title`, `description`, `storage`, `preparation`, `ingredients`, `allergens`, `nutrition`, `image`, `productUrl`, `lastFetched`, `expiresAt` (computed), `source`.

- **Tesco Apollo cache entry**: The JSON value at the `"ProductType:<tpnc>":` key in a product page's HTML. Source of truth for all product fields.

### Contract Impact

- `scripts/sync-dashboard-data.py`: `enrich_order_items_with_product_metadata` updated to write product blobs to Vercel Blob and set `productBlobPath` on items. Does not embed `productMetadata` in order blobs.
- `scripts/backfill_tesco_product_metadata.py`: writes `products/{tpnc}.json` blobs and updates the products manifest. Accepts `--dry-run --force --limit`.
- `scripts/data/tesco_product_metadata_cache.json`: deprecated as source of truth; kept for backwards compat during transition. Backfill reads from it; dashboard does not.
- `lib/meals-data.ts`: `GroceryItem.productMetadata` replaced with `GroceryItem.productBlobPath?: string`.
- `lib/dashboard-data.ts`: read path fetches product blobs by `productBlobPath` reference and composes `productMetadata` at read time.
- `lib/dashboard-ui-utils.ts`: `resolveProductInfoForItem` updated to populate `lastFetched` and computed `expiresAt` in all three return paths. `PRODUCT_METADATA_TTL_DAYS = 21` constant added.
- `components/dashboard-client.tsx`: updated — modal renders TTL badge showing fetch date and refresh/expiry date.
- `app/api/dashboard-sync/route.ts`: handles `productBlobPath` on items in order blobs. Writes product blobs and products manifest alongside order/coverage/summary blobs.
- `skill.spec.yaml`: `expected_artifacts:` updated to reflect new backfill script and removed local-cache artifacts.

## Open Questions *(resolved)*

1. **Separate product blobs** — Resolved: product data stored in `products/{tpnc}.json`, order blobs carry `productBlobPath` reference. This is the architecture of this spec.
2. **TTL window** — Resolved: 21 days (default). Configurable via `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS`.
3. **Cooking instructions flattening** — Resolved: oven > microwave > grill, chilled > frozen priority.
4. **Ingredients as HTML or plain text** — Resolved: HTML stripped to plain text before persisting (FR-009).
5. **Nutrition table shape** — Resolved: rendered as markdown table in the product blob.
6. **Substitution items** — Resolved: substitution name used for search if original name fails.
7. **Tpnc collision (delisted product reused)** — Resolved: TTL re-fetch handles stale data; no active re-validation beyond TTL.
8. **Backfill scope** — Resolved: one-shot script; not a cron job.
9. **Local cache file** — Resolved: deprecated; Vercel Blob product blobs are the source of truth. Local cache kept only for back compat during backfill transition.

## Verification Plan

- Unit tests: name→tpnc resolution, Apollo-cache JSON extraction (mocked HTML), field mapping, freshness TTL short-circuit, backfill dry-run/upgrade/unmatched paths, HTML strip, `\u002F` decode, no-fabrication invariant.
- Integration test: stubbed Tesco product pages + dashboard-sync API route; verify `products/{tpnc}.json` blobs written, `productBlobPath` on items, products manifest updated, no `productMetadata` embedded in order blob.
- Read path test: feed items with `productBlobPath` to `getDashboardData`; verify `productMetadata` correctly resolved from product blobs.
- End-to-end: run sync against real Tesco order; inspect Vercel Blob to confirm `products/` blobs written; verify dashboard modal renders new fields.
- Backfill: run backfill against existing cache snapshot; confirm `products/` blobs written and products manifest updated.

## Reference Material

- Spike notes: 2026-06-16 probe of three Tesco product pages confirmed Apollo cache structure.
- `lib/meals-data.ts` `GroceryItem`: updated to use `productBlobPath` instead of `productMetadata`.
- `lib/dashboard-data.ts` `getDashboardData`: updated read path for product blob composition.
- Feature `010-dashboard-product-detail`: consumer of the resolved product info in the modal.
- Feature `016-dashboard-blob-storage-layout`: blob storage layout this spec extends with a `products/` namespace.
- Feature `017-dashboard-blob-read-path`: read path that composes product data at read time.
