# Tasks: Dashboard Order History Retention

Status: Final
Feature: 035-dashboard-order-history-retention
Skill: data-science/meals-check

Tasks are sequenced by phase. A task is "done" when its acceptance criteria pass and the diff matches the listed file paths. Phases 1-4 are owned by the **coder profile** (per Danny's standing 2026-06-26 rule); Phase 5 (deployment + verification gate) is the chef-profile re-verification.

## Phase 1 — Pure derivation helper (TDD red → green)

- [ ] **T010** [FR-001, FR-002, FR-006] Add unit tests for `assemble_orders(active, historical, cap)` in a new `scripts/tests/test_sync_dashboard_history.py` module. Cover the four pure-helper guarantees (FR-006 idempotence, FR-004 in-place replace on orderId match, FR-005 FIFO eviction, deterministic deliveryDate-ascending order). Use synthetic `OrderBlob`-shaped dicts (`orderId`, `deliveryDate`, `deliverySlot`, `status`, `items`).
  - **Acceptance criterion**: `python3 -m pytest scripts/tests/test_sync_dashboard_history.py -v -k "test_assemble_orders"` shows the 4 new tests RED before Phase 1 implementation; GREEN after Phase 1 implementation.

- [ ] **T020** [FR-001, FR-002, FR-003, FR-006] Implement the pure helper and sidecar CRUD in `scripts/sync-dashboard-data.py`:
  - `MAX_HISTORICAL_ORDERS: int = 6` module-level constant.
  - `load_historical_orders(cap: int) -> list[dict]` — JSON read with safe fallback (`return []` + INFO log on any error).
  - `persist_historical_orders(orders: list[dict]) -> None` — atomic JSON write via `.tmp + os.replace`.
  - `assemble_orders(active: dict, historical: list[dict], cap: int) -> list[dict]` — pure, de-duplicating, sort-and-cap helper.
  - **Acceptance criterion**: T010's tests pass green.
  - **Acceptance criterion**: `MAX_HISTORICAL_ORDERS` is the single configuration point; no other magic numbers in the helper.

## Phase 2 — CLI flags + integration into `build_dashboard_payload`

- [ ] **T030** [FR-003, FR-008] Add `--max-history N` (positive int, max 50, default 6) and `--no-history` (boolean, default False) CLI flags to `sync-dashboard-data.py`'s `argparse` parser. Reject negative or non-integer `N` with a clear parser error. Wire both into the helper / builder pipeline.
  - **Acceptance criterion**: `python3 scripts/sync-dashboard-data.py --help` shows both flags.
  - **Acceptance criterion**: `python3 scripts/sync-dashboard-data.py --max-history 0 --dry-run` runs without raising.
  - **Acceptance criterion**: `python3 scripts/sync-dashboard-data.py --no-history --dry-run` produces a single-element `orders[]`.

- [ ] **T031** [FR-002, FR-007, FR-009] Wire `assemble_orders(...)` into the existing `build_dashboard_payload(...)` flow:
  - Read sidecar at the top, then call `merged = assemble_orders(active, historical, cap)` where `cap` comes from `--max-history` (or the module default).
  - Assign `orders: merged` to the published payload (replacing the prior single-receipt / empty assignment).
  - After successful publish, call `persist_historical_orders(merged)` so the sidecar reflects the published state.
  - Emit the FR-009 INFO log line.
  - **Acceptance criterion**: a dry-run with two synthetic receipts (previous + next) produces a payload whose `orders[]` contains both, ordered by `deliveryDate` ascending.

## Phase 3 — Pytest coverage expansion

- [ ] **T040** [FR-001, FR-006, FR-007] Add the sidecar CRUD + corrupt-sidecar recovery tests (3 cases):
  - `test_load_historical_orders_returns_empty_on_missing_file` — uses `tmp_path` fixture, asserts `[]` returned and INFO log emitted.
  - `test_load_historical_orders_returns_empty_on_corrupt_json` — write garbage to `tmp_path/previously_synced.json`, assert `[]` returned, INFO log emitted.
  - `test_persist_historical_orders_writes_valid_json_and_is_atomic` — assert the output file contains valid JSON identical to the input list, and that an aborted `.tmp` write does not leave a half-baked final file.
  - **Acceptance criterion**: all three pass green.

- [ ] **T041** [FR-007, FR-009] Add the build-and-publish integration test:
  - `test_build_dashboard_payload_includes_historical_orders` — invoke `build_dashboard_payload` with a synthetic active receipt + a pre-seeded `tmp_path` sidecar, assert the returned dict's `orders[]` has length `cap + 1`, sorted by `deliveryDate` ascending.
  - `test_build_dashboard_payload_with_no_history_flag_returns_single_element` — invoke with `--no-history`, assert `orders[]` length is 1 (active only).
  - **Acceptance criterion**: both pass green.

- [ ] **T042** [FR-008] Add the `--max-history` CLI override test:
  - `test_max_history_override_parametrised` — parametrise over `cap in [0, 3, 6]` and assert the published `orders[]` length is `min(distinct_receipts_count, cap) + 1` for cap > 0 and exactly 1 for cap == 0.
  - **Acceptance criterion**: passes green for all three parametrised cases.

## Phase 4 — `.gitignore` + skill contract update

- [ ] **T050** [.gitignore] Append `data/orders/*.json` to the existing `scripts/.gitignore` (or create the pattern under the `scripts/` ignore set if it does not yet exist; verify first).
  - **Acceptance criterion**: `git status scripts/` shows no untracked changes after a dry-run that writes to `data/orders/previously_synced.json`.

- [ ] **T051** [skill contract] Update `skill.spec.yaml` for the `data-science/meals-check` skill with the 10 expected_artifacts entries (one per FR), and add `previously_synced.json` to `runtime_state` as `committed_to_repo: false`.
  - **Acceptance criterion**: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` shows `Validated: data-science/meals-check` with **no new warnings** attributable to spec 035.

## Phase 5 — End-to-end verification + production deploy

- [ ] **T060** [FR-001..FR-010, NFR-001..NFR-006] Run the full verification suite per spec.md Verification Plan:
  - `python3 -m pytest scripts/tests/test_sync_dashboard_history.py -v` — 9+ new assertions green.
  - `cd ../meals-dashboard && npx tsc --noEmit` — 0 errors (sanity check that the dashboard was not touched).
  - `cd ../meals-dashboard && npx vitest run` — all tests still green (410/410 baseline preserved).
  - `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — `Validated: data-science/meals-check` clean (or with only the pre-existing 031 warnings).
  - `grep -rn "previously_synced\|assemble_orders\|MAX_HISTORICAL_ORDERS" scripts/` — returns only the expected files (no surprise leakage).
  - Manually publish a sync run with two synthetic receipts and confirm Vercel Blob receives both via the chef profile's verification harness.

- [ ] **T070** [promotion] After T060 green, the chef profile promotes spec 035 from Draft → Proposed → Final per the spec-driven-skills promotion flow. The Final status entry in `CHANGELOG.md` MUST cite `meals-dashboard` `origin/main` HEAD and the published Blob hash.
