# Implementation Plan — Dashboard User Menu (Spec 026)

Status: Final

Implementation complete; see CHANGELOG.md.

## Phase 1 — Pure helpers (`lib/user-menu.ts`)

T001. Extract `toggleDebug(currentEnabled: boolean): Promise<{ ok: boolean; newEnabled: boolean; error?: string }>` from `components/debug-toggle.tsx` into `lib/user-menu.ts`. The pure helper POSTs to `/api/debug/toggle` with `{ value: <flipped> }` and returns the outcome. The existing inline `<DebugToggle />` is updated to call `toggleDebug()` instead of inlining the fetch.

T002. Extract `toggleTheme(currentTheme: 'light' | 'dark'): 'light' | 'dark'` from `components/theme-toggle.tsx` into `lib/user-menu.ts`. Reads / writes the `meals-theme` localStorage key and returns the new theme. The existing inline `<ThemeToggle />` is updated to call `toggleTheme()`.

T003. Extract `signOut(): void` from `components/sign-out-button.tsx` into `lib/user-menu.ts`. Navigates to `/api/auth/signout`. The existing inline `<SignOutButton />` is updated to call `signOut()`.

T004. Add `lib/user-menu.test.ts` with Vitest tests for each pure helper.

## Phase 2 — Menu component (`components/user-menu.tsx`)

T005. Create `components/user-menu.tsx` as a thin client component. Wrap the existing server-rendered `<UserChip />` inside a `<button>` trigger. Render the `<ChevronDown>` icon next to the chip text inside the trigger.

T006. Add open/close state via `useState(false)`. Wire the trigger's `onClick` to toggle. Add `useEffect` to register `mousedown` (outside click) and `keydown` (Escape) listeners while open; remove on close/unmount.

T007. Render the dropdown panel conditionally when open. Position absolutely below the trigger, right-aligned, with `z-index: 60`.

T008. Render the identity header row (non-interactive `<div aria-hidden="true">`) as the first child of the panel.

T009. Render the Debug menu row always (no `debugOn &&` guard, per FR-005 Rev 2). Use `role="menuitemcheckbox"` and `aria-checked` reflecting the `debugOn` prop. Reuse the `toggleDebug()` helper from `lib/user-menu.ts`. Optimistic update + revert on error + `router.refresh()` on success. Clicking POSTs `{ value: '1' }` when off, `{ value: '0' }` when on — the row is the first-time-enablement path for users with the `meals_debug_mode` cookie unset.

T010. Render the Theme menu row always. Use `role="menuitem"`. Reuse the `toggleTheme()` helper from `lib/user-menu.ts`.

T011. Render the Sign out menu row always. Use `role="menuitem"`. Reuse the `signOut()` helper from `lib/user-menu.ts`. Close the menu before navigation.

T012. Wire focus management: on open, move focus to the first interactive row; on close (Escape / outside click / row activation), return focus to the trigger.

T013. Add `components/user-menu.test.tsx` with Vitest tests for the trigger, panel, rows, focus management, and click-outside / Escape handling.

## Phase 3 — Wire-up (`components/dashboard-client.tsx`)

T014. Replace `<UserChip />` + `<DebugToggle />` + `<ThemeToggle />` + `<SignOutButton />` in the action row with `<UserMenu userName={userName} debugOn={!!debugOn} />`. `<DemoModeChip />` remains a separate sibling.

T015. Update `components/dashboard-client.test.ts` per FR-022 to assert the new structure.

## Phase 4 — Spec governance

T016. Update `skill.spec.yaml` `expected_artifacts:` to include the new spec directory and the new source files.

T017. Update `index.yaml` to add the new spec entry (Draft → Proposed → Final lifecycle).

T018. Add the CHANGELOG.md entries.

## Phase 5 — Verification

T019. Run `npx tsc --noEmit`, `npx vitest run`, `npx next build`. Verify clean.

T020. Manual verification per the Verification Plan in spec.md (Production Criteria block).

T021. Capture production deployment evidence per the Promotion Criteria for Final block.

## Phase 6 — Promotion

T022. Promote `Status: Draft` → `Status: Proposed` (atomic two-file write: state.yaml + index.yaml) after Danny approves the Draft.

T023. Promote `Status: Proposed` → `Status: Final` (atomic two-file write) after production deployment evidence is captured.