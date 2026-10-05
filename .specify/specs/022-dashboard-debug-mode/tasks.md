# Tasks: Dashboard Debug Mode (Rev 4)

**Input**: `.specify/specs/022-dashboard-debug-mode/spec.md`

> **Status: Final (2026-06-22) — Rev 4 (cookie-only audit)**. The runtime contract is unchanged from Rev 3. Rev 4 is a docs-reconciliation revision: it tightens the operator-facing reference contract (FR-020) and codifies the first-time-enablement affordance (FR-021) so the 2026-06-22 "the toggle does not change anything" confusion cannot recur. Phase 11 is the chef-profile commit (spec artefacts + meals-check SKILL.md summary). Phase 12 is the coder-profile reconciliation in the meals-dashboard code repo — left as a pending list for the coder, not committed from chef-profile scope.

## Phase 1: Spec authoring (this Draft → Proposed, then Rev 1 → Rev 2 → Rev 3)

- [x] T001 Write `spec.md`
- [x] T002 Write `plan.md`
- [x] T003 Write `CHANGELOG.md`
- [x] T004 Add entry to `.specify/specs/index.yaml` with `status: Final, readiness: already_satisfied` (Rev 3)
- [x] T005 Write `scenarios.yaml` + `traceability.yaml`
- [x] T006 Update `skill.spec.yaml` `expected_artifacts:` to include this spec directory and source files
- [x] T007 Validate: `python /home/hermes/workspace/Hermes-Skills/software-development/spec-driven-skills/scripts/validate_spec_skill.py /home/hermes/workspace/Hermes-Skills/data-science/meals-check`
- [x] T008 Rev 2: rewrite spec.md, CHANGELOG.md, plan.md, scenarios.yaml, traceability.yaml, references/dashboard-debug-mode.md, and skill.spec.yaml to reflect the two-level switch (env-var + per-user signed cookie) and the in-header UI toggle.
- [x] T009 Rev 3: rewrite spec.md, plan.md, tasks.md, scenarios.yaml, traceability.yaml, references/dashboard-debug-mode.md, and CHANGELOG.md to reflect the cookie-only gate (env-var removed). Validator clean.

## Phase 2: Per-user signed cookie helper (Rev 2)

- [x] T010 Create `lib/debug-cookie.ts` exporting `signDebugCookie`, `verifyDebugCookie`, `isDebugCookieOn`, `DEBUG_COOKIE_NAME`, `DEBUG_COOKIE_MAX_AGE_SECONDS`
- [x] T011 HMAC-SHA-256 keyed on `NEXTAUTH_SECRET`; format `<value>.<base64url-sig>`; `timingSafeEqual` for verification; returns `null` for unset/malformed/tampered
- [x] T012 Create `lib/debug-cookie.test.ts` with Vitest cases (round-trip, tampered value, tampered signature, malformed, unset, secret rotation, weird inputs, 30-day Max-Age export, canonical name export) — **25 tests passing**

## Phase 3: Debug-mode helper (Rev 3 simplify)

- [x] T020 `lib/debug-mode.ts` exports `effectiveDebugMode(cookieRaw): boolean` — cookie-only check; no `process.env` reads
- [x] T021 *(Rev 3: removed)* `isDebugModeEnabled()` env-only helper — gone, no longer needed
- [x] T022 `lib/debug-mode.test.ts` covers the `effectiveDebugMode` contract — **7 tests passing**

## Phase 4: `/api/debug/items-by-category` route (cookie-only gate)

- [x] T030 `app/api/debug/items-by-category/route.ts` reads the cookie via `next/headers` `cookies()` and gates on `effectiveDebugMode(cookieRaw)`
- [x] T031 `app/api/debug/items-by-category/route.test.ts` mocks `effectiveDebugMode` and `next/headers` `cookies()`; covers unset, signed "1", signed "0", tampered, unsigned — **7 tests passing**
- [x] T032 Verify: with cookie unset, `GET /api/debug/items-by-category` → 404 (for authenticated); with cookie set, → 200 with FR-004 JSON shape

## Phase 5: `/debug` page + debug shell (cookie-only gate)

- [x] T040 `app/debug/page.tsx` reads the cookie, gates on `effectiveDebugMode(cookieRaw)`, and passes the decoded cookie value to the shell's footer
- [x] T041 `components/debug-shell.tsx` takes a `cookieValue: '0' | '1' | 'unset'` prop and renders it in the footer (alongside the Vercel deployment ID)
- [x] T042 *(Rev 3: removed)* env-var footer row — gone, replaced with the deployment ID via prop

## Phase 6: In-header UI toggle (cookie-only gate)

- [x] T050 Create `app/api/debug/toggle/route.ts` (POST). Body: `{ "value": "0" | "1" }` (optional — flip if absent). Set signed cookie via `res.cookies.set`. Return `{ enabled, value }` JSON. *(Rev 3: the 404-when-env-off branch is removed; the route always accepts the cookie flip.)*
- [x] T051 Create `app/api/debug/toggle/route.test.ts` with Vitest cases — **11 tests passing**
- [x] T052 Create `components/debug-toggle.tsx` (client). Reads `initialEnabled` from props. Click → optimistic update → POST `/api/debug/toggle` → `router.refresh()`. Bug icon. *(Rev 3: the `envEnabled` prop is removed; the toggle is always interactive.)*

## Phase 7: Wire-up (cookie-only gate)

- [x] T060 `app/page.tsx` reads the cookie, computes `debugOn` from `effectiveDebugMode`, passes it to `DashboardClient`. Drop the `?debug=inject` URL detection and the `debugInject` prop. *(Rev 3: the `envEnabled` prop computation is removed.)*
- [x] T061 `components/dashboard-client.tsx` accepts `debugOn` (replacing `debugInject` and `envEnabled`), renders `<DebugToggle>` in the header next to `<ThemeToggle>` and `<SignOutButton>`, and gates the inline chip on `debugOn`
- [x] T062 `components/dashboard-debug-chips.tsx` and `components/items-by-category-debug-panel.tsx` (doc-only — same logic, contract is unchanged)

## Phase 8: Remove temporary 2026-06-17 debug overlay

- [x] T070 Remove `DEBUG: latestOrder=NULL | ...` overlay from `components/dashboard-client.tsx` (already absent in the Rev 1 implementation; verified by grep)
- [x] T071 Verify by grep: `grep -rn "DEBUG:" components/ app/` returns no hits in source

## Phase 9: Reference documentation

- [x] T080 `references/dashboard-debug-mode.md` documents the cookie contract, the toggle UI flow, the enablement steps, the panel-extension pattern, the security boundary, and a troubleshooting checklist. *(Rev 3: the env-var section is removed; the matrix is cookie-only.)*

## Phase 10: Tests + governance

- [x] T090 `npx tsc --noEmit` clean
- [x] T091 `npx next build` clean (cookie unset, build does not read the cookie)
- [x] T092 Full Vitest suite — **188/188 passing across 16 files** (152 pre-existing + 7 debug-mode + 25 debug-cookie + 7 items-by-category route + 11 toggle route + others)
- [x] T093 Production verification (2026-06-17): `curl https://meals-dashboard.vercel.app/debug` → 307 (OIDC, no session); `curl /api/debug/items-by-category` → 307; `curl -X POST /api/debug/toggle` → 307; `curl -H "Cookie: meals_debug_mode=1.bogus" /debug` → 307 (OIDC first, then would be 404); production main bundle grep clean for `DEBUG:`, `latestOrder=`, `meals_debug_mode`, `MEALS_DEBUG_MODE`, `isDebugModeEnabled`, `envEnabled`
- [x] T094 Manual end-to-end (operator-confirmed 2026-06-17): signed in, clicked the toggle in the header, the inline chip appeared next to `Order Items by Category`; `/debug` returned 200 with the items-by-category panel; click toggle off, the chip disappeared and `/debug` returned 404
- [x] T095 Update `skill.spec.yaml` `expected_artifacts:` per FR-019
- [x] T096 Capture live runtime evidence — production bundle grep + curl /debug 404 + curl /debug 307 with OIDC. **Captured 2026-06-17 at deployment `dpl_FN7HxzZybn1SWfJv1rViJ1bPnbGt`**

## Phase 11: Future debug surfaces (deferred — each is its own follow-up spec or its own slice in a promoted version of this spec)

- [ ] T100 DS-01 Week Meals grid state (deferred)
- [ ] T101 DS-02 Meal Detail Overlay state (deferred)
- [ ] T102 DS-03 Product Blob resolution trace (deferred)
- [ ] T103 DS-04 Summary filter counters (deferred)
- [ ] T104 DS-05 Sync lag (deferred)
- [ ] T105 DS-06 Calendar context (deferred)
- [ ] T106 DS-07 Tesco email parse (deferred)

## Phase 12: Rev 4 — chef-profile docs reconciliation (this commit)

Rev 4 is docs-only. The runtime contract is unchanged from Rev 3. This phase is the chef-profile commit: spec artefacts + the meals-check `SKILL.md` summary. The code-repo reconciliation is Phase 13 (coder-profile work, not in this commit).

- [x] T110 spec.md — Rev 4 callout block, FR-020 (operator-facing reference contract), FR-021 (first-time-enablement), DebugToggle key entity updated, Open Question 9 added
- [x] T111 plan.md — Rev 4 status callout, Phase 11 / Phase 12 split
- [x] T112 tasks.md — Rev 4 phase numbering, this Phase 12 section
- [x] T113 CHANGELOG.md — Rev 4 entry, with the audit of stale env-var references found on 2026-06-22
- [x] T114 `references/dashboard-debug-mode.md` (spec dir) — full rewrite for the cookie-only design
- [x] T115 meals-check `SKILL.md` line 87 summary — drop the env-var reference
- [x] T116 `traceability.yaml` — FR-020 / FR-021 mapping; `scenarios.yaml` — AS-024 / AS-025
- [x] T117 `index.yaml` — `last_reviewed_at` bumped to 2026-06-22 (status unchanged)
- [x] T118 Validator: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` → `No issues found.`
- [x] T119 Commit on Hermes-Skills `main`: `spec(022): Rev 4 cookie-only audit — reconcile operator-facing docs to the implementation`

## Phase 13: Rev 4 — coder-profile code-repo reconciliation (NOT in this commit)

The runtime contract is already cookie-only. The chef profile does NOT edit meals-dashboard code; the following list is left for the coder profile to pick up on the meals-dashboard `preview` branch.

- [ ] T120 `meals-dashboard/references/dashboard-debug-mode.md` — full rewrite for the cookie-only design (lines 12, 18, 33, 39, 43, 64, 75, 138, 150, 174, 176, 181 currently mention the env-var)
- [ ] T121 `meals-dashboard/components/debug-shell.tsx` — update comments on lines 7 and 88 (code itself is correct, no env-var read)
- [ ] T122 `meals-dashboard/PREVIEW_ENVIRONMENT.md` — lines 37 and 124 (env-var enablement instructions)
- [ ] T123 `meals-dashboard/scripts/test_firecrawl_search.py` line 50 — remove the `'MEALS_DEBUG_MODE': '0',` test stub (it is unused by the firecrawl path) or replace with an explanatory comment
- [ ] T124 `meals-dashboard/app/api/debug/toggle/route.test.ts` line 176 — historical comment is accurate as archival; either leave as historical or prefix with `// Historical note (Rev 3, 2026-06-17):` so it is clear it is archival
- [ ] T125 `npx tsc --noEmit` + `npx next build` + full Vitest suite green; production bundle remains grep-clean for `MEALS_DEBUG_MODE` and `isDebugModeEnabled`
- [ ] T126 Merge to `main`, deploy, capture post-deploy verification (curl /debug → 307 OIDC; sign in; click Debug in header; curl /debug → 200); update CHANGELOG with coder-profile commit SHA + deploy ID
