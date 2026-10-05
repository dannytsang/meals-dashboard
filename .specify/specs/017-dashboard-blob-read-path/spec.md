---
name: dashboard-blob-read-path
description: "Dashboard read path consuming the split Blob storage layout from 016: pointer → manifest → data blobs, lazy loading of coverage blobs for the visible two-week window, missing-blob fallback to null/empty state without crashing."
---

# Feature Specification: Dashboard Blob Read Path

Feature ID: `017-dashboard-blob-read-path`

Feature Name: Dashboard Blob Read Path

Target Skill: `data-science/meals-check`

Created: 2026-06-15

Status: Final

Change history: CHANGELOG.md

Input: Original 016-dashboard-blob-storage-layout Draft (2026-06-14) US4 — Dashboard Reads From Split Blobs. After review, the original 016 was split per the spec governance rule (one user story per feature, meaningful IDs only). This feature owns the dashboard's read path that consumes the storage layout defined by `016-dashboard-blob-storage-layout`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Dashboard Reads From Split Blobs (Priority: P2)

As Danny, I want the dashboard to continue functioning correctly after the storage split, reading the same data it reads today but from the split blob layout.

**Independent Test**: Load the dashboard and verify all data (order total, delivery date, meal coverage, matched items) renders correctly when data is served from the split blob layout.

**Acceptance Scenarios**:
1. **Given** the dashboard loads, **When** it fetches data, **Then** it reads `pointers/latest.json` first to get the manifest path, fetches the manifest, then fetches the referenced data blobs.
2. **Given** any referenced blob is unavailable or returns an error, **When** the dashboard renders, **Then** it falls back to null/empty state for the missing portion without crashing the page.
3. **Given** the dashboard renders the meal grid for a two-week window, **When** the window spans two delivery cycles, **Then** it correctly fetches and composes data from two different `orders/` blobs via the manifest.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard's data-reading path (`lib/dashboard-data.ts`) MUST read `pointers/latest.json` first to get the manifest path, then fetch the manifest blob, then fetch the referenced data blobs. It MUST NOT require fetching all historical blobs on every page load.

- **FR-002**: The dashboard MUST support lazy loading of coverage blobs: only blobs for dates within the visible two-week window need to be fetched on initial load. Past blobs outside the window MAY be fetched on demand.

- **FR-003**: If the manifest or any referenced data blob is unavailable or unreadable, the dashboard MUST fall back to null/empty state for the missing portion (not crash or error). `pointers/latest.json` is the critical dependency; if it is unreadable the dashboard should show empty state.

- **FR-004**: The dashboard MUST fetch the current `orders/{date}/{num}.json` blob for each delivery in the visible two-week window, compose their items, and surface them to the UI in the same shape the existing `latestOrder` consumer expects.

- **FR-005**: The dashboard MUST fetch the `meta/summary-{hash}.json` blob (or its content-addressable equivalent as recorded in the manifest) in parallel with the manifest fetch, so the `mealsCheckSummary` field is available without an extra round-trip. The summary blob is registered in the manifest under a `meta/summary-*` key; the read path resolves its current path by reading the manifest.

- **FR-006**: The dashboard MUST handle the case where two delivery windows are visible in the same two-week render (e.g. last delivery on day 1, next delivery on day 5) by composing the two order blobs' items and rendering delivery markers for both.

- **FR-007**: The dashboard MUST read private split projection data through the server-side data boundary established by `015-dashboard-oidc-authentication` — never import blob-fetching code into a client component, never expose Blob URLs to the browser.

### Contract Impact

- `skill.spec.yaml` changes required: No — this is a downstream consumer of the storage layout declared in `016-dashboard-blob-storage-layout`.
- `SKILL.md` changes required: No — the read path is owned by the meals-dashboard repo, not the meals-check skill.
- `004-dashboard-sync` relationship: This feature is the dashboard-side counterpart to the storage layout. `004-dashboard-sync` continues to own the sync script interface; this feature owns the consumer.
- Runtime state changes required: Yes — `lib/dashboard-data.ts` updated to read the new layout.
- Secrets/config changes required: No new secrets.
- Cron/hook changes required: No.

### Key Entities

- **DashboardBlobData**: The composed shape returned to the dashboard client. Same shape as today's `DashboardData`, but assembled from multiple blob fetches. Fields include `latestOrder`, `coverage`, `mealsCheckSummary`, `deliveryWindows`, plus any future fields added by `018`/`019`/`020`.

- **Manifest Schema** (consumed): `Record<blobPath, sha256Hash>`. The dashboard treats this as an opaque map; it only uses the manifest to know which blob paths are current and to skip fetching unreferenced historical blobs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: The dashboard renders correctly (order total, delivery date, meal coverage, matched items) when served from the split blob layout.
- **SC-02**: Dashboard page load time is not significantly degraded by fetching multiple blobs vs. one (target: < 2s for pointer + manifest + 2 data blobs on typical connection).
- **SC-03**: When a single referenced data blob is missing/unreachable, the dashboard renders the remaining data without crashing and without an unhandled rejection.
- **SC-04**: The dashboard's compiled client chunks do not contain blob-fetching code or Blob URLs — verified by the existing `scripts/scan-static-private-data.mjs` check.

## Assumptions

- The dashboard repo `/home/hermes/workspace/meals-dashboard` is the implementation target.
- The existing `lib/dashboard-data.ts` server-side data boundary (from `015-dashboard-oidc-authentication`) is the place to wire the new read path.
- Vercel Blob fetches use `BLOB_READ_WRITE_TOKEN`; the dashboard server owns that token, the sync script does not.

## Out of Scope

- Storage layout itself → `016-dashboard-blob-storage-layout`
- Order status / cancellation / refund → `018-dashboard-order-status-tracking`
- Coverage invalidation / shelf-life / perishable / manual override → `019-dashboard-coverage-invalidation-refunds-perishables`
- Grocy pantry coverage → `020-dashboard-grocy-pantry-coverage`
- Changing the dashboard UI or data consumption patterns beyond the read path.

## Clarifications

### Session 2026-06-14 — Dashboard read path from split blobs

- Q: How does the dashboard know which blobs are current? → A: It reads `pointers/latest.json` (~50 bytes), which points at `meta/manifest-{hash}.json`. The manifest maps blob paths to SHA-256 hashes. The dashboard fetches the manifest, then fetches only the blobs it needs.
- Q: What if a blob is missing? → A: Fallback to null/empty state for that portion. The page must not crash.
- Q: Why fetch in parallel? → A: Sequential fetches compound latency. The manifest + summary + 2 data blobs should fetch in parallel after the pointer read.
- Q: Can the dashboard cache anything client-side? → A: Yes — the existing static-bundle privacy check ensures no private data is bundled. The dashboard can use SWR/React Query or similar for client-side caching of the assembled `DashboardData`, but the source of truth remains the server-side read path.

### Session 2026-06-15 — Split from 016-dashboard-blob-storage-layout

- Q: Why is the read path a separate feature? → A: The original 016 had two distinct concerns: storage layout (writes) and read path (reads). Each has its own acceptance scenarios, failure modes, and tests. Splitting them allows the read path to land independently of the storage layout migration, and allows the dashboard team to own the read path while the meals-check team owns the storage layout.
- Q: What about `004-dashboard-sync`? → A: `004-dashboard-sync` continues to own the sync script's interface (CLI flags, POST endpoint, Vercel deploy trigger). It references `016` for storage details. `017` is a downstream consumer of the storage layout.
