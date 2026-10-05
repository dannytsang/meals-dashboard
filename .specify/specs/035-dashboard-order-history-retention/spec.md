---
name: dashboard-order-history-retention
description: "Persist the last 6 OrderBlobs in the dashboard payload cache (not just the latest) so the spec 034 'Previous delivery' chip can resolve to actual items instead of an empty list. The Python sync walks a small on-disk archive of historical receipts and packs the most-recent N (default 6, soft cap) plus the active one into the payload's orders[] array. No loader / pipeline / cron architecture changes."
---

# Feature Specification: Dashboard Order History Retention

Feature ID: `035-dashboard-order-history-retention`

Feature Name: Dashboard Order History Retention

Target Skill: `data-science/meals-check`

Created: 2026-06-30

Status: Final

Change history: CHANGELOG.md

## Background

On 2026-06-30, Danny reported that the dashboard's "Order Items by Category" section no longer shows the previous order when the "Previous delivery" filter chip is selected. The dashboard UI itself is correct (spec 034 deployed to production on `22b00c8`, `tsc --noEmit` clean, 410/410 vitest passing) — the matcher logic, the chips, the badges, the sub-headings, and the time-machine all work as specified.

The upstream cause is in `scripts/sync-dashboard-data.py`. The function `build_dashboard_payload` (lines ~1983-2011) currently writes exactly **one order** into the published `orders: []` array — the latest receipt from the current pipeline run. Vercel Blob storage retains the historical order blobs (5 in production as of the user-visible bug: `6521-8108-142`, `6521-0808-9408`, `6521-1507-9804`, `6521-0407-9401`, `6521-2506-1510`), but the published payload does not include them.

Consequence:
1. The dashboard loader receives exactly one `OrderBlob`.
2. `classifyOrderItemsByDelivery(items, validOrders, deliveryWindows, today)` therefore returns a `previous` bucket containing **zero groups** (no order has `deliveryDate < today`).
3. Tapping the "Previous delivery" chip renders an empty list.

This is a data-pipeline / sync retention bug, not a dashboard bug. Spec 034 made the right design assumption — "the loader already loads every order blob in the visible manifest window" — but `sync-dashboard-data.py` was never updated to **publish** more than the latest receipt, so the assumption is broken.

This spec closes that gap by **extending the sync side to retain the last N (default 6) receipts across pipeline runs**, then **publishing them all in the payload `orders: []` array**. The dashboard loader (spec 017) already enumerates whatever paths it finds in the manifest — it does not need to change.

## Goal

The dashboard's "Order Items by Category → Previous delivery" chip MUST show actual items from one or more previously delivered orders whenever such orders exist in Blob storage, with no code change to the dashboard itself.

## Non-Goals

- **Not** a redesign of `tesco_matcher.py`, the email-action monitor, or any other pipeline module beyond the minimum delta in `sync-dashboard-data.py` required to retain historical receipts.
- **Not** a backfill of historical orders older than the current sync window. Only orders the active `tesco_meal_check.py` cron sees during its normal operation are eligible.
- **Not** an archival system. We retain **the most recent N (default 6)** receipts on disk in a small companion file inside `data/orders/` (gitignored) plus the live receipt in `data/dashboard_cache.json`. Older receipts are not retained; Blob remains the source of truth for everything older.
- **Not** a deduplication layer. If the latest run produces a receipt whose `orderId` matches one already in the history, the old one is replaced (most-recent-wins).
- **Not** a retention change on the Blob side. Blob already retains everything; this spec only changes what the publisher packs into the payload.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Previous delivery chip shows real items after retention (Priority: P1)

As Danny, I want to tap the "Previous delivery" chip on the dashboard and see the items from the last Tesco order I actually received, so that I can review what crossed the doorstep in the run-up to today's planned meal.

**Why this priority**: This is the exact symptom Danny reported on 2026-06-30 ("The order items by category does not seem to show previous order"). Without this fix the previous-delivery chip is permanently empty and the filter is a UX dead-end.

**Independent Test**: Run the sync twice in succession with two distinct synthetic receipts (one dated `today - 7 days`, one dated `today`). The published `orders[]` array on Vercel Blob MUST contain 2 entries, the dashboard's `validOrders` MUST have 2 entries, and the spec 034 matcher MUST classify the older one as `previous` and the newer one as `next`.

**Acceptance Scenarios**:

1. Given the sync has run at least once with a receipt whose `orderId` is `6521-AAAA-0001` and `deliveryDate` is `today - 7 days`, When the sync runs again with a new receipt whose `orderId` is `6521-BBBB-0002` and `deliveryDate` is `today + 2 days`, Then the published `orders[]` array MUST contain BOTH entries (in deliveryDate-ascending order by default), and the Blob write MUST succeed.
2. Given a `previously_synced: OrderBlob[]` JSON sidecar containing N historical entries (where N < cap), When `build_dashboard_payload` is called, Then `orders[]` MUST contain all N historical entries PLUS the active receipt (so `orders.length == N + 1`).
3. Given the `previously_synced` sidecar already contains `cap` (default 6) historical entries, When the sync runs with a newer active receipt, Then the oldest entry MUST be evicted (FIFO) so the sidecar returns to `cap` size (and `orders.length == cap + 1`).
4. Given the active receipt's `orderId` already exists in the historical sidecar (re-sync of the same order, e.g. after an amendment), When the sync runs, Then the existing historical entry MUST be replaced in-place with the new payload, the sidecar's size MUST NOT grow, and `orders[]` MUST contain the merged entry only once.
5. Given the dashboard has loaded with `validOrders.length == 2` (one previous, one next), When the user taps the "Previous delivery" chip, Then the Order Items by Category section MUST render the previous-order items (each with `Prev · {DD MMM}` badge per spec 034 FR-004), and the count MUST match the historical sidecar count.
6. Given the retention cap is configured to 6 in `sync-dashboard-data.py`, When the sync has run 10 times in close succession with 10 distinct receipts, Then the published `orders[]` MUST contain exactly 7 entries (6 historical + 1 active), and the historical sidecar on disk MUST contain exactly 6 entries.
7. Given the Python sync is invoked with `--no-history` (a debug-only CLI flag), When the payload is assembled, Then `orders[]` MUST contain exactly the active receipt (legacy single-order behaviour), and the historical sidecar MUST NOT be updated. This flag exists for parity with the pre-spec 035 behaviour and for rollback safety; it is not part of the default flow.
8. Given the spec 034 regression suite runs against the new payload shape, When `npx vitest run -- dashboard-client.order-items` executes, Then every existing acceptance scenario from spec 034's regression suite MUST remain green, no test edits required.

### Edge Cases

- **Cap is 0** — When the cap is configured to 0, the historical sidecar MUST NOT exist on disk, `orders[]` MUST contain exactly the active receipt, and the loader MUST continue to work in legacy mode. CI / fast-mode smoke tests can use this.
- **Sidecar file is corrupt or missing** — When the historical sidecar JSON is unreadable or absent, the sync MUST log a non-fatal warning, treat the sidecar as empty, and re-seed it from the active receipt alone. The publish MUST NOT fail.
- **Order with malformed `deliveryDate`** — Per spec 034 FR-001 edge case, malformed dates are excluded by the matcher, but the sidecar MUST still retain the blob (the loader handles skipping). Retention operates on **all** non-duplicate receipts.
- **Clock skew across runs** — When two syncs happen within the same minute, the resulting `orders[]` MUST contain the two distinct receipts (deduplicated by `orderId`), not collapse them into one.
- **The active receipt equals the most recent historical** — When the active run re-processes the same `orderId` as the latest historical entry (e.g. a manual re-run for verification), the sidecar MUST be idempotent (no duplicate, no growth).
- **The scheduler / cron wrapper invokes the script with no `data/` directory present** — When `Path('data/orders/previously_synced.json').parent` does not exist, the sync MUST `mkdir -p` it before writing; missing parents MUST NOT cause the publish to fail.
- **Concurrent sync invocations** — When two cron invocations race (theoretically possible during deploys), the sidecar update MUST be last-write-wins with a small lock-file protection; for production we rely on the Vercel cron serialisation guarantees. Out of scope for this spec to add a distributed lock.

## Functional Requirements

- **FR-001**: `sync-dashboard-data.py` MUST introduce a small on-disk companion file at `data/orders/previously_synced.json` whose shape is `OrderBlob[]` (the same `OrderBlob` schema as the live payload). The sidecar MUST be created on first sync and updated on every subsequent sync that produces a new `orderId`.
- **FR-002**: `build_dashboard_payload(...)` MUST read the historical sidecar before assembling `orders: []` and merge the historical entries with the active receipt, ordered by `deliveryDate` ascending. The merged `orders[]` array length MUST equal `min(N_historical + 1, cap + 1)`.
- **FR-003**: The retention cap MUST be defined as a single module-level constant `MAX_HISTORICAL_ORDERS` (default `6`) at the top of `sync-dashboard-data.py`, with a `--max-history N` CLI override (positive integer, capped at 50 as a sanity upper bound).
- **FR-004**: When the active receipt's `orderId` collides with a historical entry, the existing entry MUST be replaced in-place with the new payload (most-recent-wins); the sidecar MUST NOT grow when this happens.
- **FR-005**: When the historical sidecar reaches `MAX_HISTORICAL_ORDERS` and a new distinct `orderId` arrives, the oldest entry (by `deliveryDate` ascending) MUST be evicted (FIFO).
- **FR-006**: `build_dashboard_payload(...)` MUST emit exactly the same `orders[]` when invoked twice in succession with no intervening receipt as the second invocation would emit on its own — i.e. the function MUST be idempotent in the absence of new receipts. (Ties to spec 030's no-op suppression.)
- **FR-007**: The sync MUST write the merged `orders[]` array to the published Blob payload path with all its entries; the Vercel Blob write MUST succeed and the published blob MUST be readable end-to-end by the spec 017 loader.
- **FR-008**: A new `--no-history` CLI flag MUST cause the sync to publish a single-element `orders[]` (just the active receipt), skip the sidecar read/write entirely, and log a `INFO: history retention disabled (--no-history)` line. This flag is for tests, rollback, and debug; it MUST NOT be the default behaviour.
- **FR-009**: The sync MUST produce an INFO-level summary log line `orders: published N (active: <id>, history: {N_hist}, cap: {cap})` on every successful publish, so the chef profile (and the matcher cron logs) can verify retention at a glance.
- **FR-010**: A new pytest unit test module `tests/test_sync_dashboard_history.py` (or extension to `test_dashboard_payload.py` if it exists) MUST cover the seven acceptance scenarios from User Story 1 + the corrupt-sidecar edge case, plus the `--no-history` and `--max-history` CLI override paths. Total: minimum 9 new test cases.

## Non-Functional Requirements

- **NFR-001**: The historical sidecar add MUST NOT increase the `npx tsc --noEmit` time on the meals-dashboard side beyond +20ms (the sync is in Python, so this is effectively a no-op on the dashboard).
- **NFR-002**: The historical sidecar read/write MUST add ≤ 100ms wall clock per sync invocation at the default cap (6). The sidecar is small (≤ 6 OrderBlobs × ~2KB each ≈ 12KB); the read/write is dominated by network on the Blob write itself.
- **NFR-003**: The Vercel Blob payload size MUST NOT exceed the spec 016 / 017 limits (current budget is 5MB per blob). With the default cap of 6 historical orders (~12KB sidecar) plus the existing payload envelope (~500KB), the publish stays well within budget.
- **NFR-004**: The sync MUST NOT introduce any new environment variables, secrets, or environment prefixes. The existing `BLOB_READ_WRITE_TOKEN` / `BLOB_*` env access pattern is reused.
- **NFR-005**: The merge+publish MUST be a pure function of `(active_receipt, historical_sidecar, cap)` — no randomness, no clock-dependent ordering (the `deliveryDate` ordering is deterministic). Testability is preserved.
- **NFR-006**: The historical sidecar JSON file MUST be `.gitignore`d (under `data/orders/`) so the committed repo stays small. The path itself is **not** part of the spec interface; only the merge contract is.

## Technical Notes

- **Archive vs sidecar choice**: We use a tiny **sidecar JSON file** (not a SQLite database, not parquet) because:
  - Python `json` stdlib round-trips the small data trivially;
  - it stays under the spec 016 / 017 blob-size conversation thresholds;
  - it can be `.gitignore`d cleanly;
  - it is human-readable for debugging (the matcher cron logs can show the file's contents during incidents).
- **Ordering**: Always emit `orders[]` sorted by `deliveryDate` ascending. The spec 034 matcher's `previous` / `next` derivation depends on the chronological order, and a stable order makes the sidecar diffable across runs.
- **Idempotence on re-run**: The function `assemble_orders(active, historical, cap) -> [OrderBlob]` is the smallest pure helper. The new logic is a thin wrapper around `dict.fromkeys([active, *historical], key=lambda o: o.orderId).values()` followed by `sorted(..., key=lambda o: o.deliveryDate)` followed by a FIFO cap.

## Verification Plan

- **VP-1**: Run `python3 -m pytest tests/test_sync_dashboard_history.py -v` — expect 9+ new tests green.
- **VP-2**: Run `npx tsc --noEmit` in `meals-dashboard` — expect 0 errors (no dashboard code changed).
- **VP-3**: Run `npx vitest run` in `meals-dashboard` — expect all existing tests green (no regression introduced by the new payload shape).
- **VP-4**: Run `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — expect `Validated: data-science/meals-check` with no new warnings.
- **VP-5**: Manually call the sync twice in succession with two synthetic receipts (one dated `today - 7`, one dated `today + 2`), confirm the Blob payload contains both, and confirm via the loader test fixture that the dashboard's `validOrders` would have 2 entries.
- **VP-6**: Manually call the sync 10 times with 10 distinct receipts at the default cap of 6, confirm the payload contains exactly 7 entries (6 historical + 1 active) and the sidecar JSON on disk contains exactly 6 entries.
- **VP-7**: Visually load the Vercel preview URL after spec 035 lands on production and confirm tapping the "Previous delivery" chip renders items from the oldest retained order.

## Out of Scope

- A backfill script that scans Vercel Blob to rebuild the sidecar from scratch.
- A separate history endpoint API for dashboards that want a longer window.
- Cross-workspace archival (e.g. to a cloud bucket other than Vercel Blob).
- Retention policies beyond FIFO / cap (e.g. LRU, weighted by item count).

## Open Questions

None at draft time. All defaults proposed by the chef profile based on the spec 034 precedent (cap = 6, FIFO eviction, sidecar JSON).
