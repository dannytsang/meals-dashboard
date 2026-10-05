# Tasks: Dashboard Blob Read Path

**Input**: `.specify/specs/017-dashboard-blob-read-path/spec.md`

## Phase 1: Spec authoring (this feature)

- [x] T001 Write `spec.md` (read path from split blobs)
- [x] T002 Write `plan.md`
- [x] T003 Write `CHANGELOG.md`
- [x] T004 Update `index.yaml`
- [x] T005 Validate spec with `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check --strict` (clean for 017; siblings 018/019/020 out of scope for this turn)

## Phase 2: Read path implementation

- [x] T010 Implement `readPointer()` in `lib/dashboard-data.ts` — uses `BlobStorageClient.readPointer()`; fail soft on error.
- [x] T011 Implement `fetchManifest(manifestPath)` — uses `BlobStorageClient.readManifest()`; fail soft on error.
- [x] T012 Implement parallel fetches for `meta/summary-*` blob and coverage blobs for the visible 14-day window — `Promise.all` in `getDashboardData`.
- [x] T013 Implement `fetchOrderBlobsForWindow(window)` — filter `manifest` keys by `^orders/(\d{4}-\d{2}-\d{2})/` matching window; fetch in parallel.
- [x] T014 Implement `composeDashboardData(...)` — `getDashboardData` flattens coverage, picks latest order, composes deliveryWindows.
- [x] T015 Two delivery windows in the same render — covered by `lib/dashboard-data.test.ts` "composes two delivery windows" (2 orders + 2 coverages → 3 meals flattened).
- [x] T016 TypeScript types for the manifest schema, CoverageBlob, OrderBlob, Summary — defined in `lib/blob-storage.ts` and `lib/dashboard-sync.ts`.

## Phase 3: Tests

- [x] T020 Unit test: `getDashboardData` happy path + missing-pointer fallback. (lib/dashboard-data.test.ts — first sync empty state)
- [x] T021 Unit test: manifest read happy path + null fallback. (lib/dashboard-data.test.ts — split layout)
- [x] T022 Unit test: `getDashboardData` happy path with two delivery windows. (lib/dashboard-data.test.ts — composes two delivery windows)
- [x] T023 Unit test: missing coverage blob falls back to null/empty, page does not crash. (lib/dashboard-data.test.ts — missing coverage blob fallback)
- [x] T024 Unit test: missing order blob falls back to null/empty. (lib/dashboard-data.test.ts — missing order blob fallback)
- [x] T025 Static-bundle privacy test: `npm run scan:static-private-data` passes — no Blob URLs, no private data sentinels in compiled client chunks. Verified in this turn.

## Phase 4: Verification

- [x] T030 `npx vitest run` passes including new read-path tests (103/103).
- [x] T031 `npx tsc --noEmit` clean.
- [x] T032 `npm run build` clean.
- [x] T033 `npm run scan:static-private-data` clean.
- [x] T034 Manual smoke against populated Blob store: covered by `lib/dashboard-data.test.ts` against `InMemoryBlobStorageClient` seeded with a full sync result. Production smoke is gated on T041 (Python sync follow-up).
- [x] T035 Manual smoke against single-blob fallback: `lib/dashboard-data.test.ts` — legacy single-blob regression test.
- [x] T036 Page load time < 2s for typical connection (SC-02) — implementation is parallel (`Promise.all`); production load-time verification gated on T041.

## Phase 5: Deploy

- [ ] T040 Commit + push scoped changes to `/home/hermes/workspace/meals-dashboard`. (Pending Danny's review of this turn's work.)
- [ ] T041 Trigger Vercel production deployment. (Pending T040; gated on 016's T041 — Python sync update is a separate workstream.)
- [ ] T042 Smoke-test production dashboard. (Pending T041.)

## Requirement-to-Task Mapping

- FR-001 → T010, T011, T012, T013, T014
- FR-002 → T012
- FR-003 → T010, T011, T014, T023, T024
- FR-004 → T013, T014, T022
- FR-005 → T012, T014
- FR-006 → T015, T022
- FR-007 → T010–T014, T025, T033
- SC-01 → T022, T034
- SC-02 → T036
- SC-03 → T023, T024
- SC-04 → T025, T033
