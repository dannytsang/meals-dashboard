---
name: dashboard-delivery-day-last-receipt-publication
description: "On a Tesco delivery day, when a new receipt email arrives for `last_delivery`, publish it as an OrderBlob to Vercel Blob immediately so the dashboard's Previous-delivery chip shows today's groceries (not last week's). The pipeline currently persists only the chosen `receipt` (default = next delivery) in the dashboard cache; the just-arrived `last_email` is processed for matching but never written to Blob. Spec 036 closes that gap."
---

# Feature Specification: Dashboard Delivery-Day Last-Receipt Publication

Feature ID: `036-dashboard-delivery-day-last-receipt-publication`

Feature Name: Dashboard Delivery-Day Last-Receipt Publication

Target Skill: `data-science/meals-check`

Created: 2026-06-30

Status: Final

Change history: CHANGELOG.md

## Background

Spec 035 (Dashboard Order History Retention) shipped on 2026-06-30 and successfully retained the last N (default 6) OrderBlobs across pipeline runs in a small on-disk sidecar. The Dashboard's "Previous delivery" chip now renders items from any order whose `deliveryDate < today`. After the deploy, Danny confirmed the chip populated with the 13 June order (`6521-1507-9804`) — three weeks back, the most recent delivery that has a published OrderBlob.

But **today (2026-06-30) is itself a delivery day.** The cron `Meals check — 15:00 delivery day receipt backup` (job_id `6e17d31c5787`) ran at 14:02 UTC, recorded `receipt_found: true` in `data/scheduled_meals_check_state.json`, and the printed meals-check report showed:

- Order ID: `6521-8284-142`
- Email sent: Tue 30 Jun 13:01
- Delivery: Tuesday 30 June 2026
- Order total: £62.65
- Real grocery items (Go Ahead Strawberry Fruit Yogurt Breaks, Tesco Finest Cherries, Innocent Apple Juice, grapes, mango, microwave chips, etc.)

Yet the dashboard cache (`data/dashboard_cache.json`) still records `receipt.delivery_date = 2026-07-04` and `receipt.order_number = 6521-8108-142` (the future 4 July order). When the publisher (`scripts/sync-dashboard-data.py`) reads the cache and builds the payload, only one OrderBlob is published per spec 035 — the chosen receipt — and the just-arrived 30 June order is invisible to the dashboard.

### Root cause analysis

Tracing the data flow:

1. **`tesco_meal_check.py:1885` (`gmail_fetch_email`)**: fetches the new email from Gmail; the `last_email` and `next_email` variables hold the parsed receipts.
2. **`tesco_meal_check.py:1117` (`write_dashboard_cache`)**: builds the local cache. Per the comments on lines 1166-1180 the receipt chosen for the cache is the **next** delivery's items by default (the user is planning meals around the upcoming order). The `last_email` is consumed for matching (`last_matched`) and for the cron printout (`--report-identity last`), but never persisted to the cache.
3. **`scripts/sync-dashboard-data.py:1981` (`build_dashboard_payload`)**: reads the cache and projects the **single chosen receipt** into one OrderBlob (line 2084) — even after spec 035's historical retention, only the active receipt has items; the retained historical entries are seeded from Vercel Blob, not from the cache.
4. **`publish_split_dashboard_payload`**: writes one OrderBlob per sync. The dashboard sees only what was in the cache.

The `last_email` is therefore orphaned — present in Gmail, parsed by the matcher, used for matching, but never reaches Vercel Blob. The OrderBlob at the canonical `orders/2026-06-30/6521-8284-142.json` path **does not exist on delivery-day**, even though the order itself does.

### Why spec 035 doesn't catch this

Spec 035 retained historical OrderBlobs already in Blob (the cap-N tail). It cannot retain what's never been published. The 30 June order is invisible to spec 035 because:

1. The matcher's cache only persists the **next** receipt
2. The publisher only publishes one OrderBlob per sync (the chosen receipt)
3. There is no code path that writes the just-arrived `last_email` as a Blob order

Result: even though Vercel Blob has 4 prior OrderBlobs (6521-2506-1510 / 6521-0407-9401 / 6521-1507-9804 / 6521-8108-142), the **most recent delivery** of all — the one that literally walked through the door today — has no OrderBlob.

### What's actually true from the data we have

- Vercel Blob today: 4 OrderBlobs (2026-05-30, 2026-06-06, 2026-06-13, 2026-07-04)
- Gmail inbox today: 5+ emails (the historical 4 + the new 6521-8284-142 for 2026-06-30)
- Cache: only the 2026-07-04 receipt persisted
- Dashboard: shows 13 June as "most recent Previous" because that's the most recent Blob entry with `deliveryDate < today`

The gap is purely in the publisher: when the matcher finds a `last_email`, it does not currently trigger an OrderBlob write.

### User-visible symptom

Danny: *"the items listed for previous delivery is showing 13th June but it should be 30th June"*

Today's groceries (the 2026-06-30 order, £62.65, 22 unmatched items) are invisible to the dashboard's Previous-delivery chip because they exist only in Gmail + matcher's transient memory, not in Blob or the cache.

## Goal

When a new Tesco receipt email arrives and the matcher identifies it as a `last_email`, the pipeline MUST publish a corresponding OrderBlob to Vercel Blob at the canonical path (`orders/<deliveryDate>/<orderId>.json`) within the same sync cycle, so the dashboard's Previous-delivery chip shows today's delivery from the next render.

## Non-Goals

- **Not** a redesign of spec 035. Spec 035's sidecar-based retention is correct for orders that were historically published. Spec 036 closes the missing-publish window for orders that arrive in the same sync cycle.
- **Not** a redesign of `write_dashboard_cache()`. The cache still stores the chosen receipt (default `next`); only the Blob publication path changes.
- **Not** a backfill of pre-2026-06-30 missing OrderBlobs. The only known orphan is today's (2026-06-30); future deliveries will be handled by the new path going forward.
- **Not** a change to the spec 034 `classifyOrderItemsByDelivery` matcher semantics.
- **Not** a public API addition. Spec 036 is an internal pipeline change in `tesco_meal_check.py` and `sync-dashboard-data.py`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — New delivery-day receipt becomes an OrderBlob automatically (Priority: P1)

As Danny, when a new Tesco delivery arrives and the matcher cron fires, I expect today's groceries to appear on the dashboard's Previous-delivery chip within the next cron tick, not a week later when the next sync catches up.

**Why this priority**: This is the exact symptom Danny reported on 2026-06-30 ("the items listed for previous delivery is showing 13th June but it should be 30th June"). Without this fix, every future delivery day will show the same staleness — the dashboard is permanently one delivery behind the moment of arrival.

**Independent Test**: Mock a delivery-day matcher run with a synthetic 2026-MM-DD receipt. Confirm that after the run:
- `orders/<date>/<orderId>.json` exists in Vercel Blob
- `dashboard_cache.json` either persists the last receipt (new field) OR the publisher reads it transient
- The dashboard's Previous-delivery chip renders items from that order on next render

**Acceptance Scenarios**:

1. Given a new Tesco receipt email arrives for `order_number = 6521-XXXX-YYYY` with `delivery_date = today`, When the matcher cron fires on the delivery day, Then a Blob write commits to `orders/<delivery_date>/<order_number>.json` with full items, status, refund_amount, substitutions, unavailable, short_life_items, slot, orderTotal — all standard OrderBlob fields — and the dashboard's Previous-delivery chip renders items from that order on next render.
2. Given the matcher found a `last_email` for delivery day, When `sync_dashboard_data.py` runs (via `sync_dashboard()` at the end of `tesco_meal_check.py`), Then the publisher publishes BOTH the new day's OrderBlob AND the existing chosen receipt's OrderBlob (as today's `orders` array), so the dashboard's `validOrders` includes today's just-arrived order before today's midnight.
3. Given the matcher found a `last_email` for a date in the past (e.g. the cron is running a delayed run for an earlier date), When the publisher runs, Then the new OrderBlob is published and the dashboard's Previous-delivery chip picks it up on next render (no special handling needed).
4. Given the matcher found NO `last_email` (no new receipt today), When the publisher runs, Then spec 036 adds no OrderBlob writes — behaviour is identical to today's; only delivery-day receipt-found runs trigger the new path.
5. Given today's receipt was already published as an OrderBlob (e.g. the cron fires twice in 30 minutes), When the second matcher run completes, Then the publisher MUST NOT re-publish if the Blob hash matches — Vercel Blob's no-op suppression (spec 030) kicks in for the duplicate OrderBlob write.
6. Given the new order's `order_number` collides with an existing OrderBlob's orderId (Tesco re-issued the same order, e.g. amended after confirmation), When the publisher runs, Then the new OrderBlob overwrites the old one (most-recent-wins, consistent with spec 035's `assemble_orders` dedup rule) and the dashboard picks up the amended version on next render.

### Edge Cases

- **Receipt email arrives but parsing fails**: If `last_email` is `None` or items are unparseable, the new path is a no-op (no OrderBlob write); the existing sync completes as it does today.
- **Receipt has `email_type = 'refund'`**: Spec 019 / FR-06 already handles refund reconciliation through `process_refund`. The new publish path uses the reconciled items, not the raw email items.
- **The matcher's `--days 30` window excludes today's email**: When the cron runs with `--days N` and N is small enough to exclude today's email, `last_email` is `None`; the new publish path is a no-op.
- **Receipt exists but order was cancelled** (per spec 018): The publisher MUST publish the cancelled-order OrderBlob with `status: 'cancelled'` and the spec 034 matcher handles the cancelled-status rendering naturally.
- **Network failure during Blob write**: Same resilience as today — publish failure logs but doesn't roll back the cache; the next sync retries.
- **Two crons fire concurrently** (theoretical race): Vercel Blob writes are last-write-wins; the matcher's idempotent manifest + per-order path makes a race safe even if two publishers race.

## Functional Requirements

- **FR-001**: `sync_dashboard_data.py` MUST accept a new `--extra-order` CLI flag (path to a JSON file containing a single OrderBlob-shaped dict) and a `--extra-order-key` (default `deliveryDate:<ISO>:<orderId>`). When provided, the publisher MUST add the extra OrderBlob to the manifest's `orders/` paths in addition to the chosen receipt's OrderBlob.
- **FR-002**: `tesco_meal_check.py`'s `write_dashboard_cache` MUST, on a delivery-day run that produced a non-null `last_email`, serialize the parsed OrderBlob to a temporary file at `<cache_dir>/pending_last_order.json` and pass the path as `--extra-order` to the underlying `sync-dashboard-data.py` invocation in `sync_dashboard()`.
- **FR-003**: When `--extra-order` is absent (no `last_email` found, OR cron ran a non-delivery-day gate), the publisher MUST behave identically to today's spec 035 behaviour — no OrderBlob write beyond the chosen receipt's path.
- **FR-004**: The `--extra-order` Blob write MUST use the canonical path `orders/<deliveryDate>/<orderId>.json` (same pattern as today's chosen-receipt write).
- **FR-005**: The publisher MUST serialise the extra OrderBlob in the same shape as today's main OrderBlob (matching `lib/dashboard-sync.ts` OrderBlob interface: orderId, orderNumber, deliveryDate, deliverySlot, orderTotal, items[], substitutions[], unavailable[], shortLifeItems[], status, orderBlobPath). The dashboard loader (spec 017) MUST accept it without code change.
- **FR-006**: When both the chosen receipt's OrderBlob AND an extra OrderBlob are published in the same sync, the publisher MUST include BOTH in the spec 035 sidecar (`previously_synced.json`) so future syncs retain both as historical entries when they age out of "next" status.
- **FR-007**: The extra OrderBlob write MUST be idempotent under Vercel Blob no-op suppression (spec 030) — re-running the cron with the same `last_email` MUST NOT cause a duplicate Blob write.
- **FR-008**: The pipeline MUST log a `INFO: extra-order published: <orderId> (<deliveryDate>)` line per non-no-op extra-order write, so the matcher cron logs make the new behaviour visible.
- **FR-009**: The pipeline MUST handle `--extra-order` argument through `argparse` correctly: it accepts a filesystem path; the file MUST be valid JSON; malformed JSON MUST log a warning and skip the extra-order write (the main write still proceeds).
- **FR-010**: A new pytest unit test module MUST cover the `--extra-order` publisher path: 5+ cases covering AS-001..AS-006 from User Story 1 + the missing-file / malformed-JSON edge case. Total: 6+ new tests.

## Non-Functional Requirements

- **NFR-001**: The `--extra-order` publisher extension MUST NOT increase the round-trip time of a normal sync by more than +200ms (the extra Blob write is a single PUT).
- **NFR-002**: No new env vars or secrets are introduced; existing `BLOB_READ_WRITE_TOKEN` / `BLOB_*` access pattern is reused.
- **NFR-003**: The delivery-day receipt parsing logic MUST be a pure function — extract `last_email_to_order_blob(last_email, delivery_date)` returning an OrderBlob-shaped dict or `None` (testable in isolation).
- **NFR-004**: The extra OrderBlob's bytes MUST be ≤ 50KB (one receipt's worth of items + metadata).
- **NFR-005**: The dashboard's frontend (lib/, components/, app/) MUST remain unchanged — the loader already accepts OrderBlob paths from the manifest.
- **NFR-006**: The new publish path MUST participate in the spec 035 sidecar's FIFO + cap logic (FR-006) without affecting the cap invariant — adding the extra OrderBlob to the sidecar does not change how many entries fit within the cap.

## Technical Notes

### Where the OrderBlob lives in the matcher's memory

The matcher's `last_email` is a dict like:
```python
{
  "order_number": "6521-8284-142",
  "delivery_date": "2026-06-30",  # or "deliveryDate" depending on parser version
  "delivery_slot": "20:00-21:00",  # optional
  "total_paid": 62.65,
  "items": [{...}, ...],
  "substitutions": [...],
  "unavailable": [...],
  "short_life_items": [...],
  "email_type": "order",  # or "refund", "amendment", etc.
}
```

The cleanest extraction is a helper:
```python
def last_email_to_order_blob(last_email: dict | None) -> dict | None:
    """Convert a parsed Gmail receipt to an OrderBlob-shaped dict for Blob publication.

    Returns None if last_email is None or missing required fields.
    Pure function — no I/O.
    """
    if not last_email:
        return None
    order_id = last_email.get("order_number") or last_email.get("orderId")
    delivery_date = last_email.get("delivery_date") or last_email.get("deliveryDate")
    if not (order_id and delivery_date):
        return None
    return {
        "orderId": order_id,
        "orderNumber": order_id,
        "deliveryDate": delivery_date,
        "deliverySlot": last_email.get("delivery_slot") or last_email.get("deliverySlot") or "",
        "orderTotal": float(last_email.get("total_paid") or last_email.get("total") or 0),
        "items": last_email.get("items") or [],
        "substitutions": last_email.get("substitutions") or [],
        "unavailable": last_email.get("unavailable") or [],
        "shortLifeItems": last_email.get("short_life_items") or [],
        "status": email_type_to_order_status(last_email.get("email_type") or ""),
        "orderBlobPath": f"orders/{delivery_date}/{order_id}.json",
    }
```

The publisher-side work is purely a small adapter in `sync-dashboard-data.py` `publish_split_dashboard_payload` that reads `--extra-order` JSON, adds its path to the manifest's `orders/`, and adds the payload entry to the orders array before the Blob write.

### Why a CLI flag and not an env var

`--extra-order` is invoked only on delivery-day runs where the cron passed `last_email` through `sync_dashboard()`. An env var would force every sync to evaluate it; a CLI flag makes the data path explicit and audit-friendly in cron logs. The flag mirrors the `argparse` pattern already used for `--max-history` and `--no-history` from spec 035.

## Verification Plan

- **VP-1**: `python3 -m pytest scripts/tests/test_publish_extra_order.py -v` — expect 6+ new tests green.
- **VP-2**: `python3 -m pytest scripts/tests/` — expect no regressions among pre-existing 51 tests.
- **VP-3**: `python3 scripts/sync-dashboard-data.py --help` — expect `--extra-order PATH` in the help text.
- **VP-4**: `cd /home/hermes/workspace/meals-dashboard && npx tsc --noEmit` — expect 0 errors (no frontend change).
- **VP-5**: `cd /home/hermes/workspace/meals-dashboard && npx vitest run` — expect 410/410 baseline preserved.
- **VP-6**: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — expect clean (only pre-existing 031 warnings).
- **VP-7**: Live test: hand-craft a synthetic `--extra-order` JSON for `orders/2026-06-30/6521-8284-142.json`, run `sync-dashboard-data.py --extra-order /tmp/extra.json --skip-fetch`, and verify the Blob write succeeds (Vercel API returns 200 and the path is readable). Expected: Vercel Blob stores the new order path; the dashboard's `validOrders` includes the new entry on next render.
- **VP-8**: Live integration test on a delivery day: trigger the matcher cron (it finds the last_email), confirm `sync_dashboard()` invokes `sync-dashboard-data.py --extra-order ...`, confirm the Blob write lands, confirm the dashboard renders the new order on the Previous-delivery chip.

## Out of Scope

- Backfilling the missing 2026-06-30 OrderBlob (will be done as a one-shot the night spec 036 ships).
- A pre-delivery "Email is on the way" notification (separate spec).
- Multi-mailbox or multi-provider Gmail alternative.
- A REST API for manually triggering the publish (the cron is the only public entry point).

## Open Questions

None at draft time. All defaults proposed by the chef profile based on the canonical-path pattern from spec 035.

## Compatibility Notes

The new path is additive and backward-compatible:
- A pre-spec-036 dashboard Vercel Blob has no `orders/2026-06-30/6521-8284-142.json`. After spec 036 deploys + the missing-publish reconciliation runs, it will. Older dashboard builds already accepted any OrderBlob path; nothing in `lib/dashboard-sync.ts` or `lib/dashboard-data.ts` needs to change.
- The spec 035 sidecar (`previously_synced.json`) is augmented (FR-006). Existing entries stay; the new entry joins them.
- The matcher cron's `data/scheduled_meals_check_state.json` is unaffected.

## Estimated Effort

- Spec body: already drafted (this document).
- Implementation: coder profile, ~80–120 LOC across `tesco_meal_check.py` (helper + sync_dashboard() update) and `sync-dashboard-data.py` (CLI flag + manifest wiring). 6+ new pytest cases.
- Verification: 1 coder → tester cycle. ~30 minutes.
- Production deploy: standard preview → main flow. Backfill of the missing 2026-06-30 OrderBlob: a single one-shot CLI invocation.
