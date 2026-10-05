# Tasks: Dashboard Blob Error Surface

Feature ID: `029-dashboard-blob-error-surface`

Status: Proposed

## Phase 0 — Spec review

- [x] T001 Danny reviews Draft requirements, especially the exact alert copy and whether the title should be `Meals dashboard unavailable.`.
- [x] T002 Promote the spec to Proposed after review, updating `spec.md`, `CHANGELOG.md`, `index.yaml`, `scenarios.yaml`, and `traceability.yaml` if the scope changes.

## Phase 1 — Error model

- [x] T003 Add a sanitised `DashboardLoadError` model or equivalent near the dashboard data boundary.
- [ ] T004 Add error formatting for Blob SDK/fetch/credential failures, preserving status code and reason.
- [ ] T005 Add redaction for token-like, bearer-header, signed-URL, cookie, and raw-env-value fragments.

## Phase 2 — Data boundary wiring

- [ ] T006 Catch live-mode Blob read exceptions without crashing the page.
- [ ] T007 Preserve missing-data empty-state semantics for legitimate absent blobs.
- [ ] T008 Ensure demo mode never instantiates the live Blob reader when credentials are missing/incomplete.
- [ ] T009 Pass the sanitised error object to `app/page.tsx` or the relevant server component.

## Phase 3 — UI

- [ ] T010 Create `components/dashboard-data-error-panel.tsx`.
- [ ] T011 Render the panel below the dashboard header and above the main data sections.
- [ ] T012 Match the Travel dashboard alert pattern: pale card, subtle border, rounded corners, bold title, direct explanatory body.
- [ ] T013 Add accessible alert semantics and ensure the panel is server-rendered.

## Phase 4 — Tests

- [x] T014 Add formatter/sanitiser tests.
- [ ] T015 Add live-mode pointer-failure test.
- [ ] T016 Add live-mode downstream blob-failure test.
- [ ] T017 Add demo-mode suppression test.
- [ ] T018 Add component accessibility/copy tests.

## Phase 5 — Verification

- [ ] T019 Run `npx tsc --noEmit`.
- [ ] T020 Run targeted vitest tests.
- [ ] T021 Run full `npx vitest run` if shared dashboard data code changed.
- [ ] T022 Run `npx next build`.
- [ ] T023 Run `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.
- [ ] T024 Verify no credential material appears in rendered messages, test snapshots, logs, or bundles.

## Phase 6 — Deployment / Final gate

- [ ] T025 Deploy to preview for Danny review.
- [ ] T026 Deploy to production after approval.
- [ ] T027 Capture production evidence: live-mode Blob failure renders panel with HTTP 200.
- [ ] T028 Capture demo evidence: demo mode renders fixture data and no Blob error panel.
- [ ] T029 Promote spec to Final only after production evidence is recorded.
