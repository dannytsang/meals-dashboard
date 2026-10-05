# Tasks: Dashboard Delivery-Day Last-Receipt Publication

Status: Final
Feature: 036-dashboard-delivery-day-last-receipt-publication
Skill: data-science/meals-check

Tasks are sequenced by phase. A task is "done" when its acceptance criteria pass and the diff matches the listed file paths.

## Phase 1 — Pure helper (TDD red → green)

- [x] **T010** [FR-003, NFR-003] Add unit tests for `last_email_to_order_blob(last_email)` in `scripts/tests/test_last_email_to_order_blob.py`. Cover:
  - `test_last_email_to_order_blob_with_valid_receipt` — full receipt yields full OrderBlob with all required fields.
  - `test_last_email_to_order_blob_returns_None_for_None_input` — defensive against unparseable receipts.
  - `test_last_email_to_order_blob_returns_None_for_missing_order_number` — invalid input yields None.
  - `test_last_email_to_order_blob_returns_None_for_missing_delivery_date` — invalid input yields None.
  - `test_last_email_to_order_blob_handles_legacy_key_aliases` — both `order_number`/`orderId`, `delivery_date`/`deliveryDate`, `total_paid`/`total`, `delivery_slot`/`deliverySlot`, `short_life_items`/`shortLifeItems` — accepted.
  - `test_last_email_to_order_blob_handles_refund_status` — `email_type: 'refund'` maps to cancelled/refunded via `email_type_to_order_status()`.
  - `test_last_email_to_order_blob_sets_correct_path` — `orderBlobPath = f"orders/<deliveryDate>/<orderId>.json"`.
  - **Acceptance criterion**: `pytest scripts/tests/test_last_email_to_order_blob.py -v` shows the 7 tests RED before T020; GREEN after T020.

- [x] **T020** [FR-003, NFR-003] Implement `last_email_to_order_blob(last_email)` in `scripts/tesco_meal_check.py`. Pure function. Imports: `email_type_to_order_status` from the existing helper module. No I/O. OrderBlob shape per `lib/dashboard-sync.ts` interface.
  - **Acceptance criterion**: T010's tests pass green.
  - **Acceptance criterion**: function is a non-default export; clean docstring referencing FR-003.

## Phase 2 — `sync_dashboard()` integration (FR-002)

- [x] **T030** [FR-002, FR-008] In `scripts/tesco_meal_check.py:1261` (`sync_dashboard`), extend the function to:
  - Accept the parsed `last_email` as a parameter (passed from the caller).
  - Serialize the OrderBlob to `<DASHBOARD_CACHE_FILE.parent>/pending_last_order.json` when `last_email_to_order_blob(last_email)` is non-None.
  - Append `--extra-order <path>` to the `cmd` array on line 1279 before subprocess.run.
  - Emit the FR-008 INFO log line on the success path.
  - **Acceptance criterion**: a hand-crafted test invocation with a synthetic `last_email` produces a non-empty `pending_last_order.json` and the subprocess invocation log shows `--extra-order` in the cmd.

- [x] **T031** [FR-002] Update the call site of `sync_dashboard()` at line 1845 to pass the parsed `last_email` (already in scope from the main pipeline). Use a defensive guard so older callers (without `last_email`) continue to work — `sync_dashboard(dry_run=..., last_email=last_email if last_email else None)`.
  - **Acceptance criterion**: a delivery-day matcher run with a real `last_email` writes `pending_last_order.json` and invokes `sync-dashboard-data.py --extra-order`.

## Phase 3 — Publisher CLI flag and manifest wiring (FR-001, FR-005)

- [x] **T040** [FR-001, FR-009] In `/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py:2222` (existing `main()`), add a new argparse flag `--extra-order PATH` (type=str, default=None). Validate: if the path is provided, the file MUST exist and MUST be valid JSON; otherwise log a warning and skip the extra-order write (FR-009). Pass the parsed dict to `build_dashboard_payload` as a new `extra_order_blob: Optional[Dict] = None` kwarg.
  - **Acceptance criterion**: `python3 scripts/sync-dashboard-data.py --help` lists `--extra-order PATH` with a clear description.
  - **Acceptance criterion**: `python3 scripts/sync-dashboard-data.py --extra-order /tmp/missing.json` warns and exits 0.

- [x] **T041** [FR-005, FR-006] Extend `build_dashboard_payload` in `/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py:1981` to accept `extra_order_blob: Optional[Dict] = None` and `extra_order_key: Optional[str] = None`. When present:
  - Append the extra OrderBlob to the spec 035 sidecar (`previously_synced.json`) so it ages into the historical set naturally.
  - Include the OrderBlob in the published `orders[]` payload (with its own `orderBlobPath`).
  - Emit the FR-009 INFO log line `extra-order published: <orderId> (<deliveryDate>)`.
  - **Acceptance criterion**: a dry-run with `--extra-order /tmp/extra.json` shows 2 entries in the FR-008 log (`orders: published N` and `extra-order published: ...`); `Order blobs: 2`.

- [x] **T042** [FR-007] Wire the no-op suppression (spec 030) into the extra-order path: the publisher MUST check the Blob's ETag / hash before writing the extra-order Blob; if unchanged, skip the write and log `extra-order up-to-date`.
  - **Acceptance criterion**: re-running `sync-dashboard-data.py --extra-order <same.json>` twice in succession produces two log lines: `extra-order published ...` then `extra-order up-to-date ...` (second invocation skips the actual PUT).

## Phase 4 — Tests (FR-010, AS-001..AS-006)

- [x] **T050** [FR-010] Add `scripts/tests/test_publish_extra_order.py` with 6+ cases:
  - `test_publish_extra_order_appends_to_orders_array` — given an `--extra-order` JSON, the published `orders[]` length is N+1 (the existing receipt + the extra).
  - `test_publish_extra_order_writes_canonical_blob_path` — the extra-order Blob is published to `orders/<deliveryDate>/<orderId>.json`.
  - `test_publish_extra_order_with_no_last_email_is_no_op` — without `--extra-order`, behaviour matches spec 035 baseline.
  - `test_publish_extra_order_with_malformed_json_warns_and_continues` — malformed JSON triggers a warning, the main write still proceeds.
  - `test_publish_extra_order_most_recent_wins_on_orderId_collision` — same orderId twice overwrites the historical entry (spec 035 dedup parity).
  - `test_publish_extra_order_participates_in_sidecar` — running with `--extra-order` adds the extra entry to `previously_synced.json`.
  - **Acceptance criterion**: `pytest scripts/tests/test_publish_extra_order.py -v` shows 6+ tests GREEN after T040-T042 land.

## Phase 5 — Backfill the missing 2026-06-30 OrderBlob

- [ ] **T060** [backfill] After T050 green, execute a one-shot backfill: hand-craft a minimal `orders/2026-06-30/6521-8284-142.json` OrderBlob from the data captured in the meals-check printed report on 2026-06-30 (Order ID `6521-8284-142`, delivery 2026-06-30, slot 20:00-21:00, total £62.65, status `active`, items from the printed report). Run `python3 /home/hermes/.hermes/scripts/tesco_meal_check.py --days 1 --output both --report-identity last` followed by `python3 sync-dashboard-data.py --extra-order /tmp/6521-8284-142.json --skip-fetch`. Confirm the Blob write succeeds and the dashboard's Previous-delivery chip populates with the 30 June order.
  - **Acceptance criterion**: `ls` on the Blob (via the dashboard read API or by inspecting the manifest) shows `orders/2026-06-30/6521-8284-142.json`. Visual confirmation on `https://meals-dashboard.vercel.app` that the "Previous delivery" chip renders today's items.

## Phase 6 — End-to-end verification + production deploy

- [x] **T070** [FR-001..FR-010, NFR-001..NFR-006] Run the full verification suite per spec.md Verification Plan:
  - `python3 -m pytest scripts/tests/test_last_email_to_order_blob.py scripts/tests/test_publish_extra_order.py -v` — 7+6 = 13+ new tests green.
  - `python3 -m pytest scripts/tests/` — no regressions among pre-existing 51 tests.
  - `python3 scripts/sync-dashboard-data.py --help` — `--extra-order PATH` visible.
  - `cd /home/hermes/workspace/meals-dashboard && npx tsc --noEmit` — 0 errors.
  - `cd /home/hermes/workspace/meals-dashboard && npx vitest run` — 410/410 baseline preserved.
  - `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — clean (only pre-existing 031 warnings).
  - Live backfill (T060) succeeds and dashboard renders today's order.

- [x] **T080** [promotion] After T070 green, the chef profile promotes spec 036 from Draft → Proposed → Final per the spec-driven-skills promotion flow.
