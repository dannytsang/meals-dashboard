---
name: dashboard-grocy-pantry-coverage
description: "Grocy pantry inventory as an automatic coverage source in the meals-check pipeline. Order items matched first (freshness preference), then Grocy items fill remaining gaps. Adds source: order/grocy/manual_override field to matched_items and a 'In pantry' badge to the dashboard."
---

# Feature Specification: Dashboard Grocy Pantry Coverage

Feature ID: `020-dashboard-grocy-pantry-coverage`

Feature Name: Dashboard Grocy Pantry Coverage

Target Skill: `data-science/meals-check`

Created: 2026-06-15

Status: Final

Change history: CHANGELOG.md

Input: Original 016-dashboard-blob-storage-layout Draft (2026-06-14) FR-10 — Grocy pantry as automatic coverage source. After review, the original 016 was split per the spec governance rule. This feature owns the Grocy pantry coverage integration: query Grocy stock after order allocation, match remaining meal requirements to pantry items, surface `source: "grocy"` and the `🏠 In pantry` badge. Coverage invalidation / refund / perishable / manual override logic is in `019-dashboard-coverage-invalidation-refunds-perishables`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Grocy Pantry as Automatic Coverage Source (Priority: P2)

As Danny, I want meal items that are not in the current Tesco delivery but are in my Grocy pantry to be automatically matched as coverage, so that the dashboard correctly reflects that I have those items available.

**Independent Test**: A meal plan includes "Pasta" which is in Grocy stock but not in the current Tesco order. Verify the coverage blob shows "Pasta" as a matched item with `source: "grocy"` and `🏠 In pantry` badge. Verify a meal summary still shows `covered` if all items are covered (order + Grocy).

**Acceptance Scenarios**:
1. **Given** a meal plan item is not in the current Tesco order, **When** the pipeline runs the coverage algorithm, **Then** it queries `grocy_client.get_products_in_stock()` and matches pantry items to the remaining meal requirements.
2. **Given** an item is in both the Tesco order AND Grocy, **When** the coverage algorithm matches, **Then** the order item is matched first; Grocy is not consulted for that item.
3. **Given** an item is in Grocy but not the Tesco order, **When** the coverage algorithm matches, **Then** the Grocy item is matched with `source: "grocy"`.
4. **Given** a Grocy-matched item is in the coverage blob, **When** the dashboard renders the meal detail card, **Then** the item shows a `🏠 In pantry` badge.
5. **Given** a Grocy-matched item is in the coverage blob, **When** the dashboard renders, **Then** the item does NOT have a `use_by_warning` (pantry items may be arbitrarily old; freshness signals apply only to fresh delivery items).
6. **Given** a meal's items are all covered by order + Grocy (no missing), **When** the dashboard renders, **Then** the meal status is `covered`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The pipeline MUST use Grocy pantry inventory as an automatic coverage source, checked before marking a meal item as missing. When the Tesco order items do not fully cover a meal, the pipeline queries `grocy_client.get_products_in_stock()` and matches pantry items to the remaining meal requirements. Grocy pantry items are matched at lower priority than fresh delivery items: order items are allocated to meals first (freshness preference), then Grocy items fill remaining gaps.

- **FR-002**: Each `matched_items` entry MUST include a `source` field with one of: `"order"` (from Tesco delivery), `"grocy"` (from pantry inventory), `"manual_override"` (Danny manually confirmed). The field is required on every matched item; default is `"order"`.

- **FR-003**: Grocy-matched items MUST be displayed in the dashboard meal detail card with a `🏠 In pantry` badge.

- **FR-004**: The Grocy client (`grocy_client.py`) MUST be called during coverage calculation to fetch current pantry stock. The Grocy client location and configuration are declared in `skill.spec.yaml` (see `references/grocy-integration.md`).

- **FR-005**: Items sourced from Grocy are best-effort pantry coverage — they MUST NOT receive a `use_by_warning` (pantry items may be arbitrarily old; freshness signals apply only to fresh delivery items). The Grocy client response does not need to provide a `use_by_date`.

- **FR-006**: The matcher MUST allocate order items first. For each meal in date-ascending order: first pass through `matched_items[]` allocates order items (including shelf-life-aware matching for `019`); second pass allocates Grocy items to fill any remaining gaps. The two passes are sequential within each meal's allocation cycle.

- **FR-007**: When Grocy is unavailable (network error, auth failure, schema mismatch, etc.), the pipeline MUST fail soft: log a warning, skip Grocy matching, and mark uncovered items as missing. The pipeline MUST NOT fail the sync because of a Grocy issue. This is graceful degradation — order coverage still works.

- **FR-008**: The Grocy product match logic is best-effort: match by name (case-insensitive substring) or by exact product ID if the Grocy product has a corresponding Tesco item. The matcher is opportunistic; not every pantry item maps to a meal. A pantry item that doesn't match any meal requirement is ignored.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — add `020-dashboard-grocy-pantry-coverage` to the features list; declare `grocy_client.py` location and Grocy API configuration.
- `SKILL.md` changes required: Yes — document Grocy as automatic coverage source; update `references/grocy-integration.md` to mark it as wired.
- `019-dashboard-coverage-invalidation-refunds-perishables` relationship: This feature depends on `019`'s `matched_items[]` schema for the `source` field. `019` is the producer; this is one of the consumers.
- `018-dashboard-order-status-tracking` relationship: Independent — order status changes do not trigger Grocy re-matching (Grocy is a snapshot, not an event source).
- Runtime state changes required: Yes — `tesco_matcher.py` calls `grocy_client.get_products_in_stock()`; the Grocy URL and API key are environment variables.
- Secrets/config changes required: Yes — `GROCY_API_KEY` and `GROCY_BASE_URL` env vars (already declared in the existing Grocy integration).
- Cron/hook changes required: No.

### Key Entities

- **Grocy Product**: A pantry item fetched from `grocy_client.get_products_in_stock()`. Has at minimum `id`, `name`, `quantity`, `product_group_id`. May also have `best_before_date` but this is ignored per FR-005.

- **Matched Item Source Field**: New field on `matched_items[]` in the coverage blob. Values: `"order" | "grocy" | "manual_override"`. The `manual_override` value is set by `019-dashboard-coverage-invalidation-refunds-perishables`.

- **Pantry Badge**: `🏠 In pantry` badge rendered in the dashboard meal detail card for any matched item with `source: "grocy"`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: A meal plan item that is in Grocy stock but not in the current Tesco order is matched with `source: "grocy"` and shown in the dashboard with the `🏠 In pantry` badge.
- **SC-02**: An item that is in both the order and Grocy is matched with `source: "order"` (order takes priority).
- **SC-03**: Grocy-matched items do NOT have a `use_by_warning` field set.
- **SC-04**: When Grocy is unavailable (network error), the sync still completes successfully; the warning is logged; uncovered items are marked missing.
- **SC-05**: A meal whose items are all covered by order + Grocy shows status `covered` in the dashboard.

## Assumptions

- Grocy is reachable from the Hermes gateway at a stable HTTPS URL.
- `GROCY_API_KEY` and `GROCY_BASE_URL` are configured in the Hermes environment (already declared in the existing Grocy integration).
- The Grocy product name is sufficient for matching to meal items. (Product ID matching is opportunistic; not all pantry items have a corresponding Tesco product ID.)

## Out of Scope

- Storage layout primitives → `016-dashboard-blob-storage-layout`
- Dashboard read path → `017-dashboard-blob-read-path`
- Order status tracking → `018-dashboard-order-status-tracking`
- Coverage invalidation / refund / perishable / manual override → `019-dashboard-coverage-invalidation-refunds-perishables`
- The Grocy client itself: this feature consumes an existing `grocy_client.py` (per `references/grocy-integration.md`). Building the Grocy client is a separate concern.
- Multi-pantry / multi-Grocy support: this feature assumes one Grocy instance.
- Pantry expiry tracking: the Grocy client may return a `best_before_date`, but this feature does not use it (per FR-005). Future feature could add Grocy shelf-life awareness.

## Clarifications

### Session 2026-06-14 — Grocy integration rationale

- Q: Why not keep the algorithm order-only? → A: The algorithm is "current delivery bounded" — it correctly reports items not in the current order. But Danny's pantry also has items, and showing "missing" for a pantry item is misleading. Adding Grocy as an automatic source is a small extension that significantly improves coverage accuracy for pantry staples.
- Q: Why don't Grocy items get `use_by_warning`? → A: Pantry stock in Grocy may be arbitrarily old — the enrichment data does not reliably indicate how long items have been in the pantry. Fresh delivery items are the only reliable source of freshness signals.
- Q: Why does order take priority over Grocy? → A: Fresh delivery items should be used before they spoil. Grocy pantry items are a fallback — they fill gaps when the order doesn't cover a meal. This also preserves pantry items for future meals.
- Q: What if the same item is in both the order AND Grocy? → A: The order item is matched first. Grocy is only consulted for remaining uncovered meals. This ensures fresh delivery items are used in priority.
- Q: How is the Grocy match logic implemented? → A: Best-effort: name match (case-insensitive substring) or exact product ID if available. Opportunistic; not every pantry item maps to a meal.
- Q: What if Grocy is down? → A: Fail soft: log a warning, skip Grocy matching, mark uncovered items as missing. Sync continues.

### Session 2026-06-15 — Split from 016-dashboard-blob-storage-layout

- Q: Why is Grocy a separate feature from coverage invalidation? → A: Coverage invalidation (`019`) is the consumer of order status changes; Grocy is a different kind of coverage source (pantry, not order). They share the `matched_items[]` schema but are conceptually independent. Splitting them keeps each focused.
- Q: Why is this spec at all? Could it just be a configuration option? → A: The `source: "grocy"` field and the `🏠 In pantry` badge are user-visible surface changes. The fail-soft behaviour (Grocy down → sync continues) is a contract. The matcher changes (Grocy as fallback after order allocation) are matcher logic. These warrant their own spec.
