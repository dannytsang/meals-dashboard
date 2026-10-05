# Change Log: Dashboard Expiry Timeline

Feature ID: `013-dashboard-expiry-timeline`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or "why did this change?" questions.

## Entries

### 2026-06-11 — Captured current behaviour as Final spec

- Change: Created `013-dashboard-expiry-timeline` as a Final feature spec documenting the dashboard's short-life items expiry timeline panel.
- Status after change: Final
- Rationale: Danny requested a review of dashboard specs to identify coverage gaps. Expiry timeline was identified as the only other live component (alongside theme toggle) that is connected to real pipeline data (`receipt.shortLifeItems` from `tesco_email_parser.py`). Created as a standalone feature with its own sequential ID.
- Implementation impact: Documentation-only. No runtime changes.
- Evidence: Inspected `/home/hermes/workspace/meals-dashboard/components/expiry-timeline.tsx` and traced `shortLifeItems` data shape to `tesco_email_parser.py`.