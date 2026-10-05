---
name: dashboard-order-status-tracking
description: "Tesco order status tracking across cancellations, moved orders, and refunds. Adds status field to order blobs (active/cancelled/superseded/refunded), email-type detection patterns, moved-order (order_number, delivery_date) pair tracking, and dashboard status badges."
---

# Feature Specification: Dashboard Order Status Tracking

Feature ID: `018-dashboard-order-status-tracking`

Feature Name: Dashboard Order Status Tracking

Target Skill: `data-science/meals-check`

Created: 2026-06-15

Status: Final

Change history: CHANGELOG.md

Input: Original 016-dashboard-blob-storage-layout Draft (2026-06-14) US5 (Cancellation and Moved Order Detection) plus parts of FR-004 (refund email detection and order status update). After review, the original 016 was split per the spec governance rule (one user story per feature, meaningful IDs only). This feature owns order status tracking: cancellation detection, moved-order detection, refund detection, and the `status` field on order blobs. Coverage invalidation triggered by these status changes lives in `019-dashboard-coverage-invalidation-refunds-perishables`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cancellation and Moved Order Detection (Priority: P1)

As Danny, I want the pipeline to detect when a Tesco order is cancelled, rescheduled to a different delivery date, or partially refunded, so that the dashboard does not show stale or incorrect order data and the storage correctly reflects the current state of each order.

**Independent Test**: Send a cancelled order email, a moved order email (same order number, new delivery date), and a refund email through the pipeline. Verify the manifest, order blobs, and coverage blobs reflect the correct status for each.

**Acceptance Scenarios**:
1. **Given** a Tesco "order cancelled" email is received, **When** the sync runs, **Then** the pipeline detects the cancellation (email subject matches cancellation pattern and `email_type` is set to `cancelled`), writes the order blob with `"status": "cancelled"`, and excludes that order from meal coverage calculations.
2. **Given** a Tesco order is moved to a new delivery date (same order number, new delivery date email), **When** the sync runs, **Then** the pipeline detects the moved order, marks the old order blob as `"status": "superseded"`, writes a new order blob for the new delivery date with `"status": "active"`, and uses the new order blob for meal coverage.
3. **Given** an order blob has `status: "cancelled"` or `status: "superseded"`, **When** the dashboard renders, **Then** it displays an appropriate badge or indicator and excludes that order's items from coverage calculations.
4. **Given** a cancelled order is later re-added to the calendar with a new delivery date, **When** a new order email is received for that delivery, **Then** the pipeline treats it as a new order (new order number or new `(order_number, delivery_date)` pair), writes a fresh order blob with `"status": "active"`, and the old cancelled blob remains untouched with its `cancelled` status.
5. **Given** the manifest maps blob paths to hashes, **When** an order blob's status changes (e.g. `active` → `superseded`), **Then** the blob's content hash changes, the manifest entry is updated with the new hash, and the new manifest is written — the old blob is retained but unreferenced in the new manifest.
6. **Given** a refund email arrives, **When** the sync runs, **Then** the pipeline detects the refund (subject pattern + `email_type = "refund"`), updates the existing order blob to `"status": "refunded"`, removes refunded items from the order's item list, and records the refund amount. The order blob with `status: "refunded"` is used for coverage calculations with the reduced item set. (Refunds trigger coverage invalidation in `019-dashboard-coverage-invalidation-refunds-perishables`.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each order blob MUST contain a `status` field with one of: `"active"` (current, valid order — used for meal coverage), `"cancelled"` (order cancelled before delivery, not fulfilled), `"superseded"` (order moved to a different delivery date, no longer current), `"refunded"` (items returned after delivery, order total reduced — used for coverage but with reduced item set). The blob is immutable once written; only the `status` field and item list are updated when an order is cancelled, moved, or refunded. The `status` field update changes the blob content hash, triggering manifest update.

- **FR-002**: The pipeline MUST detect "order cancelled" emails from Tesco. Detection is via email subject pattern match (case-insensitive: "order cancelled", "your order has been cancelled", "order fully cancelled") and sets `email_type` to `cancelled`. Cancelled order blobs are written with `status: "cancelled"` and MUST be excluded from meal coverage calculations.

- **FR-003**: The pipeline MUST detect moved orders. A moved order is identified when the same `order_number` appears in two emails with different `delivery_date` values. On detection: the pipeline writes the new order blob with `status: "active"` and updates the existing blob's `status` field to `"superseded"`. The superseded blob is retained in storage but excluded from coverage calculations. If the moved order's new delivery date falls within the current sync window, the new order blob is used for coverage; if not, the old blob's `superseded` status is preserved.

- **FR-004**: The pipeline MUST detect "order refunded" emails from Tesco. Detection is via email subject pattern match (case-insensitive: "refund", "items refunded", "your refund") and sets `email_type` to `refund`. The pipeline MUST include `refund` emails in the valid email candidates alongside `amendment` and `confirmation` emails. When a refund email is received for an existing order, the pipeline MUST update the order blob: set `status: "refunded"`, update the item list to remove refunded items, and record the refund amount (if present in the email). The order blob with `status: "refunded"` is used for coverage calculations with the reduced item set. Refunds are distinct from amendments — amendments occur before delivery, refunds occur after delivery and reduce the available item set. Coverage is recalculated after a refund (triggered by `019-dashboard-coverage-invalidation-refunds-perishables`).

- **FR-005**: The `tesco_meal_check.py` valid email filter MUST include `cancelled` and `refund` emails as valid candidates so the pipeline can write the corresponding order blobs. The current filter requires `items > 0 or email_type in (amendment, confirmation)`; this is too narrow — `cancelled` and `refund` emails legitimately have `items=0` and `email_type=cancelled` or `refund`.

- **FR-006**: The dashboard MUST display appropriate status badges for orders with `status: "cancelled"`, `"superseded"`, or `"refunded"`. The badge text is at minimum the status word; an icon prefix is preferred (e.g. "❌ Cancelled", "↪️ Moved", "💸 Refunded"). Active orders have no badge.

- **FR-007**: The pipeline MUST write an audit log entry to `~/.hermes/scripts/data/audit.jsonl` for every order status change: `{type: "order_status_change", order_path: "...", old_status: "...", new_status: "...", timestamp: "..."}`. This is the version history and audit trail.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — add `018-dashboard-order-status-tracking` to the features list.
- `SKILL.md` changes required: Yes — document order status tracking, cancellation/moved/refund detection, status badges.
- `016-dashboard-blob-storage-layout` relationship: This feature extends the storage layout with the `status` field. The order blob schema is the union of `016` FR-001 (immutable order blob) and this feature's FR-001 (status field).
- `019-dashboard-coverage-invalidation-refunds-perishables` relationship: Status changes from this feature trigger coverage invalidation in `019`.
- Runtime state changes required: Yes — `tesco_gmail.py` subject patterns, `tesco_meal_check.py` valid email filter, dashboard status badges.
- Secrets/config changes required: No new secrets.
- Cron/hook changes required: No.

### Key Entities

- **Order Status Field**: `status: "active" | "cancelled" | "superseded" | "refunded"`. Part of the order blob JSON. Changes to this field change the blob content hash, triggering manifest update via `016-dashboard-blob-storage-layout` FR-003.

- **Email Type Field**: `email_type: "confirmation" | "amendment" | "receipt" | "cancelled" | "refund" | "unknown"`. Set by `tesco_gmail.py` subject pattern matching. The `valid_emails` filter in `tesco_meal_check.py` MUST accept `confirmation`, `amendment`, `cancelled`, `refund` regardless of items count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Tesco "order cancelled" email is correctly detected (`email_type = "cancelled"`), the order blob is written with `status: "cancelled"`, and that order is excluded from meal coverage.
- **SC-002**: A moved order (same `order_number`, new `delivery_date`) is correctly detected: old blob updated to `status: "superseded"`, new blob written with `status: "active"`, the new blob is used for coverage.
- **SC-003**: A refund email is correctly detected (`email_type = "refund"`), the order blob is updated to `status: "refunded"` with the item list reduced and refund amount recorded.
- **SC-004**: The dashboard renders status badges for `cancelled`, `superseded`, and `refunded` orders; active orders have no badge.
- **SC-005**: The audit log receives one entry per order status change.

## Assumptions

- Tesco email subjects are stable enough to match on case-insensitive substrings. False positives are tolerable if reviewed by a human; false negatives (missed cancellations) are not.
- The `tesco_gmail.py` parser already returns structured fields including `order_number`, `delivery_date`, and `items`. Adding `email_type` is a new field.
- The `tesco_meal_check.py` order selection by delivery date proximity to calendar windows is the existing strategy; this feature adds the `(order_number, delivery_date)` pair as a cross-cutting identity check.

## Out of Scope

- Storage layout primitives → `016-dashboard-blob-storage-layout`
- Dashboard read path → `017-dashboard-blob-read-path`
- Coverage invalidation triggered by status changes → `019-dashboard-coverage-invalidation-refunds-perishables`
- Perishable items / shelf-life matching / "Use today" panel → `019`
- Manual override UI / persistence → `019`
- Grocy pantry as automatic coverage source → `020`
- Refund item display in meal detail card (covered → partial, refunded item section) → `019`
- Dashboard UI changes beyond status badges

## Clarifications

### Session 2026-06-14 — Cancellation and moved order detection

- Q: Does the current pipeline detect cancelled orders? → A: No. The current `tesco_gmail.py` `parse_tesco_email_type()` returns `"unknown"` for cancellation emails. The valid email filter in `tesco_meal_check.py` requires `items > 0` or `email_type in (amendment, confirmation)`. Cancelled emails have `items=0` and `email_type=unknown`, so they are silently excluded.
- Q: Does the current pipeline detect moved orders? → A: No. The pipeline picks emails by delivery date proximity to calendar windows. It has no concept of order identity across delivery date changes. If the same order number appears in two emails with different delivery dates, both get picked as separate candidates without any `"superseded"` linking.
- Q: How does the `status` field interact with hash dedup? → A: The `status` field is part of the order blob JSON. If `status` changes from `"active"` to `"superseded"`, the blob content hash changes, so the new hash is different from the manifest entry. The sync writes the updated blob (because the hash differs), then updates the manifest with the new hash. The old blob remains in storage but is unreferenced in the new manifest.
- Q: How does a cancelled order get written if the cancelled email has 0 items? → A: The pipeline detects the cancellation separately from the items filter. The `email_type="cancelled"` flag is set from the subject pattern, not from items count. The order blob is written with `status: "cancelled"` and the email's `total_paid` field (if present) to record the transaction state.
- Q: What about the `tesco_gmail.py` email parsing? → A: `parse_tesco_email_type()` needs a new case-insensitive pattern match for cancellation subjects. The `tesco_meal_check.py` email selection logic needs to include `cancelled` emails as valid candidates so the pipeline can write the cancelled order blob.

### Session 2026-06-14 — Refund handling

- Q: Why is a refund a separate status, not just an amendment? → A: Amendments occur before delivery and change the planned order. Refunds occur after delivery and reduce the order total — they have financial implications and happen post-delivery. The dashboard should show a distinct "£X refunded" badge for refunded orders, and affected meals should go to `partial` status. Refund item display in the meal detail card is owned by `019-dashboard-coverage-invalidation-refunds-perishables`.
- Q: Can a refunded item still appear in coverage? → A: No. Refunded items are removed from the order's item list. Coverage is recalculated with the reduced item set. If a refunded item was the sole coverage for a meal, that meal becomes `partial`. The recalculation trigger is in `019`.

### Session 2026-06-15 — Split from 016-dashboard-blob-storage-layout

- Q: Why is order status tracking a separate feature from coverage invalidation? → A: Order status tracking is the producer of status-change events (cancellation, moved, refund). Coverage invalidation is the consumer (it recalculates coverage when an order changes). Each has a clear single user story and a clean producer/consumer boundary. Splitting them allows the producer (status tracking) to land independently of the consumer (coverage invalidation), and keeps the test surface for each focused.
- Q: What about refund item display in the meal detail card? → A: The "£X refunded" badge in the meal detail card is part of the coverage invalidation feature (`019`), not this one. This feature is responsible for the order blob's `status: "refunded"` and the reduction of the item list. The dashboard rendering of refunded items in the meal detail card is owned by `019`.
