# Implementation Plan: Dashboard Delivery-Day Last-Receipt Publication

Status: Final
Feature: 036-dashboard-delivery-day-last-receipt-publication
Skill: data-science/meals-check

## Summary

Closes an upstream-of-spec-035 gap in the meal-check pipeline. The matcher's `last_email` (the just-arrived receipt) is currently consumed only for meal matching and the cron printout; it is never persisted to the dashboard cache as the canonical `receipt` field, and the publisher has no path to write it to Vercel Blob. Result: on delivery days, the dashboard's "Previous delivery" chip is stale by one cycle. Spec 036 adds a tiny `last_email → OrderBlob` helper in the matcher, a `--extra-order PATH` CLI flag on the publisher, and the manifest/orders wiring to publish the delivery-day receipt as a second Blob alongside the chosen (next) receipt.

## Technical Context

- **`/home/hermes/.hermes/scripts/tesco_meal_check.py:1117-1258`** — `write_dashboard_cache()`: NO change to its core shape (the `receipt` field still defaults to next delivery). The new helper runs OUTSIDE this function — only on the `sync_dashboard()` invocation.
- **`/home/hermes/.hermes/scripts/tesco_meal_check.py:1261-1292`** — `sync_dashboard(dry_run=False)`: CHANGED. Accepts `last_email` parameter, serializes the helper's output to `pending_last_order.json`, appends `--extra-order <path>` to the cmd.
- **`/home/hermes/.hermes/scripts/tesco_meal_check.py:1845`** — `sync_dashboard(dry_run=args.dashboard_dry_run)` call site: CHANGED to pass `last_email` through.
- **`/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py:1981`** — `build_dashboard_payload()`: CHANGED. New `extra_order_blob: Optional[Dict] = None` kwarg plus `extra_order_key`; appends to sidecar + orders[].
- **`/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py:2222`** — `main()` argparse: CHANGED. New `--extra-order PATH` flag.
- **`/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py:1928`** — `publish_split_dashboard_payload`: CHANGED. Reads the extra-order blob, adds its path to the manifest's `orders/` map.
- **Frontend** — UNCHANGED. The dashboard loader (spec 017) already accepts any OrderBlob paths from the manifest; nothing in lib/, components/, or app/ is touched.
- **Spec 035 sidecar** — CHANGED (FR-006). The extra OrderBlob is appended to `previously_synced.json` after a successful publish, so it ages into the historical set as the chosen receipt ages out.

## Constitution Check

- **One user story per feature**: satisfied. Spec has one user story (delivery-day receipt publication).
- **Closure-not-deletion**: N/A. Spec 035 stays Final/closed; spec 036 adds a complementary publish path, not a replacement.
- **FR-NNN required**: satisfied. 10 FRs (FR-001..FR-010), all `FR-\d{3}` format.
- **Skill contract source of truth**: `skill.spec.yaml` will be updated to add 10 expected_artifacts entries in the same commit as the spec files.
- **Runtime state declared, not committed**: `pending_last_order.json` is gitignored scratch; `orders/<date>/<orderId>.json` writes go to Vercel Blob per spec 016/017. No new committed-to-repo artefacts.
- **Idempotence**: spec 030 no-op suppression covers the extra-order path via Blob ETag check (FR-007).

## Implementation Phases

### Phase 1 — Pure helper (TDD red → green)

See tasks T010 + T020. Single helper function with 7 tests covering the email-to-OrderBlob conversion edge cases (None input, missing fields, legacy key aliases, refund status, canonical path).

### Phase 2 — `sync_dashboard()` integration

See tasks T030 + T031. Wire the helper into the existing sync pipeline. New `pending_last_order.json` is gitignored scratch file under `data/orders/pending/`.

### Phase 3 — Publisher CLI flag and manifest wiring

See tasks T040 + T041 + T042. Add `--extra-order PATH` to the publisher, append the OrderBlob to the sidecar + orders[], and integrate spec 030's no-op suppression.

### Phase 4 — Tests (FR-010, AS-001..AS-006)

See tasks T050. 6+ new pytest cases covering the publisher's `--extra-order` path. Total: 13+ new tests across T010 + T050.

### Phase 5 — Backfill the missing 2026-06-30 OrderBlob

See task T060. One-shot CLI invocation with a hand-crafted `6521-8284-142` OrderBlob JSON. Logs the manifest hash; visual confirmation on the dashboard.

### Phase 6 — End-to-end verification + production deploy

See tasks T070 + T080. Standard 6-command verification block; promote Draft → Proposed → Final after green.

## Phased Rollout

1. Phase 1 + 2 land on `feat/spec-036-...` in `/home/hermes/.hermes/scripts`. Unit tests green locally.
2. Phase 3 lands on `feat/spec-036-...` in `/home/hermes/workspace/meals-dashboard`. CLI flag + integration green.
3. Phase 4 (tests) lands on the meals-dashboard branch.
4. Phase 5 (backfill) runs on a one-shot basis after Phase 3 lands.
5. Tester verification (independent) on both branches + the backfill.
6. Chef profile merges both feat branches → main, then promotes spec 036 to Final.

## Risks

- **Blob write race**: a delivery-day cron race (two syncs in 30 seconds) could race the publish path. spec 030's idempotent manifest + spec 035's orderId-dedup make this safe (last-write-wins; Vercel Blob is single-region per token).
- **Malformed `last_email`**: If the parser returns an item-less or invalid receipt, the helper returns None and the path is a no-op. Defensive against bad Gmail data.
- **Frontend invariant**: 410/410 vitest baseline MUST be preserved. The loader already accepts any OrderBlob path; no code changes are required on the frontend. Mitigation: V4 + V5 in the Verification Plan.
- **Spec 035 sidecar size**: The extra-order entry adds to the sidecar; cap=6 means up to 7 entries (6 historical + 1 active + 1 extra fits within the cap logic via FIFO eviction). Mitigation: NFR-006 + the spec 035 + 1 merge logic proven by existing tests.
- **Backfill leak**: The T060 backfill hand-crafts an OrderBlob from the printed report; some items may not be perfectly accurate. Mitigation: the items on the dashboard render are exactly what the printed report showed, so Danny sees what Tesco emailed today — the same source of truth, just bypassed through the dashboard instead of the cron.

## Follow-Ups (Out of Scope)

- A dedicated `last_receipt_blob` field on the dashboard cache (would be a future spec, this one uses CLI flag pass-through).
- An end-to-end mock test that constructs a delivery-day fixture and verifies the full matcher → publisher → dashboard render path.
- A spec 037 for "multi-email-receipt-fan-out" (when Tesco sends order, refund, and amendment emails on the same day).
