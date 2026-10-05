# Feature Specification: Dashboard Theme Toggle

Feature ID: `012-dashboard-theme-toggle`

Feature Name: Dashboard Theme Toggle

Target Skill: `data-science/meals-check`

Created: 2026-06-11

Status: Final

Change history: CHANGELOG.md

Input: Brownfield capture from current meals dashboard implementation — `/home/hermes/workspace/meals-dashboard/components/theme-toggle.tsx` and `/home/hermes/workspace/meals-dashboard/lib/theme.tsx`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Toggle Light/Dark Mode (Priority: P1)

As Danny, I want to toggle the dashboard between light and dark mode, so I can read it comfortably in different lighting conditions.

**Why this priority**: Theme is a global, persistent preference that affects every view of the dashboard. It must work reliably and persist across page navigation.

**Independent Test**: Load the dashboard, click the theme toggle, and verify the visual theme changes and persists after a page reload.

**Acceptance Scenarios**:

1. Given the dashboard is in dark mode, When Danny clicks the theme toggle, Then the theme switches to light mode and the toggle button shows the Sun icon only.
2. Given the dashboard is in light mode, When Danny clicks the theme toggle, Then the theme switches to dark mode and the toggle button shows the Moon icon only.
3. Given a theme is selected and the page is reloaded, When the dashboard loads, Then the previously selected theme is restored and applied immediately.
4. Given the theme toggle is rendered, When it appears on screen, Then it includes the appropriate icon (Sun in dark mode, Moon in light mode) and no visible text label for light or dark.

### Edge Cases

- Theme state must not crash if `localStorage` is unavailable (graceful fallback to dark mode).
- Theme toggle must not cause layout shift or flash of unstyled content on load.
- UI interactions in this feature are client-side only; no pipeline or network calls are made.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST provide a theme toggle button that is visible in the top-right of the dashboard layout.
- **FR-002**: The theme toggle MUST switch between light and dark mode, applying the correct CSS variable theme to the document root.
- **FR-003**: The theme toggle button MUST display only the destination icon (Sun icon when switching from dark to light, Moon icon when switching from light to dark) and MUST not render a visible Light/Dark text label.
- **FR-004**: Selected theme MUST be persisted to `localStorage` under the key used by `useTheme()` and MUST be restored on page load without requiring a page reload.
- **FR-005**: If `localStorage` is unavailable or the saved theme is corrupted, the dashboard MUST default to dark mode without crashing.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — this feature directory is listed as an expected artifact.
- `SKILL.md` changes required: Yes — dashboard UI feature specs are listed in the meals-check spec contract.
- Runtime state changes required: No — this is a current-behaviour documentation split.
- Secrets/config changes required: No.
- Cron/hook changes required: No.

### Key Entities

- **Theme**: Light or dark mode reflected in CSS custom properties on the document root.
- **Theme Toggle Button**: The interactive control rendered in the dashboard header area.
- **useTheme Hook**: The React context hook (`lib/theme.tsx`) that manages theme state and persistence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Clicking the theme toggle changes the visual appearance of the dashboard to the opposite theme.
- **SC-002**: The toggle button shows the correct icon for the destination theme without any visible Light/Dark text label.
- **SC-003**: Theme preference is preserved across page reloads.
- **SC-004**: Dashboard loads without crash when `localStorage` is unavailable, defaulting to dark mode.

## Assumptions

- The current dashboard implementation under `/home/hermes/workspace/meals-dashboard` is the source of truth for this brownfield capture.
- The theme system uses CSS custom properties (CSS variables) on the document root, managed via `lib/theme.tsx` context.
- This spec captures current behaviour; future theme changes (e.g. additional colour schemes) should update this feature or create a new feature spec.

## Out of Scope

- Changing the colour palette or design tokens of either light or dark theme.
- Adding a system-preference auto-detect mode.
- Changing meals-check pipeline matching semantics.
- Changing Telegram report formatting.
- Deploying, building, or modifying runtime dashboard code as part of this documentation split.