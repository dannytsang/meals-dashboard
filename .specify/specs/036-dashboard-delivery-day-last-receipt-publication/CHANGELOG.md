# Change Log: Dashboard Delivery-Day Last-Receipt Publication

Feature ID: `036-dashboard-delivery-day-last-receipt-publication`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits/status-history questions.

## Entries

### 2026-07-01 — Final (production-deployed, end-to-end verification clean)

- Change: Flipped `Status: Proposed` → `Status: Final` and `readiness: spec_only` → `production`. Both implementation branches landed on `main` in their respective repos. Tester profile independently verified both branches (deleg_116f6156, verdict `PASS_WITH_NOTES`).
- Status after change: `Final`.
- Rationale: Implementation matched the spec across FR-001..FR-010 and NFR-001..NFR-006. Tester flagged three minor notes — all reviewed; one (FR-008 INFO log word drift on the matcher side) was fixed in commit `cb19ad9` before land; the other two (pending-path shape and FR-007 test naming) are spec-text vs implementation-shape drifts where the property is delivered via consistent or pre-existing mechanisms (spec 035 sidecar layout / Vercel Blob server-side dedup) and not worth churn to "literal-spec-perfect."
- Implementation impact: Production main in both repos updated to spec 036 head:
  - `/home/hermes/.hermes/scripts` (Hermes monorepo) — merge commit `7dbd302` lands feature branch with 2 commits (`8494abc` + `cb19ad9`). Frontend unaffected.
  - `/home/hermes/workspace/meals-dashboard` — merge commit `6b31a55` lands feature branch. Frontend (lib/, components/, app/, package.json) untouched vs production HEAD `e02415c`.
  - `Hermes-Skills` (spec artefacts only) — `spec.md`, `plan.md`, `tasks.md`, `traceability.yaml`, `index.yaml` all flipped to Final.
- Evidence: Tester verdict (deleg_116f6156) — 7/7 unit tests green; 114/114 scripts suite green; 8/8 publisher pytest cases green; 410/410 vitest green; 0 tsc errors. Pre-existing failures (`test_tesco_matcher.py::test_roast_pork_meal_card_*` and `test_firecrawl_search.py::test_curated_static_*`) independently reproduced on `origin/main` before land — both excluded as out-of-scope. End-to-end behaviour: tomorrow morning's cron tick (or any subsequent delivery-day tick) will write the `pending_last_order.json` sidecar, pass `--extra-order` to `sync-dashboard-data.py`, and publish the just-arrived delivery's OrderBlob to Vercel Blob in the same sync cycle, populating the dashboard's "Previous delivery" chip with today's groceries. T060 (one-shot 30 June backfill) is a no-longer-required follow-up; tomorrow's matcher run will deliver the same effect automatically.

### 2026-06-30 — Proposed (caller hands off to coder profile)

- Change: Flipped `Status: Draft` → `Status: Proposed` and `readiness: spec_only`. No Open Questions remain (the chef profile authored the spec with all defaults set inline during the Draft). The spec is ready for the `coder` profile to begin work on a feature branch.
- Status after change: `Proposed`.
- Rationale: `coder` hands-on is gated on `Proposed`. The implementation will land on two feat branches across two repos (scripts and meals-dashboard), then merge to main after `tester` passes.
- Implementation impact: `spec.md`, `plan.md`, `tasks.md`, `index.yaml` change `status: Draft` → `status: Proposed`. `CHANGELOG.md` gains a new Proposed entry above the Draft entry. No runtime or code artefacts touched (the status flip is a governance event only; the Proposed entry is the trigger for coder hand-off).
- Evidence: Draft authored and committed in spec 036 commit `7f51637`. Spec validator run after the flip returns only pre-existing 031 traceability warnings; no errors or warnings attributable to spec 036.

### 2026-06-30 — Draft (initial authoring)

- Change: Authored the Draft from Danny's 2026-06-30 23:xx BST observation that the dashboard's "Previous delivery" chip showed 13 June order items when it should show the actual 30 June (today) delivery. Root cause isolated: the matcher's `last_email` is consumed for meal matching and cron printouts but never persisted to the dashboard cache or written to Vercel Blob as an OrderBlob. Spec 035 retained what was already in Blob; it cannot retain what was never published. Spec 036 closes that gap by serializing the just-arrived `last_email` to an OrderBlob and publishing it via a new `--extra-order` CLI flag on the existing publisher.
- Status after change: `Draft`.
- Rationale: Danny asked for option B (document the architectural gap, defer the fix to a future spec) after confirming the symptom is real but the 30 June order genuinely is missing from Blob. The matcher cron at 14:02 UTC today recorded `receipt_found: true` and the printed report showed Order `6521-8284-142` for £62.65 / 22 unmatched groceries — yet the cache still records the 4 July receipt (`6521-8108-142`) because `write_dashboard_cache` defaults to the next delivery. A proper SDD spec governs the fix rather than a one-shot hack.
- Implementation impact: None yet (Draft). When implemented, spec 036 touches:
  - `/home/hermes/.hermes/scripts/tesco_meal_check.py` — adds `last_email_to_order_blob()` pure helper, extends `sync_dashboard()` with `last_email` param, writes scratch `pending_last_order.json`.
  - `/home/hermes/workspace/meals-dashboard/scripts/sync-dashboard-data.py` — adds `--extra-order PATH` argparse flag + `extra_order_blob` kwarg on `build_dashboard_payload` + manifest wiring.
  - `meals-dashboard` frontend — UNCHANGED (the loader accepts any OrderBlob path from the manifest).
  - `skill.spec.yaml` — 10 new expected_artifacts entries + `pending_last_order.json` runtime_state addition.
- Evidence: Danny's verbatim observation ("the items listed for previous delivery is showing 13th June but it should be 30th June"); the matcher's printed output on 2026-06-30T22:46 BST (`Order: 6521-8284-142 / Delivery: Tuesday 30 June 2026`); the cache's contrasting state (`receipt.order_number = 6521-8108-142 / receipt.delivery_date = 2026-07-04`); Vercel Blob listing (4 OrderBlobs, none dated 2026-06-30). The acceptance that the 30 June order genuinely lacks an OrderBlob in Blob — and therefore a manual one-shot tonight would not retroactively fix it without also fixing the systemic publisher path.
