---
name: dashboard-blob-error-surface
description: "Render a Travel-dashboard-style operator error panel when live-mode Vercel Blob reads fail, preserving the original Blob error text for diagnosis. Demo mode remains exempt: if credentials are absent and the dashboard routes to bundled fixture data, no blob error panel renders."
---

# Feature Specification: Dashboard Blob Error Surface

Feature ID: `029-dashboard-blob-error-surface`

Feature Name: Dashboard Blob Error Surface

Target Skill: `data-science/meals-check`

Created: 2026-06-19

Status: Final

Change history: CHANGELOG.md

## Background

The meals dashboard currently has two runtime data modes:

1. **Live mode** — Vercel Blob credentials are present, so the dashboard reads `pointers/latest.json`, the manifest, summary, order, coverage, and product blobs from Vercel Blob.
2. **Demo mode** — credentials are absent or incomplete, so the dashboard falls back to bundled static fixture data per `024-dashboard-static-fixture-mode-for-preview`.

When live mode is selected but Blob storage rejects the configured credentials or otherwise fails, the dashboard must not quietly collapse into a blank or misleading empty state. Danny provided a Travel dashboard screenshot on 2026-06-19 as the desired pattern: a bordered, pale operator-facing alert below the page header with a bold title ("Portfolio unavailable.") and a direct error sentence that includes the Blob failure detail, e.g. `Vercel Blob rejected the configured credentials (403 Forbidden)`. The meals dashboard should replicate that pattern in its own vocabulary.

This spec is intentionally narrow. It does not change the split blob layout, Blob SDK method selection, the sync script, product enrichment, or demo fixture generation. It only defines how live-mode blob read failures are captured, passed to the page, and rendered.

## Promotion Criteria for Final

This spec remains at `Status: Proposed, readiness: ready` until the implementation is **deployed to the production meals-dashboard Vercel environment**. Preview-only deployment is necessary but not sufficient.

The status flips to `Final` and `readiness` to `already_satisfied` only when all of the following are verified against the production deployment:

- In live mode, a simulated or real Blob credential/read failure renders a page-level error panel matching the Travel dashboard pattern: bordered, pale background, bold title, and direct Blob error message text.
- The rendered message includes the meaningful underlying Blob error reason, including the status code when available, without leaking secrets or tokens.
- In demo mode, the dashboard continues to render fixture data and the demo banner/chip; the Blob error panel is not rendered.
- The page returns HTTP 200 for a captured Blob read failure rather than crashing to a Next.js error page or returning HTTP 500.
- Production bundle and server logs are grep-clean for actual credential values, bearer headers, signed Blob URLs, cookies, and other credential material. Safe environment variable names such as `BLOB_READ_WRITE_TOKEN` may appear in operator remediation copy.

This rule aligns with Danny's standing lifecycle rule that `Final` means verified in production, not merely committed or previewed.

## User Scenarios & Testing

### User Story 1 — Surface live-mode Blob read failures (Priority: P1)

As Danny, when the meals dashboard is in live mode but Blob storage fails, I want the dashboard to render a clear operator error panel that preserves the real Blob error, so I can diagnose credential/binding issues without opening server logs first.

**Why this priority**: A blank dashboard or generic empty state makes a credential problem look like "no meals". The UI should say the portfolio/data is unavailable and explain why.

**Independent Test**: Force live mode by providing non-empty Blob env vars, mock the Blob client to reject with a 403-style error, load the dashboard page, and confirm the page returns HTTP 200 with the error panel text visible.

**Acceptance Scenarios**:
1. Given live mode is active and `readPointer()` throws a 403 credential error, When the dashboard loads, Then the page renders a dashboard-unavailable alert with the original error detail included.
2. Given live mode is active and any manifest/order/coverage/blob read throws a Blob store binding or network error, When the dashboard loads, Then the same error panel renders rather than a generic empty state.
3. Given a Blob failure includes a status code, When the error panel renders, Then the status code appears in the human-readable message.

### User Story 2 — Demo mode must not show live Blob errors (Priority: P1)

As Danny, when the dashboard is in demo mode because Blob credentials are absent or incomplete, I want the dashboard to keep falling back to fixture data and not show a Blob error panel, because demo mode is explicitly designed to avoid Blob reads.

**Why this priority**: Demo mode is a deliberate fallback. Showing a Blob credential error in demo mode would contradict the contract from spec 024 and make preview noisy.

**Independent Test**: Unset one or both Blob credential env vars, load the dashboard, and confirm fixture data + demo banner/chip render while the error panel is absent.

**Acceptance Scenarios**:
4. Given `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` is missing, When the dashboard loads, Then demo mode renders fixture data and no Blob error alert is present.
5. Given demo mode is active and fixture loading succeeds, When the page renders, Then no Blob SDK call is made and therefore no Blob error can be surfaced.
6. Given demo mode is active and fixture loading fails, When the page renders, Then the existing demo/empty-state behaviour applies; the live Blob error panel is not used.

### User Story 3 — Match the sibling dashboard alert pattern (Priority: P2)

As Danny, I want the meals dashboard error surface to visually match the Travel dashboard's "Portfolio unavailable" pattern, so the household dashboards behave consistently when their private backing store is unavailable.

**Why this priority**: Consistent error language and layout makes operator failures easier to recognise across dashboards.

**Independent Test**: Compare the meals panel against the provided Travel screenshot: a pale tinted alert card below the header, subtle border, bold title, and a direct explanatory sentence.

**Acceptance Scenarios**:
7. Given a live-mode Blob read fails, When the meals dashboard renders the error panel, Then the title is `Meals dashboard unavailable.` or equivalent meals-specific wording.
8. Given a live-mode Blob read fails, When the alert body renders, Then it follows the Travel pattern: `Failed to read meals dashboard <resource> from Blob storage: <reason>. Check the Production BLOB_READ_WRITE_TOKEN or Blob store binding.`
9. Given the alert renders, When inspecting markup, Then the alert uses `role="alert"` or equivalent accessible semantics and does not depend on client-side JavaScript to appear.

## Requirements

### Functional Requirements

- **FR-001**: The dashboard server-side read path MUST distinguish live-mode Blob read failures from legitimate empty/missing data. Credential failures, Blob store binding failures, SDK exceptions, and failed fetches are errors, not empty meals.

- **FR-002**: When live-mode Blob read fails, the page MUST render a page-level alert beneath the dashboard header and above the main data sections. The alert title MUST use meals-specific unavailable wording such as `Meals dashboard unavailable.`.

- **FR-003**: The alert body MUST include the meaningful underlying Blob error reason. If the source error includes an HTTP status or status text (for example `403 Forbidden`), that status MUST be present in the rendered text.

- **FR-004**: The alert body MUST include operator remediation wording modelled on the provided Travel dashboard example: `Check the Production BLOB_READ_WRITE_TOKEN or Blob store binding.` The exact prefix may vary by resource, but it MUST identify Blob storage as the failing dependency.

- **FR-005**: The alert MUST NOT render in demo mode. Demo mode is selected by missing/incomplete Blob credentials per spec 024 and MUST continue to use fixture data instead of attempting Blob reads.

- **FR-006**: Demo-mode fixture failures MUST continue to use the demo/empty-state behaviour from spec 024. They MUST NOT be reported as live Blob storage errors.

- **FR-007**: The implementation MUST avoid leaking credential values. Error formatting may include status codes, SDK error names, safe environment variable names (for example `BLOB_READ_WRITE_TOKEN`), configured non-secret resource names, and remediation hints, but MUST NOT include actual env var values, bearer tokens, signed Blob URLs, cookies, or request headers.

- **FR-008**: The page MUST return HTTP 200 with the alert rendered for captured live-mode Blob read failures. It MUST NOT crash to a Next.js error boundary or return a generic HTTP 500 for handled Blob failures.

- **FR-009**: The alert MUST be server-rendered. It MUST not depend on a client-side effect, localStorage flag, or URL parameter to appear.

- **FR-010**: Tests MUST cover at least: live-mode pointer failure, live-mode downstream blob failure, demo mode with credentials absent, credential-redaction behaviour, and accessibility semantics.

### Non-Functional Requirements

- **NFR-001**: The change MUST be a narrow dashboard presentation/data-boundary change. It MUST NOT modify the sync script, cron jobs, Blob storage layout, or product enrichment pipeline.
- **NFR-002**: The error message should be useful before opening logs, but concise enough to fit in a single alert card on mobile.
- **NFR-003**: The visual style should reuse existing dashboard tokens/classes where possible and mirror the Travel dashboard screenshot's subdued, operator-facing tone rather than a loud destructive error banner.

### Key Entities

- **DashboardDataLoadResult**: Proposed wrapper around dashboard data composition. Shape may be `{ data: DashboardBlobData; error?: DashboardLoadError }` or equivalent. It lets `app/page.tsx` render partial/empty data plus an operator alert without throwing.
- **DashboardLoadError**: Sanitised error object with at least `title`, `message`, `source`, and optional `statusCode`/`resourcePath`. It contains no secrets.
- **Blob error panel component**: Server-rendered UI component, likely `components/dashboard-data-error-panel.tsx`, responsible only for presentation.

## Contract Impact

- `skill.spec.yaml` changes required: Yes — this spec directory and eventual component/tests are added to expected artifacts.
- Runtime secrets/config changes required: No new secrets.
- Dashboard runtime impact: Yes — live-mode data-load errors become visible operator alerts instead of generic empty/crash behaviour.
- Demo-mode impact: Explicitly none; fixture fallback remains the dominant path and suppresses this alert.

## Relationship to Other Specs

- **Spec 017 (`017-dashboard-blob-read-path`)** defines null/empty fallback for missing blobs. This spec refines that contract for *errors*: missing data can be empty, but credential/binding failures must be visible.
- **Spec 024 (`024-dashboard-static-fixture-mode-for-preview`)** defines demo mode. This spec explicitly preserves demo mode and forbids the Blob error panel there.
- **Spec 028 (`028-dashboard-blob-head-read-savings`)** changes Blob SDK method selection. This spec is orthogonal: regardless of `head()` vs `list()`, thrown Blob failures must be surfaced.
- **Trips/Travel dashboard screenshot (2026-06-19)** is the visual/reference pattern for the alert copy and placement.

## Verification Plan

### Local verification

1. `npx tsc --noEmit` in `/home/hermes/workspace/meals-dashboard`.
2. `npx vitest run` for the new dashboard error-panel/data-load tests plus affected dashboard page/component tests.
3. `npx next build` to verify server-rendered alert code compiles.
4. `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` in `/home/hermes/workspace/Hermes-Skills`.
5. Bundle/log grep to confirm no token values or bearer headers appear in rendered error messages.

### Production verification

1. Deploy implementation to production after Danny approval.
2. Temporarily simulate or observe a safe Blob credential failure in live mode.
3. Confirm the production page returns HTTP 200 and renders the error panel with the sanitised Blob reason.
4. Confirm production demo-mode equivalent (credential-absent preview or local demo env) still renders fixture data and no Blob error panel.
5. Capture screenshot/evidence before promoting to Final.
