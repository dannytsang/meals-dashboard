# Tasks: Dashboard Blob No-op Sync Suppression

Feature ID: `030-dashboard-blob-noop-sync-suppression`

Status: Final

## Phase 0 — Spec approval

- [x] T001 Danny reviews and approves the no-op sync write-suppression scope.
- [x] T002 Promote the spec directly to Proposed because Danny said "Go ahead" after reviewing the recommended scope.

## Phase 1 — Sync-result contract

- [x] T003 Add explicit no-op suppression metadata to `SyncResult` or equivalent route response.
- [x] T004 Keep existing `manifestPath`, `manifestHash`, `writtenPaths`, `skippedPaths`, and `isInitialSync` semantics compatible.

## Phase 2 — Deterministic manifest comparison

- [x] T005 Refactor or add helper logic to compute the deterministic manifest content, hash, and path before writing.
- [x] T006 Normalise current and computed `productsManifestPath` values so `undefined` and `null` compare consistently.
- [x] T007 Detect a true no-op only when pointer exists, manifest state was read, no data/product/products-manifest blobs were written, and both pointer targets are unchanged.

## Phase 3 — Write suppression

- [x] T008 Suppress `writeManifest()` and `writePointer()` for true no-op syncs.
- [x] T009 Preserve manifest + pointer writes for changed data.
- [x] T010 Preserve manifest + pointer writes for changed products-manifest paths.
- [x] T011 Preserve manifest + pointer writes for missing pointer, initial sync, or missing/unreadable manifest recovery.
- [x] T012 Preserve dry-run side-effect-free behaviour.

## Phase 4 — Tests

- [x] T013 Add a true no-op suppression test with spies proving `writeManifest()` and `writePointer()` are not called.
- [x] T014 Add changed-data publication test proving writes still happen.
- [x] T015 Add changed-products-manifest publication test proving pointer updates still happen.
- [x] T016 Add missing-pointer bootstrap test proving writes still happen.
- [x] T017 Add missing-manifest recovery test proving writes still happen.
- [x] T018 Add dry-run regression coverage.

## Phase 5 — Verification

- [x] T019 Run targeted dashboard sync tests.
- [x] T020 Run `npx tsc --noEmit`.
- [x] T021 Run `npx next build` if route/result typing changed.
- [x] T022 Run `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.

## Phase 6 — Deployment / Final gate

- [x] T023 Deploy implementation to preview for Danny review.
- [x] T024 Deploy to production after approval.
- [x] T025 Capture production evidence that a no-op sync suppresses manifest/pointer writes.
- [x] T026 Capture production evidence that a changed sync still publishes and dashboard renders normally.
- [x] T027 Promote spec to Final only after production evidence is recorded.
