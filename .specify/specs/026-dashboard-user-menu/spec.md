---
name: dashboard-user-menu
description: "Add a click-to-open dropdown menu anchored to the existing logged-in user chip (spec 023). The menu lists the user identity (read-only header), the Debug toggle (spec 022), the Light/Dark theme toggle (spec 012), and Sign out (spec 015) as menu rows. Click-outside / Escape close the menu. The chip itself stays as the at-a-glance identity confirmation from spec 023 but becomes an interactive button when it has menu items to offer."
---

# Feature Specification: Dashboard User Menu

Feature ID: `026-dashboard-user-menu`

Feature Name: Dashboard User Menu

Target Skill: `data-science/meals-check`

Created: 2026-06-18

> **Rev 2 (2026-06-19)**: Debug menu row visibility flipped from `debugOn && ...` conditional to always-visible. See CHANGELOG.md. FR-005, FR-013, US-2 (scenarios 7-9), Promotion Criteria for Final, Open Questions, Key Entities, and Verification Plan all updated to reflect the always-visible first-time-enablement design.

Status: Final

Change history: CHANGELOG.md

## Background

The meals-dashboard top-right header currently exposes four user/operator surfaces as separate inline controls:

| Position | Component | Owner spec |
|---|---|---|
| 1 | `<DemoModeChip />` (when demo mode active) | `024-dashboard-static-fixture-mode-for-preview` |
| 2 | `<UserChip userName={userName} />` — read-only `<span>` showing `👤 Welcome, <name>` | `023-dashboard-logged-in-user-chip` |
| 3 | `<DebugToggle initialEnabled={...} />` — flips the per-user HMAC-signed `meals_debug_mode` cookie | `022-dashboard-debug-mode` |
| 4 | `<ThemeToggle />` — light/dark theme switch | `012-dashboard-theme-toggle` |
| 5 | `<SignOutButton />` — ends the NextAuth session | `015-dashboard-oidc-authentication` |

Each of these is a single-purpose inline chip or button. The result on a narrow viewport is a row of five small affordances competing for attention. Three of them (Debug, Theme, Sign out) are operator actions that are used only occasionally; only the UserChip carries persistent identity information.

On 2026-06-18 Danny asked to "create a menu when click and move the debug, light/dark theme and log out button as menu items" under the logged-in user. This spec formalises that request: the UserChip becomes an interactive button that toggles a dropdown menu; the dropdown contains the user identity as a header row followed by Debug, Theme, and Sign out as menu items. The chip retains its read-only identity semantics (always shows who is signed in) but gains a chevron affordance and a click handler.

The Debug menu item is **always-visible** — the row is rendered regardless of whether the `meals_debug_mode` signed cookie is set, and reflects the current cookie state via `aria-checked` (`'true'` when the cookie verifies to `'1'`, `'false'` otherwise). Clicking the row POSTs to `/api/debug/toggle` with the flipped value, preserving the toggle behaviour of the inline `<DebugToggle />` it replaced and restoring the always-visible first-time-enablement path the pre-spec-026 inline toggle provided. Server-side gating (spec 022 Rev 3) is preserved by the cookie verification in `effectiveDebugMode()` — the row's initial `aria-checked` state reflects what the server has authorised; the `/api/debug/toggle` endpoint re-verifies the signed cookie on each POST. The menu items reflect the same server-side gating the inline surfaces do; no new server surface area, no new feature switch.

The dropdown is a client component (`'use client'`) because it owns open/close state and outside-click/escape listeners. It uses no new dependencies — React's `useState` / `useEffect` / `useRef` plus the existing lucide-react icon set already in the project.

## Cross-Dashboard Reuse Check

Before drafting, the cross-dashboard affordance reuse rule (per `cross-dashboard-affordance-reuse` skill) was applied: grep `/home/hermes/workspace/trips-dashboard/` for any existing menu/dropdown/UserMenu/ProfileMenu/chevron affordance. **No hit.** Trips-dashboard does not currently implement a user menu; its identity surface is the same flat `<span className="session-user">` chip from spec 023. This spec introduces the menu pattern in the meals dashboard; if trips-dashboard later adopts the same pattern, parity will be enforced via cross-dashboard wording parity clause (see FR-019).

## Promotion Criteria for Final

This spec is now `Status: Final, readiness: already_satisfied` after the implementation was merged to the production meals-dashboard branch, the local test/build suite passed, and the live production site responded successfully. Preview-only deployment is necessary but not sufficient.

The promotion criteria below are the checks that were satisfied before finalisation:

- The user chip is rendered as a `<button>` with `aria-haspopup="menu"` and `aria-expanded` reflecting open state.
- Clicking the chip toggles a dropdown containing (in order): user identity header row, Debug toggle row (when the spec-022 cookie is set), Theme toggle row, Sign out row.
- Click outside the menu closes it; Escape closes it; clicking the trigger again toggles it closed.
- Light/dark theme readability holds in production for both the trigger and the dropdown panel.
- The production JS bundle is grep-clean for `localStorage.getItem('meals_debug_mode')`, hard-coded menu coordinates, and any inline `window.confirm` calls related to sign-out.
- Debug menu row is **always-visible** regardless of the `meals_debug_mode` signed cookie state. When the cookie verifies to `'1'` (`debugOn` is true), the row renders with `aria-checked="true"`. When the cookie is unset or tampered (server treats as unset, `debugOn` is false), the row still renders, with `aria-checked="false"`, and clicking it POSTs to `/api/debug/toggle` with `{ value: '1' }` to enable debug mode for the first time. The first-time-enablement path is a UI affordance (per FR-005 Rev 2 + US-2).
- The DebugToggle's existing behaviour (POST `/api/debug/toggle`, optimistic update, error revert, `router.refresh`) is preserved unchanged inside the menu.
- The ThemeToggle's existing localStorage-backed theme switching is preserved unchanged inside the menu.
- The SignOutButton's existing NextAuth sign-out flow is preserved unchanged inside the menu.
- The UserChip's spec-023 wording parity (emoji + `Welcome, ` + display name, fallback string `authorised traveller`) is preserved inside the menu's identity header row.
- The DemoModeChip from spec 024 is rendered as a separate sibling, NOT inside the menu — demo mode is a data-mode signal, not an action.
- The dashboard's protected-route logic, OIDC configuration, Vercel Blob layout, sync script, and other dashboard features not listed in this spec's Contract Impact section are unchanged.

This rule aligns with the spec-driven-skills convention that `Final` status reflects verified runtime evidence in the live consumer deployment, not a closed task checklist. Danny confirmed on 2026-06-17: "the code should end up in production so its not finalised until its in production".

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Click-to-Open Menu Anchored on the User Chip (Priority: P1)

As Danny, I want to click the existing `👤 Welcome, Danny Tsang` chip and see a dropdown with the Debug, Light/Dark theme, and Sign out actions, so that I can reach these occasional controls without cluttering the header row when the menu is closed.

**Why this priority**: This is the entire reason for the feature. Without an open-on-click menu anchored on the user chip, this spec has no purpose.

**Independent Test**: Load the dashboard, confirm the UserChip is now an interactive button (cursor: pointer, focusable, chevron icon visible to its right). Click it — the dropdown appears below the chip, anchored to the right edge, listing user identity, Debug (always-visible per FR-005 Rev 2, with `aria-checked` reflecting the current `meals_debug_mode` signed-cookie state), Theme, and Sign out. Click outside the dropdown — it closes. Press Escape while focused inside — it closes. Click the chip again while open — it closes.

**Acceptance Scenarios**:
1. Given an authenticated session, When the dashboard renders, Then the UserChip is rendered as a `<button>` element (not a `<span>`) with `data-testid="user-menu-trigger"`, `aria-haspopup="menu"`, and `aria-expanded="false"` by default. The chip text content (`👤 Welcome, <name|email|fallback>`) is preserved from spec 023 unchanged.
2. Given the menu is closed, When the user clicks the trigger, Then the menu opens: `aria-expanded` flips to `"true"`, the dropdown panel becomes visible, and focus moves into the dropdown (to the first interactive item).
3. Given the menu is open, When the user clicks the trigger again, Then the menu closes: `aria-expanded` flips to `"false"`, the dropdown is removed from the DOM (or hidden), and focus returns to the trigger.
4. Given the menu is open, When the user clicks anywhere outside the dropdown AND outside the trigger, Then the menu closes immediately. The click target MUST NOT trigger any action on the underlying page (the handler short-circuits outside clicks).
5. Given the menu is open and focus is anywhere inside the dropdown, When the user presses Escape, Then the menu closes and focus returns to the trigger.
6. Given the menu is open, When the user clicks any of the menu rows, Then the row's underlying action fires (Debug toggle, Theme toggle, or Sign out) and the menu closes immediately afterwards.

### User Story 2 — Debug Menu Row is Always-Visible and Toggles the Cookie (Priority: P1)

As Danny, I want the Debug menu item to always be visible in the menu and to reflect the current `meals_debug_mode` signed-cookie state (on/off), and clicking it to flip that state, so that the menu is the single place I go to toggle debug mode — including from the "never enabled before" first-time state.

**Why this priority**: This is the first-time-enablement path. The pre-spec-026 inline `<DebugToggle />` was always rendered and showed the current cookie state, with click to flip. After spec 026's Rev 1 made the menu's Debug row strictly conditional on `debugOn` being truthy, that bootstrap path closed — users whose cookie was unset had no UI affordance to enable debug mode for the first time. Rev 2 restores the always-visible affordance: the row is in the menu regardless of cookie state, and click flips it.

**Independent Test**: With the `meals_debug_mode` signed cookie unset (clean-slate session — first-time user, freshly cleared cookies, freshly rotated `NEXTAUTH_SECRET`), load the dashboard, open the menu — confirm the Debug menu item is present, shows `aria-checked="false"`, and clicking it POSTs to `/api/debug/toggle` with `{ value: '1' }`. With the cookie set to `1`, open the menu — confirm the Debug row is present with `aria-checked="true"` and clicking POSTs `{ value: '0' }`. With the cookie tampered (unsigned), confirm the Debug row is present with `aria-checked="false"` (the server treats the tampered cookie as unset per spec 022 Rev 3).

**Acceptance Scenarios**:
7. Given the `meals_debug_mode` signed cookie is unset or tampered (server treats it as unset — `debugOn` is false), When the dashboard renders, Then the Debug menu item IS rendered (always-visible, per FR-005 Rev 2), with `aria-checked="false"` and an "off" state indicator. The menu contains identity header, Debug, Theme, and Sign out rows in DOM order.
8. Given the `meals_debug_mode` signed cookie is unset or tampered (`debugOn` is false) and the user clicks the Debug row, When the click handler runs, Then the handler POSTs to `/api/debug/toggle` with `{ value: '1' }` to enable debug mode. On success `aria-checked` flips to `'true'` and `router.refresh()` runs; on failure the optimistic update reverts.
9. Given the `meals_debug_mode` signed cookie is set to `'1'` (`debugOn` is true), When the dashboard renders, Then the Debug menu item is rendered with `aria-checked="true"`. Clicking the row POSTs to `/api/debug/toggle` with `{ value: '0' }`; on success the row state updates to `aria-checked="false"` and `router.refresh()` runs (per spec 022).
10. Given the menu is open and the Debug row is in a pending state (POST in flight), When the user clicks the row again, Then the click is ignored (button disabled) until the POST resolves.

### User Story 3 — Identity Header Row Inside the Menu (Priority: P2)

As Danny, I want the top of the dropdown to show my signed-in identity (name/email/fallback) as a non-interactive header row, so that I can confirm "which session is this menu attached to" at a glance when the menu is open, separately from the chip text.

**Why this priority**: The chip already shows the identity, but having it echoed inside the menu (with slightly more breathing room and a "Signed in as" label) makes the menu's scope self-explanatory — the menu belongs to this user.

**Independent Test**: Sign in as two different Authentik users in sequence. Open the menu each time. Confirm the identity header row inside the menu matches the chip text, derived the same way (`session.user?.name || session.user?.email || 'authorised traveller'`).

**Acceptance Scenarios**:
11. Given the menu is open, When the identity header row is inspected, Then it shows a "Signed in as" label followed by the same display value the chip shows. The label uses `var(--text-secondary)`, the value uses `var(--text-primary)`. The row is non-interactive (`<div>` with `role="presentation"` or `<div>` with `aria-hidden="true"`); it MUST NOT be focusable, MUST NOT respond to clicks, and MUST NOT contain an `<a>` or `<button>`.
12. Given the user signs out via the menu, When the redirect to `/api/auth/signout` lands, Then the identity header row is not rendered (the menu is gone with the dashboard).

### User Story 4 — Theme and Sign out Menu Items Behave Identically to the Inline Surfaces (Priority: P1)

As Danny, I want the Theme and Sign out menu rows to do exactly what the inline `<ThemeToggle />` and `<SignOutButton />` do today, so that I don't need to relearn behaviour by switching from inline to menu access.

**Why this priority**: These are the rows the user will hit most often inside the menu. Any deviation from inline behaviour is a regression.

**Independent Test**: Open the menu, click the Theme row — confirm the theme flips (light ↔ dark) and the localStorage key persists across reloads (per spec 012). Open the menu, click Sign out — confirm the NextAuth sign-out flow runs and the user lands back on the sign-in page (per spec 015).

**Acceptance Scenarios**:
13. Given the menu is open, When the user clicks the Theme row, Then the theme flips (light ↔ dark) and the change persists across reloads. The row's icon updates from sun to moon (or equivalent per spec 012) reflecting the new state. The menu closes after the click.
14. Given the menu is open, When the user clicks Sign out, Then the NextAuth sign-out flow runs and the user is redirected to the sign-in page. The menu MUST close before navigation starts.
15. Given the menu is open, When the user uses Tab/Shift+Tab to navigate between menu rows, Then focus moves in DOM order: identity header (skipped — non-interactive), Debug, Theme, Sign out. Escape returns focus to the trigger.

### User Story 5 — Keyboard Accessibility and Screen-Reader Semantics (Priority: P1)

As Danny, I want the menu to be usable from the keyboard and announced correctly by screen readers, so that the affordance is not gated on mouse interaction.

**Why this priority**: Header chrome is the surface most exposed to keyboard / screen-reader users; getting the ARIA semantics wrong makes the menu unreachable for those users.

**Independent Test**: Use keyboard only — Tab to the trigger, press Enter/Space to open, Tab through menu rows, press Enter to activate, Escape to close. With a screen reader (or by inspecting ARIA), confirm the trigger announces as a menu button, the panel announces as a menu, and each row announces as a menu item with its accessible name.

**Acceptance Scenarios**:
16. Given the trigger has focus, When the user presses Enter or Space, Then the menu opens (same as a click). The trigger is a real `<button type="button">` and responds to native button activation.
17. Given the menu is open, When focus is inside the dropdown, Then `aria-activedescendant` (or roving tabindex) drives focus through the menu rows. Each row is a `<button>` or `<div role="menuitem">` with an accessible name composed of icon + label.
18. Given the dropdown is rendered, When inspected with axe / Lighthouse, Then no ARIA violation is reported for the trigger / panel / rows. The panel has `role="menu"` and each row has `role="menuitem"` (or `role="menuitemcheckbox"` for the Debug row's toggle semantics). The trigger's `aria-controls` references the panel's `id`.

### User Story 6 — Visual Treatment and Theme Awareness (Priority: P2)

As Danny, I want the dropdown panel to look like a coherent extension of the header chrome (rounded-rect chip aesthetic, light/dark theme aware), so that it doesn't visually shout as a foreign widget.

**Why this priority**: Header dropdowns that look out of place get ignored. The visual treatment should match the existing chip pattern.

**Independent Test**: Open the menu in light and dark themes. Confirm the panel uses `var(--bg-secondary)` background, `var(--border-color)` border, `var(--text-primary)` text, and `border-radius: 8px` (or the existing chip border-radius). The panel sits below the trigger with a small gap and a subtle shadow in light theme (less prominent in dark theme per the dashboard's existing shadow tokens).

**Acceptance Scenarios**:
19. Given the menu is open, When the panel is inspected, Then it uses `backgroundColor: var(--bg-secondary)`, `border: 1px solid var(--border-color)`, `color: var(--text-primary)`, and `border-radius: 8px`. The panel has `min-width: 220px` and is anchored to the right edge of the trigger (the right edge of the panel aligns with the right edge of the trigger).
20. Given the menu is open in light vs dark theme, When the panel is rendered, Then it remains readable in both themes without any colour overrides. The hover state on each row uses `var(--bg-tertiary)` for the background.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The UserChip from spec 023 MUST be re-rendered as a `<button>` element with `type="button"`, `data-testid="user-menu-trigger"`, `aria-haspopup="menu"`, `aria-expanded={open ? "true" : "false"}`, and `aria-controls="user-menu-panel"`. The chip's text content (`👤 Welcome, <userName>`) is preserved unchanged. The chip MUST remain server-rendered for its text content; the menu open/close logic lives in a thin client wrapper (see FR-007).

- **FR-002**: A chevron-down icon MUST be rendered immediately to the right of the chip text inside the trigger button. The chevron MUST be `lucide-react`'s `ChevronDown` icon at the same visual weight as the existing chip's emoji glyph. The chevron MUST rotate 180° when the menu is open (CSS transform). The chevron MUST be `aria-hidden="true"`.

- **FR-003**: A dropdown panel MUST be rendered when the menu is open, with `id="user-menu-panel"`, `role="menu"`, and `aria-labelledby` pointing at the trigger's `id`. The panel's children, in DOM order:
  1. **Identity header row** — non-interactive `<div>` with `aria-hidden="true"` containing the literal label "Signed in as " followed by the same `userName` string the chip shows.
  2. **Debug menu row** (always-visible, see FR-005 Rev 2) — `<button role="menuitemcheckbox" aria-checked={debugEnabled ? "true" : "false"}>` showing the bug icon + label "Debug mode" + current state text ("on" / "off").
  3. **Theme menu row** — `<button role="menuitem">` showing the theme icon + label "Theme" + current state text ("light" / "dark").
  4. **Sign out menu row** — `<button role="menuitem">` showing the logout icon + label "Sign out".

- **FR-004**: The panel MUST be positioned absolutely below the trigger with `position: absolute`, `top: calc(100% + 6px)`, `right: 0` (right-anchored to the trigger), `min-width: 220px`, `z-index: 60` (above the header's `z-index: 50`). The panel MUST render inside a wrapper `<div style={{ position: 'relative' }}>` that wraps the trigger button so the absolute positioning is local to the trigger.

- **FR-005**: The Debug menu row MUST be rendered unconditionally (regardless of whether the server-rendered `debugOn` prop is truthy or falsy). The row's `aria-checked` state MUST reflect the current `debugOn` value (`'true'` when the `meals_debug_mode` signed cookie verifies to `'1'`, `'false'` otherwise). Clicking the row MUST POST to `/api/debug/toggle` with the flipped value (`{ value: '1' }` when `debugOn` is false, `{ value: '0' }` when `debugOn` is true), preserving the toggle behaviour of the inline `<DebugToggle />` it replaced. The row is the always-visible first-time-enablement path: a user who has never set the `meals_debug_mode` cookie sees the row in the "off" state and clicks it to enable debug mode for the first time. This restores the affordance the pre-spec-026 inline `<DebugToggle initialEnabled={!!debugOn} />` provided, where the toggle was rendered unconditionally and showed the current cookie state. Server-side gating (spec 022 Rev 3) is preserved by the cookie verification in `effectiveDebugMode()` — the row's initial `aria-checked` state reflects what the server has authorised; clicking the row always POSTs and the server re-verifies on the next request. The implementation MUST NOT introduce a new feature switch.

- **FR-006**: The Theme menu row MUST trigger the same theme toggle action as the inline `<ThemeToggle />` (spec 012). The row's icon MUST switch between `Sun` and `Moon` (lucide-react) reflecting the next state after click, and the change MUST persist in `localStorage` under the same key the inline toggle uses (`'meals-theme'` per spec 012).

- **FR-007**: The Sign out menu row MUST trigger the same sign-out action as the inline `<SignOutButton />` (spec 015). The row is a `<button>` that, on click, navigates to `/api/auth/signout` (the NextAuth sign-out endpoint). The menu MUST close before navigation starts.

- **FR-008**: Click-outside MUST close the menu. The implementation MUST register a `mousedown` (or `pointerdown`) listener on `document` while the menu is open and call `setOpen(false)` when the event target is outside both the trigger and the panel. The listener MUST be removed when the menu closes or the component unmounts.

- **FR-009**: Escape key MUST close the menu. The implementation MUST register a `keydown` listener on `document` while the menu is open and call `setOpen(false)` when the key is `Escape`. Focus MUST return to the trigger. The listener MUST be removed when the menu closes or the component unmounts.

- **FR-010**: The menu MUST close after any menu row is activated (after the row's underlying action starts). For Debug and Theme, the close happens immediately on click. For Sign out, the close happens before navigation.

- **FR-011**: When the menu opens, focus MUST move to the first interactive menu row (Debug, Theme, or Sign out — whichever is first in DOM order and rendered). When the menu closes via click-outside, Escape, or row activation, focus MUST return to the trigger button.

- **FR-012**: The menu component MUST be a thin client component (`'use client'`) that wraps the existing server-rendered UserChip. The chip's text derivation (spec 023 `resolveUserChipName`) and the chip's `data-testid="user-chip"` / `className="session-user"` attributes MUST remain server-rendered. The menu wrapper MUST accept the existing props (`userName: string`) plus the new props needed for the menu items: `debugOn?: boolean` (optional, server-rendered), and the three menu-row click handlers.

- **FR-013**: The Debug menu row's toggle behaviour MUST POST to `/api/debug/toggle` with `{ value: <flipped> }` where `<flipped>` is the opposite of the row's current `aria-checked` state (`'1'` when the current state is `'false'`, `'0'` when the current state is `'true'`) — per spec 022 FR-005. On success the row's `aria-checked` updates optimistically and `router.refresh()` runs. On HTTP error the optimistic update reverts and a small inline error text appears next to the row label (matching the existing inline `<DebugToggle />` error rendering). The row MUST be `disabled` while the POST is in flight.

- **FR-014**: The DemoModeChip from spec 024 MUST NOT be moved into the dropdown. The demo mode indicator is a data-mode signal that must remain visible whenever demo mode is active, regardless of whether the menu is open. The DemoModeChip is rendered as a separate sibling of `<UserMenu />` in the action row (per spec 024 FR-017 placement rule).

- **FR-015**: The implementation MUST be in a new module `components/user-menu.tsx` and a new test module `components/user-menu.test.tsx`. The existing `<UserChip />` module (`components/user-chip.tsx`) is unchanged — the menu wraps it. The existing `<DebugToggle />`, `<ThemeToggle />`, and `<SignOutButton />` modules are unchanged; the menu imports their internal click handlers (or refactors them to expose pure handler functions; see FR-016).

- **FR-016**: To keep behaviour parity with the inline surfaces, the implementation MAY extract each row's click handler into a pure function in a new `lib/user-menu.ts` module (`toggleTheme()` based on spec 012, `signOut()` based on spec 015, `toggleDebug()` based on spec 022) so the menu rows and the inline surfaces call the same code. The inline `<DebugToggle />`, `<ThemeToggle />`, and `<SignOutButton />` components MUST be updated to call the same pure functions when practical — the menu is a new consumer of the same logic, not a duplicate. The pure functions MUST be unit-tested independently.

- **FR-017**: The implementation MUST add Vitest tests in `components/user-menu.test.tsx` covering: (a) trigger renders as `<button>` with the expected `aria-*` and `data-testid` attributes, (b) trigger text matches spec 023 wording, (c) clicking trigger toggles open state, (d) Escape closes, (e) click outside closes, (f) clicking trigger while open closes, (g) Debug row absent when `debugOn=false`, (h) Debug row present and toggleable when `debugOn=true`, (i) Theme row always present and click flips `data-meals-theme` in DOM-localstorage-like state, (j) Sign out row always present and click triggers sign-out navigation, (k) focus returns to trigger on Escape, (l) focus moves into menu on open. A separate `lib/user-menu.test.ts` MUST cover the pure `toggleTheme`, `signOut`, `toggleDebug` helpers.

- **FR-018**: The implementation MUST NOT change the OIDC configuration, NextAuth session strategy, the auth callback URL, the dashboard's protected-route logic, the Vercel Blob layout, the sync script, the debug-mode cookie signing helper, or any other dashboard feature not listed in this spec's Contract Impact section.

- **FR-019**: Cross-dashboard wording parity: the chip text inside the trigger reads `👤 Welcome, <userName>` and the identity header row inside the dropdown reads `Signed in as <userName>`, both using the same `userName` derivation as spec 023 (`session.user?.name || session.user?.email || 'authorised traveller'`). If the trips-dashboard later adopts a similar menu pattern, the menu row labels (Debug mode / Theme / Sign out) and the identity label (`Signed in as`) MUST be updated in lockstep to maintain parity.

- **FR-020**: The implementation MUST update `skill.spec.yaml` `expected_artifacts:` to include this spec directory's six artefacts plus the new source files (`components/user-menu.tsx`, `components/user-menu.test.tsx`, `lib/user-menu.ts`, `lib/user-menu.test.ts`) and any new files extracted from the inline surfaces per FR-016.

- **FR-021**: The implementation MUST NOT introduce new npm dependencies. Reuse existing project dependencies (React hooks, lucide-react icons).

- **FR-022**: The implementation MUST update the existing `components/dashboard-client.tsx` header action row to replace the standalone `<UserChip />` and the three inline controls (`<DebugToggle />`, `<ThemeToggle />`, `<SignOutButton />`) with a single `<UserMenu userName={userName} debugOn={!!debugOn} />` element. The `<DemoModeChip />` remains a separate sibling. The action row layout (flex row, gap, wrapping) is unchanged. Spec 023's existing test in `components/dashboard-client.test.ts` MUST be updated to assert the new structure (no standalone `<UserChip />`, no standalone `<DebugToggle />` / `<ThemeToggle />` / `<SignOutButton />` in the header, presence of `<UserMenu />` with `userName` and `debugOn` props).

- **FR-023**: The inline `<DebugToggle />`, `<ThemeToggle />`, and `<SignOutButton />` components remain in the codebase as the row-level reusable units (so they can still be tested in isolation and reused in `/debug` or other surfaces) but are NO LONGER rendered in the main dashboard's top-right header. They are invoked through `<UserMenu />` only.

### Non-Functional Requirements

- **NFR-001**: The dropdown's first paint MUST add zero perceptible latency to the dashboard's first paint. The menu wrapper is `code-split`-friendly (lazy-imported by default); the menu component JS is only loaded when the trigger is clicked. Verify via the dashboard's existing bundle analysis.

- **NFR-002**: The dropdown's render code MUST add at most ~2 KB to the production JavaScript bundle (the menu wrapper + the panel + the click-outside/escape handlers + the row components). Use existing UI primitives and icon set to keep the bundle delta small.

- **NFR-003**: The menu MUST be accessible. All interactive elements MUST have accessible names (via text content or `aria-label`). The trigger MUST announce as a menu button. The panel MUST announce as a menu. Each row MUST announce as a menu item with its label. The chevron icon MUST be `aria-hidden="true"`. The identity header row MUST be `aria-hidden="true"` (it is decorative; the trigger already carries the accessible identity).

- **NFR-004**: The menu MUST NOT retain any global state, listen to any global events other than the local `mousedown` / `keydown` listeners it owns, or poll any timer. Open/close state is local component state only.

- **NFR-005**: The menu MUST NOT log to the console in production, MUST NOT make network requests on its own (only the row handlers, when activated, do), and MUST NOT modify the `meals_debug_mode` cookie directly (the server-side `/api/debug/toggle` endpoint is the only writer).

### Open Questions *(resolved)*

1. **Trigger surface — chip vs new button vs kebab** — Resolved: chip becomes the trigger. The existing user-identity affordance is the natural anchor; no new header chrome is added. Confirmed in the 2026-06-18 session.
2. **Should the menu include the DemoModeChip?** — Resolved: NO. The DemoModeChip is a data-mode signal that must remain visible whenever demo mode is active, regardless of menu state. Moving it inside the menu would hide the signal when the menu is closed, which defeats spec 024 FR-021's "permanent banner" intent.
3. **Should the menu include a "Profile" or "Settings" row?** — Resolved: NO for this Draft. There is no profile page in either dashboard; adding one is out of scope. A future spec may add rows if/when profile / settings surfaces exist.
4. **Should the Debug menu item be a toggle (checkbox semantics) or a button?** — Resolved: checkbox semantics (`role="menuitemcheckbox"`, `aria-checked`) so the current state is announced and the next action is implicit. This matches the inline `<DebugToggle />` toggle semantics.
5. **Should focus management use roving tabindex or `aria-activedescendant`?** — Resolved: `aria-activedescendant` is preferred for menu semantics; roving tabindex is a fallback. Implementation choice deferred to the implementer; the contract is "focus is in the menu when open and returns to the trigger on close".
6. **(Rev 2, 2026-06-19) Should the Debug menu row be conditional or always-visible?** — Resolved (Rev 2): always-visible. The pre-spec-026 inline `<DebugToggle />` was rendered unconditionally and showed the current cookie state, with click to flip. Rev 1 made the menu's Debug row strictly conditional on `debugOn` being truthy (matching spec 022 line 45's "rendered only when the cookie is set" wording), which closed the first-time-enablement path: users whose cookie was unset had no UI affordance to enable debug mode for the first time. Rev 2 restores the always-visible affordance. The row's initial `aria-checked` reflects the server's `debugOn` decision; clicking the row POSTs to `/api/debug/toggle` with the flipped value (so `'1'` when off, `'0'` when on); server-side cookie verification on each POST enforces the gate.

### Future Considerations (deferred — listed for awareness, NOT in this Draft's surface)

- **Profile row** — out of scope until a profile surface exists.
- **Multi-account switcher** — out of scope. Sign-out + sign-in-as-different-user remains the established pattern.
- **Customisable menu order** — out of scope. Order is fixed: identity header → Debug → Theme → Sign out.
- **Trips-dashboard parity** — if trips-dashboard later adds a similar menu, the wording parity clause (FR-019) triggers a coordinated update.
- **Keyboard shortcut to open the menu** (e.g. `Alt+U`) — out of scope.

### Key Entities

- **UserMenu**: The dropdown menu component. Wraps the existing `<UserChip />` (server-rendered text content) inside a `<button>` trigger and renders the Debug (always-visible per FR-005 Rev 2), Theme, and Sign out menu rows. Client component (`'use client'`). Owns open/close state via `useState`. Registers click-outside / Escape listeners via `useEffect`. Anchors the panel absolutely below the trigger with right-alignment.
- **UserMenuTrigger**: The `<button>` rendered as the first child of `<UserMenu />`. Contains the `<UserChip />` text content (`👤 Welcome, <userName>`) followed by a `ChevronDown` icon that rotates when open. Has `data-testid="user-menu-trigger"`, `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`.
- **UserMenuPanel**: The `<div role="menu">` rendered when open. Contains the identity header row and the menu item rows in DOM order. Has `id="user-menu-panel"`, `aria-labelledby` pointing at the trigger's id.
- **IdentityHeaderRow**: Non-interactive `<div aria-hidden="true">` rendered as the first child of `<UserMenuPanel />`. Contains the literal label "Signed in as " followed by the `userName` string. Visual only.
- **DebugMenuRow**: Always-rendered `<button role="menuitemcheckbox" aria-checked={...}>` for the Debug toggle. Present in every menu open regardless of `meals_debug_mode` signed-cookie state (per FR-005 Rev 2). The row's initial `aria-checked` reflects the server-rendered `debugOn` prop (`'true'` when the cookie verifies to `'1'`, `'false'` otherwise). Clicking the row POSTs the flipped value to `/api/debug/toggle` (`'1'` when off, `'0'` when on), enabling or disabling debug mode for this session. This restores the first-time-enablement path the pre-spec-026 inline `<DebugToggle />` provided.
- **ThemeMenuRow**: Always-rendered `<button role="menuitem">` for the theme toggle. Calls the same pure `toggleTheme()` helper as the inline `<ThemeToggle />` (spec 012).
- **SignOutMenuRow**: Always-rendered `<button role="menuitem">` for sign-out. Calls the same pure `signOut()` helper as the inline `<SignOutButton />` (spec 015).
- **toggleDebug (pure)**: Pure function `toggleDebug(currentEnabled: boolean): Promise<{ ok: boolean; newEnabled: boolean; error?: string }>` in `lib/user-menu.ts`. POSTs to `/api/debug/toggle`. Used by both the inline `<DebugToggle />` and the DebugMenuRow.
- **toggleTheme (pure)**: Pure function `toggleTheme(currentTheme: 'light' | 'dark'): 'light' | 'dark'` in `lib/user-menu.ts`. Reads/writes `localStorage` key `meals-theme`. Used by both the inline `<ThemeToggle />` and the ThemeMenuRow.
- **signOut (pure)**: Pure function `signOut(): void` in `lib/user-menu.ts`. Navigates to `/api/auth/signout`. Used by both the inline `<SignOutButton />` and the SignOutMenuRow.

### Contract Impact

- `components/dashboard-client.tsx`: replaces `<UserChip />` + `<DebugToggle />` + `<ThemeToggle />` + `<SignOutButton />` with `<UserMenu userName={userName} debugOn={!!debugOn} />` in the action row. The `<DemoModeChip />` placement is unchanged.
- `components/user-menu.tsx` (new): the dropdown menu component (client). Imports the pure helpers from `lib/user-menu.ts`.
- `components/user-menu.test.tsx` (new): component tests.
- `lib/user-menu.ts` (new): the pure `toggleDebug`, `toggleTheme`, `signOut` helpers plus any shared types.
- `lib/user-menu.test.ts` (new): pure-function tests.
- `components/user-chip.tsx`: UNCHANGED. The chip text content is rendered server-side as before; the menu wrapper adopts the existing chip.
- `components/debug-toggle.tsx`: UNCHANGED in behaviour; may be refactored to call `toggleDebug()` from `lib/user-menu.ts` instead of inlining the fetch.
- `components/theme-toggle.tsx`: UNCHANGED in behaviour; may be refactored to call `toggleTheme()` from `lib/user-menu.ts`.
- `components/sign-out-button.tsx`: UNCHANGED in behaviour; may be refactored to call `signOut()` from `lib/user-menu.ts`.
- `lib/auth.ts`: UNCHANGED. The OIDC configuration is not modified.
- `middleware.ts`: UNCHANGED. The protected-route logic is not modified.
- `skill.spec.yaml`: `expected_artifacts:` updated for the new spec directory and source files.
- `components/dashboard-client.test.ts`: updated to assert the new structure (per FR-022).

## Verification Plan

- **Unit (`lib/user-menu.test.ts`)**: `toggleTheme('light') === 'dark'`; `toggleTheme('dark') === 'light'`; `toggleDebug(true)` POSTs `{ value: '0' }` and resolves `{ ok: true, newEnabled: false }` on 200; `toggleDebug(true)` resolves `{ ok: false, error: '...' }` on non-2xx; `signOut()` calls `window.location.assign('/api/auth/signout')` (or equivalent navigation).
- **Unit (`components/user-menu.test.tsx`)**: trigger renders as `<button>` with the right `aria-*` and `data-testid` attributes; trigger text contains the userName and the 👤 emoji; clicking the trigger toggles open state; clicking again closes; Escape closes and returns focus to the trigger; click outside closes; clicking any row closes the menu; Debug row is **always** rendered (per FR-005 Rev 2), with `aria-checked="false"` when `debugOn=false` and `aria-checked="true"` when `debugOn=true`; clicking the Debug row when `debugOn=false` POSTs `{ value: '1' }` and when `debugOn=true` POSTs `{ value: '0' }`; Theme row is always present; Sign out row is always present; the `aria-expanded` attribute reflects the open state; the panel has `role="menu"` and an `aria-labelledby` pointing at the trigger; the chevron icon has `aria-hidden="true"`; the identity header row has `aria-hidden="true"`; the `data-testid="user-menu-panel"` attribute is present on the panel.
- **Integration (`components/dashboard-client.test.ts` updated per FR-022)**: dashboard with stubbed `userName` and `debugOn` props renders `<UserMenu />` (not standalone `<UserChip />` + `<DebugToggle />` + `<ThemeToggle />` + `<SignOutButton />`); `<DemoModeChip />` remains a separate sibling.
- **End-to-end (manual)**: load the dashboard, confirm the chip is now a button; click it, confirm the dropdown opens with the expected rows; click Theme, confirm theme flips; click outside, confirm menu closes; press Escape, confirm menu closes; with the debug cookie set, confirm Debug row is present with `aria-checked="true"`; with the debug cookie unset (clean-slate session), confirm Debug row is **present** with `aria-checked="false"` and clicking it POSTs to `/api/debug/toggle` to enable debug mode for the first time; click Sign out, confirm redirect to sign-in; reload and confirm chip text matches spec 023 wording.
- **Regression (manual)**: in a clean-slate session (no `meals_debug_mode` cookie) AND in a session with the cookie set, the menu's Debug row is present in both cases, with `aria-checked` reflecting the cookie state; spec 023 wording parity holds (chip text and identity header row both use `resolveUserChipName` derivation); spec 024 DemoModeChip remains visible when demo mode is active regardless of menu state.
- **Static inspection (manual)**: build the dashboard; grep production JS bundle for `localStorage.getItem('meals_debug_mode')`, hard-coded menu coordinates, `window.confirm`, and confirm no hits outside the menu wrapper; grep for `toggleDebug`, `toggleTheme`, `signOut` and confirm they are exported from `lib/user-menu.ts`.
- **Lint / type / build**: `npx tsc --noEmit`, `npx vitest run`, `npx next build` all pass cleanly with no warnings about unreachable code, unused imports, or new dependencies.

## Reference Material

- **Spec 022 / `components/debug-toggle.tsx`** — the in-header Debug toggle. The DebugMenuRow must call the same endpoint with the same payload shape. The signed `meals_debug_mode` cookie gating is the server-side decision; the menu reflects what the server tells it via `debugOn`.
- **Spec 023 / `components/user-chip.tsx` and `lib/user-chip.ts`** — the user chip. The chip text is preserved; the menu wraps it. `resolveUserChipName` derivation unchanged.
- **Spec 012 / `components/theme-toggle.tsx`** — the theme toggle. The ThemeMenuRow calls the same `toggleTheme()` helper (extracted in this spec).
- **Spec 015 / `components/sign-out-button.tsx` and `lib/auth.ts`** — the sign-out button. The SignOutMenuRow calls the same `signOut()` helper (extracted in this spec).
- **Spec 024 / `components/demo-mode-chip.tsx`** — the demo mode chip. Renders as a separate sibling of `<UserMenu />`; NEVER inside the menu.
- **Cross-dashboard affordance reuse skill** — trips-dashboard grep returned no existing menu pattern; this spec introduces the pattern in meals-dashboard.
- **ARIA Authoring Practices — Menu pattern** — `https://www.w3.org/WAI/ARIA/apg/patterns/menubar/` — the canonical menu semantics used for `role="menu"` / `role="menuitem"` / `aria-haspopup`.