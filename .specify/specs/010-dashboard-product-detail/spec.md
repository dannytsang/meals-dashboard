# Feature Specification: Dashboard Product Detail

Feature ID: `010-dashboard-product-detail`

Feature Name: Dashboard Product Detail

Target Skill: `data-science/meals-check`

Created: 2026-06-10

Status: Final

Change history: CHANGELOG.md

> **Rev 4 (2026-06-22, static fallback removed)**: The static `lib/product-database.ts` substring-match fallback is removed. When generated pre-enriched Tesco product metadata is unavailable, the modal shows the truthful placeholder ("Product information not available in generated data") rather than silently inventing details from a hand-curated map. This is a contract change: the consumer (spec 010) and the producer (spec 021 / 025 / 027) all drop the static-DB fallback. Danny's 2026-06-22 observation: "It should use the per product data and if none exist, then show place holder information like no product description found for example". The static DB was added in Rev 1 as a 38-entry curated map; Rev 4 deletes the file (or reduces it to a no-op empty object for back-compat) and updates the spec contract. The category-icon 16-key emoji mapping (FR-004) and the "loading/unavailable" states (FR-008) are unchanged — those are honest UI states, not invented product details. Status flipped `Final` → `Proposed` for the amendment; flips back to `Final` once the implementation lands and the production modal is verified to no longer read `lib/product-database.ts`.

> **Rev 5 (2026-06-23, debug-mode product-resolution chip on the modal)**: When spec 022's signed `meals_debug_mode` cookie is effectively verified-on, the Product Detail Modal surfaces a small debug chip / inline panel that shows the product-resolution chain for the currently inspected item: `tpnc` when known, the derived `products/{tpnc}.json` path, the winning source for each key field (`description` ∈ `apollo | firecrawl | placeholder`, `image`, `storage`, `preparation`), and freshness metadata (`product lastFetched`, `firecrawl lastFetched`) where available. When debug mode is off, the chip MUST NOT render and the modal looks exactly as it does today. The chip is data-equivalent to the spec 031 product-resolution panel — the modal reads from the same server-gated debug data source that `/debug` reads, with the spec-022 OIDC + signed-cookie gate re-applied. No new npm dependencies; no second debug framework. Danny's 2026-06-23 ask: "When debug mode is on, i want to be able to see debug information on products". Status stays `Proposed` (already Proposed from Rev 4) and the spec re-flips to `Final` once the chip is verified live in production for both an Apollo-backed item and a placeholder item.

> **Rev 5.1 (2026-06-23, expected-vs-actual product path in the chip)**: The debug chip MUST additionally surface `expectedProductBlobPath` (derived from the item's tpnc per the spec 021 Key Entities convention `products/{tpnc}.json` — `null` when tpnc is unknown) and `productBlobPathMatch: true | false | null`. The convention is sourced from spec 021 Key Entities (`ProductBlob: products/{tpnc}.json`); the chip MUST NOT hardcode the convention. When the values match, the chip shows `expected: products/<tpnc>.json ✓ match`. When they do not match, the chip shows `expected: products/<tpnc>.json ✗ found <actual>` so convention drift is visible inline. When tpnc is unknown, the chip shows `expected: (unknown — tpnc not resolved)` and `productBlobPathMatch: null`. This closes the convention-drift blind spot Danny asked about on 2026-06-23: "does the debug contain information such as expected blob storage path for product meta data?". The chip's data source is the spec 031 Rev 3 product-resolution payload (FR-005 / FR-006 as amended by Rev 3).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Order Item Opens Product Detail (Priority: P1)

As Danny, I want to click a Tesco order item or a matched item in a meal detail overlay and see the same product details quickly, using pre-enriched Tesco product information where available, so I can understand what an item is, whether it was substituted, and what it costs without waiting for slow client-side lookup.

**Why this priority**: Grocery-level drill-down explains unfamiliar receipt items and substitutions without leaving the dashboard.

**Independent Test**: Load generated order data containing pre-enriched Tesco product metadata, click an order item, verify the product modal renders from generated metadata without starting a slow client-side product search, then open a meal detail overlay and click a matched item to verify the same modal contract opens from that source. Also verify fallback text for items without enriched metadata and close behaviour via close control or backdrop. Unit coverage verifies cleaned modal titles, total-price display, safe empty receipt transformation, preserved optional substitution metadata, matched-item source handling, and generated product metadata consumption.

**Acceptance Scenarios**:

1. Given a visible order item is clicked, When the dashboard handles the click, Then it opens a product detail overlay for that item using generated pre-enriched product metadata when available, without making a slow product-search request during modal open.
2. Given a matched item is clicked from the Meal Detail Overlay, When the dashboard handles the click, Then it opens the same product detail overlay contract for the underlying matched Tesco/order item and uses the same generated pre-enriched product metadata path.
3. Given generated Tesco product metadata exists for the item, When the overlay renders, Then it shows the generated description/title/image/product URL/storage or other supported product fields.
4. Given generated Tesco product metadata is unavailable or incomplete, When the overlay renders, Then it MUST show the truthful placeholder ("Product information not available in generated data") rather than fall back to a static curated map or perform a slow client-side web search. *(Rev 4: the static `lib/product-database.ts` fallback is removed; the modal must be honest about missing data rather than silently invent details.)*
5. Given the clicked item was substituted and generated substitution metadata is present, When the overlay renders, Then it shows the substituted item separately from the cleaned item name.
6. Given the modal has no generated metadata, When the overlay renders, Then it shows the truthful "Product information not available in generated data" placeholder text rather than fabricating specific product details.
7. Given the overlay is open, When Danny clicks the close control or backdrop, Then it closes and clears selected product state.

### Edge Cases

- Missing generated dashboard data should produce visible empty/fallback UI states from the current implementation, not fabricated meal or grocery data.
- UI interactions in this feature are read-only client state unless explicitly stated otherwise.
- The Product Info Modal is shared UI: Order Item Row clicks and Meal Detail Overlay matched-item clicks must not diverge into separate modal behaviours.
- Matching, delivery-window, and receipt parsing logic remain owned by the meals-check pipeline, not the dashboard UI.

### User Story 2 - Debug-Mode Product-Resolution Chip on the Modal (Priority: P2)

As Danny, when spec 022's debug mode is effectively on (signed `meals_debug_mode` cookie verified-on by the server), I want the Product Detail Modal to show a small debug chip or inline panel that exposes the product-resolution chain for the currently inspected item — tpnc, the derived `products/{tpnc}.json` path, the winning source for `description` / `image` / `storage` / `preparation`, and freshness timestamps — so I can tell at a glance whether the modal is showing Apollo-backed data, Firecrawl fallback data, or the truthful placeholder, and why, without leaving the modal to read logs or open `/debug`. When debug mode is off, the chip MUST NOT render and the modal looks exactly as it does today.

**Why this priority**: P2 — operator-only diagnostic. The product-resolution panel on `/debug` (spec 031 US3 / FR-005 / FR-006) already exposes the same data, but the round-trip from modal to `/debug` to back to the modal is friction. Surfacing the chip on the modal collapses the loop. Not P1 because the existing `/debug` product-resolution panel covers the underlying need.

**Independent Test**: With the signed `meals_debug_mode=1` cookie set, open the dashboard, click an Apollo-backed order item, confirm the modal shows the chip with `descriptionSource: apollo`, the tpnc, the derived `products/{tpnc}.json` path, and `lastFetched` for the product. Click an order item whose description falls through to the placeholder, confirm the chip shows `descriptionSource: placeholder` and identifies which upstream sources were absent or empty. Clear the debug cookie, click an item, confirm the chip is gone and the modal renders identically to the pre-Rev-5 layout.

**Acceptance Scenarios**:
8. Given debug mode is effectively on and a product item with Apollo-backed `description` is opened, When the modal renders, Then it shows a debug chip containing `tpnc` (when known), the derived `products/{tpnc}.json` path, `descriptionSource: apollo`, `imageSource`, `storageSource`, `preparationSource` where each is known, and `product.lastFetched` when available. The chip renders inline within the modal chrome, not as a popover or separate route.
9. Given debug mode is effectively on and a product item whose `description` came from Firecrawl fallback is opened, When the modal renders, Then the chip shows `descriptionSource: firecrawl`, the Firecrawl `lastFetched` timestamp, and indicates Firecrawl/placeholder were chosen (or not) for each of `image`, `storage`, `preparation` as available.
10. Given debug mode is effectively on and a product item falls through to the truthful placeholder, When the modal renders, Then the chip shows `descriptionSource: placeholder` and names the upstream sources that were absent or empty (e.g. `apolloMissing: true`, `firecrawlMissing: true`) so the operator can tell whether the gap is Apollo's fault or Firecrawl's.
11. Given the debug cookie is unset, tampered, or signed-off, When the modal renders for any item, Then the debug chip MUST NOT be present in the DOM, in the rendered HTML, or in any reachable client-side payload. Bundle grep invariant holds: `grep -rn "ProductResolutionDebug\|debug-product-chip\|product-resolution-chip" /home/hermes/workspace/meals-dashboard --include='*.ts' --include='*.tsx'` returns matches only inside spec-022-gated code paths.
12. *(Rev 5.1, 2026-06-23)* Given debug mode is effectively on and a product item has a known `tpnc` and resolved product path, When the modal renders, Then the chip MUST surface `expectedProductBlobPath` derived per the spec 021 Key Entities convention `products/{tpnc}.json` and `productBlobPathMatch: true | false` comparing the derived path to the actual resolved path. When they match, the chip shows `expected: products/<tpnc>.json ✓ match`. When they do not match, the chip shows `expected: products/<tpnc>.json ✗ found <actual>` so convention drift is visible inline.
13. *(Rev 5.1, 2026-06-23)* Given debug mode is effectively on and a product item has no resolved `tpnc` (e.g. matcher could not resolve the name to a tpnc), When the modal renders, Then the chip shows `expectedProductBlobPath: null` and `productBlobPathMatch: null` with a short label such as `expected: (unknown — tpnc not resolved)`. The chip MUST NOT show a misleading `false` for a missing tpnc; a missing tpnc is a different problem from a wrong path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST allow selecting a visible order item to open product-level detail for that item.
- **FR-002**: Product detail MUST prefer generated pre-enriched product metadata attached to the receipt/order item. Tesco-sourced metadata generated during the pipeline/sync path is the primary source for product title, image, description, product URL, and other supported product fields.
- **FR-003**: When generated pre-enriched Tesco product metadata is unavailable or incomplete, the modal MUST show the truthful placeholder text rather than fall back to a static curated map, a hand-coded substring-match, or a slow client-side web search. The contract is "if we have the data, show it; if we don't, say so" — never invent product details. *(Rev 4: replaces the prior "MAY fall back to local product database" wording; the static `lib/product-database.ts` substring-match fallback is removed entirely.)*
- **FR-004**: Product detail MUST show product image or category-icon fallback, description, the product `storage` text under the Storage & Preparation heading when available, substitution information when generated metadata is present, and the receipt item total price without multiplying by quantity again. If no reliable price is available, the modal MUST show a truthful unavailable state rather than fabricating `£0.00`.
- **FR-008**: Product detail MUST show loading and fallback/unavailable states truthfully. Loading should represent local/generated metadata preparation only, not an avoidable live web scrape performed after the user clicks an item.
- **FR-005**: Product detail MUST be dismissible via close control and backdrop click and MUST clear selected product state when dismissed.
- **FR-006**: The dashboard MUST allow selecting a matched item from the Meal Detail Overlay to open the same product-level detail contract for the underlying matched Tesco/order item when sufficient item metadata is available. Matched-item launches MUST first use generated matched-item details preserved in `realCoverage[].matchedItems`; they MAY resolve the underlying visible receipt/order item using the matched name or ingredient text when needed, so shortened matcher phrases such as `pork kebab` can still use the order item's real price and metadata when present.
- **FR-007**: Product detail behaviour MUST be source-equivalent: opening from an Order Item Row and opening from a Meal Detail Overlay matched item MUST use the same Product Info Modal fields, generated metadata path, fallback order, loading/fallback states, substitution handling, price handling, and close behaviour.
- **FR-009**: The Product Info Modal MUST preserve a graceful fallback when Tesco enrichment fails, is rate-limited, cannot find a matching product, or lacks a field. It MUST not fabricate Tesco product details.

- **FR-010 (Rev 5 — debug-mode product-resolution chip)**: When spec 022's signed `meals_debug_mode` cookie is effectively verified-on (per the spec-022 server-side `verifyDebugCookie` helper), the Product Detail Modal MUST surface a debug chip / inline panel that exposes the product-resolution chain for the currently inspected item: `tpnc` (when known), the derived `products/{tpnc}.json` path, the winning source for each key field (`description` ∈ `apollo | firecrawl | placeholder`, `image`, `storage`, `preparation`) where known, and freshness metadata (`product lastFetched`, `firecrawl lastFetched`) where available. The chip MUST render inline within the modal chrome (not as a popover, tooltip, or separate route). When the debug cookie is unset, tampered, or signed-off, the chip MUST NOT render in the DOM, the rendered HTML, or any reachable client-side payload. The chip's data source is the spec 031 product-resolution panel payload (FR-005 / FR-006 of spec 031); the modal's chip MUST be data-equivalent to that panel and MUST inherit the spec-022 OIDC gate and signed-cookie gate. No new npm dependencies; no second debug framework. *(Rev 5: Danny asked 2026-06-23, "When debug mode is on, i want to be able to see debug information on products".)*

- **FR-011 (Rev 5.1 — expected-vs-actual product path in the chip)**: The debug chip MUST additionally surface `expectedProductBlobPath` (derived from the item's tpnc per the spec 021 Key Entities convention `products/{tpnc}.json` — `null` when tpnc is unknown) and `productBlobPathMatch: true | false | null` (boolean comparing `expectedProductBlobPath` to `productBlobPath`; `null` when either side is absent). The convention is sourced from spec 021 Key Entities and MUST NOT be hardcoded in this spec. When `productBlobPathMatch` is `true`, the chip shows `expected: products/<tpnc>.json ✓ match`. When `false`, the chip shows `expected: products/<tpnc>.json ✗ found <actual>` so convention drift is visible inline. When `null` (tpnc unknown or path absent), the chip shows `expected: (unknown — tpnc not resolved)` and MUST NOT show a misleading `false`. The chip's data source for both fields is the spec 031 Rev 3 product-resolution payload (FR-005 / FR-006 as amended by Rev 3). *(Rev 5.1: Danny asked 2026-06-23, "does the debug contain information such as expected blob storage path for product meta data?". Rev 5.1 closes the convention-drift blind spot.)*

### Contract Impact

- `skill.spec.yaml` changes required: Yes — this feature directory is listed as an expected artifact.
- `SKILL.md` changes required: Yes — dashboard UI feature specs are listed in the meals-check spec contract.
- Runtime state changes required: No — this is a current-behaviour documentation split.
- Secrets/config changes required: No.
- Cron/hook changes required: No.

### Key Entities

- **Order Item**: Current dashboard concept captured from the implementation.
- **Matched Item Source**: A meal-detail matched item that refers to an underlying Tesco/order item and can launch the shared Product Detail Overlay.
- **Product Detail Overlay**: Current dashboard concept captured from the implementation.
- **Product Info**: Current dashboard concept captured from the implementation.
- **Generated Tesco Product Metadata**: Product metadata captured before dashboard push from Tesco as the primary shopping source, attached to generated order/receipt items for fast modal rendering.
- **Substitution**: Current dashboard concept captured from the implementation.
- **Category Icon**: Current dashboard concept captured from the implementation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Clicking an order item opens a product detail overlay for that item.
- **SC-004**: Clicking a matched item in the Meal Detail Overlay opens the same Product Info Modal contract for that item.
- **SC-002**: The overlay shows generated Tesco product metadata when available, falls back truthfully when unavailable, displays a cleaned item title, and shows the receipt total price.
- **SC-003**: Closing the overlay clears the selected item and product info state.

## Assumptions

- The current dashboard implementation under `/home/hermes/workspace/meals-dashboard` is the source of truth for this brownfield capture.
- The dashboard consumes generated pipeline data from `real-data.ts` and does not perform Tesco email parsing or canonical matching.
- The 2026-06-13 shared-source refinement is implemented: the Product Info Modal is shared by Order Item Row clicks and Meal Detail Overlay matched-item clicks.
- The 2026-06-13 product-enrichment refinement is Proposed: product metadata should be generated before dashboard push, with Tesco as the primary source, rather than fetched slowly at modal-open time.

## Out of Scope

- Changing meals-check pipeline matching semantics.
- Changing Telegram report formatting.
- Bypassing Tesco authentication, CAPTCHA, robots controls, or rate limits. Product enrichment must be best-effort against permitted/publicly accessible data and cache results where possible.


## Clarifications

### Session 2026-06-13

- Q: Should matched items in the Meal Detail Overlay open product information? → A: Yes. They should open the same Product Info Modal used when clicking an item in the Order Items by Category list.

### Session 2026-06-13 — Pre-enriched Tesco product metadata

- Q: Should the product modal search/load product information only after the user opens it? → A: No. That is currently slow. Enrich products after pipeline data is created and before dashboard data is pushed, using Tesco as the primary product source where permitted, so the modal can render quickly from generated metadata.
- Q: What should happen if Tesco product enrichment fails or cannot find a product? → A: Keep a truthful fallback; do not fabricate product details and do not block dashboard generation indefinitely.

### Session 2026-06-22 — Static `lib/product-database.ts` fallback removed

- Q: Why do we have a static `lib/product-database.ts` substring-match fallback at all? Should it stay? → A: Removed. The 38-entry curated map was a Rev 1 safety net for products Danny buys repeatedly that the enrichment pipeline hadn't reached yet, but the contract it encodes — "silently invent plausible product details from a hand-coded map when we have no real data" — is the wrong shape. The truthful state is: if we have per-product data, show it; if not, show the placeholder. The fallback is removed in Rev 4 and the modal will show "Product information not available in generated data" rather than guessing.
- Q: Does this break the modal? → A: No. Most products in the meals history are already pre-enriched (Apollo cache hit; spec 021). The remainder show the truthful placeholder, which the user can act on (backfill the missing product, or accept the gap). The category-icon 16-key emoji mapping (FR-004) is preserved — that is an honest UI state, not invented product data.
