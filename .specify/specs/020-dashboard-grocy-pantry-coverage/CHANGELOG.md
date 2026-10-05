# Change Log: Dashboard Grocy Pantry Coverage

Feature ID: `020-dashboard-grocy-pantry-coverage`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits/status-history questions.

## Entries

### 2026-09-08 — Runtime implementation and local verification

- Change: Wired the optional Grocy pantry tier into the active meals-check runtime. The pipeline calls `get_products_in_stock()` once per sync, allocates Tesco order matches first, fills only remaining components from Grocy, forwards `source: "order" | "grocy"`, suppresses pantry freshness warnings, and fails soft when configuration or the API is unavailable. Grocy configuration is environment-only via `GROCY_BASE_URL` and `GROCY_API_KEY`.
- Dashboard: Confirmed the meal-list surface renders `🏠` for `source: "grocy"` and added a focused source contract test.
- Evidence: 64 focused Python tests pass; 428 dashboard tests pass; TypeScript check, production build, and static-private-data scan pass. The strict owning-skill validator still reports unrelated pre-existing errors in other specs (022, 024, 025, 027, 028, 029, 030, 031, 032, 034, 037, and 019).
- Status after change: Final specification; readiness `in_progress` pending independent tester mapping and production/runtime deployment evidence. No live Grocy mutation was performed.

### 2026-06-18 — Deleted parent 016-dashboard-split-storage (closed spec removed)

- Change: The closed parent spec `016-dashboard-split-storage/` was deleted at Danny's instruction on 2026-06-18. This entry does not rewrite the historical CHANGELOG entries above (which record the original split on 2026-06-15); it adds a new entry noting that the closed parent spec was removed from the repo. The four siblings (016/017/018/019) and the foundation slice (016) remain in place.
- Status after change: No status change for this spec.
- Rationale: Danny asked to delete the closed spec on 2026-06-18. The four surviving siblings (016-dashboard-blob-storage-layout, 017-dashboard-blob-read-path, 018-dashboard-order-status-tracking, 019-dashboard-coverage-invalidation-refunds-perishables, 020-dashboard-grocy-pantry-coverage) carry the design lineage forward.
- Implementation impact: `016-dashboard-split-storage/spec.md`, `plan.md`, `tasks.md`, `CHANGELOG.md`, `scenarios.yaml`, `traceability.yaml` deleted from the repo. `index.yaml` entry removed. `skill.spec.yaml` `expected_artifacts:` updated. `SKILL.md` updated. `references/dashboard-split-storage-proposal-2026-06-14.md` deleted. Cross-references in 12 sibling spec bodies and the top-level SKILL.md rewritten from `016-dashboard-split-storage` to `016-dashboard-blob-storage-layout`. Integer sequence unchanged (still 001–026 with the 009 gap).
- Evidence: Validator output post-deletion — expected `No issues found.`. Git diff shows deletion of 7 files (6 in 016-dashboard-split-storage/ + 1 references file), modification of 13 cross-reference files, removal of 6 lines from `skill.spec.yaml` expected_artifacts, removal of 1 entry from `index.yaml`.

### 2026-06-15 — Proposed (split from 016-dashboard-split-storage)

- Change: Created `020-dashboard-grocy-pantry-coverage/` as the fifth of five feature slices split from the original 016-dashboard-split-storage Draft. This feature owns the Grocy pantry coverage integration: query Grocy stock after order allocation, match remaining meal requirements to pantry items, surface `source: "grocy"` and the `🏠 In pantry` badge. Maps directly to original FR-10.
- Status after change: Proposed
- Rationale: Grocy is a different kind of coverage source from the order — pantry, not order. Splitting it from `019` (which handles order-driven coverage invalidation, refund, perishable, and manual override) keeps each focused. The `source: "grocy"` field and the `🏠 In pantry` badge are user-visible surface changes; the fail-soft behaviour (Grocy down → sync continues) is a contract. These warrant their own spec.
- Implementation impact: New `020-dashboard-grocy-pantry-coverage/` directory with `spec.md`, `plan.md`, `tasks.md`, `CHANGELOG.md`. No runtime code changes yet. Will land in `tesco_matcher.py`, `tesco_meal_check.py`, and the dashboard meal detail card.
- Evidence: Spec created in this session; `index.yaml` updated with new feature entry; owning-skill validator passes with the standard pre-existing brownfield warnings.

### 2026-06-14 — Add Grocy pantry as automatic coverage source (carried over from parent)

- Change: Original 016 spec added FR-10 for Grocy pantry coverage. The coverage algorithm only looked at Tesco order items; Grocy pantry inventory was not consulted. When a meal plan item was not in the current order but was in Grocy stock (e.g. pantry staples like pasta, rice, oil), the algorithm showed it as missing even though Danny has it. The Grocy client (`grocy_client.py`) already exists in the skill but was not wired into coverage logic. Added FR-10: Grocy pantry is an automatic coverage source, checked before marking an item as missing. Order items are matched first (freshness preference), then Grocy items fill remaining gaps. `matched_items[].source` field added: `"order" | "grocy" | "manual_override"`. Dashboard shows `🏠 In pantry` badge on Grocy-matched items. No `use_by_warning` on Grocy items. Carried over verbatim and forms the basis of this feature.
- Status after change: Proposed (this slice)
- Rationale: Grocy items are best-effort pantry coverage and should not displace fresh delivery items. Automatic matching is better UX than requiring manual overrides for every pantry staple.
- Implementation impact: `tesco_matcher.py`: call `grocy_client.get_products_in_stock()` during coverage calc, after order allocation, before marking as missing. `matched_items` entries gain `source: "grocy"`. Dashboard: `🏠 In pantry` badge on Grocy items. `grocy-integration.md`: mark as wired, remove "pending" status.
- Evidence: Scenario 3.10.
