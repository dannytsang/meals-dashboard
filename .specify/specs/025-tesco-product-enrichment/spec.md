---
name: tesco-product-enrichment-sources
description: "Draft investigation of alternative data sources for filling the product enrichment gap that the existing Tesco Apollo cache pipeline (spec 021) cannot close. Captures the live data gap (picture/description/storage/preparation missing on a material fraction of receipt items), surveys Tesco.com scraping mechanics, Open Food Facts, supermarket APIs, and off-the-shelf datasets (USDA FoodData Central, Edamam), records legal/ToS considerations and rate-limit/reliability expectations for each, and proposes a layered architecture that keeps Apollo as the primary source and adds fallback layers (Tesco search-page HTML, Open Food Facts via EAN, curated static product-database.ts, optional aggregator). The expected outcome of this Draft is a design decision record, not shipped code. Implementation of any layer other than the existing Apollo approach is contingent on the gap persisting after re-running the existing pipeline against fresh orders and confirming whether the failure is upstream (name→tpnc search), midstream (Apollo cache extraction), or downstream (no product data exists at all)."
---

# Feature Specification: Tesco Product Enrichment — Source-of-Truth Investigation

Feature ID: `025-tesco-product-enrichment`

Feature Name: Tesco Product Enrichment — Source-of-Truth Investigation

Target Skill: `data-science/meals-check`

Created: 2026-06-17

Status: Draft

Change history: CHANGELOG.md

> **HOLD (2026-06-18)**: Danny put this spec on hold pending the Vercel Blob storage API limit reset. The OFF (Tesco scraping) integration was already disqualified from scope on 2026-06-18 due to blob-budget pressure. No implementation work, no spec promotion, no scope re-think until Danny explicitly re-opens the spec. See CHANGELOG 0.2.0 entry and the open Disqualifying Constraints section below.

## Background

The meals dashboard surfaces a per-item product card in the Order Items by Category list and a full Product Detail modal (spec 010). The modal currently renders five fields sourced from `resolveProductInfoForItem` (`lib/dashboard-ui-utils.ts:282`):

- **title** — from generated metadata or `cleanItemName(item.name)` fallback
- **description** — generated text or "Product information not available in generated data or the local product database."
- **storage** — generated text or "Check packaging for storage instructions."
- **preparation** — generated text or empty string
- **image** — generated imageUrl or empty
- **nutrition** — generated markdown table or "Nutrition information not available."

The generation source is the Tesco Apollo cache embedded in `https://www.tesco.com/groceries/en-GB/products/{tpnc}` HTML, fetched and parsed by `scripts/sync-dashboard-data.py` `_fetch_tesco_apollo_cache()` and persisted as one blob per tpnc at `products/{tpnc}.json` in Vercel Blob (spec 021). When the Apollo path fails (network error, Akamai block, missing `ProductType:<tpnc>` entity, delisted product, no `productUrl` on the order email, name→tpnc search miss), the read path falls back to `lib/product-database.ts` (a small committed dictionary of hand-curated Tesco products), then to a flat "not available" string. The dashboard UI does not distinguish between "Apollo returned data" and "this is a placeholder string"; the user sees the placeholder.

Danny reports that picture, description, storage, and preparation are missing on "a lot of items" — enough that the per-item card stops being useful. This Draft investigates where the data goes missing, what alternative sources could fill the gap, and what tradeoffs each alternative imposes. It is **not** an implementation plan for a new enrichment layer; it is a structured comparison that lets Danny decide whether any fallback beyond the existing static `product-database.ts` is justified, and if so, which one.

The key question this Draft answers is **not** "how do we scrape Tesco" (spec 021 already does that, and the architecture is sound) — it is **"given that Apollo misses material coverage, is the right answer Open Food Facts, a paid aggregator, more static curation, or accepting the gap?"**

## Relationship to Spec 021

Spec 021 (`021-dashboard-product-enrichment-tesco-apollo`) is the production architecture. It establishes:

- Product blobs live at `products/{tpnc}.json` in Vercel Blob, keyed by tpnc
- Order blobs carry `productBlobPath: "products/{tpnc}.json"` reference (not embedded metadata)
- Read path composes product data at dashboard render time
- 21-day TTL: stale products are re-fetched on the next sync run
- Apollo cache extraction uses a brace-counter JSON parser against the `ProductType:<tpnc>` entity embedded in product page HTML

Spec 025 is a Draft investigation that **does not replace 021**. It records what is currently missing from 021's coverage, what alternative sources could be added as fallback layers behind the existing Apollo path, and the design decision record for each candidate. If a future spec is cut from this Draft (e.g. `026-tesco-off-fallback`), that spec will own the implementation; 025 stays as the rationale and the comparison matrix.

## Data Gap Analysis

This section enumerates the upstream failure modes that produce "missing" in the dashboard modal. Each mode is a candidate failure of the 021 pipeline; the question is which modes are real, which are avoidable, and which require a fundamentally different source.

### G1 — `tpnc` was never resolved

The order email carries `name`, `price`, `quantity`, sometimes `imageUrl` (from the email HTML), but **not** `tpnc`. The enrichment step resolves tpnc by parsing the Tesco search page (e.g. `https://www.tesco.com/groceries/en-GB/search?query=...`). Failure modes:

- **G1a** — Tesco search HTML regex misses (Tesco changed class names; product is at end of pagination; search returns no results because the email name is e.g. "Tesco Finest British Beef Mince 5% Fat 400g" and the search returns the wrong product)
- **G1b** — Akamai bot detection blocks the search-page request (HTTP 403); `_fetch_tesco_apollo_cache` logs `⚠ Apollo cache fetch failed for {tpnc}` and the item gets `tpnc=None`
- **G1c** — Substitution item name does not match any search result (e.g. "Subs: Tesco Breaded Chicken Goujons 300g" was the substituted name, search returned no hit)
- **G1d** — Delisted product no longer appears in Tesco search; nothing matches

When `tpnc=None`, no `productBlobPath` is written and the order blob carries no enrichment reference. The dashboard falls through to `product-database.ts` then to the placeholder.

### G2 — `tpnc` resolved but Apollo cache is empty/malformed

The product page HTML returns 200 but the Apollo cache does not contain a usable `ProductType:<tpnc>` entity. Failure modes:

- **G2a** — Product page is a Clubcard offer page with a different schema (the entity key is `OfferType` not `ProductType`); the parser logs `no ProductType:{tpnc} entity` and gives up
- **G2b** — Product is a third-party seller listing (e.g. Tesco "Marketplace") with a different schema; Apollo cache may have an `Offer` entity instead
- **G2c** — Apollo cache extraction's brace-counter miscounts because of nested JSON-within-JSON (the embedded `description` field contains escaped quotes); parser logs `unclosed object for ProductType:{tpnc}` and falls back to the HTML regex path
- **G2d** — Product page redirects (302 to a category page or a 404 soft-redirect); the fetched HTML is not a product page

When the Apollo extraction fails, the existing pipeline logs a warning and writes nothing to the product blob. The item carries no `productBlobPath` and falls through to the static fallback.

### G3 — Apollo extraction succeeds but fields are empty

The entity exists, JSON parses, but fields like `description`, `storage`, `preparationAndUsage` are absent or empty strings in Tesco's data. This is rare for Tesco's first-party products but more common for:

- **G3a** — Seasonal / Clubcard-only products with sparse metadata
- **G3b** — New product launches (Tesco often ships the product page before populating cooking instructions)
- **G3c** — Private-label Tesco "Extras" / "Finest" lines with custom copy that is filed under different fields than the parser expects

The product blob is written but `storage` / `preparation` are empty. The UI displays the placeholder string for that field.

### G4 — TTL expired and re-fetch fails

The product blob is older than 21 days. On the next sync, the enrichment tries to re-fetch. If the re-fetch fails (Akamai block, network error, delisted product), the pipeline logs the failure but **does not delete** the existing blob. The dashboard continues to display the stale data — but with the "Refresh overdue" amber badge (spec 021 / FR-017). This is the **correct** behaviour (better stale than empty) but means the "missing" data is still being shown with no recovery path.

### G5 — Item never reaches enrichment

Order email parsing fails (spec 008) so the item never makes it into the order blob. Different problem; not in scope of this spec.

### Coverage estimate (unverified)

This Draft cannot quote a precise coverage number without re-running the 021 pipeline against fresh data and counting fall-throughs. A coarse estimate based on the user report ("missing on a lot of items") is **20-50% of items** fall into G1, G2, or G3 combined. This is the kind of number that should be measured before any new fallback layer is built — see Open Question 1.

## Candidate Sources

The candidate sources are ordered by expected effort / cost ratio (cheap to expensive). For each, the columns are: fields available, data quality, ToS / legal, rate limit, auth needed, freshness, reliability, and how it would slot into the existing architecture.

### S1 — Tesco.com product page Apollo cache (status quo, spec 021)

- **Fields**: tpnc, gtin, tpnb, title, imageUrl, description, storage (incl. freezingInstructions), preparation (cooking instructions for oven/microwave/grill, chilled/frozen), ingredients (HTML), allergens, nutrition (table), brand, category (department/aisle/shelf)
- **Data quality**: First-party. Authoritative for Tesco-specific product data (image, packaging copy, Tesco's storage phrasing). Best-in-class for the missing fields.
- **ToS**: Tesco.com terms prohibit scraping for commercial purposes. Apollo cache is a side-effect of client-side rendering. The current pipeline is a single `urllib` request per unique tpnc per 21 days, no browser automation, no proxy rotation, no login. This is a **grey area**; it works because Akamai's bot detection has not blocked the pattern, not because there is a published right to scrape. See "Legal / ToS Considerations" below.
- **Rate limit**: Implicit — one request per tpnc per 21 days in the steady state. Sync run touches every unique tpnc in the orders to be re-fetched (typically a handful per run). Burst on backfill (~500 items once) is fine if rate-limited via `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS` (currently 1s default).
- **Auth**: None required for product pages.
- **Freshness**: 21-day TTL. Storage/preparation rarely change for established products.
- **Reliability**: High *when the page returns 200 and the entity parses*. Prone to G1 (no tpnc) and G2 (entity missing / malformed).

### S2 — Tesco.com search page HTML (already partially in use)

- **Fields**: tpnc (from `/shop/en-GB/products/{tpnc}` URL), title, imageUrl (sometimes), productUrl. No description, storage, or preparation — the search page is a list, not a detail page.
- **Data quality**: First-party. Useful for G1 (resolving tpnc from name when the order email does not carry it) and as a last-ditch `title` + `imageUrl` source.
- **ToS**: Same grey area as S1.
- **Rate limit**: Implicit. The pipeline already calls this once per item that lacks a tpnc. The bottleneck is the search-page request returning useful results.
- **Auth**: None.
- **Freshness**: Same as S1.
- **Reliability**: Moderate. Search-page HTML class names change frequently; regex is brittle. This is already in the existing pipeline (`_extract_from_tesco_search_html`).

### S3 — Open Food Facts (world.openfoodfacts.org)

- **Fields (from API v2)**: `product_name`, `brands`, `categories`, `ingredients_text`, `allergens`, `nutriments` (energy, fat, carbs, protein, salt, sugar, etc.), `image_url`, `image_front_url`, `image_ingredients_url`, `image_nutrition_url`, `countries`, `stores`, `labels`, `additives_tags`, `nutriscore_grade`, `nova_group`, `ecoscore_grade`, `packaging`. **Does not carry**: storage instructions, preparation/cooking instructions, productUrl to the Tesco product page.
- **Data quality**: Crowdsourced. Coverage is best for products with EAN-13 / GTIN barcodes that have been scanned and uploaded by users. UK Tesco product coverage is moderate but uneven — big brands are present, Tesco private label lines are spottier. Field quality is highly variable; `ingredients_text` is usually good, `nutriments` often has only energy, and `storage` / `preparation` are not collected by OFF's schema.
- **ToS**: Open data, CC BY-SA 4.0 for derived works. No API key required. Explicitly designed for reuse. Free for non-commercial and commercial use with attribution. The OFF project asks for a `User-Agent` header identifying the consumer (e.g. `MealsDashboard/1.0 (danny@example.com)`) so the project can contact heavy users.
- **Rate limit**: Soft limit (no published hard limit). Their FAQ asks consumers to stay under ~10 req/s for the read API. The official position is "be reasonable". Bulk endpoints (`/cgi/search.pl`) exist for mass lookups. The project has a paid "Pro" tier (`world.pro.openfoodfacts.org`) with higher rate limits and dedicated infrastructure, but the public endpoint is sufficient for this use case.
- **Auth**: None for the public endpoint.
- **Freshness**: Continuously updated as users upload. Re-fetching on TTL is appropriate.
- **Reliability**: High for products with EAN-13. Misses products without barcodes (e.g. loose produce by weight). The OFF server is operated by the Open Food Facts non-profit; uptime is generally good but not guaranteed.
- **Fit for the gap**: OFF covers `image_url`, `ingredients_text`, `allergens`, `nutriments` (partial nutrition), and `product_name` for products that have an EAN-13. It **does not cover `storage` or `preparation`**. It would be a useful gap-fill for ingredients/allergens/nutrition, not a replacement for Apollo.

### S4 — Tesco Developer API / groceries-api (closed partner API)

- **Fields**: full product catalogue. The Tesco developer ecosystem historically exposed a `groceries-api` (Tesco Labs project, last significant activity ~2014) and a newer partner API behind the Clubcard app (requires approved partnership). Partner API access requires Tesco commercial agreement; product data is partner-grade.
- **Data quality**: First-party, partner-grade. Equivalent to Apollo cache but as a JSON API.
- **ToS**: Requires a commercial partnership. Not available to individuals.
- **Rate limit**: Per-partner contract.
- **Auth**: OAuth2 client credentials, signed JWTs.
- **Freshness**: Real-time.
- **Reliability**: Highest of all options if accessible. **Not accessible** to Danny without a commercial relationship.
- **Fit for the gap**: Not actionable. Mentioned only for completeness.

### S5 — Edamam Food Database API

- **Fields**: per 100g nutrition (energy, macros, micros), ingredient list, allergens, label claims (vegan, gluten-free), category, image, brand, UPC/EAN as the lookup key. **Does not carry**: storage instructions, preparation/cooking instructions, brand-specific UK product copy.
- **Data quality**: Curated commercial database, ~700k+ products. UK Tesco product coverage is partial; branded UK products are present, Tesco private-label lines are sparser.
- **ToS**: Paid commercial API. Free tier: 10 req/min, 10k req/month. Pro tier starts ~$99/month for higher limits. ToS prohibits bulk export / caching the entire database.
- **Rate limit**: Free tier 10 req/min. Pro tier configurable.
- **Auth**: App ID + App Key (free signup).
- **Freshness**: Updated periodically by Edamam curators.
- **Reliability**: High (commercial SLA).
- **Fit for the gap**: Similar to OFF but with stricter rate limits, commercial cost, and similar coverage gap on storage/preparation. **Not recommended** over OFF for Danny's use case unless OFF's coverage proves insufficient and Edamam has something OFF doesn't.

### S6 — USDA FoodData Central

- **Fields**: nutrient data per 100g (energy, macros, micros, vitamins, minerals), standard reference ingredients, branded-food product records (for US-branded products). **Does not carry**: storage, preparation, image, EAN. UK Tesco products are generally **not in FDC's branded-food dataset** (which is US-focused).
- **Data quality**: Authoritative for US generic foods and nutrient values. US-centric.
- **ToS**: Public domain (US government). No API key required for low-volume; free API key for higher throughput.
- **Rate limit**: 1000 req/hour per IP without key; higher with key.
- **Auth**: Optional API key (free).
- **Freshness**: Updated quarterly for SR Legacy; ongoing for branded.
- **Reliability**: High (US government).
- **Fit for the gap**: **Not applicable**. USDA FDC is US-centric and has no UK Tesco product coverage. Useful only if Danny needs generic UK-recipe ingredient nutrient data (e.g. "what is the per-100g energy of 'chicken thigh'"), which is a different problem.

### S7 — Aggregator scraping services (Piloterr, Unwrangle, Apify, ScrapingBee)

- **Fields**: whatever Tesco exposes via their scraper API, typically the full product record (title, image, description, brand, category, price, gtin, tpnb, tpnc, ingredients, allergens).
- **Data quality**: First-party-derived (they do the scraping). Accuracy depends on the provider's parser.
- **ToS**: **This is the elephant in the room.** These services *do* the scraping that Danny would otherwise have to do, and they handle Akamai bot detection via proxy rotation. They operate in a legal grey area; their terms typically prohibit using the data for resale or in violation of the underlying site's ToS. The cost is ~$0.001-0.01 per product lookup; at 500 products × 21-day TTL × 26 refresh/year = ~$130-1300/year.
- **Rate limit**: Provider-defined.
- **Auth**: API key.
- **Freshness**: Same as underlying site.
- **Reliability**: Provider-dependent.
- **Fit for the gap**: Could close G1 and G2 entirely by outsourcing the scraping, but: (1) cost, (2) legal exposure is higher than direct scraping because the aggregator's scale draws Tesco's attention faster, (3) defeats the simplicity of the existing pipeline. **Not recommended** for this use case unless the in-house Apollo path fails repeatedly.

### S8 — Static product-database.ts (already in repo)

- **Fields**: name, description, storage, preparation, image (sometimes empty), nutrition (text, not table). No ingredients, no allergens, no tpnc, no brand, no category, no TTL.
- **Data quality**: Hand-curated by Danny for products he cares about (currently ~20 entries: Activia yoghurt, Crosta & Mollica pizza, Tesco blueberries, etc.). Accurate for those specific products but does not scale.
- **ToS**: N/A (committed source).
- **Rate limit**: N/A.
- **Auth**: N/A.
- **Freshness**: Updated when Danny edits the file. Already stale for some entries (e.g. "Activia Rhubarb" was a one-off product).
- **Reliability**: 100% when present, 0% when absent.
- **Fit for the gap**: **Best place to invest if Danny wants zero-cost, zero-risk enrichment of the products he actually buys repeatedly**. See Open Question 2.

## Legal / ToS Considerations

This section is deliberately brief; the goal is to flag the issues, not to render a legal opinion.

### Tesco.com scraping (S1, S2)

Tesco.com's terms of service (linked from the footer at `tesco.com`) reserve all rights in the content and prohibit automated access other than via their published developer APIs. The UK courts have not ruled decisively on whether scraping a publicly accessible product page for non-commercial personal use is a breach of the ToS or copyright (the `Ryanair v PR Aviation` line of cases is the closest precedent, and it found scraping publicly available flight prices for a price-comparison site was not a database right infringement but *was* a breach of the website's ToS, which the court treated as a contractual matter; civil claim was possible but rare for individual users).

The current Apollo-cache extraction (spec 021) is:

- A single HTTP GET per unique tpnc per 21 days (low volume)
- Uses Python's `urllib` with a default user-agent (no impersonation)
- Does not bypass Akamai bot detection (relies on it not being triggered)
- Does not authenticate, does not extract user-specific data
- Is used solely for Danny's own personal household dashboard

This is **comparable in posture to RSS reader usage** — well within the spirit of "I want to read what's on the website myself, programmatically." The risk that Tesco sends a cease-and-desist to an individual doing one request per tpnc per 21 days for personal use is **very low but not zero**. The risk that Akamai starts blocking the IP is **moderate** — this is the more likely failure mode (already observed in the G1b/G2c warnings).

**Recommendation**: keep the existing Apollo approach as the primary path. Do not add a paid aggregator (S7) which would materially increase legal exposure. If Tesco changes the page structure or starts blocking, the answer is to fall back to S3 (OFF) and S8 (curated static), not to add a scraping escalation tier.

### Open Food Facts (S3)

CC BY-SA 4.0. Free for commercial and non-commercial use with attribution. Requires a `User-Agent` header identifying the consumer. No other restrictions. **Lowest legal exposure of any source** for a personal dashboard.

### Edamam (S5)

Commercial ToS. Free tier exists but with rate limits. ToS restricts caching / redistribution. Acceptable for the dashboard's read-through-on-render usage (the data is fetched and immediately displayed, not bulk-cached for redistribution).

### Tesco Developer API (S4)

Not available without a commercial partnership. Out of scope.

### USDA FoodData Central (S6)

Public domain. No restrictions.

### Aggregator services (S7)

Operator's ToS + underlying site's ToS (same as S1). Higher legal exposure than direct scraping because the aggregator's scale draws the underlying site's attention faster. Not recommended.

## Architecture (Proposed Layered Fallback)

This is the proposed layering behind the existing Apollo primary. Each layer is consulted only if the previous layer returned no usable data for the requested field(s). The layering is per-field, not per-item — if Apollo gave us `imageUrl` and `description` but not `storage`, we ask OFF for `storage` (which it won't have, so we fall to curated static, then to placeholder).

```
For each GroceryItem with a productBlobPath (or needing one):
  ┌─ Apollo cache blob from Vercel Blob (cache hit) ──────────────┐
  │     → if all requested fields populated, render                 │
  └────────────────────────────────────────────────────────────────┘
  ┌─ Apollo cache re-fetch (cache miss OR TTL expired OR partial) ─┐
  │     → write product blob, render                                │
  └────────────────────────────────────────────────────────────────┘
  ┌─ Tesco search-page HTML (no tpnc) ──────────────────────────────┐
  │     → resolve tpnc → re-enter Apollo flow                       │
  └────────────────────────────────────────────────────────────────┘
  ┌─ Open Food Facts via gtin (no Apollo fields for this field) ───┐
  │     → fill ingredients, allergens, partial nutrition, image     │
  │     → never fills storage, preparation                          │
  └────────────────────────────────────────────────────────────────┘
  ┌─ lib/product-database.ts (curated static, name match) ──────────┐
  │     → fill description, storage, preparation for known items   │
  └────────────────────────────────────────────────────────────────┘
  ┌─ Placeholder string ("Check packaging for storage instructions") ┐
  └────────────────────────────────────────────────────────────────┘
```

**Key design choices:**

- **Apollo primary, always.** The 021 architecture is sound; do not abandon it.
- **Per-field fallback.** Apollo partial success is better than OFF full coverage for some fields. Apollo may give us `imageUrl` and `description` but miss `preparation`; OFF gives us `ingredients_text` but nothing on `preparation`. We compose the best available per field.
- **OFF keyed on `gtin`, not `tpnc`.** OFF doesn't know Tesco's internal IDs. The existing `gtin` field on `GeneratedProductMetadata` (from Apollo) is the join key. For items with no Apollo gtin, OFF is unreachable.
- **Static fallback keyed on `name`.** `lib/product-database.ts` already does name-based fuzzy matching (`normalizeProductMatchText` in `lib/dashboard-ui-utils.ts:334`). Extend the dictionary, not the matching algorithm.
- **No aggregator (S7).** Out of scope.
- **No Edamam (S5) until OFF proves insufficient.** Avoid the cost and the ToS overhead.
- **No USDA (S6).** Wrong geography.
- **TTL handling.** Each layer has its own TTL: Apollo 21 days (existing); OFF 30 days (changes are rare); curated static: until the file is edited.

## Rate Limits / Reliability Expectations

| Source | Rate limit | Failure mode | Mitigation |
| --- | --- | --- | --- |
| Apollo | ~1 req per tpnc per 21 days in steady state; backfill ~500 req over ~10 minutes with `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS=1.0` | Akamai 403, network timeout, schema change, missing entity | Per-item try/except + warning log; no escalation to a paid fallback |
| Tesco search | One per item lacking tpnc per sync run (~5-20 per sync) | Search-page regex miss; no results | Fall through to OFF if gtin known, else curated static, else placeholder |
| OFF | Soft ~10 req/s; no published hard limit | OFF server down; product not in OFF | Per-item try/except; placeholder fallback; OFF is a fill layer, not a hard dependency |
| Curated static | N/A | Name match miss | Placeholder |

## Staleness Tolerances

- **Storage**: changes rarely for an established product (a recipe reformulation, a Clubcard packaging change). 21-day Apollo TTL is appropriate. OFF has no storage field, so OFF staleness does not apply here.
- **Preparation**: same as storage — rarely changes. 21-day Apollo TTL appropriate.
- **Image**: changes only on packaging redesign (every 1-3 years). 21-day TTL is overkill but harmless — the URL is content-addressed via the Tesco CDN, so a 200 response with a stale URL means Tesco has not re-uploaded the image.
- **Ingredients / allergens**: changes only on recipe reformulation. Same as storage.
- **Nutrition**: rarely changes for an established product. 21-day TTL appropriate.

**Conclusion**: 21 days is a sensible TTL across the board. There is no field where tighter TTL is required and no field where looser TTL would be more appropriate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Diagnose the existing gap (Priority: P1)

As Danny, I want a structured report of *which* of G1/G2/G3/G4 failure modes is responsible for the missing product data on the items I currently see in the dashboard, so I can decide whether the answer is "fix the existing Apollo path" (e.g. improve name→tpnc search, add a retry on Akamai 403), "extend `lib/product-database.ts`" (for the items Danny buys repeatedly), "add OFF as a fallback for ingredients/allergens/nutrition", or "accept the gap as the cost of not having a Tesco commercial API".

**Why this priority**: Before any fallback layer is built, the failure mode must be measured. Building OFF integration when the actual failure is G1a (name→tpnc search misses) is wasted work.

**Independent Test**: Run the existing 021 pipeline against the last 6 months of orders. For each GroceryItem without `productBlobPath`, classify it as G1 (no tpnc), G2 (Apollo failed), G3 (fields empty), or G4 (stale). Produce a counts-by-mode summary. Re-run with a tweaked name→tpnc search heuristic to estimate the upper bound on G1a fixability.

**Acceptance Scenarios**:
1. Given the existing 021 pipeline and 6 months of order blobs, When the diagnostic script runs, Then it produces a counts-by-mode report (G1a/G1b/G1c/G1d/G2a/G2b/G2c/G2d/G3a/G3b/G3c/G4) covering all GroceryItems without `productBlobPath` in the orders blob set, plus a sample-of-five names per mode for manual review.
2. Given the report, When Danny reviews it, Then he can decide: (a) "G1 dominates — fix the search", (b) "G2 dominates — fix the parser / retry on 403", (c) "G3 dominates — accept that some products have no Apollo data and only OFF can help", or (d) "all modes are small — the gap is acceptable as-is".
3. Given the report identifies G3 (Apollo empty fields), When Danny reviews it, Then the report specifies which fields are empty per item, so he can decide whether OFF could fill the gap (ingredients/allergens/nutrition: yes; storage/preparation: no).

### User Story 2 — Extend curated static fallback for repeated buys (Priority: P2)

As Danny, for the products I buy every week or two (e.g. milk, eggs, bread, the Activia yoghurt), I want the existing `lib/product-database.ts` to carry accurate storage and preparation text, so that the dashboard modal shows useful information even when Apollo fails for those items.

**Why this priority**: Cheapest path to "more coverage". No new dependencies, no new legal exposure, no rate limits. Covers a small but predictable subset of items (the ones Danny buys on repeat).

**Independent Test**: Add a single curated entry for "Tesco Semi-Skimmed Milk 4 Pints 2.272L" with `storage: "Keep refrigerated between +1°C and +6°C. Use by: see cap. Once opened, consume within 3 days."`, `preparation: ""`, `image: ""`, `nutrition: "Per 100ml: Energy 46kcal, Fat 1.8g, Carbohydrates 4.8g, Protein 3.4g"`. Confirm that on the next sync, an order item named "Tesco Semi-Skimmed Milk 4 Pints" matches via `findProductInfo` and the modal renders the curated storage / nutrition strings instead of the placeholder.

**Acceptance Scenarios**:
4. Given `lib/product-database.ts` contains an entry whose normalized name fuzzy-matches an order item, When the dashboard renders, Then `resolveProductInfoForItem` returns the curated `description`, `storage`, `preparation`, `nutrition` and the modal renders them in the corresponding sections.
5. Given `lib/product-database.ts` does not contain a matching entry, When the dashboard renders, Then the modal falls through to the placeholder string and the UI shows the empty state for that item (no error, no crash).

### User Story 3 — Optional Open Food Facts enrichment for ingredients/allergens/nutrition (Priority: P3)

As Danny, for items where Apollo returned partial data (image + description but no ingredients/allergens/nutrition), I want a fallback to Open Food Facts via the product's `gtin`, so the modal can show ingredients and allergens even when Tesco's page did not include them.

**Why this priority**: P3 because (a) it requires a new dependency (the OFF API client, however thin), (b) OFF coverage on UK Tesco private-label products is uneven, (c) storage and preparation are NOT covered by OFF so the modal's headline value-add ("is this frozen?" / "how do I cook it?") cannot be filled by OFF, (d) the user-reported gap is specifically about storage and preparation, so OFF helps ingredients/allergens/nutrition but not the headline ask.

**Independent Test**: Add an OFF client (`lib/off-client.ts`) that, given a `gtin`, returns `{ ingredients_text, allergens, nutriments, image_url, product_name }` from `https://world.openfoodfacts.org/api/v2/product/{gtin}.json`. In the read path, for items where Apollo has `gtin` but no `ingredients` or `allergens`, fetch OFF and merge. Add a 30-day TTL cached in the product blob under a `off` field.

**Acceptance Scenarios**:
6. Given a product blob with `gtin` and empty `ingredients`/`allergens` and no `off` field or `off.lastFetched` older than 30 days, When the dashboard renders, Then the read path fetches OFF in parallel with the existing Apollo blob read, merges the OFF `ingredients_text` / `allergens` into `productMetadata`, and writes the OFF fields back to the product blob under `off: { ingredients, allergens, imageUrl, lastFetched }`.
7. Given a product blob with `off.lastFetched` within 30 days, When the dashboard renders, Then OFF is NOT fetched; the cached `off` field is used as-is.
8. Given OFF returns 404 for the gtin (product not in OFF), When the dashboard renders, Then `off` is set to `{ status: "not_found", lastFetched: <now> }` and the cached placeholder is used. No OFF fetch for the next 30 days.
9. Given OFF returns 5xx or a network timeout, When the dashboard renders, Then the read path logs a warning, does not crash, and the modal shows the placeholder for the missing fields. The `off` field is NOT updated (next render retries).
10. Given a product blob with NO `gtin` (Apollo failed to resolve gtin), When the dashboard renders, Then OFF is NOT consulted (OFF requires gtin). The modal falls through to curated static then to placeholder.

### User Story 4 — No aggregator escalation (Priority: P1, non-feature)

As Danny, I want the fallback chain to stop at OFF + curated static + placeholder, and NOT escalate to a paid aggregator (Piloterr, Unwrangle, Apify, ScrapingBee), so that I do not incur monthly cost, do not take on additional legal exposure, and do not couple my dashboard to a third-party service that may change pricing or ToS.

**Why this priority**: Codifies the "no" decision so it does not need to be re-litigated every time a new aggregator appears.

**Independent Test**: Read this spec; confirm US4 exists and the architecture diagram does not include an aggregator layer.

**Acceptance Scenarios**:
11. Given the architecture diagram in this spec, When Danny reviews it, Then it shows Apollo → Tesco search → OFF → curated static → placeholder, and does NOT include any paid aggregator.

## Functional Requirements

- **FR-001**: This spec MUST NOT modify the existing Apollo cache extraction path (spec 021). The primary product data source remains the embedded `ProductType:<tpnc>` entity in `https://www.tesco.com/groceries/en-GB/products/{tpnc}` HTML, parsed by `scripts/sync-dashboard-data.py` `_fetch_tesco_apollo_cache`.
- **FR-002**: This spec MUST NOT modify the existing `lib/product-database.ts` interface (`ProductInfo { name, description, storage, preparation, image, nutrition }`) without a separate spec that explicitly addresses the interface change.
- **FR-003**: If a future spec implements OFF enrichment (US3), it MUST use `gtin` (from Apollo, when present) as the OFF lookup key, NOT `tpnc`. OFF does not know Tesco's internal IDs.
- **FR-004**: If a future spec implements OFF enrichment, it MUST cache OFF responses inside the existing `products/{tpnc}.json` blob under an `off` field (sub-object with `ingredients`, `allergens`, `imageUrl`, `lastFetched`, `status` keys), NOT in a separate `off/{gtin}.json` namespace. This keeps the per-product blob self-contained and avoids introducing a second product-data cache.
- **FR-005**: If a future spec implements OFF enrichment, it MUST respect a 30-day TTL for OFF fields (separate from the Apollo 21-day TTL). The OFF TTL is configurable via `MEALS_OFF_ENRICHMENT_MAX_AGE_DAYS`.
- **FR-006**: If a future spec implements OFF enrichment, it MUST honour `MEALS_OFF_ENRICHMENT=0` as a kill switch, and `MEALS_OFF_ENRICHMENT_DELAY_SECONDS` as a rate-limit knob (default 0.5s).
- **FR-007**: If a future spec implements OFF enrichment, it MUST identify itself via the `User-Agent` header on every OFF API request, in the form `MealsDashboard/<version> (<contact>)`, where `<contact>` is a working email Danny controls. OFF asks for this so they can contact heavy users.
- **FR-008**: If a future spec implements OFF enrichment, the dashboard read path MUST NOT block on the OFF fetch. If OFF is slow or unavailable, the dashboard renders Apollo data + placeholder, then progressively enhances with OFF data when it arrives (or on the next render).
- **FR-009**: The diagnostic script (US1) MUST be runnable as a standalone Python script (`scripts/diagnose_product_enrichment_gaps.py`) that reads the order blobs from Vercel Blob and produces a counts-by-mode report. It MUST NOT mutate any blob.
- **FR-010**: The diagnostic script (US1) MUST classify each fall-through into G1/G2/G3/G4 by inspecting (a) the absence of `productBlobPath`, (b) the `lastFetched` vs current time for `productBlobPath` references, (c) the Apollo cache extraction logs in the sync run output, (d) the product blob's field population. Classification rules MUST be in a single source-of-truth module (`scripts/product_enrichment_gap_classifier.py`).
- **FR-011**: Curated static extensions (US2) MUST be added by editing `lib/product-database.ts` only. No new module. No new import. Existing `findProductInfo` matching is reused.
- **FR-012**: The architecture diagram (Background section) MUST be the canonical reference for the fallback chain. Any future spec that implements a fallback layer MUST update the diagram to include that layer.
- **FR-013**: This spec MUST NOT add any paid API dependency. Edamam (S5), USDA FDC API key (S6), aggregator services (S7), and Tesco Developer API (S4) are all explicitly out of scope.
- **FR-014**: This spec MUST NOT include any implementation tasks in `tasks.md`. The Draft is a design decision record; implementation is downstream. `tasks.md` lists "no implementation" as the only task, plus "re-evaluate after US1 diagnostic" as the gate.

## Non-Functional Requirements

- **NFR-001**: The existing 021 pipeline must remain unchanged in throughput and behaviour. Any fallback layer added by a future spec must NOT slow the existing pipeline down (per-item critical path stays the same; OFF fetch, if added, is in the dashboard read path, not the sync path).
- **NFR-002**: The OFF client, if added, must use only Python stdlib (`urllib`, `json`, `time`) or existing project dependencies. No new `requests` dependency.
- **NFR-003**: The diagnostic script (FR-009) must complete in under 60 seconds for a 6-month order history (~30 orders, ~500 items).
- **NFR-004**: No new Vercel Blob namespaces. Product data lives under `products/{tpnc}.json` (spec 021). OFF data, if added, lives in a sub-object of the same blob (FR-004), NOT in a new `off/{gtin}.json` namespace.
- **NFR-005**: No new Python or Node dependencies. The existing `urllib`, `re`, `json`, `requests` (already in `python_packages`) cover all sources in this spec.

## Key Entities

- **ProductBlob** (spec 021): unchanged. `products/{tpnc}.json` in Vercel Blob. Carries Apollo fields. May be extended in a future spec with an `off` sub-object (FR-004).
- **OFFEnrichment** (new, deferred): proposed shape if US3 is implemented. `{ ingredients?: string; allergens?: string; imageUrl?: string; lastFetched: string; status: "ok" | "not_found" | "error" }`. Stored inside ProductBlob under `off` key. NOT a separate blob.
- **GapMode** (new, US1 only): diagnostic enum for the fallback classification. Values: `G1a`, `G1b`, `G1c`, `G1d`, `G2a`, `G2b`, `G2c`, `G2d`, `G3a`, `G3b`, `G3c`, `G4`. Used only in the diagnostic report; not stored.
- **ResolvedProductInfo** (existing): unchanged. The five-field shape rendered by the modal. Already consumes `productMetadata` (Apollo) + `findProductInfo` (curated static) + placeholder.

## Contract Impact

This spec is a Draft; nothing in this section is a contract yet.

- **If US1 is implemented (gap diagnostic)**: new `scripts/diagnose_product_enrichment_gaps.py` + `scripts/product_enrichment_gap_classifier.py`. Read-only against Vercel Blob. No writes.
- **If US2 is implemented (curated static extension)**: edits to `lib/product-database.ts` only. No code changes outside the data file.
- **If US3 is implemented (OFF enrichment)**: new `lib/off-client.ts` (read-through client with 30-day TTL cache), changes to `lib/dashboard-data.ts` (parallel OFF fetch in read path), changes to `scripts/sync-dashboard-data.py` (write `off` sub-object when OFF data is fetched). The Apollo write path is unchanged; OFF writes piggyback on the existing product-blob write. This MUST be its own spec.
- **If US4 is implemented (no aggregator escalation)**: no code changes; this is the absence of a feature, codified in the architecture diagram.

## Open Questions

1. **What is the actual gap size?** This Draft cannot quote a precise number. The diagnostic script (US1 / FR-009) must be run before any fallback layer is built. If G1 dominates, the answer is "improve the name→tpnc search" not "add OFF". If G3 dominates, the answer is "add OFF + accept storage/preparation will still be missing for some items". If the gap is small (e.g. <5% of items), the answer is "accept it" — no new layer is justified. **This Draft does not commit to any implementation until the diagnostic is run.**

2. **Is curated static extension the right first move?** Even if the gap is G3-dominated (Apollo fields are empty for some products), the cheapest first move is to add a few more curated entries to `lib/product-database.ts` for the products Danny buys repeatedly. The 021 read path already does name-based fuzzy matching; no new code is needed. The question is whether Danny wants to invest time curating or wants to wait for OFF. The right default is "curate the obvious repeat buys first, then evaluate OFF". US2 is the P2 because it is small and valuable but not headline-impact.

3. **OFF coverage on UK Tesco private-label lines** is unverified. OFF's UK coverage on Tesco-branded products (e.g. "Tesco Finest 6 Chicken Breast Fillets 600g") may be patchy. If OFF coverage is poor, OFF is not worth the integration cost. A 5-product spot-check on `https://world.openfoodfacts.org/api/v2/product/{gtin}.json` for known Danny products would resolve this. This is a cheap investigation (10 minutes) before committing to US3.

4. **Does OFF's `nutriments` field give the same per-100g shape as the Apollo nutrition table?** OFF stores nutriments as separate keys (`energy-kcal_100g`, `fat_100g`, etc.) that need to be rendered to a markdown table — the same work that the existing 021 parser does for Apollo nutrition. If the rendering logic can be shared, the integration is cheap; if it cannot, the integration is more involved.

5. **Can the diagnostic classifier (US1) work from the existing sync log, or does it need to re-fetch product pages?** Inspecting sync logs is cheap but fragile (logs are not guaranteed to be retained). Re-fetching is expensive (a fresh Apollo request per item per diagnostic run). The diagnostic should classify from the **existing product blob contents** (presence/absence of fields, `lastFetched` timestamps) and **optionally** from the sync log when available. The classifier MUST NOT re-fetch product pages.

6. **Is there a way to know which items fall into G1a vs G1b without re-running the sync?** G1a (search miss) is observable from the sync log (`⚠ Apollo cache fetch failed for {tpnc}` lines). G1b (Akamai 403) is also in the sync log but distinguishable from G1a only by HTTP status code. The classifier (US1) needs access to the sync log, OR the classifier needs to re-run the sync in dry-run mode. The dry-run option is cleaner but adds a new sync mode.

## Verification Plan

- **Read-only review of this Draft**: walk through the candidate source matrix and confirm the per-source fields/ToS/rate-limit/reliability ratings. Update `references/tesco-product-enrichment-sources.md` if any source's rating changes.
- **Diagnostic script (US1, when implemented)**: run against the last 6 months of orders. Confirm the report covers all items without `productBlobPath`. Confirm the counts-by-mode summary is reproducible.
- **No implementation tests**: this is a Draft. No `tasks.md` implementation tasks (FR-014).

## Reference Material

- `references/tesco-product-enrichment-sources.md` — per-source notes for the candidate sources in this spec (URL patterns, fields, ToS, rate limits).
- Spec 021 — production architecture (Tesco Apollo cache, separate product blob layout, 21-day TTL).
- Spec 010 — Product Detail modal that consumes the resolved product info.
- Spec 016 / 017 — Blob storage layout and read path that the dashboard uses to surface product data.
- `lib/product-database.ts` — existing curated static fallback.
- `lib/dashboard-ui-utils.ts:282` — `resolveProductInfoForItem` (the existing fallback composer).
- `scripts/sync-dashboard-data.py` `_fetch_tesco_apollo_cache` — the existing Apollo extraction (lines 116-200ish).
- `https://world.openfoodfacts.org/data` — Open Food Facts data documentation.
- `https://openfoodfacts.github.io/openfoodfacts-server/api/` — OFF API reference.
- `https://developer.edamam.com/food-database-api-docs` — Edamam Food Database API reference (for context, not for implementation).
- `https://fdc.nal.usda.gov/api-guide/` — USDA FoodData Central API reference (for context, not for implementation).

## Promotion Criteria for Final

This spec's purpose is design investigation, not feature delivery. It will be promoted from `Status: Draft, readiness: spec_only` to `Status: Final` when **all** of the following are true:

- The candidate source matrix is complete (no new sources have appeared that would change the recommendation).
- The architecture diagram in Background has been validated against the actual `lib/dashboard-data.ts` and `lib/dashboard-ui-utils.ts` code (i.e. the fallback chain described here matches what the code does today).
- Danny has reviewed and either confirmed "no implementation is needed beyond the existing 021 path" or cut a follow-up spec (e.g. `026-tesco-off-fallback`) that owns the implementation.
- The diagnostic script (US1, FR-009) has been run at least once against real data, and the report has informed the implementation decision.

This spec remains Draft until Danny is ready to make the implementation decision. Promotion to Final does **not** require any code to ship — it requires the design decision to be made and recorded.