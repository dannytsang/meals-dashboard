# Change Log: Dashboard Logged-In User Chip

Feature ID: `023-dashboard-logged-in-user-chip`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits/status-history questions.

## Entries

### 2026-06-18 — Final (production deploy verified)

- Change: Promoted `023-dashboard-logged-in-user-chip` from Proposed to Final. Status lines updated in `spec.md`, `index.yaml` (`status: Proposed → Final`, `readiness: ready → already_satisfied`). Implementation completed across 5 atomic commits on the `preview` branch (3fe5550, a585e35, b1e5074, 5d34230, a486315), merged to `main` as merge commit `1a1c45a`, and deployed to the production meals-dashboard Vercel environment at alias `meals-dashboard.vercel.app` (commit `1a1c45a`).
- Status after change: Final
- Rationale: All 20 functional requirements and 5 non-functional requirements verified. Promotion Criteria for Final satisfied:
  - chip evidence (`session-user` class, `user-chip` testid, `authorised traveller` fallback) present in production dashboard JS bundle (`.next/static/chunks/app/page-*.js`).
  - chip is **absent** from `/auth/signin` production HTML (0 grep hits for any chip token).
  - chip is **absent** from `/debug` production HTML (per build artifact inspection).
  - **zero** hits in production bundle for `session.accessToken`, `session.sub`, `session.idToken`, `gravatar.com`, `session.user.sub`, `session.user.id`, `session.user.image` (FR-006 privacy contract).
  - `<ThemeToggle />` and `<SignOutButton />` ordering preserved (ThemeToggle precedes SignOutButton, asserted by `dashboard-client.test.ts`).
  - no new dependencies (FR-022 / NFR-005).
  - production deploy READY via Vercel deployments API.
  - tsc --noEmit clean, 287/287 vitest tests pass, `next build` succeeds.
- Implementation impact: new `lib/user-chip.ts` (pure helper + `USER_NAME_FALLBACK` constant + `resolveUserChipName` function), new `components/user-chip.tsx` (server component, no `'use client'`, inline styles matching `DemoModeChip` aesthetic), `app/page.tsx` extended to derive `userName = resolveUserChipName(session.user)` after the session-redirect guard and pass it to `<DashboardClient />`, `components/dashboard-client.tsx` extended to add `userName: string` to the props interface and render `<UserChip />` between `<DemoModeChip />` and `<DebugToggle />` in the action row. New tests: `lib/user-chip.test.ts` (14 cases), `components/user-chip.test.tsx` (12 cases), `components/dashboard-client.test.ts` extended by 9 assertions in a new `describe` block. `skill.spec.yaml` `expected_artifacts:` updated for the 4 new source files.
- Evidence:
  - meals-dashboard commits: `3fe5550` (phase 1 helper), `a585e35` (phase 2 component), `b1e5074` (phase 3 wire-up), `5d34230` (phase 4 dashboard-client tests), `a486315` (FR-014 nit fix), merge commit `1a1c45a`.
  - Hermes-Skills commits: `642f51d` (`skill.spec.yaml` 4 new entries), index.yaml + spec.md status flip in this commit.
  - Vercel production deploy: alias `meals-dashboard.vercel.app`, state READY.
  - Live probes: `/` returns 307 (OIDC redirect, expected), `/auth/signin` returns 200 with **zero** chip-token grep hits, `/debug` returns 307 (protected, expected).
  - tsc --noEmit clean, vitest 287/287, next build succeeded.

### 2026-06-17 — Proposed (promoted from Draft after Danny's review)

- Change: Promoted `023-dashboard-logged-in-user-chip` from Draft to Proposed. Status lines updated in `spec.md`, `plan.md`, `tasks.md`. `index.yaml` updated: `status: Draft → Proposed`, `last_reviewed_at` unchanged (today). `readiness` remains `spec_only` — implementation has not started; this is the canonical Proposed-readiness state per the spec-driven-skills convention (compare `020-dashboard-grocy-pantry-coverage`, also `status: Final, readiness: spec_only`). Phase 1 spec-authoring tasks (T004-T007) ticked off in `tasks.md`; all were already complete, just bookkeeping drift.
- Status after change: Proposed
- Rationale: Danny asked on 2026-06-17 "is there anything outstanding in 023? If not, move it to proposed". Audit confirmed: all four open questions resolved, no TBD/TODO markers, validator clean, six spec artifacts present, `index.yaml` and `skill.spec.yaml` updated, no missing cross-references. Implementation work is now eligible to begin on the `preview` branch of the meals-dashboard repo per the workflow established earlier today (production for real changes, preview for debug and implementation work).
- Implementation impact: None yet. When implementation lands: new `lib/user-chip.ts` (helper + `USER_NAME_FALLBACK` constant + `resolveUserChipName` function), new `components/user-chip.tsx` (chip component reusing trips-dashboard JSX/CSS), small updates to `app/page.tsx` (derive `userName`, pass to `<DashboardClient />`) and `components/dashboard-client.tsx` (render chip in existing flex row), new tests (`lib/user-chip.test.ts`, `components/user-chip.test.tsx`, integration test in `components/dashboard-client.test.ts`), and `skill.spec.yaml` `expected_artifacts:` update. After implementation lands and is verified on the preview environment, this spec moves to Final with `readiness: in_progress` → `already_satisfied` over time.
- Evidence: Validator output (2026-06-17 17:xx UTC) — `Validated: /home/hermes/workspace/Hermes-Skills/data-science/meals-check / No issues found.` Audit confirms T004 (`index.yaml` entry present), T005 (`scenarios.yaml` + `traceability.yaml` present), T006 (6 entries in `skill.spec.yaml` `expected_artifacts:` for spec 023), T007 (validator clean) — all complete.

### 2026-06-17 — Draft (cross-dashboard reuse of the trips-dashboard identity chip)

- Change: Created `023-dashboard-logged-in-user-chip/` as a Draft feature, then rewrote it after Danny pointed to the trips-dashboard chip at `components/dashboard-session-surface.jsx:192` and asked to "reuse the code from that repository to save time". The trips dashboard already implements the same identity affordance — `<span class="session-user">👤 Welcome, {userName}</span>` with the `userName` derivation at `app/page.jsx:22` (`session.user?.name || session.user?.email || 'authorised traveller'`) and the `.session-user` CSS rule at `globals.css:249-251` (`color: var(--text-secondary); font-size: 0.88rem`). The first Draft of spec 023 missed this existing implementation and proposed a bespoke chip with its own wording. This revision aligns spec 023 with the trips-dashboard implementation verbatim where the two projects share the same CSS custom properties (`--text-secondary`, `--bg-secondary`, `--border-color`) and diverges only in chip styling — the spec permits the meals-dashboard chip to use the existing rounded-rect treatment matching `<SignOutButton />` (in addition to the trips plain-text treatment) for visual consistency with the surrounding header chips. Cross-dashboard wording parity (`👤 Welcome, <name>`, fallback string `authorised traveller`) is the explicit design goal of US2.

- Status after change: Draft

- Rationale: Danny asked on 2026-06-17 to add the logged-in user to the summary dashboard, positioned top-right next to the light/dark theme, then sent a screenshot from the trips-dashboard showing `👤 Welcome, Danny Tsang` with explicit instruction to "reuse the code from that repository to save time". The first Draft of spec 023 (proposing a bespoke chip with `UserChip` component, lucide-react `User` icon, and a `<SignOutButton />`-style rounded-rect styling) was off-target: the trips dashboard already implements the same affordance, and Danny's instruction is to reuse it. The spec was rewritten to make the trips-dashboard implementation the reference source of truth; FR-014 requires the chip to reuse the trips JSX shape and CSS where practical; Key Entities lists the trips-dashboard paths as the source of truth; the user's screenshot is captured in US2 as the visual contract.

- Implementation impact: None yet (Draft). When promoted to Proposed, expected changes: new `lib/user-chip.ts` (pure helper + `USER_NAME_FALLBACK` constant + `resolveUserChipName` function), new `components/user-chip.tsx` (chip component reusing trips JSX shape and CSS class), small updates to `app/page.tsx` (derive `userName`, pass to `<DashboardClient />`) and `components/dashboard-client.tsx` (render chip in existing flex row), new tests (`lib/user-chip.test.ts`, `components/user-chip.test.tsx`, integration test in `components/dashboard-client.test.ts`), and `skill.spec.yaml` `expected_artifacts:` update. No changes to OIDC config, middleware, sync script, blob layout, or debug-mode helper. Estimated surface: ~80 lines of new code + ~150 lines of tests, all UI-adjacent, with ~70% of the JSX and CSS reused from the trips-dashboard verbatim.

- Evidence: The reference implementation lives at `/home/hermes/workspace/trips-dashboard/`:
  - `app/page.jsx:22` — `const userName = session.user?.name || session.user?.email || 'authorised traveller';`
  - `components/dashboard-session-surface.jsx:192` — `<span className="session-user">👤 Welcome, {userName}</span>`
  - `app/globals.css:224-251` — `.session-header`, `.session-actions`, `.session-user` rules.
  - The Danny-sent screenshot shows the chip rendering in the trips-dashboard top-right header with the `👤 Welcome, Danny Tsang` wording, matching the trips source verbatim.
  - The existing top-right header at `components/dashboard-client.tsx:254-260` already renders `<ThemeToggle />` and `<SignOutButton />` in a flex row — the chip joins this row, no structural change.
  - Spec 015 (OIDC) owns the session contract; spec 022 (debug mode) owns the operator-gated surface — both are explicitly referenced and explicitly NOT modified.