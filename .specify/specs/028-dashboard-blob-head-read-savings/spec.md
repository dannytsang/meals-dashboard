---
name: dashboard-blob-head-read-savings
description: "Replace two `list({prefix: path})` Vercel Blob SDK calls in `lib/blob-storage.ts:readPointer` and `readManifest` with `head(path)` calls. Saves 2 Vercel Blob Advanced Operations per meals-check sync by downgrading the pointer-and-manifest reads from Advanced to Simple Operations. The `readJsonBlob` common path (used by coverage invalidation) is intentionally NOT changed — same SDK call shape, same blast radius, minimal reviewer surface. 6 functional requirements, 3 non-functional requirements, 1 key entity (one existing module: `lib/blob-storage.ts`). No new dependencies, no new env vars, no schema changes."
---

# Feature Specification: Dashboard Blob `head()` Read Savings

Feature ID: `028-dashboard-blob-head-read-savings`

Feature Name: Dashboard Blob `head()` Read Savings

Target Skill: `data-science/meals-check`

Created: 2026-06-18

Status: Final

Change history: CHANGELOG.md

## Background

Each meals-check sync run costs Vercel Blob advanced operations to write the split-layout payload (orders, coverage, summary, product blobs, products manifest, main manifest, pointer). On 2026-06-18, Danny asked whether the product metadata writes are the dominant cost. They aren't — the real cost reduction opportunity is in the **read** path: every sync begins with two `list()` calls (`lib/blob-storage.ts:62` `readPointer` and `lib/blob-storage.ts:68` `readManifest`) that look up the pointer and current manifest blobs.

Vercel Blob SDK (`@vercel/blob@2.4.0`) exposes both `list({prefix})` and `head(pathname)` for reading blob metadata. Per Vercel's pricing page (`https://vercel.com/docs/vercel-blob/usage-and-pricing`):

> **Simple Operations**: Counts when a blob is accessed by its URL and it's a cache MISS or when using the `head()` method.
> **Advanced Operations**: Counts when using `put()`, `copy()`, or `list()` methods.

Hobby tier includes 10K simple ops/month and only 2K advanced ops/month. Over-allowance is $0.40 per 1M simple vs $5.00 per 1M advanced — **`head()` is 12.5× cheaper** than `list()`.

### Why the swap is safe

`readPointer` and `readManifest` both know the **exact** blob pathname they want to read:

- `readPointer` → `POINTER_PATH` = `'pointers/latest.json'` (constant, line 19)
- `readManifest(manifestPath)` → caller passes the manifest path that came from the pointer (e.g. `'meta/manifest-8acaeb57…fe00a60.json'`)

For these cases, `list({prefix: path})` is the wrong tool. The current code does `list`, then filters `blobs.blobs.find((b) => b.pathname === path)` to pick the single match, then calls `fetch(match.url)` to get the content. `head(path)` returns the same `{url, pathname, ...}` metadata directly with **no list scan**, then we still `fetch(headResult.url)` for the body — same two network calls as today, but the lookup is `head()` (Simple) instead of `list()` (Advanced).

### What this spec does NOT do

- **Does not change `readJsonBlob`.** The common read path (`lib/blob-storage.ts:79`) is used by `invalidateCoverageForOrder` (coverage invalidation), `syncDashboardLayout` (dry-run path), and tests. It accepts an arbitrary pathname, and the `list({prefix})` call there is the right tool — Vercel's `list()` is the only way to search by prefix when the caller doesn't know the exact path. Extending `head()` to `readJsonBlob` is a separate decision (deferred — see Open Question 1).
- **Does not change the `BlobStorageClient` interface.** The interface stays source-of-truth-clean; only the production implementation changes. The in-memory test client has its own internal map and doesn't call any SDK method.
- **Does not change the pointer or manifest blob shapes.** Schema unchanged. No data migration.
- **Does not add a new env var, dependency, or runtime cost.** Pure SDK method swap within existing code paths.
- **Does not introduce a Route Handler, server action, or new Vercel Function.** The change is server-side in the existing `/api/dashboard-sync` route handler at `app/api/dashboard-sync/route.ts`.

## User Scenarios

### US1 (P1) — Danny wants reduced Vercel Blob cost on every sync

As Danny, I want each meals-check sync run to cost fewer Vercel Blob Advanced Operations, so my monthly Vercel bill stays within the Hobby tier's included 2K advanced ops/month quota when the schedule is busy.

### US2 (P1) — Danny wants the change to ship without behavioural drift

As Danny, I want the pointer-and-manifest reads to remain functionally identical (same blob content returned, same null-vs-value semantics on miss), so the sync pipeline behaves exactly as before and the dashboard renders unchanged data.

### US3 (P2) — Danny wants production verification before promotion to Final

As Danny, I want the spec to ship as Proposed on the implementation commit, and only flip to Final after observing Vercel function logs on the production deploy showing `list()` calls dropping from 2 to 0 in the `/api/dashboard-sync` route, so the cost saving is empirically verified before the spec is marked Final.

## Functional Requirements

### Core behaviour

- **FR-001**: `VercelBlobStorageClient.readPointer()` MUST call `head('pointers/latest.json', { token })` instead of `list({ prefix: 'pointers/latest.json', token })`. The `find(b => b.pathname === path)` filter step is removed because `head()` returns the single matching blob directly.

- **FR-002**: `VercelBlobStorageClient.readManifest(manifestPath)` MUST call `head(manifestPath, { token })` instead of `list({ prefix: manifestPath, token })`. The `find(b => b.pathname === path)` filter step is removed. The caller passes the exact manifest path (no list scan needed).

- **FR-003**: Both methods MUST keep the existing two-step read pattern: `head()` returns metadata (`url`, `pathname`, etc.), then `fetch(headResult.url, { headers: Authorization: Bearer *** token })` retrieves the body. The `head()` step replaces the `list()` step; the `fetch()` step is unchanged.

- **FR-004**: Both methods MUST preserve the existing null-on-miss semantics: when the blob does not exist, `head()` returns `null` (per `@vercel/blob@2.4.0` source: `if (response.status === 404) return null;`). The methods return `null` for non-existent blobs without throwing.

- **FR-005**: Both methods MUST preserve the existing malformed-manifest defensive validation: `readPointer` returns `null` if the JSON has no `manifestPath` string field; `readManifest` returns `{}` if the JSON is not an object or contains non-string values. These guards run after `fetch()`, unchanged from today.

- **FR-006**: `VercelBlobStorageClient.readJsonBlob()` MUST remain unchanged. The `list({prefix: path})` call stays because `readJsonBlob` accepts arbitrary pathnames from callers (e.g. coverage invalidation reads paths that come from the manifest, not from a known constant).

### Non-functional

- **NFR-001**: The implementation MUST be a minimal-diff change — only the `list()` call inside `readPointer` and `readManifest` is replaced. No other lines in `lib/blob-storage.ts` change. The `InMemoryBlobStorageClient` (test fixture) is unchanged because it never calls the Vercel SDK.

- **NFR-002**: The implementation MUST pass the existing vitest suite for `lib/blob-storage.test.ts` AND the broader `lib/dashboard-sync.test.ts` suite without modification to test fixtures (the in-memory client interface is the same). New tests in Phase 3 below assert `head()` is called and `list()` is NOT called.

- **NFR-003**: The implementation MUST NOT add a new dependency, new env var, new runtime cost, new Vercel Function, or new Route Handler. The change is purely a method-swap inside an existing file.

## Key Entities

### Module — `lib/blob-storage.ts` (MODIFIED)

Two methods of `VercelBlobStorageClient` change:
- `readPointer()` (line 62-66) — `list()` → `head()`
- `readManifest(manifestPath)` (line 68-77) — `list()` → `head()`

No new types, no new interfaces, no new fields. The `BlobStorageClient` interface (line 31-47) is unchanged. The `InMemoryBlobStorageClient` (line 165-233) is unchanged.

### Module — `lib/blob-storage.test.ts` (MODIFIED — additive only)

New vitest cases added; existing cases unchanged. Cases assert:
- `vi.mock('@vercel/blob', ...)` exposes a `head` mock
- `readPointer()` calls `head` exactly once with `'pointers/latest.json'`
- `readPointer()` calls `list` exactly zero times
- `readManifest(manifestPath)` calls `head` exactly once with the passed path
- `readManifest(manifestPath)` calls `list` exactly zero times
- `readJsonBlob()` still calls `list` exactly once (regression guard for FR-006)

## Promotion Criteria for Final

The spec ships as Proposed on the implementation commit. Promotion to Final requires ALL of the following verified in the production environment:

1. The commit is on `origin/main` AND Vercel production deploy succeeded (auto-deploys on push to `main`).
2. A real meals-check sync run has been triggered in production (via the email monitor cron or the manual `/meals` Telegram slash command) AFTER the production deploy.
3. Vercel function logs for `/api/dashboard-sync` on the post-deploy run show **zero `list()` calls** in the route handler's invocation path. (The route calls `syncDashboardLayout`, which calls `readPointer` and `readManifest`. Both now use `head()`. A grep of the function logs for the run should find no `list` references that came from these two methods.)
4. The run produced a valid manifest path in the route's response (`manifestPath` field in the JSON body), confirming `head('pointers/latest.json')` succeeded and the pointer was read.
5. The dashboard at `https://meals-dashboard.vercel.app` renders the latest data without errors after the production deploy, confirming `head()` returned the same content shape as the prior `list()` implementation.
6. Vercel's Blob Usage dashboard shows the post-deploy sync run consuming 2 fewer Advanced Operations than the pre-deploy baseline (the two `list()` calls that became `head()` calls).

Items 1, 4, 5 can be checked from the route response + dashboard render. Items 2, 3, 6 require Danny's observation against the live Vercel environment and cannot be checked in this session.

If items 1-6 are all confirmed, the spec is promoted to Final per the spec-driven-skills workflow: `spec.md` line 18 (`Status: Proposed` → `Status: Final`), `index.yaml` `status: Proposed` → `status: Final`, and a new CHANGELOG.md Rev 2 entry recording the production evidence.

If production observation fails (e.g. `head()` returns null when `list()` would have returned a match, or the manifest fetch 403s), revert the commit on `main` via `git revert` and leave the spec at Proposed with a CHANGELOG note recording the rollback reason. Spec 028 stays Proposed indefinitely in that case.

## Open Questions

1. **Should `readJsonBlob` also use `head()`?** It's tempting to extend the swap to the common read path (saves 1+ `list()` per coverage-invalidation run). The catch: `readJsonBlob` is called from many places, including some that pass arbitrary paths from runtime data (not constants). For a constant known at call time, `head()` works; for an arbitrary path, `list({prefix})` is still needed. A future spec could refactor `readJsonBlob` to detect constant paths and route to `head()`, but that's mixed-concerns drift — leave for a separate spec if Danny wants it.

2. **Should we add a `head`-based fallback when `list()` returns an empty result?** Today, if `list({prefix: 'pointers/latest.json'})` returns `[]` (no blobs match), the `find()` returns `undefined`, and `readPointer` returns `null`. With `head()`, a 404 returns `null` directly. Behaviour is identical, but worth verifying in production that the `head()` 404 path produces the same downstream effect (no pointer → initial sync path).

## Risks

- **Risk: `@vercel/blob` API surface change in a future SDK version.** `head()` was added in an earlier version and the d.ts signature is stable in 2.4.0, but if a future major release changes the return shape (e.g. returns a discriminated union instead of a plain object), the production client breaks silently because TS only catches it at build time, not at runtime if `node_modules` is rebuilt. **Mitigation**: `npm ls @vercel/blob` in CI catches version drift; production deploy will fail `npx tsc --noEmit` if the d.ts changes incompatibly.

- **Risk: `head()` 404 vs `list()` empty-array semantic divergence on a misconfigured store.** If `BLOB_READ_WRITE_TOKEN` is invalid, both `head()` and `list()` throw auth errors. If the store doesn't exist, both throw `BlobStoreNotFoundError`. The 404 path is exercised when the blob genuinely doesn't exist (initial sync). No known edge case where the two diverge. **Mitigation**: AS-005 (scenarios.yaml) exercises the initial-sync null path explicitly.

- **Risk: Vercel pricing change.** If Vercel reclassifies `head()` from Simple to Advanced Operations in a future pricing update, the savings vanish. **Mitigation**: the cost reduction is verified empirically (Vercel Usage dashboard item 6); if the reclassification happens, the spec stays Proposed until the swap's value is reassessed.

- **Risk: implementation lands on production but is silently bypassed by Next.js module cache.** Serverless function cold starts load `lib/blob-storage.ts` fresh; warm starts may cache the prior version's module. **Mitigation**: the sync is invoked by the email monitor cron ~once per hour (per spec 005), so any warm-cache window is at most one hour. A second sync run within that window will use the warm cache; a third sync run after the next cold start will use the new module. The first run after the production deploy may use the old code; the second run is the test target. Item 2 in Promotion Criteria accounts for this — observation must happen on a sync run AFTER the cold start.

## Relationship to Other Specs

- **Spec 016 (`016-dashboard-blob-storage-layout`)** — established the pointer/manifest blob layout that this spec reads from. No schema change here.
- **Spec 017 (`017-dashboard-blob-read-path`)** — established `lib/dashboard-data.ts:lib/dashboard-data.ts:getDashboardData`, which composes pointer → manifest → data blobs. Not modified by this spec; the read composition shape is unchanged.
- **Spec 021 (`021-dashboard-product-enrichment-tesco-apollo`)** — unrelated to the read path; product blobs are written, not read from the pointer/manifest reads.
- **Spec 027 (`027-dashboard-firecrawl-search-fallback`)** — unrelated. Spec 027 touches `scripts/sync-dashboard-data.py` (Python sync) and `lib/dashboard-ui-utils.ts` (dashboard read composition); spec 028 touches only `lib/blob-storage.ts` (server-side blob storage client).

## Verification Plan

### Local verification (in-session)

1. `npx tsc --noEmit` — TypeScript clean
2. `npx vitest run lib/blob-storage.test.ts -v` — all existing tests pass + the new Phase 3 tests pass
3. `npx vitest run lib/dashboard-sync.test.ts -v` — regression check on sync pipeline tests (the interface didn't change but the swap could surface an integration bug)
4. `npm run build` — full Next.js build succeeds
5. `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — spec validator clean

### Production verification (post-deploy, by Danny)

1. Trigger a meals-check sync run via the email monitor cron (wait for the next Tesco order email) OR via the manual `/meals` slash command.
2. Open the Vercel dashboard for the production deployment → Logs → filter to `/api/dashboard-sync`.
3. Verify the run's log entries show `head()` calls (not `list()`) for the pointer and manifest lookups.
4. Verify the run's response JSON contains a valid `manifestPath` field.
5. Open `https://meals-dashboard.vercel.app` → confirm the dashboard renders normally.
6. Open Vercel dashboard → Storage → Blob → Usage → confirm the run consumed fewer Advanced Operations than the prior baseline.

If items 1-6 are confirmed, promote spec to Final per the Promotion Criteria block.
