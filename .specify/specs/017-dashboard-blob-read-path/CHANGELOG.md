# Change Log: Dashboard Blob Read Path

Feature ID: `017-dashboard-blob-read-path`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits/status-history questions.

## Entries

### 2026-06-18 — Deleted parent 016-dashboard-split-storage (closed spec removed)

- Change: The closed parent spec `016-dashboard-split-storage/` was deleted at Danny's instruction on 2026-06-18. This entry does not rewrite the historical CHANGELOG entries above (which record the original split on 2026-06-15); it adds a new entry noting that the closed parent spec was removed from the repo. The four siblings (016/017/018/019) and the foundation slice (016) remain in place.
- Status after change: No status change for this spec.
- Rationale: Danny asked to delete the closed spec on 2026-06-18. The four surviving siblings (016-dashboard-blob-storage-layout, 017-dashboard-blob-read-path, 018-dashboard-order-status-tracking, 019-dashboard-coverage-invalidation-refunds-perishables, 020-dashboard-grocy-pantry-coverage) carry the design lineage forward.
- Implementation impact: `016-dashboard-split-storage/spec.md`, `plan.md`, `tasks.md`, `CHANGELOG.md`, `scenarios.yaml`, `traceability.yaml` deleted from the repo. `index.yaml` entry removed. `skill.spec.yaml` `expected_artifacts:` updated. `SKILL.md` updated. `references/dashboard-split-storage-proposal-2026-06-14.md` deleted. Cross-references in 12 sibling spec bodies and the top-level SKILL.md rewritten from `016-dashboard-split-storage` to `016-dashboard-blob-storage-layout`. Integer sequence unchanged (still 001–026 with the 009 gap).
- Evidence: Validator output post-deletion — expected `No issues found.`. Git diff shows deletion of 7 files (6 in 016-dashboard-split-storage/ + 1 references file), modification of 13 cross-reference files, removal of 6 lines from `skill.spec.yaml` expected_artifacts, removal of 1 entry from `index.yaml`.

### 2026-06-15 — Finalised (production read path + cross-repo smoke)

- Change: Promoted `017-dashboard-blob-read-path` from `Proposed` to `Final`. The shipped implementation in `meals-dashboard` (commit `31ee076`) matches every FR and SC: read pointer → manifest → data blobs in parallel, lazy loading of coverage blobs for the visible two-week window, missing-blob fallback to null/empty state without crashing, two-delivery-window composition, server-side data boundary (no client-side blob fetching), 9 vitest tests in `lib/dashboard-data.test.ts` covering the new `getDashboardData` path. The spec 018 work (status + refund_amount on `TescoReceipt`) is now plumbed through `transformCachedOrderSafely` and surfaced in the dashboard via the new `OrderStatusBadge`.
- Status after change: Final
- Rationale: The implementation has been in production since 2026-06-15 and the spec is now ready to track the deployed contract.
- Implementation impact: `index.yaml` entry for `017-dashboard-blob-read-path` updated from `ready` (Proposed) to `already_satisfied` (Final). `SKILL.md` spec list for 017 updated to reflect Final. No runtime changes.
- Evidence: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check --strict` → clean (only sibling 018/019/020 remain with the standard pre-existing brownfield warnings); `npx vitest run` → 117 passed; `npx tsc --noEmit` → clean; `npm run build` → clean; `npm run scan:static-private-data` → clean; production read path verified by the live dashboard.

### 2026-06-15 — Implementation delivered (read path rewired + tests)

- Change: Wired the new read path into the dashboard's server-side data layer. `lib/dashboard-data.ts` now calls `getDashboardData` which reads `pointers/latest.json` → manifest → `meta/summary-*` + `coverage/{date}.json` + `orders/{date}/{num}.json` blobs in parallel (via `Promise.all`), then composes the existing `DashboardData` shape (`coverage: MealCoverage[]`, `deliveryWindows: DeliveryWindow[]`, `latestOrder: TescoReceipt | null`, `mealsCheckSummary`). Coverage blobs are flattened from per-date to per-meal. Order blobs are reduced to the latest by delivery date. deliveryWindows are composed from order blobs (replacing the dropped pointer refinement). Missing blob fetches return null/empty for that portion without crashing (FR-003). When no pointer exists, the read path falls back to the legacy `dashboard-data.json` single-blob layout (regression guard). Renumbered all FRs to 3-digit per the strict validator. Added `traceability.yaml` and `scenarios.yaml`. 016 spec FR-005 and 017 spec FR-005 reconciled to refer to the content-addressable summary path.
- Status after change: Proposed
- Rationale: 017 is the consumer of the 016 storage layout. Both land together in this workstream because the read path cannot be tested against a populated split layout without the write path's split primitives. The legacy single-blob read path remains as a regression fallback for pre-pointer first runs and for rollback safety, but the Python sync producer is now updated to target `/api/dashboard-sync`.
- Implementation impact: Rewrote `lib/dashboard-data.ts` to use the new `BlobStorageClient` interface and `buildCoverageWindowDates`. `app/page.tsx` now passes the full inclusive date list for the visible two-week window instead of only start/end exact dates. No client-component code changed; `DashboardData` shape is preserved. 9 vitest tests in `lib/dashboard-data.test.ts`; 117/117 suite passes; tsc clean; production build clean; static-bundle privacy scan clean.
- Evidence: `npx vitest run lib/dashboard-data.test.ts` → 9 passed; `npx vitest run` → 117 passed; `npx tsc --noEmit` → clean; `npm run build` → clean; `npm run scan:static-private-data` → clean. Validator `validate_spec_skill.py data-science/meals-check --strict` → 016 and 017 clean (only sibling 018/019/020 remain, which are out of scope for this turn).

### 2026-06-15 — Proposed (split from 016-dashboard-split-storage)

- Change: Created `017-dashboard-blob-read-path/` as the second of five feature slices split from the original 016-dashboard-split-storage Draft. This feature owns the dashboard's read path: pointer → manifest → data blobs, lazy loading, missing-blob fallback, two-delivery-window composition. Maps directly to original US4 (Dashboard Reads From Split Blobs). The read path is owned by the meals-dashboard repo, not the meals-check skill, but the spec is recorded here because it is the consumer of the storage layout defined in `016-dashboard-blob-storage-layout` and lives in the same governance hierarchy.
- Status after change: Proposed
- Rationale: The original 016 had two distinct concerns: storage layout (writes) and read path (reads). Each has its own acceptance scenarios, failure modes, and tests. Splitting them allows the read path to land independently of the storage layout migration, and allows the dashboard team to own the read path while the meals-check team owns the storage layout. The read path also has a clear single user story.
- Implementation impact: New `017-dashboard-blob-read-path/` directory with `spec.md`, `plan.md`, `tasks.md`, `CHANGELOG.md`. No runtime code changes yet. Will land in `/home/hermes/workspace/meals-dashboard/lib/dashboard-data.ts` when implemented.
- Evidence: Spec created in this session; `index.yaml` updated with new feature entry; owning-skill validator passes with the standard pre-existing brownfield warnings.
