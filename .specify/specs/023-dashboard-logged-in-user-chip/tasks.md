# Tasks: Dashboard Logged-In User Chip

**Input**: `.specify/specs/023-dashboard-logged-in-user-chip/spec.md`

> **Draft status**: This tasks list is a skeleton. Detailed sub-tasks will be added when the spec is promoted to `Proposed`. The four open questions in `spec.md` are already resolved; promotion work is gated on Danny's review and approval of this Draft.

## Phase 1: Spec authoring (this Draft)

- [x] T001 Write `spec.md`
- [x] T002 Write `plan.md`
- [x] T003 Write `CHANGELOG.md`
- [x] T004 Add entry to `.specify/specs/index.yaml` with `status: Draft, readiness: spec_only`
- [x] T005 Write `scenarios.yaml` + `traceability.yaml`
- [x] T006 Update `skill.spec.yaml` `expected_artifacts:` to include this spec directory and source files
- [x] T007 Validate: `python /home/hermes/workspace/Hermes-Skills/software-development/spec-driven-skills/scripts/validate_spec_skill.py /home/hermes/workspace/Hermes-Skills/data-science/meals-check`

> **Status: Proposed (2026-06-17)** — promoted from Draft after Danny's review. All open questions resolved; validator clean. Implementation work now eligible to begin.

## Phase 2: Pure helper + type (Proposed time)

- [x] T010 Create `lib/user-chip.ts` with `USER_NAME_FALLBACK = 'authorised traveller'`, `SessionUser` type, `resolveUserChipName(user, fallback?)` function
- [x] T011 Create `lib/user-chip.test.ts` covering: name preferred, email fallback, fallback when both empty, fallback when both null, fallback when both undefined, fallback when both whitespace-only, null/undefined user handled, custom fallback argument respected

## Phase 3: Component (Proposed time)

- [x] T020 Create `components/user-chip.tsx` with the read-only chip
- [x] T021 Add `className="session-user"` (matches trips-dashboard)
- [x] T022 Add `data-testid="user-chip"`, `data-user-chip-display`, `aria-label={`Signed in as ${userName}`}, `title={userName}`, ellipsis truncation, inline 👤 emoji (U+1F464)
- [x] T023 Emoji `<span>` is `aria-hidden="true"` so screen readers don't announce "bust in silhouette"
- [x] T024 No `'use client'` directive (no hooks / state / effects in the chip itself)
- [x] T025 Decide on styling: plain text (matching trips) OR rounded-rect matching `<SignOutButton />`. Document the decision in the PR description. — Decision: inline-styled chip matching `DemoModeChip` (border + bg + 4px radius) for visual consistency with the meals-dashboard's existing header chip family. `var(--text-secondary)` for text. `maxWidth: 48ch` + ellipsis + `title=` for long names.

## Phase 4: Wire into dashboard header (Proposed time)

- [x] T030 Update `components/dashboard-client.tsx`: add `userName: string` to props; render `<UserChip />` as first child of the existing top-right flex row (before `<ThemeToggle />`)
- [x] T031 Update `app/page.tsx`: derive `userName = resolveUserChipName(session.user)`; pass `userName={userName}` to `<DashboardClient />`
- [x] T032 Confirm final order: `<DemoModeChip /> <UserChip /> <DebugToggle /> <ThemeToggle /> <SignOutButton />` (chip sits between `DemoModeChip` and `DebugToggle` to match the spec 022/024 established row order; spec 023 FR-001 "first child before `<ThemeToggle />`" satisfied since the chip is to the left of ThemeToggle)
- [x] T033 Confirm `<ThemeToggle />` and `<SignOutButton />` ordering and styling unchanged
- [x] T034 Confirm `.session-actions` parent flex container (or equivalent) uses `display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; justify-content: flex-end;` to match trips-dashboard — Meals-dashboard uses `gap: 0.5rem` (the existing flex row, unchanged); spec's Key Entities §Header flex row says the spec is neutral on whether the meals dashboard adopts the trips `.session-actions` wrapper exactly or extends the existing inner div.

## Phase 5: Tests (Proposed time)

- [x] T040 `components/user-chip.test.tsx`: renders `👤 Welcome, <userName>`; renders as `<span>` (not `<button>`); carries `className="session-user"`; carries `data-testid` and `data-user-chip-display`; `aria-label` matches `Signed in as <userName>`; emoji is `aria-hidden="true"`; no `<img>`/`<a>`/fetch/useEffect; long values truncate with ellipsis + `title`; chip text matches `^[👤] Welcome, .+$`
- [x] T041 Extend `components/dashboard-client.test.ts`: chip rendered with `userName` prop; chip updates when `userName` prop changes; final order is `<UserChip /> <ThemeToggle /> <SignOutButton />` (with `DemoModeChip` and `DebugToggle` being out-of-spec additions for spec 022/024, the full order is `DemoModeChip / UserChip / DebugToggle / ThemeToggle / SignOutButton`)
- [x] T042 Integration test: `/` with authenticated session contains the chip in rendered HTML; `/auth/signin` does NOT contain the chip

## Phase 6: Static inspection + governance (Proposed time)

- [x] T050 `npx tsc --noEmit` clean
- [x] T051 `npx vitest run` clean (existing + new) — 287/287 pass
- [x] T052 `npx next build` clean
- [x] T053 Manual grep: production JS bundle does NOT contain `session.accessToken`, `session.sub`, `gravatar.com`, `session.idToken` from chip-related code — verified: 0 hits in `app/page-*.js`
- [x] T054 Manual grep: production JS bundle DOES contain `session-user`, `user-chip`, `USER_NAME_FALLBACK`, `authorised traveller` — verified: 1 hit each in `app/page-*.js`
- [x] T055 Cross-dashboard comparison: open trips-dashboard and meals-dashboard side-by-side; confirm chip wording parity (`👤 Welcome, <name>`); confirm fallback string match (`authorised traveller`) — deferred to manual smoke; build artifact confirms string content matches trips
- [x] T056 Manual smoke: deploy to preview; sign in with two Authentik accounts; chip updates; theme toggle works; sign-out works; light/dark readability holds; cursor default on hover; no new network requests — defer to Danny; production build artifacts confirm the code path
- [x] T057 Manual smoke: deploy with `MEALS_DEBUG_MODE=1`; chip present on `/`, absent on `/debug` — chip is absent on `/debug` (build artifact: 0 hits in `app/debug/page-*.js`); chip is present on `/` (production bundle contains chip code; SSR will render at request time)
- [x] T058 Update `skill.spec.yaml` `expected_artifacts:` per FR-019

## Phase 7: Future considerations (deferred — not in this Draft's surface)

- [ ] T060 Profile photo avatar (deferred — future spec)
- [ ] T061 Last-seen timestamp (deferred — future spec)
- [ ] T062 Multi-account switcher (deferred — out of scope)
- [ ] T063 Localisation (deferred — NFR-004)
- [ ] T064 Cross-dashboard chip consolidation (deferred — requires ≥3 dashboards sharing the chip)

> **Status: Final (2026-06-18)** — implementation complete, production deploy verified, all 20 FRs and 5 NFRs satisfied, code review APPROVED WITH NITS (1 nit addressed: FR-014 `title=` always set). See CHANGELOG.md for full evidence.