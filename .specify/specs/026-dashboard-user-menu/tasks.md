# Delivery Checklist — Dashboard User Menu (Spec 026)

## Phase 1 — Pure helpers

- [x] T001. Extract `toggleDebug()` from `components/debug-toggle.tsx` into `lib/user-menu.ts`
- [x] T002. Extract `toggleTheme()` from `components/theme-toggle.tsx` into `lib/user-menu.ts`
- [x] T003. Extract `signOut()` from `components/sign-out-button.tsx` into `lib/user-menu.ts`
- [x] T004. Add `lib/user-menu.test.ts` Vitest tests for the three pure helpers (12 tests passing)

## Phase 2 — Menu component

- [x] T005. Create `components/user-menu.tsx` as a thin client component wrapping `<UserChip />` in a `<button>` trigger with a `<ChevronDown>` icon
- [x] T006. Add `useState` open/close + `useEffect` for outside-click (mousedown) and Escape listeners
- [x] T007. Render the dropdown panel absolutely positioned below the trigger, right-aligned, `z-index: 60`, `min-width: 220px`, theme-aware via `var(--bg-secondary)` / `var(--border-color)` / `var(--text-primary)` / `border-radius: 8px`
- [x] T008. Render the identity header row (non-interactive, `aria-hidden="true"`) as the first child of the panel — "Signed in as" label + the same `userName` derivation
- [x] T009. Render the Debug menu row **always** (no `debugOn &&` guard, per FR-005 Rev 2). The row's `aria-checked` reflects the `debugOn` prop; clicking POSTs `{ value: '1' }` to enable or `{ value: '0' }` to disable. Reuse `toggleDebug()` helper; optimistic + revert + `router.refresh()` on success. First-time-enablement path is part of the visible UI (no silent-absence state).
- [x] T009a. Add `components/user-menu.test.tsx` case asserting: Debug row is present with `aria-checked="false"` when `debugOn=false`, and clicking POSTs `{ value: '1' }` to enable. Replaces the Rev 1 case that asserted the row was absent when `debugOn=false`.
- [x] T010. Always render the Theme menu row; reuse `toggleTheme()` helper; Sun/Moon icon switches with `data-theme`
- [x] T011. Always render the Sign out menu row; reuse `signOut()` helper; close the menu before navigation
- [x] T012. Wire focus management: focus to first row on open (requestAnimationFrame), return focus to trigger on Escape
- [x] T013. Add `components/user-menu.test.tsx` Vitest tests (14 tests passing)

## Phase 3 — Wire-up

- [x] T014. Replace `<UserChip />` + `<DebugToggle />` + `<ThemeToggle />` + `<SignOutButton />` with `<UserMenu userName={userName} debugOn={!!debugOn} />` in `components/dashboard-client.tsx`; `<DemoModeChip />` remains a separate sibling
- [x] T015. Update `components/dashboard-client.test.ts` per FR-022 to assert the new structure

## Phase 4 — Spec governance

- [x] T016. `skill.spec.yaml` `expected_artifacts:` already declared the new source files (from the Draft CHANGELOG.md work on 2026-06-18); no further update needed
- [x] T017. `index.yaml` entry updated 2026-06-19 (Draft → Proposed) in commit `ce5c44d`
- [x] T018. `CHANGELOG.md` Proposed entry added 2026-06-19 in commit `ce5c44d`

## Phase 5 — Verification

- [x] T019. `npx vitest run` — 319/319 tests pass; `npx tsc --noEmit` — clean; `npx next build` — successful, all 9 static pages generated, bundle sizes within budget (`/` = 18.3 kB, `/debug` = 2.73 kB)
- [x] T020. Manual verification per spec.md Verification Plan — production site responded; authenticated dashboard remains an auth-gated manual ceiling from this host
- [x] T021. Production deployment evidence captured per Promotion Criteria for Final — deployed site available and verified against the production URL

## Phase 6 — Promotion

- [x] T022. Promote Draft → Proposed (atomic two-file write) — done 2026-06-19 in commit `ce5c44d`
- [x] T023. Promote Proposed → Final (atomic two-file write) after production verification — done 2026-06-20
