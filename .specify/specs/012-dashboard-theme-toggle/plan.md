# Implementation Plan: Dashboard Theme Toggle

Status: Final
Feature: 012-dashboard-theme-toggle
Skill: data-science/meals-check

## Summary

This feature documents the dashboard's light/dark theme toggle. The toggle is a global, persistent UI element that affects all views of the dashboard. Implementation is complete — this is a brownfield capture.

## Technical Context

- Component: `/home/hermes/workspace/meals-dashboard/components/theme-toggle.tsx`
- Theme context: `/home/hermes/workspace/meals-dashboard/lib/theme.tsx`
- Dashboard repository: `/home/hermes/workspace/meals-dashboard`
- Contract artifacts: `SKILL.md`, `skill.spec.yaml`, this feature directory, and `CHANGELOG.md`

## Constitution Check

- Raw report is the product: Pass — theme toggle is a UI element; no pipeline data transformation.
- Observable pipeline behaviour beats guesswork: Pass — captured from actual implementation.
- Runtime state is declared, not committed: Pass — theme preference is localStorage, not committed to any repo.
- Production side effects are bounded: Pass — purely client-side, no network or pipeline calls.

## Scope

In scope:
- Theme toggle button visibility and placement
- Light/dark mode switching
- localStorage persistence
- Default-to-dark fallback

Out of scope:
- Additional colour schemes beyond light/dark
- System preference auto-detect
- Changes to CSS variable values or design tokens
- Dashboard layout or other UI components

## Scenario Coverage Matrix

- Positive: Toggle switches theme → FR-001, FR-002, FR-003
- Positive: Theme persists on reload → FR-004
- Positive: Graceful fallback when localStorage unavailable → FR-005
- Positive: Correct icon and label shown → FR-003

## Complexity Tracking

No complexity. This is a simple two-state toggle with localStorage persistence and a well-defined fallback.

## Risk & Safety

- No pipeline or network calls involved.
- localStorage failures are gracefully handled — no crash path.
- No effect on other dashboard components.

## Verification

- Load dashboard, click toggle, verify theme changes and persists after reload.
- Test with localStorage cleared or unavailable to verify dark-mode default.
- Validate meals-check skill with `validate_spec_skill.py`.