# Implementation Plan: Dashboard Blob `head()` Read Savings

Status: Proposed
Feature: 028-dashboard-blob-head-read-savings
Skill: data-science/meals-check
Revision: 1 (initial implementation)

## Summary

Replace the `list({prefix: path})` SDK call inside `VercelBlobStorageClient.readPointer` and `readManifest` with the equivalent `head(path)` SDK call. Saves 2 Vercel Blob Advanced Operations per meals-check sync run by downgrading the pointer-and-manifest reads from Advanced (`list()`) to Simple (`head()`) Operations. Per Vercel's pricing page, Simple Operations have 5× more included quota on the Hobby tier (10K/month vs 2K/month) and 12.5× cheaper over-allowance pricing ($0.40 per 1M vs $5.00 per 1M).

This plan records a bounded implementation slice that is already committed in meals-dashboard `3ccd76b` and locally verified in this session. The feature remains Proposed because production evidence for Final promotion is still outstanding. No new dependencies, no new env vars, no schema changes, no new modules.

## Technical Context

- **`lib/blob-storage.ts:62-66` `VercelBlobStorageClient.readPointer()`** — current implementation calls `list({ prefix: POINTER_PATH, token })`, filters `blobs.blobs.find((b) => b.pathname === POINTER_PATH)`, then `fetch(match.url, { headers: Authorization: Bearer *** )`. The replacement calls `head(POINTER_PATH, { token })` directly (no list scan, no filter step), then `fetch(headResult.url, { headers: Authorization: Bearer *** )` — same `fetch()` call as today, just different metadata source.
- **`lib/blob-storage.ts:68-77` `VercelBlobStorageClient.readManifest(manifestPath)`** — same shape as `readPointer`. The `manifestPath` argument comes from `PointerContents.manifestPath` returned by `readPointer()` (e.g. `'meta/manifest-8acaeb57…fe00a60.json'`), so it is the exact blob pathname — no list scan needed.
- **`lib/blob-storage.ts:79-93` `VercelBlobStorageClient.readJsonBlob(path)`** — NOT modified. Used by `invalidateCoverageForOrder` (coverage invalidation reads paths from the manifest), `syncDashboardLayout` (dry-run path), and tests. The `list({prefix: path})` call here is the right tool because the caller may pass an arbitrary path. FR-006 keeps this unchanged.
- **`@vercel/blob@2.4.0` SDK** — `head(urlOrPathname: string, options?: BlobCommandOptions): Promise<HeadBlobResult>` is verified to exist at `node_modules/@vercel/blob/dist/index.d.ts:121`. Returns `null` on 404 (verified at `node_modules/@vercel/blob/dist/index.js:172-173`).
- **`InMemoryBlobStorageClient` (line 165-233)** — test fixture. Does NOT call any Vercel SDK method. Its `readPointer` and `readManifest` implementations use the internal `store` map directly. **Not modified by this spec.**
- **Test mock surface** — `lib/blob-storage.test.ts` currently mocks `@vercel/blob` with `vi.mock('@vercel/blob', () => ({ put: vi.fn(), list: vi.fn(), del: vi.fn(), head: vi.fn() }))` or similar. New tests assert the mock call counts for `head` (1) and `list` (0) on each of the two paths.
- **`lib/dashboard-sync.ts:lib/dashboard-sync.ts:syncDashboardLayout`** — the consumer that calls `readPointer` and `readManifest`. Its `lib/dashboard-sync.ts:lib/dashboard-sync.ts:174` line `await client.readPointer()` and `lib/dashboard-sync.ts:lib/dashboard-sync.ts:175` line `await client.readManifest(pointer.manifestPath)` are unchanged — the swap is invisible to the consumer.

## Constitution Check

- **One user story per feature** — satisfied. Three user stories, all about the SDK method swap (cost, behavioural equivalence, production verification).
- **Closure-not-deletion** — N/A. This is a new spec, not a closed one.
- **FR-NNN required** — satisfied. 6 FRs (FR-001 through FR-006), all `FR-\d{3}`.
- **Skill contract source of truth** — `skill.spec.yaml` needs no change. The swap is purely a method replacement inside an existing module; no new artefact paths.
- **Runtime state is declared, not committed** — N/A. No new runtime state.
- **Production side effects are bounded** — N/A. The swap reduces side effects (fewer API calls).

## Implementation Phases

### Phase 1 — Modify `VercelBlobStorageClient.readPointer`

Edit `lib/blob-storage.ts:62-66` (4 lines → ~10 lines):

```ts
async readPointer(): Promise<PointerContents | null> {
  const meta = await head(POINTER_PATH, { token: this.token });
  if (!meta) return null;  // head() returns null on 404
  const response = await fetch(meta.url, {
    headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Blob fetch failed for ${POINTER_PATH}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const res = JSON.parse(text) as PointerContents;
  if (!res || typeof res.manifestPath !== 'string') return null;
  return res;
}
```

Imports: `head` must be added to the existing import at line 2: `import { put, list, del, head } from '@vercel/blob';`.

### Phase 2 — Modify `VercelBlobStorageClient.readManifest`

Edit `lib/blob-storage.ts:68-77` (10 lines → ~16 lines):

```ts
async readManifest(manifestPath: string): Promise<Manifest> {
  const meta = await head(manifestPath, { token: this.token });
  if (!meta) return {};
  const response = await fetch(meta.url, {
    headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Blob fetch failed for ${manifestPath}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const res = JSON.parse(text) as Manifest;
  if (!res || typeof res !== 'object') return {};
  // Validate shape: every value must be a string.
  const valid: Manifest = {};
  for (const [k, v] of Object.entries(res)) {
    if (typeof v === 'string') valid[k] = v;
  }
  return valid;
}
```

Note: the previous implementation read via `readJsonBlob` (which wrapped `list()`). The new implementation mirrors the `readPointer` shape directly. The body parsing + shape validation logic is preserved unchanged.

### Phase 3 — Add vitest cases for the swap

Edit `lib/blob-storage.test.ts` — append new cases (do NOT modify existing cases):

```ts
describe('head() swap (spec 028)', () => {
  it('readPointer calls head() once and list() zero times', async () => { ... });
  it('readManifest calls head() once and list() zero times', async () => { ... });
  it('readJsonBlob still calls list() (regression guard for FR-006)', async () => { ... });
  it('readPointer returns null when head() returns null (404)', async () => { ... });
  it('readManifest returns {} when head() returns null (404)', async () => { ... });
});
```

The mock setup likely needs `head: vi.fn()` added to the existing `@vercel/blob` mock. If the existing mock returns mocks for `put`, `list`, `del` only, extend it with `head`.

### Phase 4 — Verify

1. `npx tsc --noEmit` — TypeScript clean (catches API drift in `head()` signature)
2. `npx vitest run lib/blob-storage.test.ts -v` — new cases pass, existing cases unchanged
3. `npx vitest run lib/dashboard-sync.test.ts -v` — sync pipeline tests pass (regression check)
4. `npm run build` — Next.js production build succeeds
5. `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — spec validator clean

### Phase 5 — Commit and push

```
git add lib/blob-storage.ts lib/blob-storage.test.ts
git commit -m "feat(meals-dashboard): swap list()→head() in readPointer/readManifest (spec 028)

Per Vercel Blob pricing, head() is a Simple Operation ($0.40 per 1M over-allowance)
while list() is an Advanced Operation ($5.00 per 1M). Saves 2 advanced ops per
meals-check sync run.

readJsonBlob is intentionally unchanged (FR-006): it accepts arbitrary pathnames
from runtime data, where list({prefix}) is the right tool.

Spec: .specify/specs/028-dashboard-blob-head-read-savings/"
git push origin main
```

Push to `main` triggers Vercel auto-deploy to `production` env.

### Phase 6 — Production verification (gates Final promotion)

Per Promotion Criteria block in spec.md, items 2-6 require Danny's observation against the live Vercel environment. After the production deploy, trigger a sync run and confirm Vercel function logs show `head()` calls (not `list()`) for the pointer and manifest lookups.

## Files Touched

| File | Action | Why |
|---|---|---|
| `lib/blob-storage.ts` | EDIT (~12 lines net) | Swap `list()` → `head()` in `readPointer` and `readManifest`. Add `head` to imports. |
| `lib/blob-storage.test.ts` | EDIT (~80 lines added) | 5 new vitest cases for the swap. Existing cases unchanged. |
| `data-science/meals-check/.specify/specs/028-dashboard-blob-head-read-savings/spec.md` | NEW | This spec |
| `data-science/meals-check/.specify/specs/028-dashboard-blob-head-read-savings/plan.md` | NEW | This plan |
| `data-science/meals-check/.specify/specs/028-dashboard-blob-head-read-savings/tasks.md` | NEW | This tasks checklist |
| `data-science/meals-check/.specify/specs/028-dashboard-blob-head-read-savings/scenarios.yaml` | NEW | Machine-readable scenarios |
| `data-science/meals-check/.specify/specs/028-dashboard-blob-head-read-savings/traceability.yaml` | NEW | Machine-readable FR mapping |
| `data-science/meals-check/.specify/specs/028-dashboard-blob-head-read-savings/CHANGELOG.md` | NEW | Spec history |
| `data-science/meals-check/.specify/specs/index.yaml` | EDIT | Add spec 028 entry |
| `data-science/meals-check/SKILL.md` | EDIT | Add spec 028 to spec summary |

## Files NOT Touched (Constitution Invariants)

| File | Why |
|---|---|
| `lib/dashboard-data.ts` | Read composition (`getDashboardData`) is unchanged |
| `lib/dashboard-sync.ts` | `syncDashboardLayout` calls `client.readPointer()` / `client.readManifest()` — interface unchanged |
| `lib/dashboard-ui-utils.ts` | UI composition (`resolveProductInfoForItem`) unchanged |
| `lib/product-database.ts` | Curated-static fallback unchanged |
| `components/dashboard-client.tsx` | UI rendering unchanged |
| `app/api/dashboard-sync/route.ts` | Route handler delegates to `syncDashboardLayout` — interface unchanged |
| `app/api/dashboard-data/route.ts` | Legacy single-blob endpoint unchanged |
| `scripts/sync-dashboard-data.py` | Python sync pipeline unchanged (writes only; reads not affected) |
| `lib/auth.ts`, `lib/debug-mode.ts`, `lib/runtime-mode.ts`, `lib/theme.tsx` | Unrelated modules |
| `app/page.tsx`, `app/layout.tsx` | Layout unchanged |
| `lib/InMemoryBlobStorageClient` (in blob-storage.ts) | Test fixture, doesn't call Vercel SDK |
| `package.json`, `package-lock.json` | No dependency change |
| `.env`, `.env.example`, `vercel.json` | No env var change |
| `meals-dashboard/PREVIEW_ENVIRONMENT.md` | Not preview-specific; no change needed |

## Risks

- **Risk: `@vercel/blob` API surface change in a future SDK version.** `head()` is stable in 2.4.0. A future major release could change the return shape; `npx tsc --noEmit` catches this at build time. **Mitigation**: CI `npm ls @vercel/blob` catches version drift; production deploy fails if incompatible.
- **Risk: Vercel pricing reclassification of `head()`.** If Vercel moves `head()` from Simple to Advanced, the savings vanish. **Mitigation**: empirically verified in the Vercel Usage dashboard per Promotion Criteria item 6.
- **Risk: warm module cache after deploy.** First sync run after production deploy may use cached prior module; second run uses the new code. **Mitigation**: Promotion Criteria item 2 requires observation on a sync run after the cold start.

## Promotion Plan

- **Draft → Proposed**: after Phase 1-4 land, local verification passes, commit pushed to `main`. Status flipped to `Proposed` in `spec.md` line 18 and `index.yaml` entry. `readiness: ready` per spec 027 Rev 3 convention.
- **Proposed → Final**: after Promotion Criteria items 1-6 are confirmed by Danny on the production deploy. Per spec 027 Rev 3 pattern: status + readiness + `last_reviewed_at` flipped atomically, new CHANGELOG.md Rev 2 entry with production evidence.
- **Proposed → rollback**: if production observation fails (e.g. `head()` 404 path diverges from `list()` empty-array path in some edge case), revert the commit on `main` via `git revert`. Spec stays at Proposed indefinitely with a CHANGELOG note recording the rollback reason.
