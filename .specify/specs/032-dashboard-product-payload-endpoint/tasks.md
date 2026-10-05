# Tasks: Dashboard Product Payload Endpoint and Split Full Sync

**Input**: `.specify/specs/032-dashboard-product-payload-endpoint/spec.md`

## Phase 1: Draft authoring

- [x] T001 Write `spec.md`
- [x] T002 Write `plan.md`
- [x] T003 Write `tasks.md`
- [x] T004 Write `CHANGELOG.md`
- [x] T005 Add entry to `.specify/specs/index.yaml`
- [x] T006 Update `skill.spec.yaml` expected artifacts
- [x] T007 Validate the spec repository after refinement

## Phase 2: Contract implementation

- [x] T010 Add `app/api/dashboard-products-sync/route.ts`
- [x] T011 Make `app/api/dashboard-sync/route.ts` reject product payloads
- [x] T012 Split `scripts/sync-dashboard-data.py` into two ordered POST calls
- [x] T013 Update `scripts/backfill_tesco_product_metadata.py` to call the product endpoint directly
- [x] T014 Add unit tests for pointer preservation and write isolation
- [x] T015 Add pipeline tests for dashboard-first/product-second ordering
- [x] T016 Add backfill tests for product-only publishing from a cache snapshot
- [ ] T017 Verify on preview and production
