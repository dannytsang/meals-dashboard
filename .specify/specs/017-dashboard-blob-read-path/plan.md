# Implementation Plan: Dashboard Blob Read Path

Status: Proposed
Feature: 017-dashboard-blob-read-path
Skill: data-science/meals-check

## Summary

Plan for the dashboard's read path that consumes the storage layout defined by `016-dashboard-blob-storage-layout`. The dashboard server-side data boundary (from `015-dashboard-oidc-authentication`) is the implementation target. The read path fetches `pointers/latest.json` → manifest → referenced data blobs in parallel, lazy-loads coverage blobs for the visible two-week window, and falls back to null/empty state when any blob is missing or unreachable.

This feature is a downstream consumer of `016`. It does not own the storage layout itself.

## Technical Context

- Dashboard repo: `/home/hermes/workspace/meals-dashboard`
- Read-path file: `lib/dashboard-data.ts` (existing server-side data boundary from `015-dashboard-oidc-authentication`)
- Vercel Blob SDK: `@vercel/blob` (already in `package.json`)
- Next.js runtime: Node.js server (forced by `export const runtime = 'nodejs'` in `app/page.tsx`)
- Vercel Blob token: `BLOB_READ_WRITE_TOKEN` (owned by the dashboard server)

## Constitution Check

- Raw report is the product: Pass — read path does not change Telegram raw report delivery.
- Observable pipeline behaviour beats guesswork: Pass — SC-02 requires measurable load-time target.
- Runtime state is declared, not committed: Pass — Blob reads are server-side, no client bundling.
- Production side effects are bounded: Pass with caution — read path has no production side effects, but must not expose Blob URLs to the client (per `015`).

## Scope

In scope:
- `lib/dashboard-data.ts` updated to read pointer → manifest → data blobs
- Parallel fetches for manifest, summary, and visible-window coverage blobs
- Composing data from two delivery windows in the same render
- Missing-blob fallback to null/empty state
- TypeScript type safety for manifest schema and composed data

Out of scope:
- Storage layout itself → `016-dashboard-blob-storage-layout`
- Status / cancellation / refund fields on order blobs → `018`
- `stale` / `staleReason` / `source` fields on coverage blobs → `019`, `020`
- Dashboard UI changes beyond the read path

## Scenario Coverage Matrix

- Positive: dashboard reads pointer → manifest → 2 order blobs + coverage window → renders → SC-01
- Positive: two delivery windows in visible two-week → compose items, render markers → SC-01
- Boundary: single blob missing → fall back to null/empty, no crash → SC-03
- Performance: pointer + manifest + 2 data blobs in < 2s → SC-02
- Privacy: no blob fetch in client bundle, no Blob URLs in HTML → SC-04
- Integration-isolated: works with `015` server-side data boundary → FR-007

## Implementation Approach

1. Update `lib/dashboard-data.ts`:
   - Fetch `pointers/latest.json` first to get the manifest path
   - Fetch manifest blob in parallel with the `meta/summary-*` blob (resolve summary path via manifest entries)
   - Fetch only coverage blobs for the visible 14-day window in parallel
   - Fetch the relevant `orders/{date}/{num}.json` blobs
   - Compose into the existing `DashboardData` shape (or a thin superset thereof)
   - On any fetch error, return null/empty for that portion

2. Add TypeScript types for the manifest schema and the composed `DashboardBlobData` shape.

3. Add tests:
   - Unit test for the read path: pointer read, manifest read, blob composition
   - Test for the two-delivery-window composition
   - Test for the missing-blob fallback
   - Test for static-bundle privacy (no blob URLs, no private data)

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Slow sequential fetches | Fetch pointer → then in parallel: manifest, summary, 2 coverage blobs, current order blob |
| Missing blob crashes page | Catch per-blob errors, return null/empty for that portion, render the rest |
| Blob URL exposed in client bundle | All fetches happen server-side via `@vercel/blob` SDK; the existing `scan-static-private-data.mjs` check enforces no private data in client chunks |
| Two delivery windows in one render | Compose items from both `orders/{date}/{num}.json` blobs; render delivery markers for both |
| `BLOB_READ_WRITE_TOKEN` not injected at edge | `app/page.tsx` already forces `runtime = 'nodejs'`, so the token is available |
| Serverless function cold start latency | < 2s budget per SC-02. Pointer + manifest are tiny (~1KB total); data blobs are < 5KB each. Should fit. |

## Verification

Required before promoting to Final:
- `npm test -- --run` passes, including new read-path tests
- `npx tsc --noEmit` clean
- `npm run build` clean
- `npm run scan:static-private-data` clean
- Dashboard renders correctly when served from the split blob layout (against a populated Blob store)
- Dashboard renders correctly when served from a single-blob fallback (against the old `dashboard-data.json`) — regression guard
- Dashboard renders without crashing when one referenced blob is missing
- Page load time < 2s for typical connection
- Commit + push to meals-dashboard repo
- Trigger Vercel production deployment
- Smoke-test production dashboard

## Reference Documents

- `references/dashboard-blob-migration-2026-06-14.md` — Blob migration patterns
- `references/dashboard-blob-mode-folded-bug-2026-06-14.md` — `list()` `mode: 'folded'` pitfall
- `references/dashboard-blob-edge-runtime-2026-06-14.md` — edge runtime relative URL pitfall
- `015-dashboard-oidc-authentication` — server-side data boundary this feature respects
- `016-dashboard-blob-storage-layout` — storage layout this feature consumes

## Sibling Features

- `016-dashboard-blob-storage-layout` — producer of the storage layout
- `018-dashboard-order-status-tracking` — adds `status` field to order blobs (read path must surface status badges)
- `019-dashboard-coverage-invalidation-refunds-perishables` — adds `stale`/`staleReason` fields
- `020-dashboard-grocy-pantry-coverage` — adds `source` field on `matched_items`
