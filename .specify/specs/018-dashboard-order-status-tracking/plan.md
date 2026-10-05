# Implementation Plan: Dashboard Order Status Tracking

Status: Proposed
Feature: 018-dashboard-order-status-tracking
Skill: data-science/meals-check

## Summary

Plan for Tesco order status tracking: cancellation detection (subject pattern + `email_type = "cancelled"`), moved-order detection (cross-email `(order_number, delivery_date)` pair tracking), refund detection (subject pattern + `email_type = "refund"`), and the `status` field on order blobs. The dashboard surfaces status badges for non-active orders. Coverage invalidation triggered by status changes is owned by `019-dashboard-coverage-invalidation-refunds-perishables`.

## Technical Context

- `tesco_gmail.py` — email parser, location: `/home/hermes/.hermes/scripts/tesco_gmail.py`. Owns `parse_tesco_email_type()`.
- `tesco_meal_check.py` — main pipeline, location: `/home/hermes/.hermes/scripts/tesco_meal_check.py`. Owns the valid email filter and order selection.
- `tesco_matcher.py` — order delivery classification, location: `/home/hermes/.hermes/scripts/tesco_matcher.py`.
- Dashboard status badges: `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx` (the existing Order Status block).

## Constitution Check

- Raw report is the product: Pass — Telegram raw report content gains a status indicator per order but the report shape is unchanged.
- Observable pipeline behaviour beats guesswork: Pass — SC-01 through SC-05 are observable.
- Runtime state is declared, not committed: Pass — status field is part of the order blob, declared in spec.
- Production side effects are bounded: Pass with caution — order status changes are persistent in Blob and require a successful sync; status changes that are then reverted could leave stale status in the audit log; mitigate by always including a `revert_to: "active"` path for false-positive detections.

## Scope

In scope:
- `tesco_gmail.py` cancellation subject pattern
- `tesco_gmail.py` refund subject pattern
- `tesco_meal_check.py` valid email filter: include `cancelled` and `refund`
- `tesco_meal_check.py` moved-order detection: cross-email `(order_number, delivery_date)` pair tracking
- `tesco_meal_check.py` order blob write: include `status` field
- `tesco_meal_check.py` refund processing: update order blob `status: "refunded"`, reduce item list, record refund amount
- Dashboard status badges: render badge for non-active orders
- Audit log: append entry per status change

Out of scope:
- Storage layout primitives → `016-dashboard-blob-storage-layout`
- Dashboard read path → `017-dashboard-blob-read-path`
- Coverage invalidation triggered by status changes → `019-dashboard-coverage-invalidation-refunds-perishables`
- Perishable items / shelf-life / "Use today" panel / manual override → `019`
- Grocy pantry coverage → `020`
- Refund item display in meal detail card → `019`

## Scenario Coverage Matrix

- Positive: cancellation email arrives → order blob `status: cancelled` → excluded from coverage → SC-01
- Positive: moved order detected → old blob `status: superseded`, new blob `status: active` → SC-02
- Positive: refund email arrives → order blob `status: refunded`, item list reduced, refund amount recorded → SC-03
- Boundary: cancelled order re-added with new delivery date → treated as new order → new `status: active` blob written → SC-01 (Acceptance 4)
- Boundary: false-positive cancellation (Tesco sends a confirmation email that looks like cancellation) → revert path via `revert_to: "active"`
- Integration-isolated: status change triggers coverage invalidation in `019` (separate feature, integration tested at end)
- UI: dashboard renders badges for non-active orders → SC-04
- Audit: log entry per status change → SC-05

## Implementation Approach

1. Add cancellation subject pattern to `tesco_gmail.py` `parse_tesco_email_type()`:
   - Case-insensitive regex for: `"order cancelled"`, `"your order has been cancelled"`, `"order fully cancelled"`
   - Returns `email_type: "cancelled"` on match

2. Add refund subject pattern:
   - Case-insensitive regex for: `"refund"`, `"items refunded"`, `"your refund"`
   - Returns `email_type: "refund"` on match

3. Update `tesco_meal_check.py` valid email filter:
   - Accept `cancelled` and `refund` regardless of items count
   - Add a `valid_email_types` constant: `("confirmation", "amendment", "cancelled", "refund")`

4. Add moved-order detection in `tesco_meal_check.py`:
   - Track `(order_number, delivery_date)` pairs across all valid emails
   - When the same `order_number` appears with a new `delivery_date`, mark the old delivery's order blob as `status: "superseded"` and write the new one as `status: "active"`
   - Use a local dedup map keyed on `order_number` to detect moves within a single sync run

5. Update `tesco_meal_check.py` order blob write:
   - Include `status` field in the JSON (default `"active"` for fresh orders)
   - For refund emails: read the existing order blob (if it exists), reduce the item list to remove refunded items, set `status: "refunded"`, record `refund_amount` from the email's `total_paid` field if present

6. Add audit log entries:
   - For each order status change, append `{type: "order_status_change", order_path, old_status, new_status, timestamp}`

7. Update dashboard:
   - `dashboard-client.tsx` Order Status block: render a badge for `cancelled`/`superseded`/`refunded` orders
   - No badge for `active` orders
   - Add focused test for badge rendering

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tesco subject pattern drifts (refund confirmation, etc.) | Use the most specific phrase first; fail-open to `unknown` for ambiguous cases; audit log records the matched phrase for debugging |
| False-positive cancellation (Tesco sends a "this is not a cancellation" email) | Subject patterns are anchored to the most distinctive phrases; if a false positive is later detected, the `revert_to: "active"` path can reset the status and the next sync will write a new blob |
| `tesco_gmail.py` parser changes break existing receipt parsing | Add focused unit tests for each new pattern; existing receipt/amendment/confirmation tests must continue to pass |
| Refund processing: how to know which items were refunded if the email doesn't list them | Tesco refund emails typically list refunded items; the parser extracts `refunded_items` array if present; if absent, the entire order is marked refunded and the item list cleared. Add a focused test for the absent-list case. |
| Moved-order detection creates spurious superseded states when Tesco sends a duplicate confirmation for the same delivery | Dedup is per `(order_number, delivery_date)` pair, not per `order_number` alone; same pair is treated as a duplicate confirmation, not a move |
| Dashboard badge colors blend into the existing dark theme | Use the same status colour tokens already in the dashboard (`var(--accent-emerald)`, `var(--accent-amber)`, `var(--accent-rose)`); add a focused test asserting each badge uses a valid token |

## Verification

Required before promoting to Final:
- `python3 -m unittest test_tesco_gmail -v` passes with new cancellation and refund pattern tests
- `python3 -m unittest test_tesco_meal_check -v` passes with moved-order and refund-processing tests
- `python3 -m unittest test_tesco_matcher -v` passes (regression guard)
- `python3 tesco_meal_check.py --days 30 --output both` runs end-to-end and writes order blobs with `status` field
- `npm test -- --run` passes in meals-dashboard, including new dashboard badge test
- `npx tsc --noEmit` clean in meals-dashboard
- `npm run build` clean in meals-dashboard
- `npm run scan:static-private-data` clean
- Manual smoke: simulate a cancellation email and verify the order blob is written with `status: "cancelled"`
- Manual smoke: simulate a moved order (same `order_number`, new `delivery_date`) and verify the old blob is `superseded` and the new blob is `active`
- Manual smoke: simulate a refund email and verify the order blob is updated to `status: "refunded"` with reduced item list
- Commit + push to meals-check and meals-dashboard repos
- Trigger production meals check + Vercel deployment
- Smoke-test production dashboard

## Reference Documents

- `references/dashboard-blob-migration-2026-06-14.md` — Blob layout context
- `references/dashboard-spec-to-implementation-simulation.md` — spec-to-implementation workflow
- `references/tesco-config-reference.md` — pipeline config

## Sibling Features

- `016-dashboard-blob-storage-layout` — produces the storage layout this feature extends
- `017-dashboard-blob-read-path` — consumer; surfaces status badges
- `019-dashboard-coverage-invalidation-refunds-perishables` — consumer of status changes for coverage invalidation
- `020-dashboard-grocy-pantry-coverage` — independent feature
