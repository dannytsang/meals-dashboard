# Change Log: Dashboard Theme Toggle

Feature ID: `012-dashboard-theme-toggle`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or "why did this change?" questions.

## Entries

### 2026-06-15 — Remove visible Light/Dark text from theme toggle

- Change: Updated the dashboard theme toggle so the button is icon-only. The visible Light/Dark text labels were removed; the button now presents only the Sun or Moon icon with a generic toggle affordance.
- Status after change: Final
- Rationale: Danny asked to remove the name Dark/Light from the theme toggle button while keeping the existing theme-switching behaviour.
- Implementation impact: `components/theme-toggle.tsx` now renders only the icon and a generic accessible label.
- Evidence: Updated `components/theme-toggle.tsx`, added `components/theme-toggle.test.tsx`, and refreshed `012-dashboard-theme-toggle/spec.md` to match.

### 2026-06-11 — Captured current behaviour as Final spec

- Change: Created `012-dashboard-theme-toggle` as a Final feature spec documenting the dashboard's light/dark theme toggle.
- Status after change: Final
- Rationale: Danny requested a review of dashboard specs to identify coverage gaps. Theme toggle was identified as the only live, used component from the uncaptured set. Created as a standalone feature with its own sequential ID.
- Implementation impact: Documentation-only. No runtime changes.
- Evidence: Inspected `/home/hermes/workspace/meals-dashboard/components/theme-toggle.tsx` and `/home/hermes/workspace/meals-dashboard/lib/theme.tsx`.