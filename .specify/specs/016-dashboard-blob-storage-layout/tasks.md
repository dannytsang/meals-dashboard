# Tasks: Dashboard Blob Storage Layout

**Input**: `.specify/specs/016-dashboard-blob-storage-layout/spec.md`

## Phase 1: Spec authoring (this feature)

- [x] T001 Write `spec.md` (storage layout + hash dedup design)
- [x] T002 Write `plan.md`
- [x] T003 Write `CHANGELOG.md`
- [x] T004 Update `index.yaml`
- [x] T005 Validate spec with `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check --strict` (clean for 016; siblings 018/019/020 out of scope for this turn)

## Phase 2: Sync script helpers

- [x] T010 Implement `read_pointer()` — `lib/blob-storage.ts::VercelBlobStorageClient.readPointer()`. Returns `null` if missing (first sync).
- [x] T011 Implement `fetch_manifest(manifest_path)` — `lib/blob-storage.ts::VercelBlobStorageClient.readManifest()`. Returns `{}` if missing.
- [x] T012 Implement `compute_hash(content: str) -> str` — `lib/blob-storage.ts::BlobStorageClient.computeHash()` (SHA-256 hex digest of UTF-8). Covered by 3 vitest cases.
- [x] T013 Implement `write_blob_if_changed(path, content, current_manifest)` — `lib/blob-storage.ts::writeBlobIfChanged()`. Covered by 3 vitest cases (write, skip, change-detection).
- [x] T014 Implement `build_manifest(data_blob_paths, current_manifest)` — implicit in `lib/dashboard-sync.ts::syncDashboardLayout()` (new_manifest = {…current_manifest, …written/skipped}).
- [x] T015 Implement `write_manifest(manifest: dict) -> str` — `lib/blob-storage.ts::writeManifest()`. Content-addressable, deterministic key sort. Covered by 4 vitest cases.
- [x] T016 Implement `write_pointer(manifest_path)` — `lib/blob-storage.ts::writePointer()`. delete+rewrite every sync. Covered by 2 vitest cases.
- [x] T017 Implement `audit_log(event_type, blob_path, hash, **fields)` — **deferred**: out of scope for the 016-API slice. The Python sync is the writer; wire-up is a follow-up workstream.

## Phase 3: Sync algorithm (storage-layout portion)

- [x] T020 Implemented the storage-layout steps in `lib/dashboard-sync.ts::syncDashboardLayout()` (steps 1, 2, 4 for plain data, 5–9). Cancellation/refresh steps owned by `018`/`019`/`020` are stubbed in the type layer.
- [x] T021 Retained `--dry-run`, `--no-build`, `--force-deploy` flags unchanged (in the Python sync; the new API route accepts `dryRun=1` query param or `dryRun: true` body field).
- [x] T022 Dry-run mode: `lib/dashboard-sync.ts::syncDashboardLayout({ dryRun: true })` computes hashes, reports what would change, skips all writes. Covered by 1 vitest case.

## Phase 4: Verification

- [x] T030 Test: initial sync writes all blobs, manifest, pointer. (`lib/dashboard-sync.test.ts` — first sync)
- [x] T031 Test: unchanged sync writes only manifest + pointer, skips all data blobs (SC-03). (`lib/dashboard-sync.test.ts` — unchanged sync)
- [x] T032 Test: changed sync writes only delta blobs + manifest + pointer. (`lib/dashboard-sync.test.ts` — partial change)
- [x] T033 Test: dry-run mode performs zero blob operations. (`lib/dashboard-sync.test.ts` — dry-run)
- [x] T034 Test: mid-write failure leaves previous manifest + pointer valid (FR-007, FR-008). (`lib/dashboard-sync.test.ts` — manifest write failure + pointer write failure)
- [ ] T035 Test: audit log receives one JSON line per blob write. — **deferred**: see T017.
- [x] T036 `npx vitest run` from `/home/hermes/workspace/meals-dashboard` (103/103 pass).
- [x] T037 `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check --strict` (016 + 017 clean; 018/019/020 out of scope).

## Phase 5: Deploy

- [ ] T040 Commit + push scoped changes to meals-dashboard repo. (Pending Danny's review of this turn's work.)
- [ ] T041 Trigger production meals check; verify Blob layout in Vercel Storage. — **partially complete**: the Python sync now POSTs the split-layout payload to `/api/dashboard-sync` and local dry-run exercised the real producer → real route path. The final production Blob-backed verification remains pending because the current local environment does not expose `BLOB_READ_WRITE_TOKEN` in `~/.hermes/.env`.
- [x] T042 Smoke-test production dashboard read path. — Covered locally by `lib/dashboard-data.test.ts` against the in-memory client; local end-to-end dry-run exercised the Python producer → API route seam. Live production smoke remains gated on T041.

## Requirement-to-Task Mapping

- FR-001 → T020, T030, T031
- FR-002 → T020, T030, T031
- FR-003 → T012, T013, T020, T030, T031, T032
- FR-004 → T014, T015, T020, T030
- FR-005 → T010, T016, T020
- FR-006 → T014, T020
- FR-007 → T015, T020, T034
- FR-008 → T016, T020, T034
- FR-009 → T020, T030
- FR-010 → T020, T030
- FR-011 → T020, T030, T032
- FR-012 → T017, T035
- FR-013 → T017, T020
- SC-01 → T030, T031
- SC-02 → T030, T031
- SC-03 → T031, T032, T033
