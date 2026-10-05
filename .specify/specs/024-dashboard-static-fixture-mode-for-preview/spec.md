---
name: dashboard-static-fixture-mode-for-preview
description: "Auto-detect runtime mode at request time and route the dashboard's blob-storage read path accordingly. When BLOB_READ_WRITE_TOKEN is set, use Vercel Blob (live mode). When unset, use a bundled, build-time-generated JSON fixture (demo mode) so the preview environment renders meaningful sample data instead of 500-ing. Demo mode renders a permanent site-wide banner + secondary header chip. Fixture is generated at build time from a small committed seed (real trip structure, randomised names/dates/locations) and the generated JSON is gitignored. Single source of truth: a new lib/runtime-mode.ts helper. Two new DashboardDataReader implementations: StaticFixtureReader and EmptyDashboardReader. No changes to VercelBlobStorageClient or any production read path."
---

# Feature Specification: Dashboard Static Fixture Mode for Preview

Feature ID: `024-dashboard-static-fixture-mode-for-preview`

Feature Name: Dashboard Static Fixture Mode for Preview

Target Skill: `data-science/meals-check`

Created: 2026-06-17

Status: Final

Delivery qualifier: Open login-page demo-banner correction — deferred implementation; previous Final sign-off does not close this follow-up.

Change history: CHANGELOG.md

## Pending: login-page demo banner (deferred fix)

Recorded 2026-09-24 at Danny's request; specification note only, not authorization to implement or deploy now.

- Observed in Meal Planner: the unauthenticated `/auth/signin` page shows the demo-mode banner, which disappears after successful sign-in. The live login response contained `data-demo-mode="true"`, `x-nextjs-prerender: 1` and `x-nextjs-cache: HIT`.
- Diagnosis: the shared layout evaluates runtime mode during login-page prerendering, before the Docker runtime storage configuration is present; the authenticated dashboard evaluates it per request. Investigate the same inherited rendering path in Meals Dashboard; its live deployment has not been independently reproduced for this defect.
- Deferred correction: evaluate the login/shared-layout mode against the deployed runtime configuration rather than retaining a build-time demo decision. Preserve genuine preview/demo banners, existing authentication, storage selection and fail-closed boundaries; do not add build-time secrets or simply hide all login-page banners.
- Open acceptance: build without live storage credentials, then start with valid runtime storage configuration; the first unauthenticated login response must not show a demo banner, and sign-in, sign-out and reload must remain consistent. Genuine demo mode must retain its banner. Verify both repositories independently, including static/private-data regression checks, before closing this note.
- Cross-reference: Meal Planner spec 001 (`001-self-hosted-dashboard-migration`) in the meal-planner repository records the matching deferred work. This is not a claim that either application has been fixed.

## Background

Today, the meals dashboard reads all of its data — pointer, manifest, summary, coverage blobs, order blobs, products — from Vercel Blob via `lib/blob-storage.ts` `VercelBlobStorageClient`. The `BLOB_READ_WRITE_TOKEN` env var must be configured in the runtime environment; without it, `@vercel/blob` SDK calls fail.

Danny disconnected the blob storage from the preview Vercel environment on 2026-06-17 (the env vars are no longer set on preview). This is the right move for data segregation: preview should not write into the same bucket as production, and a separate bucket requires either (a) a separate Vercel Blob store (operational cost, secret rotation, second sync path), or (b) no blob storage at all. Danny chose (b).

The downside is that preview now 500s when the dashboard tries to read its first blob. Danny wants preview to be usable — it should render something useful for debugging, so he can iterate on dashboard changes without setting up another blob store. He asked: *"is there a way to have static example data for preview so i don't have to setup another blob storage?"*

The answer is yes, and the codebase is already prepared for it. `lib/dashboard-data.ts:54` exports a `DashboardDataReader` interface (a `Pick<BlobStorageClient, 'readPointer' | 'readManifest' | 'readJsonBlob' | 'listPaths'>`) and `getDashboardData({ coverageWindow, reader })` accepts an injected reader (`lib/dashboard-data.ts:56-62`). The default reader is `new VercelBlobStorageClient()`. Tests already inject readers via `InMemoryBlobStorageClient`. The single injection point is the call in `app/page.tsx`. So the work is:

1. Add `lib/runtime-mode.ts` exposing `isBlobStorageConfigured()` and `runtimeModeStatus()` (env-var detection, no explicit `MEALS_FIXTURE_MODE` opt-in).
2. Bundle a small JSON fixture dataset in the repo, **generated at build time** from a committed seed file (`lib/fixtures/seed/dashboard-fixture-seed.yaml`). The seed carries the shape of a real trip; the generator randomises names/dates/locations/times into a synthetic dataset. Generated `lib/fixtures/dashboard-fixture.json` is gitignored.
3. Add `lib/fixtures/static-fixture-reader.ts` implementing `DashboardDataReader` against the generated JSON.
4. Add `lib/fixtures/empty-dashboard-reader.ts` returning null/empty for the misconfigured case.
5. Wire `app/page.tsx` to pick the right reader at request time: blob configured → Vercel Blob (live mode); else → StaticFixtureReader (demo mode).
6. Render a **permanent site-wide banner** ("DEMO MODE — showing sample data. Live data unavailable.") plus a secondary header chip when demo mode is active. The banner has no dismiss affordance; it persists across navigation.
7. Add a `prebuild` hook in `package.json` so the fixture is regenerated on every build.

Demo mode is detected, not opted-in. The trigger is the **absence** of `BLOB_READ_WRITE_TOKEN` (with `BLOB_STORE_ID` as a backup credential). Either credential being missing routes to demo mode. A partial credential is more dangerous than no credential — a stale token could silently auth and read garbage — so demo mode fails closed.

This spec is **additive** — it does not touch the production read path, the sync script, the meals-check pipeline, or any other dashboard feature. The `VercelBlobStorageClient` continues to be used in production with no changes.

## Promotion Criteria for Final

This spec remains at `Status: Proposed, readiness: ready` until the implementation is **deployed to the production meals-dashboard Vercel environment**. Preview-only deployment is necessary but not sufficient.

The preview-mode reader-selection path now includes an additional safety net: if the bundled fixture import fails at runtime, the dashboard falls back to the empty reader instead of crashing during page render. That hardening is part of the Proposed contract and does not change the production-mode behaviour.

The status flips to `Final` and `readiness` to `already_satisfied` only when **all** of the following are verified against the production deployment:

- The dashboard auto-detects `BLOB_READ_WRITE_TOKEN` presence and routes to live mode (Vercel Blob) in production
- Production deployment has the blob credential set, so demo mode is never the active read path in production — the demo banner + chip do not render
- The prebuild hook (`node lib/fixtures/scripts/generate-fixture.mjs`) runs cleanly as part of `npx next build` in production
- The generated `lib/fixtures/dashboard-fixture.json` is byte-identical across consecutive production builds (deterministic seed verification)
- The bundled fixture is grep-clean for production secrets in the production JS bundle
- The preview (or any non-production) Vercel environment shows the demo banner + header chip + fixture data when `BLOB_READ_WRITE_TOKEN` is absent
- `MEALS_DEBUG_MODE=1` does not surface debug chips when demo mode is active (demo mode wins per US-007)
- The site-wide banner has no dismiss affordance and persists across navigation; secondary header chip is always visible in demo mode
- The fixture is derived from the committed seed (real-trip structure) with realistic UK names (no "Demo" prefix), randomised dates/times/locations, an obvious-fake `orderTotal: 42.42`, and a 1-day gap to exercise the "no meals" coverage surface

This rule aligns with the spec-driven-skills convention that `Final` status reflects verified runtime evidence in the live consumer deployment, not a closed task checklist. Danny confirmed on 2026-06-17: "the code should end up in production so its not finalised until its in production". The verification scope is asymmetric: production never exercises demo mode, but production deployment is what makes the auto-detect path *and* the build-time fixture generation provably correct.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Auto-Detect Demo Mode (Priority: P1)

As Danny, when I deploy to the preview Vercel environment (which has no `BLOB_READ_WRITE_TOKEN` set), I want the dashboard to **automatically** render a static fixture dataset instead of crashing, so I don't have to configure a separate Vercel Blob store or set an explicit `MEALS_FIXTURE_MODE` env var.

**Why this priority**: This is the headline use case. The auto-detect approach is the right architectural decision because it makes the dashboard "just work" on any environment where blob credentials are missing — no operator setup, no env-var opt-in.

**Independent Test**: Deploy to the preview environment with no `BLOB_READ_WRITE_TOKEN` set. Open the preview URL. Confirm: (a) the dashboard renders without a 500 error, (b) the dashboard shows the bundled fixture data, (c) the site-wide "DEMO MODE" banner is visible at the top of the page, (d) the header chip "Demo" is visible, (e) the dashboard exercises the same UI surfaces (Week Meals grid, Order Items by Category, summary tiles) that production uses, (f) the fixture data is recognisable as a synthetic trip.

**Acceptance Scenarios**:
1. Given `BLOB_READ_WRITE_TOKEN` is unset (or empty) in the runtime environment, When the dashboard is loaded, Then the dashboard renders successfully without calling `@vercel/blob`. The render uses the bundled fixture dataset from `lib/fixtures/dashboard-fixture.json` via `StaticFixtureReader`. The demo banner is visible.
2. Given demo mode is active, When the dashboard is loaded, Then no `@vercel/blob` SDK call is made (verifiable by grepping the served HTML / network panel — there are no calls to `blob.vercel-storage.com`).
3. Given demo mode is active, When the dashboard renders, Then a **permanent site-wide banner** is visible at the top of the page with the literal text "DEMO MODE — showing sample data. Live data unavailable." The banner is sticky, has amber background, and has **no dismiss affordance**.
4. Given demo mode is active, When the dashboard renders, Then a secondary "Demo" header chip is visible (e.g. near the theme toggle). The chip uses the same amber styling and the literal word "Demo".
5. Given demo mode is active, When the dashboard renders, Then the fixture data renders through all the same UI surfaces as production data: Week Meals grid, Order Items by Category, summary tiles, latestOrder / matched items / delivery marker surfaces. One day in the coverage window has no meals (the "gap day") so the dashboard exercises the "0% coverage" surface.

### User Story 2 — Production Behaviour Unchanged (Priority: P1)

As Danny, when I deploy to the production Vercel environment (which has `BLOB_READ_WRITE_TOKEN` set), I want the dashboard to behave exactly as it does today — reading from Vercel Blob with no demo banner, no fixture data, and no behaviour changes.

**Why this priority**: Production must not regress. The whole point of the demo mode is to be the non-production fallback; production must remain untouched.

**Independent Test**: With `BLOB_READ_WRITE_TOKEN` set, deploy to production. Confirm: (a) the dashboard reads from Vercel Blob as today, (b) no "DEMO MODE" banner is visible, (c) no "Demo" header chip is visible, (d) no fixture data leaks into the page, (e) `app/page.tsx` instantiates `VercelBlobStorageClient` exactly as today.

**Acceptance Scenarios**:
6. Given `BLOB_READ_WRITE_TOKEN` is set, When the dashboard is loaded, Then the dashboard reads from Vercel Blob. `StaticFixtureReader` is NEVER instantiated. The demo banner is NOT rendered. The header chip is NOT rendered.
7. Given both `BLOB_READ_WRITE_TOKEN` and `BLOB_STORE_ID` are unset, When the dashboard is loaded, Then the dashboard renders in demo mode (the absence of either credential routes to demo mode — fail closed).
8. Given the production deployment, When static-bundle scan is run, Then the fixture reader code MAY be present in the bundle (it's small and tree-shaking depends on import structure), but the bundled fixture JSON MUST NOT be shipped to production. The fixture JSON is read at runtime only when demo mode is active; in production, the import path is unreachable.

### User Story 3 — Server-Side Detection Only (Priority: P1)

As Danny, I want the demo mode to be detected entirely server-side and never reachable from the client JS bundle, so casual visitors cannot trigger demo mode by URL-tweaking or DevTools tinkering.

**Why this priority**: Mirrors the spec 022 "no debug strings in production bundle when off" security boundary. Demo mode could leak a fake order to a household member who has never seen real data — confusion is the threat.

**Independent Test**: With `BLOB_READ_WRITE_TOKEN` set (production-like), deploy. Open the dashboard, inspect network panel and JS bundle. Confirm: (a) no fixture JSON content is in the served HTML or JS, (b) no request is made to load the fixture file, (c) no client-side flag, URL parameter, or local-storage key toggles demo mode.

**Acceptance Scenarios**:
9. Given `BLOB_READ_WRITE_TOKEN` is set, When the dashboard's JS bundle is inspected, Then the fixture JSON content is NOT present in the bundle. The fixture reader code MAY be present (small, tree-shakeable).
10. Given `BLOB_READ_WRITE_TOKEN` is set, When the dashboard is loaded, Then no client-side request is made to load the fixture JSON file. The fixture file is a server-only import.
11. Given any dashboard render, When DevTools is inspected, Then there is no client-side flag, URL parameter, or local-storage key that toggles demo mode. Demo mode is controlled ONLY by the server-side env-var check.

### User Story 4 — Graceful Empty State (Priority: P2)

As Danny, when neither `BLOB_READ_WRITE_TOKEN` nor the bundled fixture can be loaded (e.g. fixture build failed), I want the dashboard to render an empty state with a clear "No data configured" message rather than crashing.

**Why this priority**: Better DX for any future operator who doesn't know about demo mode. Mirrors the existing FR-03 / SC-03 fallback behaviour in spec 017 (which returns empty when blobs are missing).

**Independent Test**: With `BLOB_READ_WRITE_TOKEN` unset AND the bundled fixture file missing or malformed, deploy. Confirm: (a) the dashboard renders a clear empty state, (b) the empty state explains the misconfiguration, (c) no 500 error.

**Acceptance Scenarios**:
12. Given `BLOB_READ_WRITE_TOKEN` is unset and the bundled fixture is missing, When the dashboard is loaded, Then the dashboard renders an empty state with a "No data configured" notice. HTTP 200, no exception logged.

### User Story 5 — Trip-Derived Realistic Fixture (Priority: P1)

As Danny, when I view the preview dashboard with demo mode active, I want the fixture data to be derived from a real trip (preserving the structure: meals, items, coverage gaps) but with randomised names/dates/times/locations so the data looks like a real household trip without exposing any real data.

**Why this priority**: A fixture derived from a real trip exercises the dashboard's full feature surface (the same shapes that production data has). Pure placeholder data ("Sample Beef Mince 500g") exercises a smaller surface and looks obviously fake. The compromise — real-trip structure with randomised content — gives Danny realistic-looking data for debugging.

**Independent Test**: Open the preview dashboard with demo mode active. Confirm: (a) the fixture has 7 meals across 8 days (1 explicit gap day for "no meals" coverage), (b) names are realistic UK first + last names (no "Demo" prefix), (c) dates are within a recent week, (d) `orderTotal: 42.42` (an obvious-fake sentinel), (e) `dataGeneratedAt: '2026-01-01T00:00:00Z'` (an obvious-fake sentinel).

**Acceptance Scenarios**:
13. Given demo mode is active, When the dashboard renders, Then the fixture contains 7 meals across 8 days, with 1 explicit gap day showing "0% coverage" in the Week Meals grid.
14. Given demo mode is active, When the dashboard renders, Then the fixture item names are realistic UK names from a curated pool (e.g. "Sam Patel", "Chen Wei", "Patel Singh" — no "Demo" prefix, no "Sample" prefix).
15. Given demo mode is active, When the dashboard renders, Then the `dataGeneratedAt` timestamp is `2026-01-01T00:00:00Z` (a recognisably fake / placeholder timestamp) and the `orderTotal` is `42.42` (a recognisable placeholder value, not a plausible real total).

### User Story 6 — Permanent Site-Wide Banner (Priority: P1)

As Danny, when the dashboard is in demo mode, I want a permanent banner at the top of the page that announces demo mode and is impossible to dismiss, so anyone using the dashboard (including household members) can never confuse demo data with real data.

**Why this priority**: The banner is the **primary signal** that the data is fake. A dismissible banner can be dismissed and forgotten, leading to confusion. A permanent banner is unmissable and unambiguous.

**Independent Test**: Open the preview dashboard with demo mode active. Confirm: (a) the banner is visible at the top of the page, (b) the banner is sticky (does not scroll away), (c) the banner has no dismiss button, (d) the banner text contains the literal phrase "DEMO MODE" and "sample data".

**Acceptance Scenarios**:
16. Given demo mode is active, When the dashboard renders, Then the banner is positioned at the top of the page, above all other content (highest z-index), with amber background and contrasting text.
17. Given demo mode is active, When the dashboard is loaded, Then the banner has no dismiss button. The banner persists across navigation and across reloads.
18. Given demo mode is active, When the banner is rendered, Then it has `role="status"` for screen-reader announcement, `aria-label="Demo mode — sample data, not real data"`, and the emoji "⚠️" prefix is `aria-hidden="true"`.

### User Story 7 — Demo Mode Wins Over Debug Mode (Priority: P2)

As Danny, when both `MEALS_DEBUG_MODE=1` and demo mode are active, I want the demo banner and chip to render (the dominant signal that the data is fake) and the debug chips to be hidden (because debug toggles have nothing to point at when the data is fake).

**Why this priority**: Mixing the two surfaces would let a user toggle debug controls against fake data, leading to confusion about what the debug chips are showing. Demo mode is the data mode; debug mode is the operator mode. Demo mode wins.

**Independent Test**: Deploy to preview with `BLOB_READ_WRITE_TOKEN` unset AND `MEALS_DEBUG_MODE=1`. Open the preview URL. Confirm: (a) demo banner is visible, (b) header chip "Demo" is visible, (c) debug chips (spec 022) are NOT visible.

**Acceptance Scenarios**:
19. Given demo mode is active AND `MEALS_DEBUG_MODE=1`, When the dashboard renders, Then the demo banner and header chip render, and debug chips from spec 022 are hidden.
20. Given `MEALS_DEBUG_MODE=1` and `BLOB_READ_WRITE_TOKEN` is set (live mode), When the dashboard renders, Then the debug chips from spec 022 are visible, and the demo banner / chip are NOT visible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST detect runtime mode at request time via a new `lib/runtime-mode.ts` module. The module MUST export `isBlobStorageConfigured(): boolean` checking that **both** `BLOB_READ_WRITE_TOKEN` AND `BLOB_STORE_ID` are set and non-empty (fails closed if either is missing). The module MUST export `runtimeModeStatus(): { demoMode: boolean, blobConfigured: boolean }` for observability. The module MUST NOT read any other env var. **No explicit `MEALS_FIXTURE_MODE` opt-in exists in this spec.** Mode is determined entirely by credential presence.

- **FR-002**: With `BLOB_READ_WRITE_TOKEN` set, the dashboard MUST instantiate `VercelBlobStorageClient` as today. The fixture reader is NEVER instantiated. The demo banner / chip is NOT rendered.

- **FR-003**: With `BLOB_READ_WRITE_TOKEN` unset (or empty), the dashboard MUST instantiate `StaticFixtureReader` (defined in `lib/fixtures/static-fixture-reader.ts`) as the `DashboardDataReader` for the request. The fixture reader MUST implement the full `DashboardDataReader` interface and serve data exclusively from `lib/fixtures/dashboard-fixture.json` (build-time generated). The reader MUST NOT make any network request.

- **FR-004**: With `BLOB_READ_WRITE_TOKEN` set but the bundled fixture missing or malformed (e.g. build failure), the dashboard MUST instantiate an empty-state reader (`EmptyDashboardReader` in `lib/fixtures/empty-dashboard-reader.ts`) that returns null/empty for all reads. The dashboard renders with an empty Week Meals grid, an empty Order Items list, and a "No data configured" notice. The page MUST NOT crash and MUST return HTTP 200.

- **FR-005**: The `app/page.tsx` MUST select the reader exactly once per request, using the priority: blob > fixture > empty. The selection MUST happen before `getDashboardData()` is called. The `getDashboardData()` call signature is unchanged: `await getDashboardData({ coverageWindow, reader })`.

- **FR-023**: Demo mode detection MUST fail closed. If EITHER `BLOB_READ_WRITE_TOKEN` OR `BLOB_STORE_ID` is unset, the dashboard routes to demo mode. A partial credential (one set, one unset) routes to demo mode, not live mode — a stale token could silently auth and read garbage, so partial credentials are treated as missing.

- **FR-006**: The bundled fixture JSON file `lib/fixtures/dashboard-fixture.json` MUST conform to the `SplitLayoutPayload` shape from `lib/dashboard-sync.ts` (orders, coverage, summary, deliveryWindows, coverageWindow, dataGeneratedAt, uiUpdatedAt). The fixture MUST contain: a pointer, a manifest with coverage entries, a coverage blob per date in the window, an order blob per delivery, and a summary blob.

- **FR-007**: The fixture data MUST be **trip-derived and realistic** rather than obviously-fake placeholders. Concretely: the fixture is generated at build time from a committed seed file (`lib/fixtures/seed/dashboard-fixture-seed.yaml`) that captures the structure of a real trip; the generator randomises names, dates, times, and locations into realistic values. The fixture is NOT shipped with "Sample" prefixes or placeholder strings.

- **FR-008**: The fixture MUST include obvious-fake sentinels for any value that could plausibly look real. Concretely: `dataGeneratedAt: '2026-01-01T00:00:00Z'` and `orderTotal: 42.42`. These sentinels survive build-time generation; they are present in the seed and copied verbatim into the generated fixture.

- **FR-009**: The fixture MUST cover 8 days with 7 meals, including **1 explicit gap day** (a date in the coverage window with no meals) so the dashboard exercises the "0% coverage" surface. The gap day is a specific date in the seed (not a random skip) so the surface is consistently exercised.

- **FR-010**: The fixture names MUST come from a curated pool of realistic UK first + last names. No "Demo" prefix. No "Sample" prefix. The pool is small (8 first names × 6 last names = 48 combinations) and is committed in the seed file. The pool is the **only** source of names in the generated fixture.

- **FR-011**: The fixture reader (`StaticFixtureReader`) MUST read the fixture JSON at module load time (top-level import) so each request does not re-read the file. The reader MUST cache the parsed fixture in memory. The reader MUST validate the fixture shape at load time and throw a clear error if the JSON is malformed.

- **FR-012**: The fixture reader MUST support the full `DashboardDataReader` interface: `readPointer`, `readManifest`, `readJsonBlob`, `listPaths`. The reader MUST serve the fixture content under the same paths the production data uses (e.g. `pointers/latest.json`, `meta/manifest-{hash}.json`, `coverage/{date}.json`, `orders/{date}/{num}.json`, `meta/summary-{hash}.json`).

- **FR-013**: The empty-state reader (`EmptyDashboardReader`) MUST return null/empty values for all reads. Specifically: `readPointer()` returns null, `readManifest()` returns `{}`, `readJsonBlob()` returns null, `listPaths()` returns `[]`. This matches the FR-03 / SC-03 fallback behaviour in spec 017.

- **FR-014**: The implementation MUST NOT modify `VercelBlobStorageClient`, `InMemoryBlobStorageClient`, the `BlobStorageClient` interface, or the `DashboardDataReader` interface. The fixture reader is a NEW implementation of the existing interface. The production read path is unchanged.

- **FR-015**: The implementation MUST NOT modify the sync script (`scripts/sync-dashboard-data.py`), the meals-check pipeline, the OIDC configuration (spec 015), or the debug-mode helper (spec 022). Demo mode is a runtime-mode concern, isolated to the dashboard server.

- **FR-016**: The implementation MUST add a permanent site-wide banner when demo mode is active. The banner MUST:
  - Be positioned at the top of the page (highest z-index, sticky)
  - Have amber background (e.g. `bg-amber-500`) with contrasting text
  - Contain the literal text "DEMO MODE — showing sample data. Live data unavailable."
  - Have NO dismiss affordance (no close button, no sessionStorage dismissal)
  - Have `role="status"` for screen-reader announcement
  - Have `aria-label="Demo mode — sample data, not real data"`
  - Be mounted in the root layout (not the dashboard page) so it persists across navigation
  - Have `aria-hidden="true"` on the prefix emoji (⚠️) so screen readers don't announce "warning sign"

- **FR-017**: The implementation MUST add a secondary header chip when demo mode is active. The chip MUST:
  - Be positioned in the top-right header (e.g. between `<UserChip />` and `<ThemeToggle />`)
  - Have amber background matching the banner
  - Contain the literal text "Demo"
  - Be a server-rendered `<span>` (no client-side hooks)
  - Carry `data-testid="demo-mode-chip"` and `data-demo-mode="true"` attributes

- **FR-018**: The implementation MUST add `data-demo-mode="true|false"` to the dashboard root `<body>` element. `data-demo-mode="true"` is set when demo mode is active; `data-demo-mode="false"` otherwise. This makes the runtime mode observable from DevTools without depending on the banner or chip text.

- **FR-019**: The implementation MUST add a build-time generator script at `lib/fixtures/scripts/generate-fixture.mjs`. The script MUST:
  - Read the committed seed file `lib/fixtures/seed/dashboard-fixture-seed.yaml`
  - Apply deterministic randomisation (seeded RNG with a constant seed) to names, dates, times, and locations
  - Emit `lib/fixtures/dashboard-fixture.json` (the bundled fixture)
  - Run as a `prebuild` step in `package.json` so the fixture is regenerated on every `npm run build`
  - Be idempotent: consecutive runs produce byte-identical output (deterministic seed verification)

- **FR-020**: The implementation MUST add a `.gitignore` rule that excludes the generated `lib/fixtures/dashboard-fixture.json` from version control. The seed file (`lib/fixtures/seed/dashboard-fixture-seed.yaml`) IS committed. The generator script IS committed. The generated JSON is NOT committed.

- **FR-021**: The implementation MUST add Vitest tests covering:
  - `lib/runtime-mode.test.ts`: `isBlobStorageConfigured` true/false for various env-var combinations; `runtimeModeStatus` shape.
  - `lib/fixtures/static-fixture-reader.test.ts`: reader returns fixture data for known paths; returns null for unknown paths; reader shape matches `DashboardDataReader`.
  - `lib/fixtures/empty-dashboard-reader.test.ts`: every reader method returns null/empty.
  - `lib/fixtures/scripts/generate-fixture.test.ts` (or equivalent): generator produces byte-identical output across consecutive runs; generator handles missing/malformed seed gracefully.
  - Extension to `components/dashboard-client.test.ts` (or new `app/page.test.tsx`): with demo mode active, the dashboard renders the banner and chip; with live mode, neither renders; the root element carries `data-demo-mode`.
  - Integration test: a full request cycle with `BLOB_READ_WRITE_TOKEN` unset produces HTML containing the banner, the chip, and the fixture data.

- **FR-022**: The implementation MUST update `skill.spec.yaml` `expected_artifacts:` to include this spec directory's six artifacts (spec.md, plan.md, tasks.md, CHANGELOG.md, scenarios.yaml, traceability.yaml) plus the new source files (`lib/runtime-mode.ts`, `lib/runtime-mode.test.ts`, `lib/fixtures/static-fixture-reader.ts`, `lib/fixtures/static-fixture-reader.test.ts`, `lib/fixtures/empty-dashboard-reader.ts`, `lib/fixtures/empty-dashboard-reader.test.ts`, `lib/fixtures/scripts/generate-fixture.mjs`, `components/demo-mode-banner.tsx`, `components/demo-mode-chip.tsx`, plus any new tests). Note: `lib/fixtures/dashboard-fixture.json` is NOT in the artifact list because it is generated and gitignored.

### Non-Functional Requirements

- **NFR-001**: The runtime-mode detection MUST add < 1 ms to the dashboard's first paint. The detection is a synchronous env-var read at request time.
- **NFR-002**: The fixture reader MUST add at most ~10 KB to the production JavaScript bundle (the bundled fixture JSON is not in the production bundle when demo mode is off — see NFR-003). The reader code itself is ~3-4 KB; the fixture JSON is ~6 KB.
- **NFR-003**: With `BLOB_READ_WRITE_TOKEN` set, the bundled fixture JSON MUST NOT be shipped to the production bundle. The fixture file is reachable only via the `StaticFixtureReader` import path, which is only taken when `isBlobStorageConfigured()` returns false. Static-bundle scan (or equivalent) MUST be used to verify this.
- **NFR-004**: The demo banner and chip MUST be accessible: the banner MUST have a descriptive `aria-label`, the chip MUST have a descriptive `aria-label`, and the prefix emoji MUST be `aria-hidden="true"` so screen readers do not announce "warning sign" or similar.
- **NFR-005**: The runtime-mode helper MUST log a warning at request time (once per process, not per request) if `isBlobStorageConfigured()` returns false AND `VERCEL_ENV=production`. This guards against accidental demo-mode-in-prod misconfigurations.
- **NFR-006**: No new npm dependencies. Reuse existing project dependencies.
- **NFR-007**: The fixture reader MUST NOT trigger any network request. All data is in-memory after the initial JSON load at module init time.
- **NFR-008**: The build-time generator MUST be deterministic: consecutive runs with the same seed produce byte-identical output. This is verified by a unit test that runs the generator twice and asserts `shasum` equality.
- **NFR-009**: The fixture names MUST be selected from the curated pool via a seeded RNG. The seed is a constant (e.g. `42`) hard-coded in the generator. No system entropy, no time-based seeding.

### Open Questions *(resolved)*

1. **Explicit env var opt-in vs auto-detect** — Resolved: auto-detect. Danny chose "check for the blob storage id and secret env is set. If not then fall back to preview mode with sample data" on 2026-06-17. The `MEALS_FIXTURE_MODE` env var is **NOT** in this spec. Mode is determined entirely by credential presence.
2. **Banner: dismissible or permanent?** — Resolved: permanent. Danny chose "the banner for demo should never disappear" on 2026-06-17. The banner has no dismiss affordance.
3. **Naming convention: prefix or not?** — Resolved: no prefix. Danny chose "It does not need the prefix 'Demo' so you can use Sam, Patel, etc" on 2026-06-17. Names come from a curated UK pool.
4. **Where does the fixture data come from?** — Resolved: build-time generated from a committed seed file. Danny chose "take the existing trip, randomise the dates, times, locations, names with fake versions" on 2026-06-17. The seed is committed; the generated JSON is gitignored.
5. **Single fixture or multiple?** — Resolved: ONE fixture for now. Multiple-by-flag is a future extension if needed (YAGNI).
6. **Should the fixture be hand-curated or generated?** — Resolved: generated. Hand-curated fixtures drift from the schema over time. Build-time generation keeps the fixture in sync with `SplitLayoutPayload`.
7. **Should the empty-state reader be a separate class or inline?** — Resolved: separate class `EmptyDashboardReader` in `lib/fixtures/empty-dashboard-reader.ts`, for symmetry with the fixture reader and for testability.
8. **Should the runtime-mode helper be combined with spec 022's `lib/debug-mode.ts`?** — Resolved: NO. Separate modules. Spec 022 is operator-gated debug mode; spec 024 is data-source mode. Different concerns, different env vars, different code paths.
9. **What if `BLOB_READ_WRITE_TOKEN` is set AND `BLOB_STORE_ID` is unset (or vice versa)?** — Resolved: demo mode wins. A partial credential is treated as missing (fails closed). This guards against a stale token silently reading garbage.

### Future Considerations (deferred — listed for awareness, NOT in this Draft's surface)

- **Multiple fixtures** (e.g. fixture-by-trip-type: weekly, monthly, special-event) — future spec if Danny wants more variants.
- **Auto-generate fixture from a real snapshot** — out of scope. Privacy + repo-bloat concerns. The build-time generator + seed approach is the compromise.
- **Per-page fixture override** — out of scope. One global fixture for now.
- **Fixture data for non-meals-dashboard surfaces** (e.g. debug shell data) — debug-mode spec 022 owns its own fixture data; this spec only covers the main dashboard read path.
- **Larger name pool**: 8 first × 6 last = 48 combinations is sufficient for demo purposes. If a future spec needs more variety, the pool can be expanded in the seed file.

### Key Entities

- **RuntimeMode**: Read server-side at request time. Shape: `{ demoMode: boolean, blobConfigured: boolean }`. Single source of truth for "which reader to use?" across the dashboard.
- **StaticFixtureReader**: Implements `DashboardDataReader`. Reads from the bundled fixture JSON. Cached at module load. No network. Returns null/empty for paths not in the fixture.
- **EmptyDashboardReader**: Implements `DashboardDataReader`. Returns null/empty for all reads. Used when the bundled fixture is missing or malformed.
- **DemoModeBanner**: Server-rendered React component mounted in the root layout. Visible only when demo mode is active. Permanent, no dismiss affordance. Amber background.
- **DemoModeChip**: Server-rendered React component rendered in the top-right header. Visible only when demo mode is active. Amber background, "Demo" text.
- **DashboardFixture**: The bundled JSON file at `lib/fixtures/dashboard-fixture.json`. Conforms to `SplitLayoutPayload` shape. Generated at build time from a committed seed.
- **FixtureSeed**: The committed YAML file at `lib/fixtures/seed/dashboard-fixture-seed.yaml`. Captures the structure of a real trip (meals, items, coverage gaps, delivery details) plus the curated name pool. The generator reads this file and emits the fixture.
- **GenerateFixtureScript**: The build-time generator at `lib/fixtures/scripts/generate-fixture.mjs`. Reads the seed, applies seeded RNG, emits the fixture. Runs as a `prebuild` step.

### Contract Impact

- `app/page.tsx`: selects the reader at request time using the new `lib/runtime-mode.ts` helper. Passes the selected reader to `getDashboardData({ coverageWindow, reader })`. Passes `demoMode: boolean` to `<DashboardClient />`.
- `app/layout.tsx`: renders `<DemoModeBanner />` mounted in the root layout (not the dashboard page) so the banner persists across navigation. The banner is passed `demoMode: boolean` derived from the same helper.
- `components/dashboard-client.tsx`: accepts new optional `demoMode: boolean` prop. Renders `<DemoModeChip />` in the header when true. Adds `data-demo-mode="true|false"` to the root element.
- New: `lib/runtime-mode.ts`, `lib/runtime-mode.test.ts`, `lib/fixtures/static-fixture-reader.ts`, `lib/fixtures/static-fixture-reader.test.ts`, `lib/fixtures/empty-dashboard-reader.ts`, `lib/fixtures/empty-dashboard-reader.test.ts`, `lib/fixtures/scripts/generate-fixture.mjs`, `components/demo-mode-banner.tsx`, `components/demo-mode-chip.tsx`.
- New: `lib/fixtures/seed/dashboard-fixture-seed.yaml` (committed) and `lib/fixtures/dashboard-fixture.json` (gitignored, generated).
- New tests: `lib/runtime-mode.test.ts`, `lib/fixtures/static-fixture-reader.test.ts`, `lib/fixtures/empty-dashboard-reader.test.ts`, `lib/fixtures/scripts/generate-fixture.test.ts` (or equivalent), extension to `components/dashboard-client.test.ts` (or new `app/page.test.tsx`), integration test for full request cycle.
- `lib/dashboard-data.ts`: UNCHANGED. The reader injection point is the same seam the tests already use.
- `lib/blob-storage.ts`: UNCHANGED. `VercelBlobStorageClient` and `InMemoryBlobStorageClient` are not touched.
- `scripts/sync-dashboard-data.py`: UNCHANGED. The sync script writes to Vercel Blob as today; it has no awareness of demo mode.
- `package.json`: NEW `"prebuild"` script: `"prebuild": "node lib/fixtures/scripts/generate-fixture.mjs"`. No other changes.
- `lib/fixtures/.gitignore` (new): excludes `dashboard-fixture.json`. Includes everything else in `lib/fixtures/`.
- `skill.spec.yaml`: `expected_artifacts:` updated for the new spec directory and source files. Excludes the generated `dashboard-fixture.json` from the artifact list.

## Verification Plan

- **Unit (`lib/runtime-mode.test.ts`)**: `isBlobStorageConfigured` true/false for various env-var combinations; `runtimeModeStatus` shape; warning log when demo mode is detected in production-looking environment.
- **Unit (`lib/fixtures/static-fixture-reader.test.ts`)**: reader returns fixture data for known paths (pointer, manifest, coverage, order, summary); returns null for unknown paths; the parsed fixture conforms to `SplitLayoutPayload` shape.
- **Unit (`lib/fixtures/empty-dashboard-reader.test.ts`)**: every reader method returns null/empty.
- **Unit (`lib/fixtures/scripts/generate-fixture.test.ts`)**: generator produces byte-identical output across consecutive runs (`shasum` equality); generator handles missing/malformed seed gracefully; generated JSON is valid `SplitLayoutPayload`.
- **Integration (`components/dashboard-client.test.ts` extension or new `app/page.test.tsx`)**: with `demoMode=true`, the dashboard renders the banner and chip; with `demoMode=false`, neither renders; the root element carries `data-demo-mode`.
- **Integration (full request cycle)**: with `BLOB_READ_WRITE_TOKEN` unset, a full request cycle produces HTML containing the banner, the chip, and the fixture data; with `BLOB_READ_WRITE_TOKEN` set, the HTML contains Vercel Blob data and no banner/chip.
- **End-to-end (manual)**: deploy to preview (no `BLOB_READ_WRITE_TOKEN`); confirm dashboard renders; confirm banner is visible, sticky, and not dismissible; confirm chip is visible; confirm no network requests to Vercel Blob in DevTools; confirm the fixture is recognisable as a real-trip-derived dataset (not a placeholder). Then deploy to production (with `BLOB_READ_WRITE_TOKEN` set); confirm dashboard reads from Vercel Blob as today; confirm no banner/chip.
- **Regression (manual)**: deploy to production with `BLOB_READ_WRITE_TOKEN` set; confirm dashboard behaviour is unchanged from before this spec landed. No banner. No chip. No fixture data in served HTML.
- **Static inspection (manual)**: with `BLOB_READ_WRITE_TOKEN` set, build the production bundle; grep for fixture-specific strings (e.g. a name from the curated pool); assert no hits in the production JS bundle (the names should not be present in production).
- **Lint / type / build**: `npx tsc --noEmit`, `npx vitest run`, `npx next build` all pass cleanly with no warnings about unreachable code, unused imports, or new dependencies.
- **Determinism verification**: run `node lib/fixtures/scripts/generate-fixture.mjs` twice; assert `shasum lib/fixtures/dashboard-fixture.json` matches across runs.

## Reference Material

- Spec `016-dashboard-blob-storage-layout`: defines the split-blob layout (pointer, manifest, summary, coverage, orders, products). The fixture conforms to this shape.
- Spec `017-dashboard-blob-read-path`: defines the read path that consumes the `DashboardDataReader` interface. The fixture reader plugs into the same seam; no read-path changes needed.
- Spec `018-dashboard-order-status-tracking`: order status / refund fields; the fixture includes `orderStatus` to exercise this surface.
- Spec `019-dashboard-coverage-invalidation-refunds-perishables`: coverage invalidation; the fixture includes stable coverage so this surface is exercised.
- Spec `021-dashboard-product-enrichment-tesco-apollo`: product blobs written to Vercel Blob; the fixture includes product entries to exercise the product-detail surface.
- Spec `022-dashboard-debug-mode`: operator-gated debug surface. Independent from demo mode (different env var, different concern, different file). When both are active, demo mode wins per US-007.
- Spec `023-dashboard-logged-in-user-chip`: header chip rendered alongside the demo chip. Spec 023 + spec 024 together populate the top-right header with three elements: UserChip (leftmost, identity), DemoModeChip (when active, between UserChip and ThemeToggle), ThemeToggle, SignOutButton.
- `lib/dashboard-data.ts:54`: `DashboardDataReader` interface. The fixture reader implements this.
- `lib/blob-storage.ts:55`: `VercelBlobStorageClient` (production) and `InMemoryBlobStorageClient` (tests). Not modified by this spec.
- `lib/blob-storage.ts:58`: `VercelBlobStorageClient` constructor reads `BLOB_READ_WRITE_TOKEN` from env. `isBlobStorageConfigured()` wraps this check.
- `lib/dashboard-sync.ts:92`: `SplitLayoutPayload` interface. The fixture conforms to this shape.
- `app/page.tsx`: the call site. The injection point for the fixture reader.
- `app/layout.tsx`: the root layout. The mount point for the demo banner.
- `package.json`: NEW `prebuild` script entry.
- `lib/fixtures/`: the new directory. `seed/dashboard-fixture-seed.yaml` is committed; `dashboard-fixture.json` is generated and gitignored.
