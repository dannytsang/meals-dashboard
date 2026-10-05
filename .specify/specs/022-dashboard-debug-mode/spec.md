---
name: dashboard-debug-mode
description: "Add a runtime feature switch to the meals dashboard that gates debug surfaces. The switch is a per-user HMAC-signed cookie (`meals_debug_mode`, flipped by an in-header UI toggle). Debug data is fetched from the server at runtime — never bundled into client JS — so devtools network/JS inspection cannot leak pipeline state, internal store data, or order/coverage details when the feature is off. Initial debug surface: items-by-category debug panel (the precise latestOrder / receipt.items / unmatchedItems / displayItems / filter / dataGen view used to diagnose the 2026-06-17 regression). Future surfaces follow the same architecture."
---

# Feature Specification: Dashboard Debug Mode

Feature ID: `022-dashboard-debug-mode`

Feature Name: Dashboard Debug Mode

Target Skill: `data-science/meals-check`

Created: 2026-06-17

Status: Final

Change history: CHANGELOG.md

> **Rev 4 (2026-06-22, cookie-only audit)**: Operator-facing documents (`references/dashboard-debug-mode.md` in the meals-dashboard repo, `components/debug-shell.tsx` comments, `PREVIEW_ENVIRONMENT.md`, the meals-check `SKILL.md` summary, the `references/dashboard-debug-mode.md` captured in the spec dir) are reconciled to the Rev 3 cookie-only design. The implementation has been cookie-only since 2026-06-17 — the drift was in documentation and stale comments only. Rev 4 also adds **FR-020 (operator-facing reference must reflect the cookie-only design)** and **FR-021 (first-time-enablement: the in-header toggle is always rendered for authenticated users)** so the next docs drift is caught by the contract, not by operator confusion. The code-repo files still mentioning the env-var are listed in the Rev 4 plan/tasks as Phase 11 — coder-profile work, not chef-profile scope. Rev 4 stays `Status: Final` because the runtime contract is unchanged; this is a docs reconciliation, not a design change.

## Background

While investigating the 2026-06-17 *Order Items by Category* regression (where the dashboard rendered an empty list because `latestOrder` was filtered out by the page-side coverage window), the fix required shipping a transient `DEBUG: latestOrder=NULL | receipt.items=0 | unmatchedItems=0 | displayItems=0 | showCount=10 | filter=all | cats=NONE | dataGen=...` overlay directly into the main dashboard. That kind of overlay is unacceptable as a permanent diagnostic: it leaks internal state to every dashboard visitor, sits inline with production UI, and tends to be forgotten once the immediate incident is closed.

The recurring pattern across recent sessions is the same: a dashboard surface silently mis-renders, the agent diff-reads components, fetches blobs by hand, runs the sync in dry-run mode, and only after several round-trips locates the responsible variable. None of that is observable from the running browser. Adding a permanent, gated debug surface — modelled on the items-by-category diagnostic we just did — collapses that round-trip loop and gives Danny a real "what does the dashboard actually see right now?" view.

The debug surface must satisfy three constraints, in order of priority:

1. **Strict server-side gating.** Debug data MUST NOT be present in the client JS bundle, in static JSON, in `__NEXT_DATA__`, in Vercel Blob public responses, or in any reachable URL when the cookie is unset or tampered. The whole point of gating is to make devtools a non-event for casual visitors. This is non-negotiable.
2. **Per-user signed cookie switch.** The feature is gated by a single HMAC-signed cookie (`meals_debug_mode`, keyed on `NEXTAUTH_SECRET`) that the operator flips from an in-header UI toggle. The cookie is tamper-evident: setting `meals_debug_mode=1` in devtools without the server's signature has no effect — the `verifyDebugCookie` helper returns `null` and the effective debug mode is computed as off. There is no env-var kill switch (Rev 3 simplification; see CHANGELOG): the cookie is the single source of truth, the OIDC gate is inherited, and the debug surface only exposes data the dashboard already shows.
3. **Cheap to extend.** Each new debug surface is a self-contained panel that consumes a typed API. The first surface (items-by-category) establishes the pattern; future surfaces (Week Meals grid state, meal detail overlay state, product blob resolution, summary filter counters, sync timestamp/lag) plug in the same way.

## Promotion Criteria for Final

This spec remains at `Status: Final, readiness: already_satisfied` once the implementation is **deployed to the production meals-dashboard Vercel environment** AND the *off* state is verified live. Preview-only deployment is necessary but not sufficient.

The "Final" promotion verifies the *gating works* and the *default is safe*, not that the debug surface itself is exercised in production. The status was flipped to `Final` on 2026-06-17 after all of the following were verified against the production deployment at `meals-dashboard.vercel.app`:

- The signed-cookie `verifyDebugCookie` helper rejects tampered, malformed, and unsigned cookies (returns `null` → effective debug mode is off).
- With the cookie unset or tampered, the production deployment returns 307 (OIDC redirect to signin) for `/debug` and all `/api/debug/*` routes when no OIDC session is present; the OIDC gate runs *before* the debug-mode gate, so unauthenticated requests never reach the debug code path.
- The production JS bundle is grep-clean for the debug-mode string set: `DEBUG:`, `latestOrder=`, `unmatchedItems=`, `displayItems=`, `cats=`, `dataGen=`, `/debug`, `/api/debug`, `meals_debug_mode`, `MEALS_DEBUG_MODE`, `isDebugModeEnabled`, `envEnabled` (verified by fetching the main-app bundle from the live URL and grepping).
- The main dashboard served HTML does not contain any of the debug-mode strings above (verified by curl + grep).
- The temporary 2026-06-17 `DEBUG: latestOrder=NULL | ...` overlay has been removed from `components/dashboard-client.tsx` (replaced by the `/debug` route per FR-007).
- The in-header UI toggle is rendered only when the cookie is set; clicking it POSTs to `/api/debug/toggle` and the server returns the new effective state.
- The implementation preserves the OIDC gate (spec 015) — `/debug` inherits the same auth as `/`; debug mode does not bypass auth (per Open Question 3 resolution).
- The implementation does not modify `VercelBlobStorageClient`, the `DashboardDataReader` interface, the sync script, or any other dashboard feature not explicitly listed in this spec's Contract Impact section.

This rule aligns with the spec-driven-skills convention that `Final` status reflects verified runtime evidence in the live consumer deployment, not a closed task checklist. Danny confirmed on 2026-06-17: "the code should end up in production so its not finalised until its in production". For spec 022, "production" means the *off* state — the gating is the feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Per-User Signed Cookie Switch (Priority: P1)

As Danny, I want a per-user UI toggle in the dashboard header that flips a signed cookie, so that I can enable the debug surface for myself on any deployment and have it default off for everyone else (including other users of the same deployment).

**Why this priority**: This is the whole point of the feature. Without server-side gating, the debug surface is either always-on (security hole) or behind a re-deploy (deploy-time ritual). The signed cookie is the only gate; the OIDC layer is inherited from the rest of the dashboard.

**Independent Test**: With the cookie unset, confirm via curl that `/debug` is OIDC-gated (307 to signin when no session) and that the main dashboard HTML and JS chunks contain no debug strings. Sign in, set the cookie via the in-header toggle, confirm `/debug` returns 200 with the items-by-category panel and the inline debug chip appears next to `Order Items by Category`. Click the toggle again, confirm the surface goes away and `/debug` becomes 404. Set the cookie without the HMAC signature — confirm the surface stays off (tampered cookie is treated as unset).

**Acceptance Scenarios**:
1. Given the cookie is unset or tampered, When a browser requests `/debug` (any HTTP method), Then the OIDC middleware redirects to signin (307) if unauthenticated, and the route returns 404 (or 410) if authenticated. The response body contains no debug data, and no HTML or JS strings referencing debug concepts are present in the response.
2. Given the cookie is unset or tampered, When a browser requests `/api/debug/*` (any path under `/api/debug/`), Then the OIDC middleware redirects to signin if unauthenticated, and every such route returns 404 with no body if authenticated.
3. Given the cookie is unset or tampered, When the main dashboard page loads, Then the rendered HTML, the served JavaScript chunks, and the `__NEXT_DATA__` payload MUST NOT contain any of the strings used by debug mode (e.g. `DEBUG:`, `latestOrder=`, `unmatchedItems=`, `displayItems=`, `cats=`, `dataGen=`, `/debug`, `/api/debug`, `meals_debug_mode`).
4. Given the cookie is unset or tampered, When the main dashboard renders for an authenticated user, Then the toggle button is hidden from the header (or, if shown by implementation choice, is visibly disabled with a clear "debug off" state).
5. Given the cookie is set to `1` (signed by the server), When a browser requests `/debug`, Then the route returns 200 with the debug UI shell, and the page can fetch from `/api/debug/items-by-category` and render the items-by-category diagnostic panel. The toggle button in the header shows the on state.
6. Given the cookie is set to `0` (signed), When a browser requests `/debug`, Then the route returns 404. The toggle button in the header shows the off state.
7. Given the cookie is set, When the dashboard read path runs, Then debug state is fetched lazily from `/api/debug/*` after page mount and is NOT included in the initial server-rendered payload for non-debug routes.
8. Given the cookie is unset, When the production JavaScript bundle is inspected, Then there MUST be no debug render code reachable from the main page entry point (Next.js will tree-shake dynamically-imported modules only when the import is also gated; this is verified manually for now and ideally via a build-time dead-code assertion added during implementation).

### User Story 2 — In-Header UI Toggle (Priority: P1)

As Danny, I want a small toggle button in the dashboard header (next to the existing Theme and Sign-out buttons) that flips debug mode on and off for my current session, so that I do not have to type a URL flag, edit a cookie, or re-deploy to access the debug surface.

**Why this priority**: Without the UI control, the per-user cookie is set-and-forgotten and Danny still has to reach for the cookie jar or URL bar every time. The whole point of having a per-user switch is to flip it from the running browser.

**Independent Test**: Load the dashboard, locate the toggle in the header (initially off, since the cookie is unset by default), click it, observe that the page transitions to a debug-enabled state (debug chips appear next to the items-by-category surface), click again, observe the chips disappear. Refresh the page — the toggle state persists. Open `/debug` — when the toggle is on, the page renders the debug shell; when off, the page 404s. Set the cookie directly without clicking — the toggle reflects the cookie state on the next page load.

**Acceptance Scenarios**:
9. Given the cookie is unset, When the dashboard renders, Then a toggle button is visible in the header, positioned alongside the existing Theme and Sign-out buttons, labelled "Debug" with a bug/wrench icon, showing the off state (outline / dimmed). *(The toggle is always rendered for authenticated users; it is the visual *state* that reflects the cookie.)*
10. Given the cookie is unset and the toggle is currently off, When the user clicks the toggle, Then a POST to `/api/debug/toggle` is made, the server sets the signed `meals_debug_mode` cookie to `1`, the page state updates to debug-on, and the inline debug chips (initially: items-by-category) appear next to the debuggable surfaces. No full page reload is required.
11. Given the cookie is set to `1` and the toggle is currently on, When the user clicks the toggle, Then a POST to `/api/debug/toggle` is made, the server clears the signed `meals_debug_mode` cookie, the page state updates to debug-off, and the inline debug chips disappear. No full page reload is required.
12. Given the user has flipped the toggle, When the page is reloaded, Then the toggle's visual state reflects the cookie (server-rendered initial state, not client-only).
13. Given the cookie has been tampered with (the HMAC signature does not match), When the dashboard or `/debug` is requested, Then the server treats the cookie as unset and the toggle shows the off state. The malformed cookie is overwritten on the next toggle click.

### User Story 3 — Items-by-Category Debug Panel (Priority: P1)

As Danny, when I navigate to `/debug` (with the cookie set) I want to see the precise items-by-category state the dashboard sees right now: `latestOrder`, `receipt.items`, `unmatchedItems`, `displayItems` (after filter), `showCount`, `filter`, `selectedCategories`, `dataGen`, and any window-date overrides, so I can diagnose why the list is empty or wrong without diff-reading the source.

**Why this priority**: This is the canonical first debug surface — it directly captures the diagnostic we did by hand on 2026-06-17. It is the reference implementation for every future debug surface.

**Independent Test**: With the cookie set to `1`, navigate to `/debug`, verify the items-by-category panel renders all the diagnostic variables with the same names and semantics used in the temporary overlay, verify the panel refreshes when the underlying dashboard data changes, and verify the same data is independently fetchable from `/api/debug/items-by-category` returning JSON.

**Acceptance Scenarios**:
14. Given the cookie is set to `1` and the toggle is on, When `/debug` renders, Then the items-by-category panel shows: `latestOrder` (full object or `null` with reason), `receipt.items.length`, `unmatchedItems.length`, `displayItems.length`, `showCount`, `filter` (current filter value), `cats` (selected categories list or `NONE`), `dataGen` (summary generation timestamp), and `coverageWindow` (the date list used for filtering).
15. Given the cookie is set to `1` and the toggle is on, When `/debug` renders, Then each panel section is collapsible, each variable is shown with its current type (string / number / array / null / object), and null/empty values are visually distinct (e.g. `NULL`, `0`, `[]` chips) so it is obvious at a glance which variable is the culprit.
16. Given the cookie is set to `1` and the toggle is on, When the dashboard data refreshes (via the existing refresh path), Then the debug panel re-fetches from `/api/debug/items-by-category` and updates without a full page reload.
17. Given the cookie is set to `1` and the toggle is on, When the user clicks "Copy as JSON" on any panel, Then the panel's raw JSON is copied to the clipboard for pasting into Telegram.
18. Given the cookie is set to `1` and the toggle is on, When the user clicks "Refresh" on the debug page, Then `/api/debug/items-by-category` is re-fetched and the panels re-render.

### User Story 4 — Inline Debug Chips on the Main Dashboard (Priority: P2)

As Danny, when the toggle is on I want small debug chips next to the debuggable surfaces on the main dashboard (initially: items-by-category), so that I can see the most important variable at a glance without leaving the main dashboard and so that I can expand into the full `/debug` panel for the same surface with one click.

**Why this priority**: Cleaner separation than a separate page alone, but secondary to `/debug`. The user is happy with either a separate page OR injected chips as long as the data is server-gated.

**Independent Test**: With the cookie set to `1` and the toggle on, load the main dashboard, confirm the items-by-category chip is visible next to the existing `Order Items by Category` heading showing `displayItems: <N>`, click the chip, confirm the full items-by-category panel expands. Flip the toggle off, reload, confirm the chip is gone. With the cookie unset, confirm no chip is visible.

**Acceptance Scenarios**:
19. Given the cookie is set to `1` and the toggle is on, When the main dashboard renders, Then a debug chip is visible next to the `Order Items by Category` heading, labelled `displayItems: <N>` where `<N>` is the current value.
20. Given the cookie is set to `1` and the toggle is on, When the user clicks the inline chip, Then the same items-by-category panel used on `/debug` expands inline. Clicking again collapses it.
21. Given the cookie is unset, or set to `0`, When the main dashboard renders, Then no inline debug chip is visible.

### User Story 5 — Documented Enablement (Priority: P2)

As Danny, I want the exact steps to enable / disable debug mode documented in the spec, so I can flip the switch without spelunking through source.

**Why this priority**: Documentation is what makes a feature discoverable in the future. Without it, this becomes the same kind of tribal-knowledge tool it replaces.

**Independent Test**: Read the spec; verify the enablement steps exist. Read `components/dashboard-client.tsx`; verify the toggle is rendered when the cookie is set.

**Acceptance Scenarios**:
22. Given the spec is Final, When Danny reads `spec.md` or the CHANGELOG, Then the exact enablement steps are listed: open the dashboard, click the Debug toggle in the header. The cookie is set/cleared automatically. Disabling is the inverse — click the toggle again to clear the cookie. The cookie is HMAC-signed and the operator does not need to manipulate it directly.
23. Given the spec is Final, When the implementation lands, Then the debug page footer (`/debug`) shows the current signed-decoded value of the `meals_debug_mode` cookie, the Vercel deployment ID (if available via `VERCEL_DEPLOYMENT_ID` env var), and a one-line `curl` example for the underlying API.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST gate all debug-mode behaviour on a single per-user signed cookie `meals_debug_mode` (session gate, default unset). Debug mode is on for a given request if and only if the cookie is set to `1` AND the HMAC signature verifies against `NEXTAUTH_SECRET`. There is no env-var kill switch — the cookie is the single source of truth. The cookie MUST be signed (HMAC-SHA-256 using `NEXTAUTH_SECRET` as the key) so a user cannot bypass the gate by setting the cookie to `1` in devtools without the server's signature. The `lib/debug-cookie.ts` helper is the single source of truth for sign/verify (`signDebugCookie`, `verifyDebugCookie`, `isDebugCookieOn`); the `lib/debug-mode.ts` helper exposes `effectiveDebugMode(cookieRaw)` as the combined boolean for server-side decisions.
- **FR-002**: With the cookie unset or tampered (treated as unset), the following MUST be true at runtime:
  - `GET /debug` returns 404 (or 410) with no body (for an authenticated user; for an unauthenticated user the OIDC middleware returns 307 to signin first).
  - All `GET /api/debug/*` routes return 404 with no body (same OIDC ordering).
  - The main dashboard at `GET /` returns its existing payload with no debug strings, no debug fields in `__NEXT_DATA__`, and no inline debug chips.
  - The toggle button in the header shows the off state (per implementation choice it may be hidden, dimmed, or labelled "Debug off").
  - The production JavaScript bundle MUST NOT contain any debug render code reachable from the main page entry point. This is achieved by dynamically importing the debug UI only inside the `/debug` route and the toggle component, and by avoiding any top-level reference to debug symbols from non-debug modules.
- **FR-003**: With the cookie set to `1` (signed), the following MUST be true:
  - `GET /debug` returns 200 with a debug shell that lists available panels and renders the items-by-category panel by default.
  - `GET /api/debug/items-by-category` returns 200 with the items-by-category diagnostic payload as JSON.
  - `GET /` renders the main dashboard with inline debug chips next to debuggable surfaces (initially: items-by-category).
  - The toggle button in the header shows the on state.
- **FR-004**: The `/api/debug/items-by-category` endpoint MUST return a JSON object with the following fields, sourced from the same store the main dashboard reads:
  - `latestOrder`: the full `latestOrder` object or `null`, including the same `transformCachedOrderSafely`-shaped data the main UI consumes.
  - `latestOrderStatus`: `"ok" | "null_window_filtered" | "null_no_order_blob" | "null_pointer_missing"` — a short machine-readable reason for `null`, mirroring the diagnostic we did on 2026-06-17.
  - `latestOrderBlobPath`: the blob path actually loaded, or `null`.
  - `receiptItemsLength`: `receipt.items.length` from the loaded order, or `0`.
  - `unmatchedItemsLength`: `unmatchedItems.length`.
  - `displayItemsLength`: `displayItems.length` after the current filter is applied.
  - `showCount`: current `showCount` value.
  - `filter`: current `filter` value.
  - `cats`: array of currently selected categories, or empty array.
  - `dataGen`: summary `dataGeneratedAt` timestamp.
  - `coverageWindow`: array of ISO dates currently used for order filtering.
  - `pointerPath`: the current pointer blob path.
  - `manifestPath`: the current summary manifest path.
  - `fetchedAt`: ISO timestamp of when this API response was generated.
- **FR-005**: The `/debug` page MUST render each panel as a collapsible card showing the variable name, its type (string/number/array/null/object), its current value (formatted for readability), and a "Copy as JSON" affordance.
- **FR-006**: The debug shell MUST show a global refresh button that re-fetches all visible panels in parallel.
- **FR-007**: The debug shell footer MUST show the current signed-decoded value of the per-user `meals_debug_mode` cookie, the Vercel deployment ID (if available via `VERCEL_DEPLOYMENT_ID` env var), and a one-line `curl` example that hits `/api/debug/items-by-category`.
- **FR-008**: The debug surface MUST be implemented under the dashboard source tree as new routes:
  - `app/debug/page.tsx` — server component that returns 404 when the cookie is unset or tampered, otherwise renders the debug shell.
  - `app/api/debug/items-by-category/route.ts` — server route that returns 404 when the cookie is unset or tampered, otherwise returns the items-by-category diagnostic JSON.
  - `app/api/debug/toggle/route.ts` — server route that accepts `POST` and flips the per-user `meals_debug_mode` cookie (set or clear). Returns 200 with the new effective state.
  - `components/debug-shell.tsx` — client component for the debug UI (collapsible panels, copy buttons, refresh button).
  - `components/items-by-category-debug-panel.tsx` — client component for the items-by-category panel.
  - `components/dashboard-debug-chips.tsx` — client component rendered on the main dashboard when the cookie is set; reads the same `/api/debug/items-by-category` data.
  - `components/debug-toggle.tsx` — client component rendered in the dashboard header; reads the per-user cookie's server-decoded value, flips it on click via `POST /api/debug/toggle`, optimistically updates its own visual state.
- **FR-009**: The inline debug chips on the main dashboard MUST be positioned next to the existing `Order Items by Category` heading, MUST show `displayItems: <N>` as the chip label, and MUST open the same items-by-category panel used on `/debug` when clicked. With the cookie unset, the chips MUST NOT be rendered. *(Rev 2: the prior `?debug=inject` URL flag is removed; Rev 3: the env-var is removed; the cookie is the only per-user switch.)*
- **FR-010**: The dashboard TypeScript types MUST include a `DebugPanel` discriminated union type used by `components/debug-shell.tsx`, with the items-by-category panel as the first member. New panels added in follow-up specs MUST extend this union.
- **FR-011**: The implementation MUST add a `lib/debug-mode.ts` helper that exports `effectiveDebugMode(cookieRaw: string | undefined): boolean` (cookie-only check, the single source of truth used by `/debug` and `/api/debug/*` to decide whether to serve the surface). All server-side code that decides whether to render debug UI MUST go through this helper — no module is allowed to accept the cookie value from a request without validation. *(Rev 3: `isDebugModeEnabled()` and the env-var check are removed.)*
- **FR-012**: The implementation MUST add a `lib/debug-cookie.ts` helper that exports `signDebugCookie(value: '0' | '1')` and `verifyDebugCookie(raw: string | undefined): { value: '0' | '1' } | null` (returns `null` for unset, malformed, tampered, or wrong-signature cookies). The cookie format is `<value>.<base64url-hmac-sha256>` with the HMAC keyed on `NEXTAUTH_SECRET`. The cookie path is `/`, `HttpOnly: true`, `SameSite: 'lax'`, `Max-Age: 30 * 24 * 60 * 60` (30 days). The cookie is NOT `Secure` in development (so localhost works) but MUST be `Secure` in production builds.
- **FR-013**: The dashboard build MUST pass `tsc --noEmit` and `next build` cleanly with the cookie unset; the build MUST succeed without warnings about unreachable code or unused imports in the debug modules. *(Rev 3: the second build with the env-var set is no longer required because the env-var is gone.)*
- **FR-014**: The implementation MUST add a Vitest test in `lib/debug-mode.test.ts` that exercises the `effectiveDebugMode` contract: unset → false, set to `"1.<sig>"` (signed) → true, set to `"0.<sig>"` (signed) → false, set to `"1.bogus"` (tampered) → false, set to `"1"` (no signature) → false, set to `""` (empty) → false, set to `null` / `undefined` → false.
- **FR-015**: The implementation MUST add a Vitest test in `lib/debug-cookie.test.ts` that exercises: round-trip `signDebugCookie('1')` → `verifyDebugCookie(...)` returns `{ value: '1' }`, tampered cookie (flipped value) returns `null`, malformed cookie (no signature) returns `null`, unset returns `null`, and the helper does not throw on any input.
- **FR-016**: The implementation MUST add an integration test that mounts the debug page with the cookie unset (asserts 404 / not-found for an authenticated request) and with the cookie set (asserts panel renders and `/api/debug/items-by-category` returns the expected JSON shape).
- **FR-017**: Debug data MUST NOT be persisted to localStorage, sessionStorage, IndexedDB, or the service-worker cache. The `meals_debug_mode` cookie is the only debug-related persistence. The debug surface is read-only and ephemeral.
- **FR-018**: The implementation MUST add a `references/dashboard-debug-mode.md` reference document in this spec directory, capturing: enable/disable steps, the cookie contract, the toggle UI flow, the panel-extension pattern for follow-up specs, the security boundary, and a troubleshooting checklist for future Danny/agent sessions.
- **FR-019**: The implementation MUST update `skill.spec.yaml` `expected_artifacts:` to include the new spec directory and its six-artifact files (spec.md, plan.md, tasks.md, CHANGELOG.md, scenarios.yaml, traceability.yaml) plus the new source files (`app/debug/page.tsx`, `app/api/debug/items-by-category/route.ts`, `app/api/debug/toggle/route.ts`, `components/debug-shell.tsx`, `components/items-by-category-debug-panel.tsx`, `components/dashboard-debug-chips.tsx`, `components/debug-toggle.tsx`, `lib/debug-mode.ts`, `lib/debug-cookie.ts`, plus the test files).
- **FR-020**: Operator-facing documentation MUST reflect the cookie-only design. The implementation MUST keep the spec directory's `references/dashboard-debug-mode.md` and the meals-dashboard repo's `references/dashboard-debug-mode.md` free of any reference to `MEALS_DEBUG_MODE`, `isDebugModeEnabled`, `envEnabled`, the two-level switch matrix, or the "deployment gate" / "kill switch" / "env dominates" wording. The enablement section MUST lead with the per-user signed cookie as the only gate and document the toggle UI as the discoverable first-time enablement path. Any future reference doc that mentions the env-var is a bug, captured by the `references/dashboard-debug-mode.md` wording contract. *(Rev 4: the env-var-era references doc was the root cause of the 2026-06-22 operator confusion. The reference docs are now an explicit contract, not a courtesy.)*
- **FR-021**: First-time-enablement. The in-header Debug toggle MUST be rendered unconditionally for authenticated users — i.e. the toggle is visible regardless of whether the `meals_debug_mode` cookie is currently set. The toggle's *visual state* (off/on) reflects the cookie; the toggle's *visibility* does not depend on the cookie. This is the spec-026 / "the X option has disappeared" pitfall closed for debug mode: an authenticated user with an unset cookie can still see the Debug row in the user menu and click it to enable debug for the first time, without having to reach for `curl /api/debug/toggle` or pre-set the cookie. *(Rev 4: the prior wording at US2 implied the toggle could be hidden when the cookie was unset; the implementation already renders it unconditionally, but the contract did not say so. The contract now says so.)*

### Non-Functional Requirements

- **NFR-001**: Debug routes MUST respond in under 500 ms when the dashboard cache is warm. No synchronous expensive computation is permitted on the debug route path; reuse the existing `getDashboardData` cache.
- **NFR-002**: With the cookie unset, the debug source files SHOULD tree-shake out of the main page bundle. The implementation MUST use dynamic imports to enforce this. The verification is manual via `next build` and the production bundle-grep evidence captured in the Promotion Criteria block.
- **NFR-003**: No new npm dependencies. Reuse existing project dependencies (`next/headers` `cookies()` is built-in; Node `crypto` for HMAC is built-in).
- **NFR-004**: Debug mode MUST NOT modify the contents of any Vercel Blob. It is read-only.
- **NFR-005**: The `/api/debug/items-by-category` route and `/api/debug/toggle` route MUST use the same authentication contract as the rest of the dashboard (`middleware.ts` OIDC gate). Debug mode does not bypass auth.
- **NFR-006**: The per-user cookie MUST be tamper-evident: a user setting `meals_debug_mode=1` in devtools without the server's HMAC MUST NOT enable debug mode. The `verifyDebugCookie` helper returns `null` for such attempts and the effective debug mode is computed as off.

### Future Debug Surfaces (deferred — listed in spec, NOT implemented in this Final)

These are explicit follow-up surfaces Danny flagged as useful. Each gets its own future spec (or its own slice in this spec when promoted to Proposed) but they are listed here so the architecture supports them:

- **DS-01 (future)**: Week Meals grid state — same pattern, surfacing `coverageWindow`, `weekStart`, `today`, collapsed/expanded row state per meal type, and per-day delivery-marker provenance.
- **DS-02 (future)**: Meal Detail Overlay state — currently-selected meal, its MealCoverage data, matched items, expected items, Todoist completion state, and which MealCoverage field made the status render as `Partial` vs `Missing`.
- **DS-03 (future)**: Product Blob resolution trace — for a given tpnc, the steps the resolver took: cache hit, blob fetch, miss reason, fallback to static `lib/product-database.ts`. Includes `lastFetched`, `expiresAt`, blob path, and any fallback chain.
- **DS-04 (future)**: Summary filter counters — how many meals fall into each status bucket before and after the filter, with per-bucket example meal names.
- **DS-05 (future)**: Sync lag — for each of `pointer`, `manifest`, `summary`, `coverage`, `orders`, `products` blobs, the `dataGeneratedAt`/`uiUpdatedAt` timestamps and the gap to "now". Useful when sync appears stale.
- **DS-06 (future)**: Calendar context — the list of calendar events the dashboard considered when computing delivery markers, with their source calendar and classification.
- **DS-07 (future)**: Tesco email parse — the raw `delivery_date`, `substituted_items`, `actual_delivery_date`, `delivery_usable_date` for the most recent order, alongside what the dashboard did with each.

Each future surface reuses the architecture established by items-by-category: a `DebugPanel` union member, a typed `/api/debug/<surface>` route, a `components/<surface>-debug-panel.tsx` component, and a debug chip on the main dashboard (where it makes sense).

### Key Entities

- **DebugCookieValue**: The signed cookie's decoded payload. Shape: `{ value: '0' | '1' }`. Set/cleared via the toggle route. The cookie name is `meals_debug_mode`.
- **EffectiveDebugMode**: The combined boolean for a given request. True iff the signed `meals_debug_mode` cookie decodes to `{ value: '1' }`. Computed via `effectiveDebugMode(cookieRaw)`. Tampered, malformed, and unsigned cookies all yield false (off).
- **DebugPanel**: Discriminated union with a `kind: 'items-by-category' | ...` field and the panel-specific payload. New panels extend this union.
- **ItemsByCategoryDiagnostic**: The full payload returned by `/api/debug/items-by-category`. Shape: `{ latestOrder, latestOrderStatus, latestOrderBlobPath, receiptItemsLength, unmatchedItemsLength, displayItemsLength, showCount, filter, cats, dataGen, coverageWindow, pointerPath, manifestPath, fetchedAt }`.
- **DebugShell**: The `/debug` page client component. Owns the panel list, the refresh button, the footer.
- **DebugChip**: The inline chrome shown on `/` when the effective debug mode is on. One chip per surface. Same data as the panel, compacted.
- **DebugToggle**: The in-header control. Server-rendered initial state from the cookie. Client-side POST to `/api/debug/toggle` to flip. Always interactive (no env-var-driven disabled state, per Rev 3) and always rendered for authenticated users regardless of cookie state (per Rev 4 FR-021 — the toggle is the first-time-enablement affordance, so visibility cannot depend on the gate it controls).

### Contract Impact

- `lib/dashboard-data.ts`: `getDashboardData` already returns `latestOrder` and `receipt`; the debug route reuses this directly. No signature changes.
- `components/dashboard-client.tsx`: optional debug-chip renderer added when effective debug mode is on. Default render path is unchanged.
- `app/page.tsx`: detects effective debug mode (cookie-only), passes a `debugOn` boolean prop. The `?debug=inject` URL flag is removed.
- New: `app/debug/page.tsx`, `app/api/debug/items-by-category/route.ts`, `app/api/debug/toggle/route.ts`, `components/debug-shell.tsx`, `components/items-by-category-debug-panel.tsx`, `components/dashboard-debug-chips.tsx`, `components/debug-toggle.tsx`, `lib/debug-mode.ts`, `lib/debug-mode.test.ts`, `lib/debug-cookie.ts`, `lib/debug-cookie.test.ts`, plus an integration test file.
- `middleware.ts`: unchanged; debug routes inherit the same OIDC gate as the rest of the dashboard.
- `skill.spec.yaml`: `expected_artifacts:` updated for the new spec directory and source files.
- `references/dashboard-debug-mode.md`: new reference document.
- *(Rev 3)*: `MEALS_DEBUG_MODE` env-var and all `isDebugModeEnabled()` references removed. No `process.env.MEALS_DEBUG_MODE` reads anywhere in the dashboard.

## Open Questions *(resolved)*

1. **Single switch vs per-panel switches** — Resolved: single cookie. Per-panel granularity is a future enhancement if needed; YAGNI for now.
2. **Separate route vs in-line chrome** — Resolved: BOTH. `/debug` is the canonical surface; inline chips on the main dashboard provide at-a-glance state when the cookie is set. Both gated by the same effective mode.
3. **Auth bypass** — Resolved: NO. Debug mode does not bypass OIDC. Anyone who can hit the dashboard can hit `/debug` when the effective mode is on.
4. **Should the temp `DEBUG:` overlay from the 2026-06-17 fix be removed before or after this lands?** — Resolved: removed in the same commit that lands the spec's implementation. The temporary overlay has no reason to live once `/debug` is available.
5. **Cookie / local flag vs query param for the per-user switch** — Resolved (Rev 2): **signed cookie** (`meals_debug_mode`, HMAC-SHA-256 keyed on `NEXTAUTH_SECRET`). The cookie is set/cleared by the in-header UI toggle (`POST /api/debug/toggle`). The prior `?debug=inject` URL flag was removed because it was non-stateful and easy to forget; the cookie persists across sessions (30 days) and is the single source of truth for "is debug on for this user?".
6. **Should debug data be JSON-only or include rendered explanations?** — Resolved: both. The API returns raw JSON; the panels render formatted chips with type labels and "Copy as JSON" affordances.
7. **Env-var kill switch (Rev 2) — kept or removed?** — Resolved (Rev 3, 2026-06-17): **removed**. The env-var added ops friction with no security benefit. The cookie is HMAC-signed (tamper-evident), the OIDC gate is inherited, and the debug surface only exposes data the dashboard already shows. The operator has one knob: the toggle. If a global disable is ever needed, the answer is "delete the toggle component" or "revert the merge", not "set an env-var and re-deploy". The toggle is always rendered for authenticated users; its visual state reflects the cookie.
8. **Should the cookie work in development (localhost over HTTP)?** — Resolved: **yes**. The cookie is NOT `Secure` in development (so localhost works without HTTPS) but MUST be `Secure` in production. This is controlled by `process.env.NODE_ENV === 'production'`.
9. **Rev 4 — operator-facing docs drifted from the implementation** (raised 2026-06-22). Resolved: **reconcile docs to the implementation, not the other way around**. The Rev 3 implementation has been cookie-only since 2026-06-17, but `references/dashboard-debug-mode.md` (in both the spec dir and the meals-dashboard repo), the `components/debug-shell.tsx` comments, `PREVIEW_ENVIRONMENT.md`, and the meals-check `SKILL.md` summary still describe a two-level switch with `MEALS_DEBUG_MODE` as the deployment gate. Danny reported on 2026-06-22 that the in-header toggle "does not change anything" — the root cause was the stale operator-facing docs suggesting an env-var was required, not a runtime bug. Rev 4 is a docs-reconciliation revision: it adds FR-020 (operator-facing docs are now a contract) and FR-021 (toggle is always rendered for first-time-enablement), and lists the code-repo files that still need coder-profile attention in the Rev 4 plan. Rev 4 stays `Status: Final` because the runtime contract is unchanged.

## Verification Plan

- **Unit**: `lib/debug-mode.test.ts` covers the `effectiveDebugMode` contract (unset, signed "1", signed "0", tampered, unsigned, empty, null, undefined). `lib/debug-cookie.test.ts` covers round-trip sign/verify, tampering rejection, malformed rejection, unset, and the `Secure`-in-prod-only behavior.
- **Integration**: with the cookie unset, request `/debug` and `/api/debug/items-by-category`; assert 404 (for an authenticated request) or 307 (for an unauthenticated request — OIDC redirects first). With the cookie set, request both; assert 200 and the expected JSON shape. POST to `/api/debug/toggle` with body `{ "value": "1" }`; assert 200 and the cookie is set in the response. POST to `/api/debug/toggle` with body `{ "value": "0" }`; assert 200 and the cookie is cleared.
- **Static inspection (manual)**: build with the cookie unset, grep the production JS bundle and HTML for `DEBUG:`, `latestOrder=`, `/debug`, `/api/debug`, `unmatchedItems`, `displayItems`, `cats=`, `dataGen`, `meals_debug_mode`, `MEALS_DEBUG_MODE`, `isDebugModeEnabled`, `envEnabled`; assert no hits outside build artifacts that legitimately mention those tokens (e.g. tests). **This check passed in production on 2026-06-17** (see Promotion Criteria for Final).
- **End-to-end (manual)**: deploy with the cookie unset, open the dashboard, open devtools, inspect network and JS — assert no debug surface. Set the cookie via the toggle, reload, confirm the inline chip appears next to `Order Items by Category`, navigate to `/debug`, confirm the items-by-category panel renders, click the toggle off, confirm the chip disappears and `/debug` returns 404.
- **Regression (manual)**: with the cookie set and an empty `latestOrder`, confirm `latestOrderStatus` correctly reports the reason and the panel surfaces it.

## Reference Material

- 2026-06-17 incident: the `latestOrder=NULL | receipt.items=0 | unmatchedItems=0 | displayItems=0` overlay shipped as a temporary debug instrument. Its variable list and rendering style are the seed for the items-by-category panel.
- Feature `016-dashboard-blob-storage-layout`: pointer/manifest/coverage/summary/orders/products blob shape that the debug surface inspects.
- Feature `017-dashboard-blob-read-path`: read path that the debug surface does not duplicate — debug reuses `getDashboardData`.
- Feature `008-dashboard-order-items`: the items-by-category surface being debugged.
- Feature `010-dashboard-product-detail`: designed-in Rev 5 (2026-06-23) — debug surface DS-03 (product blob resolution trace) is now contracted as a chip inside the Product Detail Modal that inherits this spec's signed-cookie gate. Spec 031's product-resolution panel payload is the data source. The chip is absent from the DOM when this spec's gate is effectively off.
- `middleware.ts`: OIDC gate that debug routes inherit.
- Spec `015-dashboard-oidc-authentication`: the OIDC contract that defines `NEXTAUTH_SECRET` (the HMAC key for the per-user cookie).
