---
name: dashboard-coverage-invalidation-refunds-perishables
description: "Coverage invalidation triggered by any order content change, refund item display in meal detail (covered to partial), shelf-life-aware matching, perishable 'Use today' panel, and manual override for missing items from pantry/fridge."
---

# Feature Specification: Dashboard Coverage Invalidation, Refunds, Perishables, and Manual Override

Feature ID: `019-dashboard-coverage-invalidation-refunds-perishables`

Feature Name: Dashboard Coverage Invalidation, Refunds, Perishables, and Manual Override

Target Skill: `data-science/meals-check`

Created: 2026-06-15

Status: Final

Change history: CHANGELOG.md

Input: Original 016-dashboard-blob-storage-layout Draft (2026-06-14) covered several features beyond the storage layout: FR-005 (coverage invalidation on any order content change), FR-008 (refund item display in meal detail card), FR-006 shelf-life portion + FR-007 (perishable items / "Use today" panel), FR-009 (manual override). After review, the original 016 was split per the spec governance rule. This feature owns the consumer side of order status changes: coverage invalidation, refund item rendering, perishable matching, and manual override. The producer side (order status tracking) is `018-dashboard-order-status-tracking`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Coverage Invalidation on Any Order Content Change (Priority: P1)

As Danny, I want coverage data to be automatically recalculated whenever an order changes (amendment adding/removing items, refund, cancellation, or move), so that the dashboard never shows stale coverage.

**Independent Test**: Process an amendment email that adds 1 new item to a future delivery. Verify the coverage blobs for the affected meal dates are recalculated and the new item appears in the relevant meal's matched items.

**Acceptance Scenarios**:
1. **Given** an order blob is updated (any content change — amendment adding/removing items, refund reducing items, status change to `cancelled`/`superseded`/`refunded`), **When** the sync runs, **Then** the pipeline recalculates coverage for all meal dates whose coverage blob's `sourceOrderBlobPath` matches the affected order blob path.
2. **Given** a coverage blob is invalidated, **When** the recalculation completes, **Then** the new coverage blob has `stale: false` and the new matched items reflect the updated order.
3. **Given** the coverage blob's `stale` flag is `true` (transient state during recalculation), **When** the dashboard renders, **Then** it displays a "⚠️ stale coverage" indicator.
4. **Given** a `stale: true` coverage blob is read, **When** the dashboard renders, **Then** the stale coverage data is NOT used for meal matching decisions; the dashboard waits for the fresh blob or shows null state.

### User Story 2 — Refund Items in Meal Detail Card (Priority: P2)

As Danny, I want the meal detail card to clearly show which items were refunded, with their original details and a refund amount badge, so that I can see at a glance which meals lost coverage due to a refund.

**Independent Test**: Process a refund email that reduces 3 items from an order. Verify the affected meals' detail cards show the refunded items with full details (name, price, quantity, image) and a "£X refunded" badge. Verify meals that relied solely on a refunded item are now `partial` instead of `covered`.

**Acceptance Scenarios**:
1. **Given** a refund email causes an order's item list to be reduced, **When** the pipeline recalculates coverage, **Then** meals whose sole coverage was a refunded item transition from `covered` to `partial`.
2. **Given** a meal has a refunded item, **When** the dashboard renders the meal detail card, **Then** the refunded item is shown with full details (name, price, quantity, image URL if available) in a distinct "refunded" section with a "£X refunded" badge.
3. **Given** the meal detail card has both "matched" and "refunded" sections, **When** the user reads the card, **Then** the visual distinction is clear (refunded items are visually separated from matched items, not grouped with them).

### User Story 3 — Perishable Items in "Use Today" Panel (Priority: P2)

As Danny, I want the meal detail card to highlight perishable items that need to be used today, so that I don't accidentally let fresh items spoil.

**Independent Test**: Process a delivery that includes fresh strawberries (1-day shelf life). Verify the next-day meal's detail card has a "Use today" section at the top with the strawberries, a "Use by" date badge, and the meal summary card has a ⚠️ perishable badge.

**Acceptance Scenarios**:
1. **Given** an item has `shelf_life_days <= 1` (e.g. fresh berries, cut herbs, prepared salads), **When** the coverage algorithm matches it to a meal, **Then** it is matched to the same-day or next-day meal first — excluded from matching to meals more than 1 day after the delivery date.
2. **Given** an item has `shelf_life_days == 2`, **When** the coverage algorithm matches it, **Then** it is matched to meals within 2 days of delivery before later dates.
3. **Given** a meal contains an item with `use_by_warning: true` (`shelf_life_days <= days_until_meal_date`), **When** the dashboard renders the meal detail card, **Then** that item appears in a distinct "Use today" section at the top of the card.
4. **Given** a meal contains any item with `use_by_warning: true`, **When** the dashboard renders the meal summary card, **Then** the card displays a ⚠️ perishable badge.
5. **Given** all items in a meal have `shelf_life_days > days_until_meal_date`, **When** the dashboard renders, **Then** no perishable badge is shown.

### User Story 4 — Manual Override for Missing Items (Priority: P2)

As Danny, I want to mark a missing item as "I have this" when it's available from the pantry or fridge (leftover from an earlier order), so that the dashboard correctly reflects the actual coverage situation.

**Independent Test**: Mark a missing item (e.g. "Tasty Wheat 500g" not in the current order) as "I have this". Verify the coverage blob is updated with `override_found: true`, `override_source: "manual"`, and `override_timestamp`. Verify the meal detail card shows the item with a "✓ We have it" badge.

**Acceptance Scenarios**:
1. **Given** a meal has a missing item, **When** Danny marks it as "I have this", **Then** the coverage blob is updated with `override_found: true`, `override_source: "manual"`, and `override_timestamp` (ISO 8601).
2. **Given** a manual override is recorded, **When** the audit log is appended, **Then** it contains `{type: "manual_override", item, quantity, meal_date, meal_name, override_source: "manual", timestamp}`.
3. **Given** a manual override is recorded, **When** the next sync runs, **Then** the override persists (it is read from local state and applied to the coverage calculation before blobs are written).
4. **Given** a meal has a manual override, **When** the dashboard renders the meal detail card, **Then** the item is shown with full details (name, price, quantity, image if available) and a "✓ We have it" badge in green/blue.
5. **Given** a meal has only manual overrides and no other matched items, **When** the dashboard renders, **Then** the meal status remains `partial` (manual override does not auto-upgrade from `partial` to `covered`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an order blob is updated (any content change — including added or removed items from an amendment email, or a refund that removes items from the order, or a status change to `"cancelled"`, `"superseded"`, or `"refunded"`) the pipeline MUST recalculate coverage for all meal dates whose coverage blob's `sourceOrderBlobPath` matches the affected order blob path. Invalidation proceeds as follows: (1) for each matching coverage blob, update the blob to set `stale: true` and `staleReason` to one of: `"order_updated"` (amendment content change), `"order_cancelled"`, `"order_superseded"`, `"order_refunded"`; overwrite the blob at its original path with the updated content (this changes the blob hash, triggering manifest update); (2) recalculate coverage for all affected meal dates using the updated order and write fresh coverage blobs with `stale: false` at their original paths (overwrite); (3) update the manifest with all updated blob hashes. The meals skill MUST write an audit log entry to its local state (`~/.hermes/scripts/data/audit.jsonl`) recording the invalidation event (order path, trigger type, affected coverage dates, timestamp) for debugging purposes. The dashboard MUST display a "⚠️ stale coverage" indicator for any coverage blob with `stale: true` and MUST NOT use stale coverage data for meal matching.

- **FR-002**: Each coverage blob MUST contain a `stale` boolean field (default `false`) and a `staleReason` field (null or a string). When invalidation runs, the stale flag is set to `true` with a reason, then immediately overwritten to `false` once fresh coverage is calculated. The transient `stale: true` state is for race-condition safety; if a read happens during the brief window, the dashboard shows the "⚠️ stale coverage" indicator and does not use the data.

- **FR-003**: Shelf-life-aware coverage matching: the coverage algorithm MUST prioritise items with shorter shelf life for earlier meal dates. Each item has a `shelf_life_days` field from Tesco product enrichment (present only when a receipt email indicates a short-dated product — amendment emails do not carry shelf life data). Items with `shelf_life_days <= 1` (e.g. fresh berries, cut herbs, prepared salads) MUST be matched to the same-day or next-day meal first — they are excluded from matching to meals more than 1 day after the delivery date. Items with `shelf_life_days == 2` are matched to meals within 2 days of delivery before later dates. The algorithm processes meal dates in ascending order (earliest first), allocating short-shelf-life items before general items. Items sourced from Grocy pantry inventory do not receive a `use_by_warning` — pantry stock may be arbitrarily old; freshness signals apply only to fresh delivery items.

- **FR-004**: Each `matched_items` entry in the coverage blob MUST contain:
  ```json
  {
    "name": "Fresh Strawberries",
    "quantity": 1,
    "price": 2.50,
    "image_url": "https://...",
    "source": "order",
    "shelf_life_days": 1,
    "use_by_warning": true,
    "use_by_date": "2026-06-18",
    "matched_meal": "Lunch",
    "matched_date": "2026-06-17"
  }
  ```
  `source` is one of: `"order"` (from Tesco delivery), `"grocy"` (from pantry inventory), `"manual_override"` (Danny manually confirmed). `use_by_warning` is `true` when `shelf_life_days <= days_until_meal_date`. The `use_by_date` is the delivery date plus `shelf_life_days`.

- **FR-005**: The dashboard MUST display perishable items with low shelf life prominently in the meal detail card. Items with `use_by_warning: true` MUST appear in a distinct **"Use today"** section at the top of the meal detail card. This section MUST show: item name, quantity, image, price, and a `use_by` date badge (e.g. "Use by Sat 19th"). Meal cards (the summary card) MUST display a ⚠️ perishable badge when the meal contains any item with `use_by_warning: true`. The badge text MAY be "⚠️ Use today" or "⚠️ Perishable" depending on urgency. If all items in a meal have `shelf_life_days > days_until_meal_date`, no perishable badge is shown.

- **FR-006**: When a refund email causes an order's item list to be reduced, the pipeline MUST re-evaluate all meals covered by that order. For each affected meal: if the refunded items were the sole coverage for a meal, that meal's status MUST change from `covered` to `partial` (at least one item was refunded, reducing coverage below the original plan). The meal detail card for affected meals MUST display refunded items with full item details (name, price, quantity, image URL if available) in a distinct "refunded" section, clearly differentiated from "not found" items (which have no item details). Refunded items are shown with the refund amount badge. The dashboard MUST NOT hide refunded items — they are shown as a named, priced item with a "refunded" badge, unlike unmatched items which are shown as free-text "not found" entries.

- **FR-007**: The pipeline MUST support manual overrides for missing items. This handles the case where a meal plan item is not in the current order but is available from the pantry or fridge (leftover from an earlier order). When Danny marks a missing item as "I have this": (1) the coverage blob for that meal date is updated — the item entry is amended with `override_found: true`, `override_source: "manual"`, and `override_timestamp` (ISO 8601); (2) an audit log entry is appended to `~/.hermes/scripts/data/audit.jsonl`: `{type: "manual_override", item: "<item name>", quantity: <qty>, meal_date: "<date>", meal_name: "<meal>", override_source: "manual", timestamp: "..."}`; (3) the meals skill updates its local state to persist the override so it survives re-runs of the sync. The meal status is not automatically upgraded from `partial` to `covered` by a manual override — the override clears the individual item from the missing list; the overall meal status depends on whether other items remain genuinely unmatched.

- **FR-008**: The dashboard meal detail card MUST display manual overrides distinctly from other item states:
  - "Not found" items: grey text, no badge, free-text item name only (no price/qty/image)
  - Manual override items: normal item display (name, price, qty, image) with a "✓ We have it" badge in green/blue
  - Refunded items: normal item display with a red "£X refunded" badge
  - Order-matched items: normal item display with no special badge

- **FR-009**: Manual override local state is persisted in `~/.hermes/scripts/data/manual_overrides.json` (or similar, declared in `skill.spec.yaml`). The override file is keyed by `(meal_date, meal_name, item_name)`. On sync, the meals skill reads the override file and merges persisted overrides into the coverage calculation before writing blobs.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — add `019-dashboard-coverage-invalidation-refunds-perishables` to the features list; add `manual_overrides.json` to runtime state.
- `SKILL.md` changes required: Yes — document coverage invalidation, refund item display, perishable items, manual override.
- `016-dashboard-blob-storage-layout` relationship: This feature extends the coverage blob schema with `stale`, `staleReason`, and `matched_items[*].source` / `shelf_life_days` / `use_by_warning` / `use_by_date` fields.
- `018-dashboard-order-status-tracking` relationship: This feature is the consumer of order status changes produced by `018`.
- Runtime state changes required: Yes — coverage invalidation logic, refund processing logic, shelf-life matching, manual override persistence.
- Secrets/config changes required: No new secrets.
- Cron/hook changes required: No.

### Key Entities

- **Coverage Blob Extension**: Adds `stale: boolean` and `staleReason: string | null` to `coverage/{date}.json`. Adds `shelf_life_days`, `use_by_warning`, `use_by_date`, and `source` to each `matched_items[]` entry.

- **Manual Override State**: `~/.hermes/scripts/data/manual_overrides.json`. Format: `{"<meal_date>|<meal_name>|<item_name>": {"override_found": true, "override_source": "manual", "override_timestamp": "..."}}`.

- **Refunded Item Entry**: A new entry shape in the meal detail card. Has the same fields as a matched item (name, price, quantity, image_url) plus `refund_amount` and the "refunded" badge.

- **Perishable Item Entry**: A new entry shape in the meal detail card's "Use today" section. Has the same fields as a matched item plus `use_by_date` and the "use_by" date badge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: An amendment email that adds 1 new item to a future delivery triggers coverage recalculation for all affected meal dates. The new item appears in the relevant meal's matched items within one sync cycle.
- **SC-02**: A refund email that reduces 3 items triggers coverage recalculation. Affected meals transition correctly (`covered` → `partial` if sole coverage was refunded; stays `covered` if other coverage remains). Meal detail cards show the refunded items in a distinct "refunded" section.
- **SC-03**: A meal with a perishable item (`use_by_warning: true`) shows the item in a "Use today" section at the top of the meal detail card and displays a ⚠️ perishable badge on the meal summary card.
- **SC-04**: A manual override marks a missing item as `override_found: true`. The override persists across sync runs. The meal detail card shows the item with a "✓ We have it" badge. The meal status is not auto-upgraded from `partial` to `covered`.
- **SC-05**: Audit log receives one entry per coverage invalidation, refund processing, and manual override.

## Assumptions

- The `tesco_product_enricher` (or equivalent) can supply `shelf_life_days` for items that have a short-dated note in the receipt email. For items with no short-dated note, `shelf_life_days` is absent.
- Manual overrides are scoped to specific `(meal_date, meal_name, item_name)` triples. They don't propagate across meals.
- The audit log's `manual_overrides` event includes the full triple for unambiguous identification.

## Finalization Notes

- 2026-06-16 — Promoted to `Final`. All implementation phases shipped (Phase 2 coverage blob schema, Phase 3 coverage invalidation, Phase 4 refund processing, Phase 5 shelf-life matching, Phase 6 manual override persistence, Phase 7 dashboard UI, Phase 8 verification, Phase 9 deploy). `traceability.yaml` and `scenarios.yaml` added at promotion time. All tasks verified complete per `tasks.md`.

## Dependencies and Conflicts

- Depends on: `016-dashboard-blob-storage-layout` (storage layout), `018-dashboard-order-status-tracking` (producer of status-change events consumed by this feature)
- Conflicts with: none
- Supersedes: none
- Related specs: `016-dashboard-blob-storage-layout`, `017-dashboard-blob-read-path`, `018-dashboard-order-status-tracking`, `020-dashboard-grocy-pantry-coverage`

## Out of Scope

- Storage layout primitives → `016-dashboard-blob-storage-layout`
- Dashboard read path → `017-dashboard-blob-read-path`
- Order status tracking (the producer side) → `018-dashboard-order-status-tracking`
- Grocy pantry as automatic coverage source → `020-dashboard-grocy-pantry-coverage`
- Tesco product enrichment (the source of `shelf_life_days`) → governed by `004-dashboard-sync`; this feature consumes the field but does not own the enrichment process.

## Clarifications

### Session 2026-06-14 — Coverage invalidation

- Q: Why remove versioned blobs from blob storage? → A: Keeping every versioned blob in blob storage accumulates unbounded storage waste. The meals skill's local audit log (`audit.jsonl`) is the right place for version history; blob storage holds only current state.
- Q: How does coverage invalidation work without versioned blobs? → A: Coverage blobs are overwritten in-place when content changes. When an order is cancelled/superseded/updated, the pipeline: (1) marks the existing coverage blob `stale: true` by overwriting it, (2) writes a fresh coverage blob with `stale: false` by overwriting again. Both writes change the blob hash, updating the manifest. No versioned blobs are created.

### Session 2026-06-14 — Refunds and perishable items

- Q: Why does FR-001 trigger on amendment content changes? → A: An amendment adds or removes items from an order. Those changes affect which meals are covered. Without recalculation, the dashboard would show incorrect coverage — meals that could be covered by the new items would still show as missing.
- Q: Why is a refund a separate status, not just an amendment? → A: Amendments occur before delivery and change the planned order. Refunds occur after delivery and reduce the order total — they have financial implications and happen post-delivery. The dashboard should show a distinct "£X refunded" badge for refunded orders, and affected meals should go to `partial` status.
- Q: Where does `shelf_life_days` come from? → A: It is present only when a Tesco receipt email explicitly notes a short-dated product. Amendment emails do not carry shelf life data. For standard items with no short-dated note, `shelf_life_days` is absent and no `use_by_warning` is set.
- Q: Why don't Grocy items get `use_by_warning`? → A: Pantry stock in Grocy may be arbitrarily old — the enrichment data does not reliably indicate how long items have been in the pantry. Fresh delivery items are the only reliable source of freshness signals. (Grocy coverage itself is in `020-dashboard-grocy-pantry-coverage`.)

### Session 2026-06-15 — Split from 016-dashboard-blob-storage-layout

- Q: Why is this feature separate from `018` (order status tracking)? → A: `018` is the producer of status-change events; this feature is the consumer. The producer can be implemented and tested independently (does the pipeline correctly identify cancellations, moved orders, refunds?). The consumer can then be implemented (does the coverage algorithm correctly recalculate when an order changes?). Splitting them along the producer/consumer boundary keeps each focused and allows the producer to land first.
- Q: Why bundle coverage invalidation, refunds, perishables, and manual override into one feature? → A: They share the coverage blob schema, the same recalculation pipeline, and the same audit log. Each is a small extension; bundling them avoids four thin features and keeps the integration tests in one place. If a single user story needs to ship independently, the per-US FR numbering (FR-001 invalidation, FR-002 stale state, FR-003 shelf-life matching, FR-004 matched_items schema, FR-005 "Use today" panel, FR-006 refund items, FR-007 manual override, FR-008 four item states, FR-009 local state) makes that straightforward.
