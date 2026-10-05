# Change Log: Dashboard Summary Filters

Feature ID: `006-dashboard-summary-filters`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or “why did this change?” questions.

## Entries

### 2026-06-10 — Safe headline metric fallbacks and helper coverage

- Change: Required safe zero/null headline metrics when generated summary and receipt data are absent, and documented unit coverage for the metrics helper.
- Status after change: Final
- Rationale: Spec-to-implementation simulation showed a generated implementation would need explicit missing-data behaviour rather than relying on current data always existing.
- Implementation impact: Dashboard now uses `buildHeadlineMetrics` with tests for empty data and fallback metrics.
- Evidence: `npm test`, `npm run build`, and owning-skill validator.

### 2026-06-10 — Implementation-first alignment for item filter heuristic

- Change: Clarified generated-data fallbacks and the current dashboard word-overlap matched/unmatched item display heuristic.
- Status after change: Final
- Rationale: A second pass from `dashboard-client.tsx` showed the headline filters drive receipt-item display state, not canonical pipeline matching.
- Implementation impact: Documentation-only alignment; no runtime code change.
- Evidence: Inspected `components/dashboard-client.tsx` lines 57-65 and 270-289; owning-skill validator.

### 2026-06-10 — Final current-behaviour capture

- Change: Captured the current meals dashboard `Dashboard Summary Filters` behaviour as a dedicated feature specification.
- Status after change: Final
- Rationale: Split dashboard UI behaviour out of `004-dashboard-sync` so each spec owns one coherent user-facing capability.
- Implementation impact: Documentation/contract split only; no runtime code change.
- Evidence: Inspected /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 247-300; owning-skill validator.
