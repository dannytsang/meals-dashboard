# Tesco Product Enrichment — Per-Source Notes

This document is the detailed reference companion to `spec.md` for spec 025. Each candidate source gets a section with the live URL patterns, the fields available, the ToS/legal notes, the rate-limit/reliability expectations, and the production notes for the meals-dashboard.

The eight sources in the order they appear in `spec.md` Background:

- [S1 — Tesco.com product page Apollo cache](#s1--tescocom-product-page-apollo-cache)
- [S2 — Tesco.com search-page HTML](#s2--tescocom-search-page-html)
- [S3 — Open Food Facts](#s3--open-food-facts)
- [S4 — Tesco Developer API](#s4--tesco-developer-api)
- [S5 — Edamam Food Database API](#s5--edamam-food-database-api)
- [S6 — USDA FoodData Central](#s6--usda-fooddata-central)
- [S7 — Aggregator scraping services](#s7--aggregator-scraping-services)
- [S8 — Static product-database.ts](#s8--static-product-databasets)

---

## S1 — Tesco.com product page Apollo cache

**Status in spec 025**: Primary path (unchanged from spec 021). **Do not modify.**

### URL patterns

- Product page: `https://www.tesco.com/groceries/en-GB/products/{tpnc}` (current canonical form)
- Legacy / shop form: `https://www.tesco.com/shop/en-GB/products/{tpnc}` (still resolves; redirects or 200s depending on whether the product is live)
- Mobile: `https://www.tesco.com/mobile/groceries/en-GB/products/{tpnc}` (same content, different layout)
- Image CDN: `https://digitalcontent.api.tesco.com/v2/media/ghs/{uuid}/{filename}.jpeg?h=225&w=225` (URLs are emitted with `\u002F` and `\u0026` escapes in the Apollo cache; spec 021 / FR-010 decodes them)

### Fields available (from the `ProductType:<tpnc>` entity)

| Field | Apollo path | Notes |
| --- | --- | --- |
| tpnc | `prod.tpnc` | Tesco Product Number Category |
| gtin | `prod.gtin` | EAN-13 / Global Trade Item Number |
| tpnb | `prod.tpnb` | Tesco Product Number Base |
| title | `prod.title` | First-party copy |
| imageUrl | `prod.media.images[0].url` | Unmasked, unescaped (spec 021 / FR-008) |
| productUrl | `https://www.tesco.com/groceries/en-GB/products/{tpnc}` | Constructed |
| description | `prod.description` + `prod.details.productMarketing` (joined) | spec 021 / FR-008 |
| storage | `prod.details.storage` + `prod.details.freezingInstructions` (appended for frozen) | spec 021 / FR-008 |
| preparation | `prod.details.preparationAndUsage` + flattened `prod.details.cookingInstructions.{oven,microwave,grill}.{chilled,frozen}` | Oven > microwave > grill, chilled > frozen priority |
| ingredients | `prod.details.ingredients` (HTML-stripped) | spec 021 / FR-009 — `re.sub(r"<[^>]+>", " ", s)` then collapse whitespace |
| allergens | `prod.details.allergens[].values` (flattened) | spec 021 / FR-008 |
| nutrition | `prod.details.nutrition[]` rendered as markdown table | spec 021 / FR-008 |
| brand | `prod.brandName` | |
| category | `prod.departmentName / prod.aisleName / prod.shelfName` | Joined with " / " |

### JSON-LD product schema

Tesco also emits JSON-LD product schema on the page (`<script type="application/ld+json">`), but the Apollo cache extraction (spec 021) is more reliable because:

- JSON-LD is sometimes absent (especially for Clubcard offers, delisted products, Marketplace listings)
- JSON-LD is shallower than Apollo (often missing storage, preparation, full nutrition)
- Apollo is consistent across product types; JSON-LD varies by department

For the meals-dashboard's purposes, the Apollo cache is the right primary source.

### ToS / legal

- Tesco.com terms reserve all rights in the content; the terms do not explicitly permit or prohibit scraping for personal non-commercial use.
- The UK `Ryanair v PR Aviation` line of cases established that scraping publicly available data is not a database right infringement but *can* be a breach of the website's ToS as a contractual matter. The risk to an individual doing one request per tpnc per 21 days for personal use is very low.
- The more concrete risk is **Akamai bot detection** blocking the IP, which is observed occasionally in the existing pipeline (logged as `⚠ Apollo cache fetch failed for {tpnc}` in spec 021).
- Spec 025 does NOT add any escalation tier to the scraping pipeline; if Akamai starts blocking the existing path, the fallback is OFF + curated static, not a paid aggregator.

### Rate limit

- Implicit. One request per unique tpnc per 21 days in steady state. Backfill touches ~500 unique tpncs at `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS=1.0` default (spec 021 / FR-016) — roughly 10 minutes total.
- No published hard limit; the bound is "don't trigger Akamai".
- Recommended setting: keep `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS=1.0` for sync runs, `2.0-3.0` for backfill.

### Reliability

- High when the page returns 200 and the entity parses.
- Moderate overall — prone to G1 (no tpnc) and G2 (entity missing / malformed) per spec 025 / Background "Data Gap Analysis".

### Production code references

- `scripts/sync-dashboard-data.py:116-200` — `_fetch_tesco_apollo_cache`
- `scripts/sync-dashboard-data.py:328-355` — Apollo → ProductBlob mapping (FR-002 in spec 021)
- `lib/blob-storage.ts` — `products/{tpnc}.json` blob layout

---

## S2 — Tesco.com search-page HTML

**Status in spec 025**: Already partially in use for G1a resolution. **Do not modify beyond bug fixes.**

### URL patterns

- Search: `https://www.tesco.com/groceries/en-GB/search?query={url-encoded-name}`
- Legacy search: `https://www.tesco.com/groceries/en-GB/search/-/search?q={url-encoded-name}`
- Results include product links in the form `/shop/en-GB/products/{tpnc}` (legacy) or `/groceries/en-GB/products/{tpnc}` (current)

### Fields available

| Field | Where | Notes |
| --- | --- | --- |
| tpnc | `/shop/en-GB/products/{tpnc}` URL | Regex: `r'/shop/en-GB/products/(?P<tpnc>\d+)'` |
| title | Result tile HTML | Class names change frequently — existing regex is brittle |
| imageUrl | Sometimes present in result tile | Empty for many products |
| productUrl | Constructed from tpnc | |

### ToS / legal

- Same grey area as S1.

### Rate limit

- Implicit. Called once per item lacking tpnc per sync run. ~5-20 items per sync; ~50-200 per month for Danny's household.

### Reliability

- Moderate. Search-page HTML class names change frequently (Tesco redesigns the search experience every 1-2 years). The regex in the existing pipeline is brittle; breakage is logged but not auto-detected.

### Production code references

- `scripts/sync-dashboard-data.py:357-440` — search-page HTML extraction (`_extract_from_tesco_search_html`)

---

## S3 — Open Food Facts

**Status in spec 025**: Recommended fallback for ingredients / allergens / partial nutrition / image. **Not recommended for storage / preparation.**

### URL patterns

- Get by gtin: `https://world.openfoodfacts.org/api/v2/product/{gtin}.json` (e.g. `https://world.openfoodfacts.org/api/v2/product/05000208030699.json`)
- Get by slug: `https://world.openfoodfacts.org/api/v2/product/{slug}.json` (less reliable; prefer gtin)
- Search: `https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&json=1`
- Suggest: `https://world.openfoodfacts.org/cgi/suggest.pl?tagtype={type}&term={prefix}` (autocomplete)
- Bulk search: `https://world.openfoodfacts.org/api/v2/search?code={gtin1},{gtin2},...&fields={field1},{field2},...` (comma-separated bulk)
- Pro tier: `https://world.pro.openfoodfacts.org/api/v2/product/{gtin}.json` (higher rate limits, dedicated infra, paid)

### Fields available (from API v2 product response)

| Field | API path | Notes |
| --- | --- | --- |
| product_name | `product.product_name` | Often localised; prefer `product_name_en` if available |
| brands | `product.brands` | Comma-separated |
| categories | `product.categories` | Comma-separated, hierarchical |
| ingredients_text | `product.ingredients_text` | Plain text ingredient list (good quality when present) |
| allergens | `product.allergens` | Comma-separated tags; may also include `allergens_from_ingredients` |
| nutriments | `product.nutriments` | Nested: `energy-kcal_100g`, `fat_100g`, `carbohydrates_100g`, `proteins_100g`, `salt_100g`, `sugars_100g`, etc. |
| image_url | `product.image_url` | Original upload |
| image_front_url | `product.image_front_url` | Cropped to front of packaging |
| image_ingredients_url | `product.image_ingredients_url` | Cropped to ingredients panel |
| image_nutrition_url | `product.image_nutrition_url` | Cropped to nutrition table |
| countries | `product.countries` | Where the product is sold |
| stores | `product.stores` | Where purchased |
| labels | `product.labels` | Vegan, gluten-free, etc. |
| additives_tags | `product.additives_tags` | E-numbers |
| nutriscore_grade | `product.nutriscore_grade` | a-e |
| nova_group | `product.nova_group` | 1-4 (processing level) |
| ecoscore_grade | `product.ecoscore_grade` | a-e |
| packaging | `product.packaging` | |
| **storage** | **NOT in OFF schema** | OFF does not collect storage instructions |
| **preparation** | **NOT in OFF schema** | OFF does not collect cooking instructions |

### ToS / legal

- CC BY-SA 4.0 for derived works. Free for commercial and non-commercial use with attribution.
- The OFF project asks for a `User-Agent` header identifying the consumer (e.g. `MealsDashboard/1.0 (danny@example.com)`) so they can contact heavy users.
- **Lowest legal exposure of any source** for a personal dashboard. Explicitly designed for reuse.

### Rate limit

- Soft limit. OFF's FAQ asks consumers to stay under ~10 req/s for the read API. No published hard limit; the project says "be reasonable".
- Bulk endpoints (`/cgi/search.pl`, `/api/v2/search?code=...`) exist for mass lookups — better for backfills than per-item GETs.
- Paid Pro tier (`world.pro.openfoodfacts.org`) for higher rate limits and dedicated infra. Not needed for Danny's scale.

### Auth

- None for the public endpoint.
- Optional `User-Agent` header (required for politeness, FR-007 in spec 025).

### Reliability

- High for products with EAN-13 / GTIN barcodes that have been scanned and uploaded.
- UK Tesco product coverage is **moderate but uneven** — big brands are present, Tesco private-label lines are spottier. Spot-check required before committing (Open Question 3 in spec 025).
- OFF server is operated by the Open Food Facts non-profit; uptime is generally good but not guaranteed.

### Production code references (proposed, not yet implemented)

- `lib/off-client.ts` (Phase 4 / spec 028 if cut)
- `https://openfoodfacts.github.io/openfoodfacts-server/api/` — API reference
- `https://world.openfoodfacts.org/data` — data documentation and field list

---

## S4 — Tesco Developer API

**Status in spec 025**: **Out of scope** — requires a commercial partnership Danny does not have.

### URL patterns

- Historical `groceries-api` (Tesco Labs, ~2014): `https://dev.tescolabs.com/grocery/products/?query={query}` — requires an API key from `https://dev.tescolabs.com/`. Largely deprecated.
- Current partner API: behind the Clubcard app. Requires a commercial partnership. Not accessible to individuals.
- Tesco has not published a public product API for individual developers since 2014.

### Fields available

- Full product catalogue (equivalent to Apollo cache but as a JSON API with stable schemas).

### ToS / legal

- Requires commercial agreement.

### Rate limit

- Per-partner contract.

### Auth

- OAuth2 client credentials, signed JWTs.

### Reliability

- Highest of all options if accessible. Not accessible to Danny.

### Production code references

- None. Mentioned only for completeness.

---

## S5 — Edamam Food Database API

**Status in spec 025**: **Out of scope** — commercial cost + ToS overhead + similar coverage gap as OFF.

### URL patterns

- Food Database: `https://api.edamam.com/api/food-database/v2/parser?app_id={id}&app_key={key}&upc={gtin}`
- Branded (deprecated): `https://api.edamam.com/api/food-database/v2/branded/parser?...`
- Nutrition Data: `https://api.edamam.com/api/nutrition-data?...` (different API)

### Fields available

| Field | Notes |
| --- | --- |
| Per 100g nutrition (energy, macros, micros) | Standard |
| Ingredient list | Sometimes present |
| Allergens | Sometimes |
| Label claims (vegan, gluten-free) | Sometimes |
| Category | Hierarchical |
| Image | Sometimes |
| Brand | Yes |
| UPC/EAN | Yes (the lookup key) |
| **storage** | **NOT in Edamam schema** |
| **preparation** | **NOT in Edamam schema** |
| UK Tesco private-label coverage | Partial; sparser than OFF |

### ToS / legal

- Commercial ToS. Free tier: 10 req/min, 10k req/month. Pro tier ~$99/month and up.
- ToS prohibits bulk export / caching the entire database.
- Acceptable for read-through-on-render usage (the data is fetched and immediately displayed, not bulk-cached).

### Rate limit

- Free tier: 10 req/min, 10k req/month.
- Pro tier: configurable, contract-defined.

### Auth

- App ID + App Key (free signup at `https://developer.edamam.com/`).

### Reliability

- High (commercial SLA).

### Production code references

- None. Mentioned only as a fallback if OFF coverage proves insufficient (Step 4 in spec 025 plan).

---

## S6 — USDA FoodData Central

**Status in spec 025**: **Out of scope** — US-centric, no UK Tesco product coverage.

### URL patterns

- FDC API: `https://api.nal.usda.gov/fdc/v1/foods/search?api_key={key}&query={query}`
- FDC API (no key, low volume): `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query={query}` (DEMO_KEY is throttled to 30 req/hour per IP)
- Single food: `https://api.nal.usda.gov/fdc/v1/food/{fdcId}?api_key={key}`

### Fields available

| Field | Notes |
| --- | --- |
| Nutrient data per 100g (energy, macros, micros, vitamins, minerals) | Authoritative |
| Standard reference ingredients | Generic foods only |
| Branded-food product records | US-branded products only |
| **storage** | **NOT in FDC schema** |
| **preparation** | **NOT in FDC schema** |
| **EAN / GTIN** | **Limited; mostly US UPC** |
| **UK Tesco products** | **NOT in FDC's branded dataset** |

### ToS / legal

- Public domain (US government). No restrictions.

### Rate limit

- 1000 req/hour per IP without key (via DEMO_KEY).
- Higher with free API key (sign up at `https://fdc.nal.usda.gov/api-key-signup/`).

### Auth

- Optional API key (free).

### Reliability

- High (US government).

### Production code references

- None. Not applicable.

---

## S7 — Aggregator scraping services

**Status in spec 025**: **Not recommended** — cost + legal exposure + vendor coupling.

### URL patterns

- Each provider has its own API; none are documented here in detail because they are out of scope.
- Providers: Piloterr (`https://www.piloterr.com/library/tesco-product`), Unwrangle (`https://docs.unwrangle.com/tesco-product-data-api/`), Apify (`https://apify.com/jupri/tesco-grocery`, `https://apify.com/ecomscrape/tesco-product-details-scraper`), ScrapingBee (`https://www.scrapingbee.com/scrapers/tesco-api/`), Real Data API (`https://www.realdataapi.com/tesco-grocery-data-scraping.php`).

### Fields available

- Whatever Tesco exposes via their scraper API. Typically: title, image, description, brand, category, price, gtin, tpnb, tpnc, ingredients, allergens.

### ToS / legal

- These services do the scraping Danny would otherwise have to do. They handle Akamai bot detection via proxy rotation.
- Their terms typically prohibit using the data for resale or in violation of the underlying site's ToS.
- The legal exposure is **higher** than direct scraping because the aggregator's scale draws Tesco's attention faster. An individual scraping one URL per 21 days is invisible; an aggregator scraping millions of URLs is a target.
- Cost: ~$0.001-0.01 per product lookup. At 500 products × 21-day TTL × 26 refresh/year = ~$130-1300/year.

### Rate limit

- Provider-defined.

### Auth

- API key.

### Reliability

- Provider-dependent.

### Production code references

- None. Out of scope (FR-013 in spec 025).

> **Rev 2 (2026-06-22) — Static product-database.ts removed from the consumer contract.**
> Spec 010 Rev 4 deletes the `lib/product-database.ts` substring-match fallback. When generated pre-enriched Tesco product metadata is unavailable, the modal shows the truthful placeholder ("Product information not available in generated data") rather than silently inventing details from a hand-curated 38-entry map. This section is preserved as a historical reference for the audit chain. **The S8 source is no longer consulted at runtime.** The 16-key emoji category-icon mapping (FR-004 of spec 010) and the loading/unavailable states (FR-008) are unchanged — those are honest UI affordances, not invented product data. Producer-side enrichment (Apollo S1, Firecrawl S7) is the only path; the consumer no longer has a hand-coded map to fall back to.

---

## S8 — Static product-database.ts (REMOVED from runtime contract on 2026-06-22)

**Status**: Removed in spec 010 Rev 4. The 38-entry curated map was a Rev 1 safety net for products Danny buys repeatedly that the enrichment pipeline hadn't reached yet, but the contract it encoded — "silently invent plausible product details from a hand-coded map when we have no real data" — was the wrong shape. Spec 010 Rev 4 deletes the file (or reduces it to a no-op empty object for back-compat). The 16-key emoji category-icon map and the loading/unavailable states are preserved because they are honest UI affordances, not invented product content. **This section is historical record only; do not consult S8 at runtime.**

### Location (historical)

- `lib/product-database.ts` (meals-dashboard repo) — removed

### Interface (historical)

```typescript
export interface ProductInfo {
  name: string;
  description: string;
  storage: string;
  preparation: string;
  image: string;
  nutrition: string;
}

export const productDatabase: Record<string, ProductInfo>;
```

Keys were normalised item names (lowercase, ampersands → " and ", non-alphanumeric collapsed, plurals singularised). See `lib/dashboard-ui-utils.ts:334` `normalizeProductMatchText` for the exact rules.

### ToS / legal

- N/A (was a committed source).

### Rate limit

- N/A.

### Reliability

- 100% when present, 0% when absent. **This was the trap: the contract was that the dashboard would silently invent plausible-looking product details rather than show a placeholder. Spec 010 Rev 4 closes that contract.**

### Coverage (historical)

- Was ~20 entries (Activia yoghurt, Crosta & Mollica pizza, Tesco blueberries, etc.). Spotty; mostly curated by Danny on a one-off basis.

### Production code references (historical)

- `lib/product-database.ts` — data file, removed
- `lib/dashboard-ui-utils.ts:282` — `resolveProductInfoForItem` consumed the data file as the second-tier fallback after Apollo. Now consumes strictly `item.productMetadata`.

### Extension path (historical)

- Was: add a curated entry. No code changes. Existing `findProductInfo` matching was reused.
- Now: enrich via Apollo (S1) or Firecrawl (S7). No static DB. Per spec 010 Rev 4, missing data shows the truthful placeholder.

---

## URL reference table

| Source | URL pattern | Looked up by |
| --- | --- | --- |
| Apollo (S1) | `https://www.tesco.com/groceries/en-GB/products/{tpnc}` | tpnc |
| Tesco search (S2) | `https://www.tesco.com/groceries/en-GB/search?query={name}` | name |
| OFF (S3) | `https://world.openfoodfacts.org/api/v2/product/{gtin}.json` | gtin |
| Tesco API (S4) | n/a (commercial only) | n/a |
| Edamam (S5) | `https://api.edamam.com/api/food-database/v2/parser?...&upc={gtin}` | gtin |
| USDA FDC (S6) | `https://api.nal.usda.gov/fdc/v1/foods/search?...&query={query}` | name (US only) |
| Aggregator (S7) | provider-specific | provider-specific |
| Static (S8) | n/a (committed) | name (fuzzy) |

---

## Field coverage matrix

The matrix below summarises which fields each source provides. `✓` = primary source for this field; `△` = partial / lower quality; blank = not provided.

| Field | S1 (Apollo) | S2 (Search) | S3 (OFF) | S5 (Edamam) | S6 (USDA) | S7 (Firecrawl) |
| --- | --- | --- | --- | --- | --- | --- |
| title | ✓ | ✓ | ✓ | ✓ | △ | ✓ |
| imageUrl | ✓ | △ | ✓ | △ | | ✓ |
| description | ✓ | | △ | △ | | ✓ |
| storage | ✓ | | | | | ✓ |
| preparation | ✓ | | | | | ✓ |
| ingredients | ✓ | | ✓ | △ | △ | ✓ |
| allergens | ✓ | | ✓ | △ | △ | ✓ |
| nutrition | ✓ | | △ | ✓ | ✓ | ✓ |
| brand | ✓ | △ | ✓ | ✓ | △ | ✓ |
| category | ✓ | △ | ✓ | ✓ | △ | ✓ |
| tpnc | ✓ | ✓ | | | | ✓ |
| gtin | ✓ | | ✓ | ✓ | △ | ✓ |

> **Rev 2 (2026-06-22) — S8 column removed.** The static `lib/product-database.ts` is no longer a runtime source. Apollo (S1) and Firecrawl (S7) are the only paths; missing data shows the truthful placeholder per spec 010 Rev 4.

Note: storage and preparation are **only available from first-party sources** (Apollo S1, Firecrawl S7). OFF (S3), Edamam (S5), and USDA FDC (S6) cannot fill the headline ask ("is this frozen?", "how do I cook it?") that Danny reported.

This is the central finding of spec 025: the user-reported gap on storage/preparation **cannot be closed by a free third-party API**. The only ways to close it are:

1. Improve the existing Apollo path (G1 / G2 fixes) so more items have Apollo data.
2. Pay for an aggregator (S7) — adds cost and legal exposure.
3. *(Removed in spec 010 Rev 4: was "Manually curate the items Danny buys repeatedly (S8)". The static DB is gone; curation is now Apollo-only.)*

If those three options are exhausted and the gap persists, the answer is to accept the gap, not to keep searching for a free storage-and-preparation source.