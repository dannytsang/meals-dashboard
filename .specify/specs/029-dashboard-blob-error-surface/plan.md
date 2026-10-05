# Implementation Plan: Dashboard Blob Error Surface

Feature ID: `029-dashboard-blob-error-surface`

Status: Proposed

## Summary

Add a narrow live-mode Blob error surface to the meals dashboard. The dashboard should catch Blob credential/binding/read exceptions in the server-side read boundary, sanitise the error, and render a Travel-dashboard-style alert above the data sections. Demo mode remains exempt: missing/incomplete Blob credentials route to fixture data and never render this live Blob error panel.

## Files Touched (Expected)

| Path | Change |
|---|---|
| `/home/hermes/workspace/meals-dashboard/lib/dashboard-data.ts` | Return or expose a sanitised load error for live-mode Blob failures without leaking secrets. |
| `/home/hermes/workspace/meals-dashboard/app/page.tsx` | Render the error panel when live-mode data load reports a Blob error. |
| `/home/hermes/workspace/meals-dashboard/components/dashboard-data-error-panel.tsx` | New server-rendered alert component modelled on the Travel dashboard pattern. |
| `/home/hermes/workspace/meals-dashboard/components/dashboard-data-error-panel.test.tsx` | New component tests for copy, role, and sanitisation. |
| `/home/hermes/workspace/meals-dashboard/lib/dashboard-data.test.ts` | Add live-mode Blob failure regression tests. |
| `/home/hermes/workspace/meals-dashboard/components/dashboard-client.test.tsx` or page-level tests | Assert demo mode does not render the error panel. |

## Files NOT Touched

| Path | Reason |
|---|---|
| `scripts/sync-dashboard-data.py` | Sync pipeline is not part of this UI error-surface spec. |
| `lib/blob-storage.ts` | Blob SDK call choice is owned by spec 028; this spec handles errors at the dashboard data boundary. |
| `lib/fixtures/*` | Demo fixture generation is owned by spec 024; this spec only says demo mode suppresses Blob errors. |
| Cron/Tesco/Gmail/Todoist scripts | No pipeline behaviour change. |

## Phase 1 — Error model and sanitisation

1. Add a small `DashboardLoadError` type or equivalent near the dashboard data boundary.
2. Add a formatter that converts unknown Blob/SDK/fetch exceptions into safe human-readable messages.
3. Redact bearer tokens, signed URLs, cookie/header fragments, and raw env values.
4. Preserve useful fields: status code, status text, SDK error name, resource path if not secret.

## Phase 2 — Server-side data boundary

1. Ensure live-mode Blob credential/binding exceptions are caught at the page/data boundary.
2. Distinguish expected missing data (`null` pointer, absent optional blob) from thrown read errors.
3. Return HTTP 200 with data empty/partial plus `DashboardLoadError`, or otherwise pass the error object to `app/page.tsx` without throwing.
4. Keep demo mode on the fixture reader path; do not instantiate the Vercel Blob reader when credentials are missing/incomplete.

## Phase 3 — UI component

1. Implement `DashboardDataErrorPanel` as a server-rendered component.
2. Title: `Meals dashboard unavailable.` or close equivalent.
3. Body: `Failed to read meals dashboard <resource> from Blob storage: <reason>. Check the Production BLOB_READ_WRITE_TOKEN or Blob store binding.`
4. Style: pale tinted background, subtle border, rounded card, compact spacing, bold title, follows the provided Travel dashboard screenshot.
5. Accessibility: `role="alert"` or equivalent, readable text, no client-only dependency.

## Phase 4 — Tests

1. Unit-test formatter/sanitiser against credential-like strings and status-code errors.
2. Unit-test live-mode pointer failure.
3. Unit-test downstream manifest/order/coverage failure.
4. Unit-test demo mode: credentials absent → fixture path → no Blob error panel.
5. Component-test the panel copy and accessibility role.

## Phase 5 — Verification and promotion

1. Run `npx tsc --noEmit`.
2. Run targeted vitest tests, then full `npx vitest run` if the change touches shared dashboard data code.
3. Run `npx next build`.
4. Run the meals spec validator in Hermes-Skills.
5. Deploy through the normal preview → production path after Danny approval.
6. Promote to Final only after production evidence from the Promotion Criteria is captured.
