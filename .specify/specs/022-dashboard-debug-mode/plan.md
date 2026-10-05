# Plan: Dashboard Debug Mode (Rev 4)

**Input**: `.specify/specs/022-dashboard-debug-mode/spec.md`

> **Status: Final (2026-06-22) — Rev 4 (cookie-only audit)**. The runtime contract is unchanged from Rev 3 (single per-user signed cookie, no env-var). Rev 4 is a docs-reconciliation revision: it tightens the operator-facing reference contract (FR-020) and codifies the first-time-enablement affordance (FR-021) so the 2026-06-22 "the toggle does not change anything" confusion cannot recur. Phase 11 lists every file in the meals-dashboard code repo that still contains env-var references; that phase is **coder-profile work** and is not committed from chef-profile scope. The chef-profile work in this revision is confined to the spec artefacts in this directory and the meals-check `SKILL.md` summary.

## Implementation Phases

### Phase 1 — Per-user signed cookie helper (Rev 2 add, unchanged in Rev 3)

- Create `lib/debug-cookie.ts` exporting `signDebugCookie`, `verifyDebugCookie`, `isDebugCookieOn`, `DEBUG_COOKIE_NAME`, `DEBUG_COOKIE_MAX_AGE_SECONDS`. HMAC-SHA-256 keyed on `NEXTAUTH_SECRET`. Cookie format: `<value>.<base64url-hmac-sha256>`. Path `/`, HttpOnly, SameSite=Lax, 30-day Max-Age, Secure in production only.
- Create `lib/debug-cookie.test.ts` with Vitest cases (round-trip, tampered value, tampered signature, malformed, unset, secret rotation, weird inputs).

### Phase 2 — Debug-mode helper (Rev 3 simplify)

- `lib/debug-mode.ts` exports `effectiveDebugMode(cookieRaw): boolean` — the **only** gate. True iff the signed cookie decodes to `{ value: '1' }`. No env-var check, no `process.env` reads. *(Rev 3: `isDebugModeEnabled()` and the env-var helper are removed.)*
- `lib/debug-mode.test.ts` covers the `effectiveDebugMode` contract: unset → false, signed "1" → true, signed "0" → false, tampered → false, unsigned → false, empty → false, null/undefined → false.

### Phase 3 — `/api/debug/items-by-category` route (cookie-only gate)

- `app/api/debug/items-by-category/route.ts` reads the cookie via `next/headers` `cookies()` and gates on `effectiveDebugMode(cookieRaw)`. Returns 404 when the cookie is unset or tampered. *(Rev 3: the env-var check is removed.)*
- `app/api/debug/items-by-category/route.test.ts` mocks `effectiveDebugMode` and `next/headers` `cookies()`; covers unset → 404, signed "1" → 200 with FR-004 JSON, signed "0" → 404, tampered → 404, unsigned → 404.

### Phase 4 — `/debug` page + debug shell (cookie-only gate)

- `app/debug/page.tsx` reads the cookie, gates on `effectiveDebugMode(cookieRaw)`, and passes the decoded cookie value to the shell's footer.
- `components/debug-shell.tsx` takes a `cookieValue: '0' | '1' | 'unset'` prop and renders it in the footer. *(Rev 3: the env-var footer row is removed; replaced with the Vercel deployment ID, which is read via prop from the server component since `process.env` in a client component does not work at runtime.)*

### Phase 5 — In-header UI toggle (cookie-only gate)

- `app/api/debug/toggle/route.ts` (POST). Body: `{ "value": "0" | "1" }` (optional — flip if absent). Set signed cookie via `res.cookies.set`. Return `{ enabled, value }` JSON. *(Rev 3: the 404-when-env-off path is removed; the route always accepts the cookie flip because the cookie is the only gate.)*
- `app/api/debug/toggle/route.test.ts` covers: body "1" → 200 + signed "1" cookie; body "0" → 200 + cookie cleared; body "maybe" → flip; tampered incoming cookie → flip to "1"; no body → flip; Secure=true in production; HttpOnly/SameSite/Path/MaxAge attributes correct.
- `components/debug-toggle.tsx` (client). Reads `initialEnabled` from props. Click → optimistic update → POST `/api/debug/toggle` → `router.refresh()`. Bug icon. *(Rev 3: the `envEnabled` prop is removed; the toggle is always interactive. No "disabled in this deployment" UI state.)*

### Phase 6 — Wire-up (cookie-only gate)

- `app/page.tsx` reads the cookie, computes `debugOn` from `effectiveDebugMode`, passes it to `DashboardClient`. No env-var computation. The `?debug=inject` URL detection and the `debugInject` prop are gone (Rev 2).
- `components/dashboard-client.tsx` accepts `debugOn` (replacing `debugInject` and `envEnabled` from Rev 2), renders `<DebugToggle>` in the header next to `<ThemeToggle>` and `<SignOutButton>`, and gates the inline chip on `debugOn`. The `envEnabled` prop is gone (Rev 3).
- `components/dashboard-debug-chips.tsx` and `components/items-by-category-debug-panel.tsx` (doc-only — same logic, contract is unchanged).

### Phase 7 — Remove temporary 2026-06-17 debug overlay

- Already done in Rev 1 (the temporary overlay was never committed to `preview`; verification step is a no-op grep).
- Verify by grep: `grep -rn "DEBUG:" components/ app/` returns no hits in source.

### Phase 8 — Reference documentation

- `references/dashboard-debug-mode.md` documents the cookie contract, the toggle UI flow, the enablement steps, the panel-extension pattern, the security boundary, and a troubleshooting checklist. *(Rev 3: the env-var section is removed; the matrix is cookie-only.)*

### Phase 9 — Tests + governance

- `npx tsc --noEmit` clean.
- `npx next build` clean with the cookie unset (and naturally with it set, since the build does not read the cookie).
- Run full Vitest suite (188+ tests across 16 files: 152 pre-existing + 36 new across 4 test files — `lib/debug-mode.test.ts` 7 tests, `lib/debug-cookie.test.ts` 25 tests, `app/api/debug/items-by-category/route.test.ts` 7 tests, `app/api/debug/toggle/route.test.ts` 11 tests).
- Manual: deploy with cookie unset, `curl /debug` → 404 (or 307 to OIDC if unauthenticated); `curl /api/debug/*` → 404; `curl -X POST /api/debug/toggle` → 200; `curl -H "Cookie: meals_debug_mode=1.bogus" /debug` → 404; grep production HTML/JS for `DEBUG:`, `latestOrder=`, `meals_debug_mode`, `MEALS_DEBUG_MODE`, `isDebugModeEnabled`, `envEnabled`, `/debug`, `/api/debug` → no hits.
- Manual: sign in, click the toggle in the header, `curl /debug` → 200; `curl /api/debug/items-by-category` → 200 with expected JSON; click toggle again, `curl /debug` → 404.
- Update `skill.spec.yaml` `expected_artifacts:` per FR-019.
- Capture live runtime evidence: production bundle grep + curl /debug 404. **Captured 2026-06-17 at deployment `dpl_FN7HxzZybn1SWfJv1rViJ1bPnbGt` — see Promotion Criteria for Final in spec.md.**

### Phase 10 — Future debug surfaces (deferred — each is its own follow-up spec or its own slice in a promoted version of this spec)

- [ ] T080 DS-01 Week Meals grid state (deferred)
- [ ] T081 DS-02 Meal Detail Overlay state (deferred)
- [ ] T082 DS-03 Product Blob resolution trace (deferred)
- [ ] T083 DS-04 Summary filter counters (deferred)
- [ ] T084 DS-05 Sync lag (deferred)
- [ ] T085 DS-06 Calendar context (deferred)
- [ ] T086 DS-07 Tesco email parse (deferred)

### Phase 11 — Rev 4 docs reconciliation (chef-profile commit)

Rev 4 is docs-only. The runtime contract is unchanged from Rev 3. This phase captures the **chef-profile commit** — spec artefacts + the meals-check `SKILL.md` summary. Code-repo reconciliation is Phase 12 (coder-profile work).

- [x] T110 Update spec.md with Rev 4 callout, FR-020 (operator-facing reference contract), FR-021 (first-time-enablement), and Open Question 9 (Rev 4 audit rationale).
- [x] T111 Update plan.md with Rev 4 status callout and Phase 11 / Phase 12 split (chef vs coder).
- [x] T112 Update tasks.md with Rev 4 phase numbering (T110..T119 chef, T120..T129 coder) and a "Phase 12 — coder-profile reconciliation" enumeration.
- [x] T113 Update CHANGELOG.md with the Rev 4 entry, listing the audit of stale env-var references found on 2026-06-22 and the FRs that capture the contract going forward.
- [x] T114 Update `references/dashboard-debug-mode.md` in the spec dir to be cookie-only (drop the "two-level switch" / "deployment gate" / "kill switch" wording; lead with the per-user signed cookie as the only gate; document the toggle UI as the discoverable first-time enablement path; remove every reference to `MEALS_DEBUG_MODE`, `isDebugModeEnabled`, `envEnabled`).
- [x] T115 Update meals-check `SKILL.md` line 87 summary to reflect the cookie-only design (remove the "Gated by `MEALS_DEBUG_MODE` env var" sentence).
- [x] T116 Add FR-020 / FR-021 mapping to traceability.yaml and add new acceptance scenarios AS-024 / AS-025 to scenarios.yaml covering the FR-020 wording contract and the FR-021 first-time-enablement contract.
- [x] T117 Update `index.yaml` entry `last_reviewed_at` to 2026-06-22 (no status change — still `Final / already_satisfied`; the audit is a docs reconciliation, not a re-implementation).
- [x] T118 Run the spec validator and confirm clean: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.
- [x] T119 Commit chef-profile work on Hermes-Skills `main`: `spec(022): Rev 4 cookie-only audit — reconcile operator-facing docs to the implementation`. Do NOT touch the meals-dashboard code repo.

### Phase 12 — Rev 4 code-repo reconciliation (coder-profile work, NOT in this chef-profile commit)

The runtime contract is already cookie-only. These files in the meals-dashboard code repo still mention the env-var (or otherwise describe the two-level switch) and need the coder profile to reconcile them. Each line is the source of the stale reference and the required change.

- [ ] T120 `meals-dashboard/references/dashboard-debug-mode.md` — full rewrite for the cookie-only design (mirror the spec-dir `references/dashboard-debug-mode.md` Rev 4 wording). Current file has: lines 12, 18, 33, 39, 43, 64, 75, 138, 150, 174, 176, 181 mentioning the env-var. Replace the entire file. *(chef profile cannot commit to meals-dashboard; this is a coder-profile task on the meals-dashboard `preview` branch.)*
- [ ] T121 `meals-dashboard/components/debug-shell.tsx` — comments on lines 7 and 88 still say "with the current MEALS_DEBUG_MODE value" and "With MEALS_DEBUG_MODE off, this route does not exist." Update the comments to reflect the cookie-only design. The code itself is correct (no env-var read). *(coder-profile task.)*
- [ ] T122 `meals-dashboard/PREVIEW_ENVIRONMENT.md` — lines 37 and 124 say "Optional: `MEALS_DEBUG_MODE=1` — useful on preview" and "If `MEALS_DEBUG_MODE=1`, `/debug` returns 200." Update the operator-facing copy to reflect the cookie-only design (the toggle, not the env-var, is the enablement path). *(coder-profile task.)*
- [ ] T123 `meals-dashboard/scripts/test_firecrawl_search.py` line 50 — `'MEALS_DEBUG_MODE': '0',` in a firecrawl test fixture. This is not a real env-var read; it is a test-local stub. Either remove the stub (it is unused — the firecrawl search path does not gate on debug mode) or replace with a comment explaining why it is there. *(coder-profile task.)*
- [ ] T124 `meals-dashboard/app/api/debug/toggle/route.test.ts` line 176 — historical comment "The route used to 404 when MEALS_DEBUG_MODE was unset. Rev 3". This is a historical comment that is technically accurate (it documents a prior behaviour). Either leave as historical record (acceptable per Rev 4 — comments documenting removed code paths are legitimate) or move to a `// Historical note (Rev 3, 2026-06-17):` prefix so it is clear it is archival, not current contract. *(coder-profile task.)*
- [ ] T125 Run the full `meals-dashboard` test suite + `tsc --noEmit` + `next build` after T120..T124 land. The bundle must remain grep-clean for `MEALS_DEBUG_MODE` and `isDebugModeEnabled` (which it already is, but verify). *(coder-profile task.)*
- [ ] T126 Deploy coder-profile Rev 4 code-repo commit on `preview`, merge to `main`, deploy to production, capture the post-deploy verification: `curl /debug` → 307 (OIDC); sign in; click Debug in header; `curl /debug` → 200; confirm operator-facing reference docs render cookie-only wording. Update CHANGELOG with the coder-profile commit SHA and the deploy ID. *(coder-profile task.)*

## Risks & Mitigations

- **Cookie tampering**: a user sets `meals_debug_mode=1` in devtools without the server's signature. Mitigation: HMAC-SHA-256 with `timingSafeEqual`; `verifyDebugCookie` returns `null` for tampered cookies; `effectiveDebugMode` treats `null` as off. Covered by `lib/debug-cookie.test.ts` (tampered value, tampered signature, secret rotation).
- **Toggle route becomes a CSRF surface**: a malicious page POSTs to `/api/debug/toggle` to flip the user's cookie. Mitigation: `SameSite=Lax` (browser does not send cross-site cookies for top-level navigations); HttpOnly (the toggle route does not need the cookie to be readable from JS). SameSite=Lax is the standard mitigation for state-changing cookie endpoints; the route is not a privileged action (it does not modify server state, only the user's own cookie).
- **Cookie not refreshing the chips after toggle click**: the client may not pick up the new server-rendered state. Mitigation: `router.refresh()` in `DebugToggle.handleClick` re-runs the page loader with the new cookie, so the chips appear/disappear without a full page reload.
- **Bundle leaks debug code with cookie unset**: the `DashboardDebugChips` static import would bundle debug code into the main page. Mitigation: `next/dynamic` import boundary (in place from Rev 1); Phase 9 verifies via build-grep that the chip code is not in the main bundle. **Verified in production 2026-06-17** — main bundle is grep-clean for `meals_debug_mode` and friends.
- **Debug strings leaking into production bundle via tests or fixtures**: mitigation — explicit grep step in Phase 9. **Verified clean 2026-06-17.**
- **Tree-shaking not eliminating debug code from main bundle**: mitigation — dynamic import of debug-only components; manual `next build` inspection in Phase 9. NFR-002 captures the expectation; the verification is manual for now.
- **Cookie leaks via `__NEXT_DATA__` or HTML body**: mitigation — debug code is dynamically imported, not statically referenced; the page server component does not embed the cookie value in the HTML payload; the cookie is HttpOnly so client JS cannot read it directly. The page reads the cookie server-side and passes only a boolean (`debugOn`) to the client.

## See Also

- `spec.md` — requirements and acceptance criteria.
- `tasks.md` — delivery checklist.
- `references/dashboard-debug-mode.md` — operator-facing enablement + extension guide (Phase 8).
- `CHANGELOG.md` — design history (Rev 1 → Rev 2 → Rev 3 transitions).
