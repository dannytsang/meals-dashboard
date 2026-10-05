# Tasks: Dashboard Blob `head()` Read Savings

Status: Proposed
Feature: 028-dashboard-blob-head-read-savings
Skill: data-science/meals-check
Revision: 1 (initial implementation)

Tasks are sequenced by phase. A task is "done" when its acceptance criteria pass and the diff matches the listed file paths.

## Phase 1 — Modify `VercelBlobStorageClient`

- [x] **T001** — Edit `lib/blob-storage.ts` line 2 imports: add `head` to the existing `import { put, list, del } from '@vercel/blob';` import.
  - Result: `import { put, list, del, head } from '@vercel/blob';`

- [x] **T002** — Edit `lib/blob-storage.ts:62-66` (`readPointer` method) to use `head()` instead of `list()`.
  - Replace the `readJsonBlob` call with a direct `head(POINTER_PATH, { token })` call.
  - On `head()` returning `null` (404), return `null` immediately.
  - On success, fetch `headResult.url` with `Authorization: Bearer *** and JSON.parse the body.
  - Preserve the existing `if (!res || typeof res.manifestPath !== 'string') return null;` validation.

- [x] **T003** — Edit `lib/blob-storage.ts:68-77` (`readManifest` method) to use `head()` instead of `list()`.
  - Replace the `readJsonBlob` call with a direct `head(manifestPath, { token })` call.
  - On `head()` returning `null` (404), return `{}` immediately.
  - On success, fetch `headResult.url` with `Authorization: Bearer *** and JSON.parse the body.
  - Preserve the existing shape validation: every value must be a string.

- [x] **T004** — Verify `lib/blob-storage.ts:79-93` (`readJsonBlob` method) is UNCHANGED. The `list({prefix: path})` call stays (FR-006).

- [x] **T005** — Verify `InMemoryBlobStorageClient` (lib/blob-storage.ts:165-233) is UNCHANGED. It does not call any Vercel SDK method (per NFR-001).

## Phase 2 — Add vitest cases

- [x] **T006** — Edit `lib/blob-storage.test.ts` to add a `head` mock to the existing `@vercel/blob` mock (likely `vi.mock('@vercel/blob', () => ({ ... head: vi.fn() }))`).

- [x] **T007** — Add vitest case: `readPointer` calls `head` exactly once with `'pointers/latest.json'` and `list` exactly zero times.
  - Mock `head` to resolve with `{ url: 'https://example.com/pointer.json', pathname: 'pointers/latest.json' }`.
  - Mock the `fetch` global (or use `vi.spyOn(global, 'fetch')`) to resolve with a valid pointer JSON body.
  - Assert: `expect(head).toHaveBeenCalledTimes(1)`, `expect(head).toHaveBeenCalledWith('pointers/latest.json', { token: expect.any(String) })`, `expect(list).toHaveBeenCalledTimes(0)`.

- [x] **T008** — Add vitest case: `readManifest` calls `head` exactly once with the passed path and `list` exactly zero times.
  - Mock `head` to resolve with `{ url: 'https://example.com/manifest-X.json', pathname: 'meta/manifest-X.json' }`.
  - Assert: `expect(head).toHaveBeenCalledTimes(1)`, `expect(head).toHaveBeenCalledWith('meta/manifest-X.json', { token: expect.any(String) })`, `expect(list).toHaveBeenCalledTimes(0)`.

- [x] **T009** — Add vitest case: `readJsonBlob` still calls `list` exactly once (regression guard for FR-006).
  - Assert: `expect(list).toHaveBeenCalledTimes(1)` for a single `readJsonBlob('coverage/2026-06-18.json')` call.

- [x] **T010** — Add vitest case: `readPointer` returns `null` when `head` returns `null` (404).
  - Mock `head` to resolve with `null`.
  - Assert: `expect(await client.readPointer()).toBeNull()`.
  - Assert: `expect(list).toHaveBeenCalledTimes(0)` (confirms no fallback to list).

- [x] **T011** — Add vitest case: `readManifest` returns `{}` when `head` returns `null` (404).
  - Mock `head` to resolve with `null`.
  - Assert: `expect(await client.readManifest('meta/manifest-X.json')).toEqual({})`.
  - Assert: `expect(list).toHaveBeenCalledTimes(0)`.

## Phase 3 — Local verification

- [x] **T012** — Run `npx tsc --noEmit` from `/home/hermes/workspace/meals-dashboard`. Confirm zero errors. The `@vercel/blob@2.4.0` `head()` signature must match the production client's call shape.

- [x] **T013** — Run `npx vitest run lib/blob-storage.test.ts -v`. Confirm all existing tests pass AND all 5 new tests (T007-T011) pass.

- [x] **T014** — Run `npx vitest run lib/dashboard-sync.test.ts -v`. Confirm regression check: sync pipeline tests still pass with the swap in place.

- [x] **T015** — Run `npm run build`. Confirm Next.js production build succeeds. The `lib/blob-storage.ts` module is imported by `/api/dashboard-sync/route.ts` and `/api/dashboard-data/route.ts`; both must build clean.

- [x] **T016** — Run `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` from `/home/hermes/workspace/Hermes-Skills`. Confirm RC=0 (no errors). Warnings are acceptable for Proposed status.

## Phase 4 — Commit and deploy

- [x] **T017** — Stage the implementation diff:
  ```
  cd /home/hermes/workspace/meals-dashboard
  git status -s | grep -v '^.M .next/' | grep -v '^.D .next/' | grep -v '^??'
  ```
  Confirm only `lib/blob-storage.ts` and `lib/blob-storage.test.ts` are listed. No `.next/` build artefacts. No unrelated files.

- [x] **T018** — Commit on `main`:
  ```
  git add lib/blob-storage.ts lib/blob-storage.test.ts
  git commit -m "feat(meals-dashboard): swap list()→head() in readPointer/readManifest (spec 028)

  Per Vercel Blob pricing, head() is a Simple Operation (\$0.40 per 1M
  over-allowance) while list() is an Advanced Operation (\$5.00 per 1M).
  Saves 2 advanced ops per meals-check sync run.

  readJsonBlob is intentionally unchanged (FR-006): it accepts arbitrary
  pathnames from runtime data, where list({prefix}) is the right tool.

  Spec: .specify/specs/028-dashboard-blob-head-read-savings/"
  ```

- [x] **T019** — Push to `origin/main`:
  ```
  git push origin main
  ```
  This triggers Vercel auto-deploy to production. The deploy URL is logged; record it for Phase 5 verification.

## Phase 5 — Production verification (gates Final promotion)

- [ ] **T020** — Wait for Vercel production deploy to complete (typically 30-90 seconds). Confirm the deploy URL responds 200 at `https://meals-dashboard.vercel.app`.

- [ ] **T021** — Trigger a meals-check sync run. Two options:
  - (a) Wait for the next Tesco email to arrive and the email monitor cron to fire (variable wait time).
  - (b) Use the manual `/meals` Telegram slash command for an on-demand sync.

- [ ] **T022** — Open Vercel dashboard → production deployment → Logs → filter to `/api/dashboard-sync` route. Locate the sync run from T021. Verify the log entries show `head()` calls for the pointer and manifest lookups (not `list()` calls).

- [ ] **T023** — Verify the sync run's response JSON contains a valid `manifestPath` field. This confirms `head('pointers/latest.json')` succeeded.

- [ ] **T024** — Open `https://meals-dashboard.vercel.app` and confirm the dashboard renders the latest data normally. No visual regression.

- [ ] **T025** — Open Vercel dashboard → Storage → Blob → Usage. Compare the post-deploy sync run's Advanced Operation count to the pre-deploy baseline. Confirm the run consumed 2 fewer Advanced Operations than the pre-deploy baseline (the two `list()` calls that became `head()` calls).

## Phase 6 — Promotion to Final (if T020-T025 all pass)

- [ ] **T026** — Update `spec.md` line 18: `Status: Proposed` → `Status: Final`. Update `last_reviewed_at` in `index.yaml` to today's date.

- [ ] **T027** — Update `index.yaml` entry: `status: Proposed` → `status: Final`.

- [ ] **T028** — Add Rev 2 entry to `CHANGELOG.md` recording:
  - Date
  - Promotion status change (Proposed → Final)
  - Production evidence (Vercel logs, dashboard render, Advanced Operation count delta)
  - Rationale per spec 027 Rev 3 promotion convention

- [ ] **T029** — Re-run `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`. Confirm RC=0.

- [ ] **T030** — Commit promotion metadata:
  ```
  cd /home/hermes/workspace/Hermes-Skills
  git add data-science/meals-check/.specify/specs/028-dashboard-blob-head-read-savings/
  git commit -m "spec 028: promote to Final (production evidence captured)"
  ```
  Note: this commit is on the Hermes-Skills repo, not the meals-dashboard repo. The two repos have independent commit histories.
