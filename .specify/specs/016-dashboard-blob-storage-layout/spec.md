---
name: dashboard-blob-storage-layout
description: "Foundational Vercel Blob layout for the meals dashboard: immutable per-order blobs, mutable per-day coverage blobs, SHA-256 content-hash manifest, minimal pointer, audit trail in local meals skill state. No versioned blobs in Blob storage."
---

# Feature Specification: Dashboard Blob Storage Layout

Feature ID: `016-dashboard-blob-storage-layout`

Feature Name: Dashboard Blob Storage Layout

Target Skill: `data-science/meals-check`

Created: 2026-06-15

Status: Final

Change history: CHANGELOG.md

Input: Original 016-dashboard-blob-storage-layout Draft (2026-06-14) covered five distinct user stories. After review it was split per the meals-check spec governance rule (one user story per feature, meaningful IDs only). This feature owns the foundational storage layout: append-only per-order blobs, mutable per-meal-date coverage blobs, content-hash manifest, minimal pointer, local audit log. Cancellation/refund/perishable/Grocy/manual-override behaviour is split out into sibling features `018`, `019`, `020`; dashboard read path into `017`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Immutable Historical Orders (Priority: P1)

As Danny, I want past Tesco orders to remain stored after their delivery date has passed, so that order history is available for reference and the sync pipeline does not overwrite historical data.

**Independent Test**: After two delivery cycles, list the blobs in the `orders/` prefix and verify that each delivery date has its own blob file with the correct order data.

**Acceptance Scenarios**:
1. **Given** a new Tesco order is received and processed by the pipeline, **When** the sync runs, **Then** a new blob is written to `orders/{delivery_date}/{order_number}.json` and is never overwritten by subsequent syncs.
2. **Given** a blob has been written to `orders/{date}/{id}.json`, **When** subsequent syncs run for different delivery dates, **Then** that blob remains unchanged and reachable.
3. **Given** the dashboard requests historical order data for a past delivery, **Then** the corresponding `orders/{date}/{id}.json` blob is retrievable and parseable.

### User Story 2 — Immutable Per-Meal Coverage Blobs (Priority: P1)

As Danny, I want each meal's coverage data to be stored independently per meal date, so that historical coverage can be reviewed and the sync pipeline does not lose past coverage states.

**Independent Test**: After two sync cycles, list blobs under `coverage/` and verify each meal date has its own blob.

**Acceptance Scenarios**:
1. **Given** a sync runs for a meal date, **When** coverage data is generated, **Then** a blob is written to `coverage/{date}.json` and is never overwritten.
2. **Given** a `coverage/{date}.json` blob exists and the same meal date is re-processed in a future sync, **When** the content has not changed, **Then** the blob is not re-uploaded (hash dedup skips it). **When** the content has changed, **Then** a new blob is written with updated content at the same path (overwritten in-place).
3. **Given** the dashboard renders the current week's meal grid, **Then** it fetches only the `coverage/` blobs for dates within the visible window.

### User Story 3 — Minimal Operations on Unchanged Data (Priority: P1)

As Danny, I want a sync with no data changes to write as little as possible, so that the Blob free-tier quota is consumed only by actual changes and the sync pipeline is cheap to run hourly.

**Independent Test**: Run two consecutive syncs with identical meal/receipt data. Count blob write operations on the second run. Expect: only manifest pointer update (~1KB, 2 blob ops). No order or coverage blobs should be written.

**Acceptance Scenarios**:
1. **Given** a sync runs on unchanged data, **When** it completes, **Then** only `meta/manifest-{hash}.json` and `pointers/latest.json` are written; all data blobs (orders, coverage) are skipped by hash dedup.
2. **Given** a sync runs on data where one meal has changed, **When** it completes, **Then** only the changed coverage blob and both manifest + pointer files are written; all other data blobs are skipped by hash dedup.
3. **Given** a sync runs on data where a new order has arrived, **When** it completes, **Then** the new order blob, new manifest, and pointer are written; all existing data blobs are skipped by hash dedup.
4. **Given** the sync encounters an error mid-write, **When** it retries or recovers, **Then** no partial blob overwrites occur; writes are atomic per blob and the previous manifest remains valid.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sync MUST write order blobs to `orders/{delivery_date}/{order_number}.json` where `{delivery_date}` is the Tesco actual delivery date and `{order_number}` is the order number. The blob is immutable once written. This feature is the storage-layout baseline; the `status` field used by `018-dashboard-order-status-tracking` is added in that sibling feature.

- **FR-002** (renamed to keep number continuity with parent spec): The sync MUST write per-meal-date coverage blobs to `coverage/{date}.json` where `{date}` is the meal date (ISO `YYYY-MM-DD`). Each coverage blob MUST contain a `sourceOrderBlobPath` field identifying which order blob's items were used to calculate coverage. Coverage blobs represent current state only; they are overwritten in-place when content changes. The `stale` / `staleReason` fields and audit-log append are added in `019-dashboard-coverage-invalidation-refunds-perishables`.

- **FR-003**: The sync MUST compute a SHA-256 hash of the serialised content of every data blob (order blobs, coverage blobs) before writing. A manifest blob at `meta/manifest-{hash}.json` MUST map each blob path to its content hash. Blob paths that already exist in the manifest with a matching hash MUST be skipped (not uploaded) on that sync run.

- **FR-004**: The manifest blob itself is content-addressable by its own SHA-256 hash. Its path is `meta/manifest-{sha256_of_manifest_content}.json`. This eliminates circular write dependencies: the manifest content determines its own path, so it can always be written after the data blobs without creating a write-order cycle.

- **FR-005**: `pointers/latest.json` is the sole lightweight pointer file. It MUST contain exactly one field: `"manifestPath": "meta/manifest-{hash}.json"`. It is the only blob that is deleted and rewritten on every sync. It is kept minimal (~50 bytes) so the rewrite cost is negligible. The previous-changelog refinement that placed `deliveryWindows` / `coverageWindow` / `summaryBlobPath` directly on the pointer was dropped at split-time in favour of a strictly minimal pointer: delivery-window metadata is composed in the read path from the order blobs referenced by the manifest, and `meta/summary.json` is itself a content-addressable manifest entry (see FR-013).

- **FR-006**: The sync script MUST include all active data blob paths (orders, coverage blobs for visible window) and their computed hashes in the manifest, regardless of whether they are being written or skipped. The manifest is the single source of truth for which blob versions are current.

- **FR-007**: The sync script MUST write the new manifest blob as the final step, after all data blobs have been written or skipped. If the manifest write fails, the previous manifest remains valid and the sync is considered incomplete.

- **FR-008**: The sync script MUST write `pointers/latest.json` last, after the manifest is written. If the pointer write fails but the manifest succeeded, the next sync will pick up the correct manifest on retry.

- **FR-009**: The sync script MUST preserve the full `latestOrder` receipt data (all items with name, quantity, price, substitution metadata) in the order blob.

- **FR-010**: Tesco product enrichment MUST run before writing the order blob, and enriched item data MUST be stored inside the order blob (not fetched separately at read time).

- **FR-011**: The sync MUST NOT delete any blob from storage as part of normal operation. Order blobs and manifest blobs are append-only (never deleted). Coverage blobs are overwritten in-place when content changes. Pointer blob is deleted and rewritten every sync. No other delete operations occur.

- **FR-012**: The meals skill MUST maintain a local audit log at `~/.hermes/scripts/data/audit.jsonl`. Every blob write event is appended as a JSON line to this local file (date, blob path, content hash, timestamp, event type). This local log is the version history and audit trail; blob storage holds only current state. The audit log MUST NOT be pushed to git or to Vercel Blob.

- **FR-013**: A mutable summary blob at `meta/summary-{hash}.json` (content-addressable, manifest-tracked like every other data blob) MUST store the latest `mealsCheckSummary` payload (coverage percentage, covered / missing / total / order_total, delivery_date). The summary is computed at sync time from the same per-meal coverage data the blobs already hold; it is the dashboard's pre-composed rollup so the client does not have to aggregate 14 days of coverage blobs on every page load. The summary blob is overwritten in-place when its content hash changes; unchanged summaries are skipped via the same hash-dedup mechanism used for order and coverage blobs. The dashboard read path fetches it in parallel with the visible-window coverage blobs (`017-dashboard-blob-read-path` FR-005).

### Contract Impact

- `skill.spec.yaml` changes required: Yes — add `016-dashboard-blob-storage-layout` to the features list.
- `SKILL.md` changes required: Yes — document the split blob storage layout, content-hash dedup, and the append-only invariant. Replace the previous 016-dashboard-blob-storage-layout line.
- `004-dashboard-sync` relationship: This feature is the storage-layout foundation referenced by `004-dashboard-sync`. `017-dashboard-blob-read-path` consumes the layout.
- Runtime state changes required: Yes — sync script implements hash manifest; new Vercel Blob paths.
- Secrets/config changes required: No new secrets. Blob store name and token remain the same.
- Cron/hook changes required: No.

### Key Entities

- **Order Blob**: `orders/{delivery_date}/{order_number}.json`. Contains the full `TescoReceipt` for that delivery. Immutable once written. Hash-deduped: skipped if hash matches manifest entry.

- **Coverage Blob**: `coverage/{date}.json`. Mutable — overwritten when content changes. Contains the coverage entry for one meal date. Schema:
  ```json
  {
    "date": "2026-06-14",
    "sourceOrderBlobPath": "orders/2026-06-16/5421-8594-00.json",
    "meals": [...],
    "matched_items": [...]
  }
  ```
  `stale`, `staleReason`, and `source` are added in `019-dashboard-coverage-invalidation-refunds-perishables` and `020-dashboard-grocy-pantry-coverage`.

- **Audit Log**: `~/.hermes/scripts/data/audit.jsonl`. The meals skill appends one JSON line per blob write event to this local file. This is the version history and audit trail. It is never pushed to blob storage or git.

- **Hash Manifest**: `meta/manifest-{hash}.json`. The manifest is content-addressable by its own SHA-256 hash. Contains:
  ```json
  {
    "orders/2026-06-16/5421-8594-00.json": "a3f7c2b1d4e5f6...",
    "coverage/2026-06-14.json": "b9d1e8c3f2a7...",
    "coverage/2026-06-15.json": "c4a2f1d8e3b6..."
  }
  ```
  Written as the final step of a successful sync (after all data blobs). Previous manifest blobs remain accessible by hash.

- **Pointer Blob**: `pointers/latest.json`. The only blob that is deleted and rewritten on every sync. Contains only:
  ```json
  { "manifestPath": "meta/manifest-a3f7c2b1d4e5f6..." }
  ```
  ~50 bytes. Written last, after the manifest is confirmed written.

- **Blob Layout**: The full path hierarchy under the Vercel Blob store:
  ```
  orders/
    {delivery_date}/
      {order_number}.json          ← immutable; status field added in 018
  coverage/
    {date}.json                    ← current coverage for that date (overwritten on change)
  meta/
    manifest-{hash}.json           ← previous manifests retained by hash (append-only)
    summary-{hash}.json            ← mutable pre-composed mealsCheckSummary (content-addressable)
  pointers/
    latest.json                    ← only mutable blob (delete + rewrite every sync)
  ```
  No versioned blobs in blob storage. Version history lives in `~/.hermes/scripts/data/audit.jsonl`.

## Sync Algorithm

The following sequence is the authoritative sync procedure (storage-layout portion only):

```
1. Read pointers/latest.json → get current manifest path
2. Fetch current manifest from blob (if exists) → current_manifest: {path: hash}
3. Build local data blobs (order, coverage for visible window)
4. For each local data blob:
     compute SHA-256 of content
     if path not in current_manifest OR current_manifest[path] != local_hash:
       write blob to storage
     else:
       skip (hash matches — blob already current)
5. Build new manifest dict:
     start from current_manifest
     update/add entries for all paths written or skipped in step 4
     (so skipped blobs remain in manifest with their existing hash)
6. Serialise new manifest as JSON → manifest_content
7. Compute SHA-256 of manifest_content → manifest_hash
8. Write manifest blob to: meta/manifest-{manifest_hash}.json
9. Write pointer blob: { "manifestPath": "meta/manifest-{manifest_hash}.json" }
   to pointers/latest.json (delete + rewrite)
```

Cancellation, refund, amendment, moved-order, shelf-life, and Grocy steps are added in sibling features `018`–`020` and run as additional pipeline stages before step 4.

The summary blob (`meta/summary-{hash}.json`) is written in the same data-blob pass as coverage and order blobs (step 4 of the algorithm) — it is just another content-addressable data blob tracked in the manifest.

**Key properties:**
- Step 4 skip means zero blob operations for unchanged data
- Step 5 ensures skipped blobs stay in the manifest (no stale tracking)
- Step 7–8: the manifest path is derived from its own content, so the path is known only after the content is serialised — no circular dependency
- Step 9: pointer written last; if it fails the manifest is already valid for next retry

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: After two sync cycles, `orders/` contains at least 2 distinct delivery-date directories with order blobs; no order blob has been deleted or overwritten.
- **SC-02**: After two sync cycles, `coverage/` contains one blob per meal date representing current state; coverage blobs are overwritten in-place when content changes.
- **SC-03**: A sync run with no data changes results in exactly 2 blob operations: one delete+rewrite of `pointers/latest.json` and one write of `meta/manifest-{hash}.json`. Zero data blobs (orders, coverage) are written. All other syncs result in data blob writes proportional to the actual change delta.

## Assumptions

- Vercel Blob is the storage target; same `BLOB_READ_WRITE_TOKEN` and `MEALS_DASHBOARD_DATA_SECRET` as the current 004-dashboard-sync baseline.
- SHA-256 is computationally infeasible to exploit for deliberate collision; acceptable for dedup.
- Hermes gateway runs on a single machine for any given sync; manifest lives in Blob so any subsequent run on a different machine picks up the current state via the pointer.

## Out of Scope

- Cancellation / moved-order / refund detection → `018-dashboard-order-status-tracking`
- Coverage invalidation, refund items, perishable "Use today" panel, manual override → `019-dashboard-coverage-invalidation-refunds-perishables`
- Grocy pantry as automatic coverage source → `020-dashboard-grocy-pantry-coverage`
- Dashboard read path / lazy loading → `017-dashboard-blob-read-path`
- Historical dashboard view (showing past orders/meals): deferred to a future feature.
- Audit log query UI: the `audit.jsonl` file is for debugging and future tooling only; no UI for querying it in this spec.
- Migrating existing `dashboard-data.json` blob data to the new layout: done manually or via a one-time migration script; not part of the sync pipeline.
- Changing the dashboard UI or data consumption patterns beyond the read path.

## Clarifications

### Session 2026-06-14 — Split storage rationale

- Q: Why not keep the single blob? → A: Every sync must delete and rewrite the entire blob. Historical data is lost. The free tier has 1,000 uploads/month — delete operations count separately and append-only writes are cheaper to reason about.
- Q: Why split orders and coverage? → A: Orders change only when a new delivery arrives (every ~3-4 days). Coverage changes daily as the meal plan is updated. Splitting them means a delivery-day sync only writes the new order blob + updates the manifest pointer; coverage blobs for unchanged meal dates are untouched.
- Q: What about the dashboard read path? → A: It reads the pointer (~50 bytes) first, then the manifest (~1KB), then fetches only the data blobs for the visible window in parallel. Past blobs outside the window are not fetched on initial load. Full read path is in `017-dashboard-blob-read-path`.
- Q: Does this change the sync script interface? → A: The sync script `--dry-run`, `--no-build`, `--force-deploy` flags remain unchanged. The POST endpoint and Vercel deploy trigger remain unchanged. Only the blob storage layout and write logic change.

### Session 2026-06-14 — Content-hash dedup with blob-stored manifest

- Q: Why not a local dedup cache file? → A: A local cache (e.g. `~/.hermes/scripts/data/blob_dedup_cache.json`) has a single point of failure — if Hermes runs on a different machine or the local state is lost, all subsequent syncs re-upload every blob as if they are new. A manifest stored in Blob storage is self-healing and portable across machines and sessions.
- Q: How does the manifest avoid circular write dependencies? → A: The manifest path is `meta/manifest-{SHA256_of_manifest_content}.json`. The path is derived from the content after serialisation, not before. So the sync: computes content → serialises → hashes → writes blob with path derived from hash. No path needs to be known before content is ready.
- Q: Why does the pointer exist if the manifest already tells us everything? → A: The manifest path encodes its own hash, which changes whenever any blob changes. The pointer is a stable, tiny, single-field file that changes every sync anyway. The dashboard could technically read the manifest directly, but having a dedicated pointer keeps the dashboard read path simpler and allows the manifest to remain a pure data artefact with no semantic coupling to the read path.
- Q: What happens if a manifest write fails but the data blobs succeeded? → A: The previous manifest remains valid. The next sync will detect no hash changes for data blobs (still in the old manifest), skip all data writes, recompute the same manifest content, and retry. No data is lost or duplicated.
- Q: What happens if the pointer write fails but the manifest succeeded? → A: The manifest is valid and contains all current blob hashes. The next sync will read the old pointer path, fetch the manifest successfully, detect no hash changes, and retry the pointer write. No data is lost.
- Q: How does hash dedup affect the initial sync (no manifest exists)? → A: The sync reads `pointers/latest.json` (fails/missing), builds all blobs, writes all blobs, computes manifest, writes manifest, writes pointer. First sync writes everything — this is correct and unavoidable for the initial state.
- Q: What does an unchanged second sync look like operationally? → A: Read pointer → fetch manifest (hit) → compute local hashes (all match manifest) → skip all data blobs → write new manifest (same content but new hash, so new path) → write pointer. Total: 2 blob ops (~1KB).

### Session 2026-06-15 — Split from 016-dashboard-blob-storage-layout

- Q: Why split the original 016 into 5 features? → A: The original Draft covered 5 user stories (immutable orders, immutable coverage, hash dedup, dashboard read path, cancellation/moved detection) plus later additions (refunds, perishable, manual override, Grocy). The spec-driven-skills governance rule is "one user story per feature, meaningful IDs only." Five distinct logical workstreams → five features: `016` storage layout, `017` dashboard read path, `018` order status tracking, `019` coverage invalidation/refunds/perishables/manual override, `020` Grocy pantry coverage.
- Q: What about the original 016 directory? → A: Closed as superseded. The original spec.md / plan.md / tasks.md / CHANGELOG.md are retained in the directory at the time of closure; future spec audits can still load them for historical context but the feature is no longer in the active spec list.
