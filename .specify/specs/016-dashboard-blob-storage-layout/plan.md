# Implementation Plan: Dashboard Blob Storage Layout

Status: Proposed
Feature: 016-dashboard-blob-storage-layout
Skill: data-science/meals-check

## Summary

Plan for refactoring the Vercel Blob storage layout from a single mutable `dashboard-data.json` blob (delete + rewrite on every sync) to an append-only split layout where historical orders and meal coverage are stored as immutable dated blobs. A content-addressable hash manifest in blob storage enables per-blob dedup: unchanged blobs are skipped entirely on subsequent syncs, so a sync with no data changes writes only a new manifest pointer (~1KB) instead of rewriting all data blobs. The audit trail lives in the meals skill's local `~/.hermes/scripts/data/audit.jsonl` file, never in Blob storage.

This feature covers the **storage layout** only. Dashboard read path lives in `017-dashboard-blob-read-path`. Order status / cancellation / moved-order / refund detection lives in `018-dashboard-order-status-tracking`. Coverage invalidation / shelf-life / perishable / manual override lives in `019-dashboard-coverage-invalidation-refunds-perishables`. Grocy pantry coverage lives in `020-dashboard-grocy-pantry-coverage`.

## Technical Context

- Runtime profile: `chef` owns meals-check domain and dashboard sync workflow.
- Sync script: `/home/hermes/.hermes/scripts/tesco_meal_check.py` (current location for `sync_dashboard()`).
- Vercel Blob store: existing `BLOB_STORE_ID` / `BLOB_READ_WRITE_TOKEN` from `004-dashboard-sync`.
- Dashboard read path: `/home/hermes/workspace/meals-dashboard/lib/dashboard-data.ts`.
- Migration: one-time move of any existing `dashboard-data.json` content to the new layout. Out of scope for the sync pipeline; manual or one-shot script.

## Constitution Check

- Raw report is the product: Pass — storage layout does not change Telegram raw report delivery.
- Observable pipeline behaviour beats guesswork: Pass — SC-03 explicitly counts blob ops on unchanged sync.
- Runtime state is declared, not committed: Pass — audit log is local, never committed. Blob paths are runtime state, declared in `skill.spec.yaml`.
- Production side effects are bounded: Pass with caution — first sync writes all blobs (unavoidable initial state), subsequent syncs write only the delta.

## Scope

In scope:
- Append-only per-order blobs at `orders/{date}/{num}.json`
- Mutable per-day coverage blobs at `coverage/{date}.json`
- SHA-256 content-hash manifest at `meta/manifest-{hash}.json`
- Minimal pointer at `pointers/latest.json`
- Audit log at `~/.hermes/scripts/data/audit.jsonl`
- 7-step sync algorithm for the storage-layout portion (steps in spec §Sync Algorithm)
- `--dry-run`, `--no-build`, `--force-deploy` flags preserved

Out of scope:
- Status field on order blobs → `018`
- `stale` / `staleReason` / `source` on coverage blobs → `019` and `020`
- Dashboard read path / lazy loading → `017`
- Cancellation / moved-order / refund / amendment / shelf-life / Grocy / manual override logic → `018`, `019`, `020`

## Scenario Coverage Matrix

- Positive: write new order blob on delivery day → FR-001, FR-003, SC-01
- Positive: write new coverage blob on meal-date change → FR-002, FR-003, SC-02
- Positive: hash-dedup unchanged data → FR-003, FR-004, FR-005, FR-006, SC-03
- Negative: mid-write failure → FR-007, FR-008 (pointer/manifest write order preserves previous valid state)
- Integration-isolated: audit log records every blob write → FR-012
- Boundary: first sync (no manifest exists) → documented in clarifications
- Boundary: hash dedup with no changes in any blob → SC-03

## Implementation Approach

1. Add storage-layout helpers in `tesco_meal_check.py` (or a new helper module):
   - `read_pointer()` — read `pointers/latest.json`, return manifest path
   - `fetch_manifest(manifest_path)` — fetch manifest blob from Blob, return dict
   - `compute_hash(content: str) -> str` — SHA-256 hex digest
   - `write_blob_if_changed(path, content, current_manifest)` — hash compare, write or skip
   - `build_manifest(data_blob_paths, current_manifest)` — merge written/skipped into new manifest
   - `write_manifest(manifest: dict) -> str` — serialise, hash, write to `meta/manifest-{hash}.json`, return path
   - `write_pointer(manifest_path)` — write `pointers/latest.json` (delete + rewrite)
   - `audit_log(event_type, blob_path, hash, **fields)` — append to `~/.hermes/scripts/data/audit.jsonl`

2. Implement the storage-layout portion of the 7-step sync algorithm (steps 1, 2, 5–9 plus step 4 for plain order/coverage data; cancellation/refresh steps are owned by 018/019/020).

3. Preserve `--dry-run`, `--no-build`, `--force-deploy` flags unchanged. Dry-run mode computes hashes, reports what would change, skips all writes.

4. Verify:
   - Initial sync: all blobs written, manifest written, pointer updated
   - Unchanged sync: only manifest + pointer written, data blobs skipped
   - Changed sync: only changed blobs + manifest + pointer written
   - Audit log written for every blob write

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Manifest write fails after data blobs written | Previous manifest remains valid; next sync retries with same hashes, skips data, rewrites manifest |
| Pointer write fails after manifest written | Manifest is valid; next sync reads old pointer, fetches correct manifest, retries pointer |
| First sync (no manifest) logic complexity | Special-case: if `pointers/latest.json` is missing/empty, treat as initial sync — write all blobs |
| SHA-256 collision (theoretical) | SHA-256 is computationally infeasible to exploit for deliberate collision; acceptable for dedup |
| Hermes runs on different machine, local state lost | Manifest is in Blob — next sync on new machine reads pointer, fetches manifest, continues normally |
| Audit log grows unbounded | Out of scope here; can be rotated by an external script if it ever becomes a problem. The audit log is local state, not in Blob. |
| `audit.jsonl` path on systems where `~/.hermes/` is read-only | The path is fixed by the meals-check `skill.spec.yaml`; if it cannot be written the audit append should fail soft (warn but do not block the sync). |

## Verification

Required before promoting to Final:
- `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` passes
- Sync script end-to-end:
  - Initial sync: all blobs written, manifest written, pointer updated
  - Unchanged sync: only manifest + pointer written, data blobs skipped
  - Changed sync: only changed blobs + manifest + pointer written
- `audit.jsonl` written for every blob write
- Dashboard `lib/dashboard-data.ts` continues to work after first sync (handshake with `017` is a separate verification)
- Commit + push
- Trigger production deployment
- Smoke test production dashboard

## Reference Documents

- `references/dashboard-blob-migration-2026-06-14.md` — full end-to-end Blob migration patterns and pitfalls
- `references/dashboard-blob-mode-folded-bug-2026-06-14.md` — `@vercel/blob` `list()` `mode: 'folded'` pitfall
- `references/dashboard-blob-edge-runtime-2026-06-14.md` — edge runtime relative URL pitfall (relevant for `017` consumer)
- `references/dashboard-blob-storage-2026-06-14.md` — earlier Blob storage notes

## Sibling Features

- `017-dashboard-blob-read-path` — consumer of this layout
- `018-dashboard-order-status-tracking` — adds `status` field to order blobs
- `019-dashboard-coverage-invalidation-refunds-perishables` — adds `stale`/`staleReason` to coverage blobs, invalidation trigger, shelf-life, perishable "Use today" panel, manual override
- `020-dashboard-grocy-pantry-coverage` — adds `source: "grocy"` to `matched_items`
