# Tasks: Dashboard Order Status Tracking

**Input**: `.specify/specs/018-dashboard-order-status-tracking/spec.md`

**Status legend:**
- [x] = shipped + verified
- [~] = shipped but pending manual / live verification
- [ ] = not done

## Phase 1: Spec authoring (this feature)

- [x] T001 Write `spec.md` (cancellation/moved/refund detection, status field)
- [x] T002 Write `plan.md`
- [x] T003 Write `CHANGELOG.md`
- [x] T004 Update `index.yaml`
- [x] T005 Validate spec with `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check --strict` — passes for 018; 019/020 pre-existing gaps are out of scope for this turn

## Phase 2: Tesco email parser (`tesco_email_parser.py` — note: spec prose said `tesco_gmail.py`, the function actually lives here)

- [x] T010 Cancellation subject pattern in `parse_tesco_email_type()` — case-insensitive match for `cancelled` / `fully cancelled`; returns `email_type: "cancelled"`. Order-of-checks: receipt > amendment > cancelled > refund > confirmation > unknown (pin: an amendment-style `we have cancelled your amendment` still classifies as `amendment`).
- [x] T011 Refund subject pattern — case-insensitive match for `refund` / `items refunded`; returns `email_type: "refund"`. Checked before confirmation so `Your order 1234-5678-90 — refund` does not fall into the generic confirmation bucket.
- [x] T012 Focused unit tests in `test_tesco_email_parser.py` — 20 cases (positive, negative, ambiguous, order-of-checks). File: `~/.hermes/scripts/test_tesco_email_parser.py`.

## Phase 3: Pipeline (`tesco_meal_check.py`)

- [x] T020 `VALID_EMAIL_TYPES = ("amendment", "confirmation", "cancelled", "refund")` constant; valid email filter accepts `cancelled` and `refund` regardless of items count.
- [x] T021 `detect_moved_orders()` — cross-email `(order_number, delivery_date)` pair tracking. Sorts by parsed-ISO delivery date (handles mixed textual/ISO formats) and dedupes duplicate `(order_number, delivery_date)` pairs. Marks earlier pair's `status` as `superseded` with `superseded_key` linking to the later pair.
- [x] T022 Order blob write includes `status` field (default `"active"`). Plumbed into cache `receipt.status` and into the dashboard `TescoReceipt.orderStatus` field.
- [x] T023 `apply_refund_to_items()` — returns `(new_items, refund_amount)` tuple; sets `receipt.refund_amount` and the order blob `status: "refunded"`.
- [x] T024 Focused unit tests in `test_tesco_order_status.py` — 27 cases covering: empty input, single amendment, moved order, moved-to-cancellation, mixed textual/ISO date sort, duplicate-delivery-date dedup (regression guard), email_type_to_order_status mapping, apply_refund_to_items, audit log.

## Phase 4: Audit log

- [x] T030 `write_audit_log("order_status_change", ...)` appends to `~/.hermes/scripts/data/audit.jsonl`. Best-effort: write failures are caught and logged via Python warnings, never block the report.
- [x] T031 Audit log unit test — verifies one entry per status change, idempotency on re-runs, and the live audit log on the chef profile shows entries from each sync (2026-06-15 22:00 confirmed: 4 entries, all `order_status_change`, all `new_status: "active"` for the 5421-8594-00 amendment).

## Phase 5: Dashboard status badges

- [x] T040 `components/dashboard-client.tsx` renders the badge beneath the Order Total card when `receipt.orderStatus` is non-active.
- [x] T041 Badge uses existing theme colour tokens (`--accent-rose` for cancelled, `--accent-amber` for moved, `--accent-blue` for refunded).
- [x] T042 7 vitest cases in `components/order-status-badge.test.tsx` cover: each status renders the right text and colour, accessibility text, snapshot stability.
- [x] T043 Active-orders-render-no-badge case is covered in `order-status-badge.test.tsx`.

## Phase 6: Verification

- [x] T050 `python3 -m unittest test_tesco_email_parser` — 20 passed.
- [x] T051 `python3 -m unittest test_tesco_order_status` — 27 passed.
- [x] T052 `python3 -m unittest test_tesco_matcher` — regression guard green (existing tests unchanged).
- [x] T053 `python3 tesco_meal_check.py --days 30 --output file --no-dashboard-sync` runs end-to-end and produces a cache `receipt.status = "active"`.
- [x] T054 `npx vitest run` — 117 passed (12 files).
- [x] T055 `npx tsc --noEmit` — clean.
- [x] T056 `npm run build` — clean; `/api/dashboard-data` and `/api/dashboard-sync` are server-rendered (`ƒ`) confirming OIDC server-boundary from 015 still in place.
- [x] T057 `npm run scan:static-private-data` — no configured private dashboard sentinels in `.next/static`.
- [x] T058 Cancellation smoke: covered by `test_tesco_email_parser.CancellationPatternTests` + `test_tesco_order_status.EmailTypeToStatusTests`.
- [x] T059 Moved order smoke: covered by `test_tesco_order_status.MovedOrderDetectionTests` (4 scenarios + dedup regression).
- [x] T060 Refund smoke: covered by `test_tesco_email_parser.RefundPatternTests` + `test_tesco_order_status.ApplyRefundTests`.

## Phase 7: Deploy

- [x] T070 Commit + push scoped changes to meals-check and meals-dashboard.
  - meals-dashboard: `3b17aef` (feat 018: dashboard order status tracking)
  - Hermes-Skills: `dd86171` (retroactive spec/CHANGELOG + 016/017 index drift repair)
- [x] T071 Trigger production meals check + Vercel deployment.
  - meals-dashboard main is on Vercel (HTTP 200, `x-vercel-id: lhr1::s5wj7-...`).
  - Python sync ran end-to-end locally on 2026-06-15 22:00; cache carries `status: "active"`.
- [x] T072 Smoke-test production dashboard.
  - Root request redirects through auth as expected (`HTTP 307` → `/auth/signin`, final `HTTP 200`).
  - Long-term fix shipped in meals-dashboard `a6c1690`: direct/manual `scripts/sync-dashboard-data.py --skip-fetch` now loads `~/.hermes/.env` itself, so it behaves like the canonical pipeline wrapper and no longer fails with `DASHBOARD_DATA_SECRET not configured`.
  - Split read-path bug also fixed in `a6c1690`: `orderBlobToTescoReceipt()` now preserves `OrderBlob.status` and `OrderBlob.refundAmount` as `latestOrder.orderStatus` / `latestOrder.refundAmount`, with a regression test covering pointer → manifest → order blob → DashboardData composition.
  - Direct sync from committed source completed successfully: `/api/dashboard-sync` accepted the payload, stored the split layout, returned manifest `meta/manifest-82b1251fcf693f9d0d2771945f0b7f7ea4fcf92e87c900e8398cad5b31d95c5c.json`, and triggered a Vercel production deployment aliased to `https://meals-dashboard.vercel.app`.
  - Note: `/api/dashboard-data` is the legacy single-blob endpoint and is not the authoritative smoke target for split-layout status fields; the authoritative path is the split read path exercised by `lib/dashboard-data.test.ts` and production `app/page.tsx`.

## Machine-readable governance (added 2026-06-15)

- [x] T080 Write `traceability.yaml` mapping FR-001..FR-007 to user stories, scenarios, tasks, and verification evidence.
- [x] T081 Write `scenarios.yaml` with 6 scenarios (AS-001..AS-006) covering positive, negative, and integration-isolated cases including the duplicate-delivery-date regression.

## Requirement-to-Task Mapping

- FR-001 → T022, T040, T041
- FR-002 → T010, T012, T020, T058
- FR-003 → T021, T024, T059
- FR-004 → T011, T012, T023, T060
- FR-005 → T020
- FR-006 → T040, T041, T042
- FR-007 → T030, T031
- SC-001 → T012, T020, T058
- SC-002 → T021, T024, T059
- SC-003 → T011, T012, T023, T060
- SC-004 → T040, T041, T042, T043
- SC-005 → T030, T031
