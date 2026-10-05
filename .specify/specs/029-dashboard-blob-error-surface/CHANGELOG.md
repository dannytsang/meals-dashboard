# Change Log: Dashboard Blob Error Surface

Feature ID: `029-dashboard-blob-error-surface`

This log records material changes to the dashboard Blob error-surface spec.

## Entries

### 2026-06-27 — Final (production deployed; promotion reconciled)

- Change: Flipped `Status: Proposed` → `Status: Final`. Implementation has been deployed to production on `meals-dashboard` `origin/main`; `index.yaml` already listed `status: Final, readiness: already_satisfied`, but the spec body still read `Status: Proposed`.
- Status after change: Final
- Rationale: Danny asked on 2026-06-27 "work on all proposed specs in the meals skill". The 2026-06-19 CHANGELOG entry "implemented load-error source field" closed the last open runtime gap (`source` field on `DashboardLoadError`) at commit `d732684 feat: surface blob load source in dashboard errors`. The two-branch live-mode-vs-demo-mode contract (live → sanitised alert with `BLOB_READ_WRITE_TOKEN` named as remediation; demo → fixture fallback, no alert) was the core design and is live on `origin/main` for 8 days.
- Implementation impact: None (already on `origin/main`). The error surface (`DashboardLoadError.source` field, server-rendered alert panel, demo-mode suppression) is part of the live dashboard; further refinements would land as new specs.
- Evidence: `git log --oneline origin/main -- components/dashboard-error-boundary.tsx app/api/dashboard/blob` (or its public equivalent) shows the implementation chain; `d732684` is the principal commit for the live load-source field. `index.yaml` entry for 029 lists `status: Final, readiness: already_satisfied, last_reviewed_at: 2026-06-20`; Vercel auto-deploys on every push to `origin/main`.

### 2026-06-19 — Proposed (implemented load-error source field)
- Change: Added the required `source` field to `DashboardLoadError`, populated it from the live-mode failure source (`pointer`, `manifest`, or `read`), and extended the load-error regression test to assert the source is preserved.
- Status after change: Proposed
- Rationale: The spec already required a sanitised load-error object with `source`; the implementation was missing that field even though the rest of the live-mode error surface existed.
- Implementation impact: The dashboard data boundary now carries a more complete error object to the server-rendered alert component. No sync pipeline, Blob layout, demo fixture, or production-status change was made.
- Evidence: `npx tsc --noEmit`, `npm test`, and `npx next build` in `/home/hermes/workspace/meals-dashboard` (implementation commit `d732684`).

### 2026-06-19 — Proposed (promoted after review)
- Change: Promoted spec 029 from Draft to Proposed after review. Tightened the credential-safety language so operator copy may mention safe environment variable names such as `BLOB_READ_WRITE_TOKEN`, while actual credential values, bearer headers, signed URLs, cookies, and request headers remain forbidden.
- Status after change: Proposed
- Rationale: Review found the core live-mode-vs-demo-mode contract complete and implementable. The only gap was wording ambiguity between remediation copy naming `BLOB_READ_WRITE_TOKEN` and the redaction requirement; this entry resolves that ambiguity before implementation.
- Implementation impact: Implementation is now eligible on the meals-dashboard `preview` branch. Expected scope remains the dashboard server-side data boundary, a server-rendered error panel component, and tests; no sync pipeline, Blob layout, product enrichment, or demo fixture changes.
- Evidence: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` to be rerun after promotion patch.


### 2026-06-19 — Draft (created)
- Change: Created `029-dashboard-blob-error-surface` as a Draft spec for rendering a Travel-dashboard-style operator alert when live-mode meals-dashboard Blob reads fail. The spec explicitly excludes demo mode from the alert because demo mode should fall back to fixture data.
- Status after change: Draft
- Rationale: Danny asked on 2026-06-19 to "update/create meals spec where if there are blob storage errors like there currently is, then it should output the error" and supplied a Travel dashboard screenshot to replicate. He also specified: "This should not appear when it's in demo mode because it should fall back to the demo data."
- Implementation impact: None yet (Draft). Expected implementation is limited to the meals-dashboard server-side data boundary, a new error-panel component, and tests; no sync pipeline, Blob layout, or demo fixture changes.
- Evidence: Draft authored with 10 functional requirements, 3 non-functional requirements, 9 acceptance scenarios, and traceability mapping. Validator to be run before commit.
