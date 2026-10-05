# Feature Specification: Dashboard Order Items

Feature ID: `008-dashboard-order-items`

Feature Name: Dashboard Order Items

Target Skill: `data-science/meals-check`

Created: 2026-06-10

Status: Final

Change history: CHANGELOG.md

Input: Brownfield capture from current meals dashboard implementation, especially /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 68-77, 152-164, and 430-484 plus lib/item-utils.ts; amended by Danny on 2026-06-13 to improve the Order Items by Category controls layout and add item sorting; amended again on 2026-06-14 so item-name and price sorting each support ascending and descending order; reopened on 2026-06-19 so the section adds immediate client-side search that composes with match filters, sort controls, category chips, and future dynamic item loading; implemented and verified on 2026-06-19; reopened again on 2026-06-19 to add a clear button for the search box.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Order Item List and Filters (Priority: P1)

As Danny, I want to browse the current Tesco order by category and matched state, so I can spot stray or useful groceries without reading the raw receipt email.

**Why this priority**: The order item list is the practical grocery review surface beneath the meal grid.

**Independent Test**: Load the current dashboard data, verify the Order Items by Category controls use the available horizontal space with a readable responsive layout, type into the search box and see the visible rows filter immediately, use the clear button to empty the search text and restore the non-search-filtered result, toggle category chips and all/matched/unmatched buttons, change item sort field and direction, verify item names/prices/status markers change according to the combined search/category/matched filters and ascending/descending sorting, and use Show all/Collapse to top 10 when more than ten items are visible. Unit coverage verifies the word-overlap classifier used by the component and the pure client-side filter/search/sort pipeline.

**Acceptance Scenarios**:

1. Given receipt items have categories, When the order item controls render, Then the dashboard shows an All chip plus one chip per sorted category.
2. Given Danny clicks a category chip, When it was not selected, Then that category is added to the selected category set; clicking it again removes it.
3. Given Danny clicks All, When any category or matched-state filter is active, Then category filters are cleared and matched filter returns to all.
4. Given Danny clicks all/matched/unmatched controls, When the item list renders, Then only items matching the selected matched state are shown, where matched state is calculated by the dashboard's current receipt-item-name to meal-content word-overlap heuristic.
5. Given order items include the Substitutions: On suffix, When item names are displayed, Then the suffix is removed for display.
6. Given more items match the filters than the visible count (default: 10), When Danny clicks "Show all {N} items", Then the full filtered list is displayed with a button to "Collapse to top 10"; clicking it returns to the short list.
7. Given an item has quantity greater than 1, When the item row renders, Then it displays unit price as "{qty}× £{unitPrice}" followed by the total price; if quantity is 1, it shows only the total price; if price is unavailable, it shows "(price N/A)" in italic.
8. Given the product detail modal is open and no product image is available, When the modal renders the fallback, Then it shows the emoji from the `getCategoryIcon` mapping (16 categories: strawberry/blueberry/raspberry/blackberry/grape→🍇, apple/banana→🍎, tomato/pepper/cucumber/celery/lettuce/carrot→🥕, broccoli/spinach/kale→🥦, chicken/beef/pork/gammon/steak/bacon/ham/sausage/meat→🥩, fish/salmon/tuna→🐟, milk/cheese/yoghurt/butter/cream→🧀, egg→🥚, bread/pizza/pasta/noodle→🍞, rice/risotto→🍚, potato→🥔, juice/smoothie/drink→🧃, water/sparkling→💧, coffee/tea→☕, frozen/microwave→🧊, biscuit/cookie/cake/chocolate/sweet→🍪, popcorn→🍿, salad/bowl→🥗, default→📦).
9. Given the Order Items by Category filter controls render on desktop or wider tablet widths, When there is available horizontal space, Then the category chips, matched-state controls, and sort controls use that width in separated, readable control groups rather than bunching into a cramped cluster.
10. Given the Order Items by Category controls render on narrower widths, When the available width is insufficient for one row, Then the controls wrap gracefully with consistent spacing and remain readable/tappable.
11. Given no explicit sort has been selected, When the order item list renders, Then items are sorted alphabetically ascending by cleaned display name within the currently filtered result set.
12. Given Danny selects item-name sort direction, When the order item list renders, Then the same currently filtered result set can be sorted by cleaned display name in ascending or descending order.
13. Given Danny selects price sort, When the order item list renders, Then the same currently filtered result set can be sorted by price low-to-high or high-to-low while preserving item filtering and Show all/Collapse behaviour; items without a price sort after priced items in either direction.
14. Given Danny starts typing in the Order Items by Category search field, When each character is entered or deleted, Then the item list updates immediately on the client without waiting for a submit action, navigation, or server round-trip.
15. Given a match-state filter, category chip selection, search query, and sort choice are all active, When the order item list renders, Then the visible rows are the intersection of the match-state filter, selected categories, and search query, ordered by the selected sort, with Show all/Collapse applying only after that combined result is computed.
16. Given future optimisation introduces dynamic loading, virtualisation, or an incremental visible window for order items, When search/category/match/sort state changes, Then the optimisation must operate on the same canonical client-side filtered-and-sorted result set rather than filtering only the already-rendered subset.
17. Given the search field contains text, When Danny activates the clear button, Then the search query is emptied immediately, the search input visibly clears, focus remains in or returns to the search field, and the list re-renders using the active category/matched/sort controls with no search constraint.

### Edge Cases

- Missing generated dashboard data should produce visible empty/fallback UI states from the current implementation, not fabricated meal or grocery data.
- UI interactions in this feature are read-only client state unless explicitly stated otherwise.
- Search query changes must be immediate client-side state updates; an empty search query is equivalent to no search filter.
- The clear button should only be active/visible when the search field has text to clear; clearing search must not reset category, matched-state, sort, or Show all/Collapse state.
- Canonical meal coverage, delivery-window, and receipt parsing logic remain owned by the meals-check pipeline; this feature documents the dashboard's current receipt-item word-overlap heuristic for display-only matched/unmatched filtering.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST group receipt items by category, defaulting missing categories to Pantry.
- **FR-002**: The dashboard MUST provide All and per-category chips that update selected category UI state.
- **FR-003**: The dashboard MUST provide all/matched/unmatched controls for order-item matched-state filtering using the shared dashboard helper heuristic: split receipt item names and meal content into words longer than two characters and treat an item as matched when any item word contains a meal word or any meal word contains an item word.
- **FR-004**: The order item list MUST show match indicator, cleaned item name, quantity/unit price where available, total price where available, or price-unavailable text. Unit price is displayed as "{qty}× £{unitPrice}" when quantity > 1; when quantity is 1, only the total price is shown; when price is unavailable, "(price N/A)" renders in italic.
- **FR-005**: The order item list MUST initially show a limited count (default: 10) and allow expanding to all filtered items and collapsing back to the top 10.
- **FR-006**: Order item filtering and the matched/unmatched display heuristic MUST be UI-only and MUST NOT mutate generated dashboard or pipeline data.
- **FR-007**: When the product detail modal renders without a product image, it MUST display the emoji fallback derived from the `getCategoryIcon` mapping for the item's category.
- **FR-008**: The Order Items by Category control area MUST use available width effectively: category chips, matched-state controls, and sort controls SHOULD be visually separated into readable groups, use horizontal space on wider layouts, and wrap gracefully with consistent spacing on narrower layouts. Controls MUST NOT be bunched into a cramped cluster when unused width is available.
- **FR-009**: The order item list MUST provide a sort control with item-name alphabetical sorting as the default. Alphabetical sorting MUST use the cleaned display name so suffixes such as `Substitutions: On` do not affect order. Default direction MUST be ascending.
- **FR-010**: The order item list MUST support changing item-name sort direction between ascending and descending while operating on the currently filtered item set and preserving matched/category filter behaviour plus Show all/Collapse behaviour.
- **FR-011**: The order item list MUST support sorting by price in both low-to-high and high-to-low directions. Price sorting MUST operate on the currently filtered item set, preserve matched/category filter behaviour and Show all/Collapse behaviour, and place items with unavailable prices after priced items in either direction.
- **FR-012**: The Order Items by Category section MUST provide a client-side search input for receipt items. The search MUST update the visible list immediately as Danny types or deletes characters, without requiring a submit button, route navigation, API request, or full dashboard reload.
- **FR-013**: Search MUST compose with the existing matched-state filter, category chips, sort controls, and Show all/Collapse behaviour. The canonical client-side pipeline MUST apply category and matched-state filters, apply the normalised search query over cleaned item names and relevant item metadata available in the already-loaded receipt item object, apply the selected sort to that combined result set, and only then apply the visible-count window.
- **FR-014**: Any future dynamic loading, virtualisation, or incremental rendering optimisation for Order Items by Category MUST preserve the FR-013 pipeline semantics by filtering and sorting the full loaded receipt-item collection before selecting the rendered/visible window. It MUST NOT search only the currently rendered subset or reset category/matched/sort state when the search query changes.
- **FR-015**: The search control MUST provide a clear button when the search query is non-empty. Activating the clear button MUST set the search query to an empty string immediately, visually clear the input, preserve category/matched-state/sort/visible-count state, and keep keyboard focus in or return it to the search input so Danny can type a replacement query without extra navigation.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — this feature directory is listed as an expected artifact.
- `SKILL.md` changes required: Yes — dashboard UI feature specs are listed in the meals-check spec contract.
- Runtime state changes required: No generated-data schema changes. Implementation will add transient client-side UI state for the search query only.
- Secrets/config changes required: No.
- Cron/hook changes required: No.

### Key Entities

- **Receipt Item**: Current dashboard concept captured from the implementation.
- **Category Chip**: Current dashboard concept captured from the implementation.
- **Control Group Layout**: The responsive Order Items by Category controls area containing category chips, matched-state filters, search input, and sort controls. It should use available width on wider layouts and wrap cleanly on narrower layouts.
- **Matched State Filter**: Current dashboard concept captured from the implementation.
- **Search Query**: Transient client-side text state entered in the Order Items by Category section. Blank or whitespace-only values mean no search filter. Non-empty values are normalised case-insensitively and matched against cleaned receipt item names plus relevant item metadata already present on the loaded item object.
- **Search Clear Button**: A UI affordance shown/enabled when the search query is non-empty. It clears only the search query and preserves every other active Order Items by Category control.
- **Filter/Search/Sort Pipeline**: The deterministic client-side derivation of visible order items: start from loaded receipt items, apply category and matched-state filters, apply the search query, apply the selected sort, then apply the visible-count window.
- **Dynamic Item Window**: Any future virtualised or incrementally rendered subset used for loading performance. It is an optimisation of rendering only, not a separate filter source of truth.
- **Sort Control**: UI control for ordering the currently filtered order item list. Default is item name ascending by cleaned display name. Item-name sort supports ascending and descending directions; price sort supports low-to-high and high-to-low directions, with unavailable prices placed after priced items in either direction.
- **Visible Item Count**: Current dashboard concept captured from the implementation. Default: 10, expandable.
- **Category Icon Mapping**: 16-key keyword-to-emoji mapping used as fallback when no product image is available in the product detail modal: strawberry/blueberry/raspberry/blackberry/grape→🍇, apple/banana→🍎, tomato/pepper/cucumber/celery/lettuce/carrot→🥕, broccoli/spinach/kale→🥦, chicken/beef/pork/gammon/steak/bacon/ham/sausage/meat→🥩, fish/salmon/tuna→🐟, milk/cheese/yoghurt/butter/cream→🧀, egg→🥚, bread/pizza/pasta/noodle→🍞, rice/risotto→🍚, potato→🥔, juice/smoothie/drink→🧃, water/sparkling→💧, coffee/tea→☕, frozen/microwave→🧊, biscuit/cookie/cake/chocolate/sweet→🍪, popcorn→🍿, salad/bowl→🥗, default→📦.
- **Price Display Format**: Unit price shown as "{qty}× £{unitPrice}" when qty > 1; only total price shown when qty = 1; "(price N/A)" italic when price unavailable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Category and matched-state filters combine to change the visible item list.
- **SC-002**: Items display cleaned names and price/quantity information from current generated order data.
- **SC-003**: Show all and collapse controls work when the filtered list exceeds the current visible count.
- **SC-004**: Order Items by Category controls use the available layout width without bunching and wrap cleanly on smaller widths.
- **SC-005**: The default item order is item name ascending by cleaned display name, and item-name sorting can be reversed to descending.
- **SC-006**: Selecting price sort reorders the currently filtered item list by price in low-to-high or high-to-low direction while preserving active filters and visible-count behaviour.
- **SC-007**: Typing in the search field immediately narrows or widens the order item list without a submit action, navigation, API request, or full reload.
- **SC-008**: With search, category, matched-state, sort, and Show all/Collapse all active, the visible list reflects the combined result in the defined pipeline order.
- **SC-009**: Future dynamic loading or virtualisation is allowed only if it preserves the same combined result set and treats rendering-window selection as the final step.
- **SC-010**: Clearing the search field with the clear button immediately removes only the search constraint and leaves category, matched-state, sort, and visible-count state intact.

## Assumptions

- The current dashboard implementation under `/home/hermes/workspace/meals-dashboard` is the source of truth for this brownfield capture.
- The dashboard consumes generated pipeline data from `real-data.ts`; it does not perform Tesco email parsing or canonical meal matching, but it does perform a local word-overlap heuristic for order-item matched/unmatched display.
- This spec is Proposed for the 2026-06-19 search refinement; the previous implemented controls-layout, filtering, and sorting behaviours remain the baseline that search must compose with rather than replace.
- Cross-dashboard reuse check: searched `/home/hermes/workspace/trips-dashboard` for search/filter input patterns on 2026-06-19. The sibling dashboard has URL-backed trip filter toggles in `components/dashboard-session-surface.jsx`, but no directly reusable order-item-style free-text search input. Meals may therefore specify the search affordance in this section while keeping the same client-side state philosophy.

## Out of Scope

- Changing meals-check pipeline matching semantics.
- Changing Telegram report formatting.
- Deploying, building, or modifying runtime dashboard code as part of this spec update.
- Server-side search, query-parameter persistence, or fetching additional product blobs from the search field.

## Clarifications

### Session 2026-06-13 — Controls layout and sorting

- Q: How should the Order Items by Category filters use space? → A: The category, matched-state, and sort controls should use the available width in separated, readable groups rather than appearing bunched up; they should wrap cleanly on narrower screens.
- Q: What sorting should the section support? → A: Default to alphabetical order by cleaned item display name, with an additional price sort for the currently filtered items.

### Session 2026-06-14 — Sort direction

- Q: Should the Order Items by Category sorting support direction? → A: Yes. Item-name sorting must support ascending and descending order, with item name ascending as the default. Price sorting must support low-to-high and high-to-low order, with unavailable prices placed after priced items in either direction.

### Session 2026-06-19 — Search and loading architecture

- Q: Should the Order Items by Category search be client-side? → A: Yes. Search should begin filtering immediately as Danny types and should not require a server request or submit action.
- Q: How should search interact with the existing controls? → A: It must compose with matched-state filters, category chips, sort direction, and Show all/Collapse; it is not a replacement filter mode.
- Q: Should search include a clear affordance? → A: Yes. When text exists in the search field, the UI should provide a clear button that empties only the search query and preserves the other controls.
- Q: What about dynamic loading for performance? → A: The implementation may later optimise rendering with dynamic loading or virtualisation, but the canonical filter/search/sort result must be computed over the full loaded receipt-item collection first; the dynamic window is a rendering optimisation only.
