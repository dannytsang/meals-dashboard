# Implementation Plan: Dashboard Product Enrichment from Tesco Apollo Cache

Status: Draft
Feature: 021-dashboard-product-enrichment-tesco-apollo
Skill: data-science/meals-check

## Summary

Replace the search-page-only Tesco product enrichment in `sync-dashboard-data.py` with a stable `tpnc`-keyed Apollo-cache JSON fetch. The product page (not search) is the source of truth; all rich fields (storage, preparation, ingredients, allergens, nutrition, marketing) come from one embedded JSON blob. Search is used only to resolve `name→tpnc`, then cached.

This plan is **skeleton only at Draft time**. It will be expanded when the spec is promoted to `Proposed` and the ten open questions in `spec.md` are resolved.

## Technical Context

- `sync-dashboard-data.py` — sync pipeline, location: `/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py`. Owns `fetch_tesco_product_metadata`, `_extract_tesco_product_metadata`, and `enrich_order_items_with_product_metadata`.
- `test_product_enrichment.py` — unit tests, location: `/home/hermes/workspace/meals-dashboard/scripts/test_product_enrichment.py`.
- `lib/product-database.ts` — REMOVED in spec 010 Rev 4 (2026-06-22). The 38-entry static fallback map was deleted; the modal now shows the truthful placeholder ("Product information not available in generated data") when generated pre-enriched Tesco product metadata is unavailable. Producer-side scope: the enrichment pipeline still runs (Apollo + Firecrawl fallback per spec 025 / 027), but the consumer no longer has a hand-coded map to fall back to. Reference: spec 010 Rev 4 CHANGELOG and AS-024.
- Cache file: `MEALS_PRODUCT_METADATA_CACHE` env var, default `tesco_product_metadata_cache.json` under `scripts/data/`. Existing location; will be augmented with new fields.
- `010-dashboard-product-detail` — consumer of the enriched metadata, location: `/home/hermes/workspace/Hermes-Skills/data-science/meals-check/.specify/specs/010-dashboard-product-detail/spec.md`. Follow-up workstream to adopt the new fields in the modal.

## Constitution Check

- The spec is backwards-compatible: existing `tesco_product_metadata_cache.json` entries still load (the new fields default to absent / null). The `MEALS_PRODUCT_ENRICHMENT=0` kill switch and `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS` knob are preserved.
- The no-fabrication invariant is preserved: failed enrichments leave the item's `productMetadata` absent; the dashboard shows the truthful placeholder ("Product information not available in generated data") rather than falling back to a hand-curated static map. *(Spec 010 Rev 4, 2026-06-22: the static `lib/product-database.ts` substring-match fallback is removed; the truthful placeholder is the contract.)*
- No new dependencies; `urllib`, `re`, `json`, `html` (stdlib) are sufficient.

## Implementation Phases *(to be detailed at Proposed time)*

### Phase 1: Apollo cache extraction helper

- New function `fetch_tesco_apollo_cache(tpnc, timeout)` in `sync-dashboard-data.py` that:
  - GETs `https://www.tesco.com/shop/en-GB/products/<tpnc>`
  - Locates `"ProductType:<tpnc>":` in the response HTML
  - Walks the JSON value (respecting strings) and `json.loads` it
  - Returns the parsed dict or `None` on any failure
- Unit-tested with a fixture HTML snippet.

### Phase 2: Field mapping

- New function `apollo_cache_to_product_info(apollo, original_name)` that:
  - Joins `description` + `details.productMarketing` for the `description` field
  - Joins `details.storage` (+ `details.freezingInstructions` for frozen) for `storage`
  - Flattens `details.preparationAndUsage` + `cookingInstructions.{oven,microwave,grill}.{chilled,frozen}.instructions` for `preparation`
  - Strips HTML from `details.ingredients` for `ingredients`
  - Joins `details.allergens[].values` for `allergens`
  - Renders `details.nutrition[]` as a markdown table for `nutrition`
  - Decodes `\u002F` → `/` and `\u0026` → `&` in URLs
  - Preserves `tpnc`, `gtin`, `tpnb`, `brandName`, `departmentName`/`aisleName`/`shelfName`
- Unit-tested with the three spike product payloads.

### Phase 3: Tpnc-keyed cache lookup and freshness window

- Update `enrich_order_items_with_product_metadata` to:
  - Check the cache first (existing behaviour, key by lowercased name; new: also try `tpnc` key when present)
  - If cache hit within `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` (default 14), return cached value
  - On miss, search for `name→tpnc` (if `tpnc` not already known), then call `fetch_tesco_apollo_cache`, then call `apollo_cache_to_product_info`
  - Persist the result with `lastFetched: now().isoformat()`
  - Write the cache atomically (write to `*.tmp`, `os.replace`)

### Phase 4: Backfill script

- New file `scripts/backfill_tesco_product_metadata.py`:
  - Load `tesco_product_metadata_cache.json`
  - For each entry, parse `tpnc` from the existing `productUrl` (or fall back to name-based search for old URL shapes)
  - Fetch + extract + upgrade; or mark `unmatched` with a reason after one search + one product-page attempt
  - Print summary: `upgraded / already_complete / unmatched`
  - Flags: `--dry-run`, `--force`, `--limit N`
  - Exit 0 on success; non-zero only on fatal errors (e.g. cache file unreadable)

### Phase 5: Tests

- Update `test_product_enrichment.py` to:
  - Keep all existing tests passing
  - Add tests for: name→tpnc resolution (mocked search), Apollo-cache extraction (mocked HTML), field mapping (golden file), freshness short-circuit, HTML strip, `\u002F` decode, no-fabrication, backfill upgrade, backfill unmatched
- Add `test_backfill_tesco_product_metadata.py` (new) for the backfill script.

### Phase 6: skill.spec.yaml update

- Add the new backfill script to `expected_artifacts:` in `/home/hermes/workspace/Hermes-Skills/data-science/meals-check/skill.spec.yaml`.

## Risks

- **Tpnc collision**: Tesco reuses `tpnc` after delisting. Mitigation: re-validate the title against the search query (FR-009 already covers "no fabrication"; collision handling is a follow-up).
- **Apollo cache shape change**: Tesco may change the embedded JSON shape. Mitigation: defensive walker, log-and-skip on missing keys (FR-010).
- **Rate limiting**: Tesco currently allows 1 req/sec sustained without rate-limit headers. Mitigation: keep the existing `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS` knob.
- **Field-mapping changes**: ten open questions in `spec.md` may change the field shapes. Mitigation: implement only the agreed field set; defer modal-side changes to a follow-up workstream.

## Verification

- `python /home/hermes/workspace/meals-dashboard/scripts/test_product_enrichment.py` — must pass.
- `python /home/hermes/workspace/meals-dashboard/scripts/test_backfill_tesco_product_metadata.py` — must pass (new).
- `python /home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py --help` — must run without import errors.
- `python /home/hermes/workspace/meals-dashboard/scripts/backfill_tesco_product_metadata.py --dry-run` — must print a summary and exit 0.
- Live runtime evidence: run sync against a real Tesco order; capture a screenshot of the dashboard modal showing the new fields.

## Documentation Artifacts

- This `plan.md` — implementation approach.
- `tasks.md` — delivery checklist.
- `CHANGELOG.md` — material change history.
- `references/tesco-apollo-cache-shape.md` (to be added at Proposed time) — spike notes, three product payloads, field-mapping table.
