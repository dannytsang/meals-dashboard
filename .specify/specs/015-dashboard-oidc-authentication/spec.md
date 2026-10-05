# Feature Specification: Dashboard OIDC Authentication

Feature ID: `015-dashboard-oidc-authentication`

Feature Name: Dashboard OIDC Authentication

Target Skill: `data-science/meals-check`

Created: 2026-06-13

Status: Final

Change history: CHANGELOG.md

Input: Danny asked to implement OAuth2/OIDC for the meals dashboard using Authentik as the identity provider. Investigation of `/home/hermes/workspace/meals-dashboard` found a Next.js 15 App Router app deployed to Vercel, no current auth dependencies, no current Vercel environment variables, and generated meal/order data imported into client code from `lib/real-data.ts`, which means route protection alone would not fully protect private dashboard data. Updated on 2026-06-20 for the login button copy refinement: the primary unauthenticated sign-in action reads `Login to continue`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authentik-gated Dashboard Access (Priority: P1)

As Danny, I want the production meals dashboard to require login through Authentik before any household meal/order data is shown, so the dashboard is not publicly readable.

**Why this priority**: The dashboard contains private household meal plans, Tesco order details, labels, and grocery metadata. Authentication must protect both the page route and the generated data it displays.

**Independent Test**: Visit the production dashboard in a fresh unauthenticated browser session and verify the user is redirected to Authentik. After authenticating as an allowed user, verify the dashboard loads. After signing out or clearing the session, verify direct dashboard access is blocked again.

**Acceptance Scenarios**:

1. Given an unauthenticated visitor requests `/`, When the dashboard handles the request, Then it redirects to the Authentik OIDC login flow before rendering meal/order data.
2. Given an authenticated Authentik user who is allowed to access the dashboard, When they return from the OIDC callback, Then they receive a secure session and can view the meals dashboard.
3. Given an authenticated user signs out or the session expires, When they request the dashboard again, Then access is blocked and a fresh Authentik login is required.
4. Given a user is not assigned to the Authentik meals-dashboard application or required group/policy, When they attempt login, Then they must not receive dashboard access.
5. Given Authentik/OIDC environment variables are missing or invalid, When the dashboard starts or receives an auth request, Then the failure is explicit and must not fall back to public unauthenticated access.

### User Story 2 - Private Dashboard Data Boundary (Priority: P1)

As Danny, I want generated meal/order data to be served only after authentication, so private data is not leaked through public static JavaScript bundles even if the route itself redirects.

**Why this priority**: The current dashboard imports generated data into a client component from `lib/real-data.ts`; route middleware alone can still leave private strings in `_next/static` chunks. Authentication is incomplete unless the data-loading boundary changes.

**Independent Test**: Build the dashboard after the auth/data refactor and scan generated static client chunks for known private meal or grocery strings. Verify those strings are absent from public static chunks and only delivered through authenticated server-rendered data or authenticated API responses.

**Acceptance Scenarios**:

1. Given the dashboard build completes, When generated client-side static chunks are inspected, Then known meal/order strings from the generated data are not present in public `_next/static` assets.
2. Given an unauthenticated request is made to any dashboard data API route, When the route handles it, Then it returns an authentication challenge or denial and no meal/order JSON.
3. Given an authenticated request is made to the protected dashboard data path, When the route handles it, Then it returns the generated dashboard data needed by the UI.
4. Given the meals-check pipeline sync updates generated dashboard data, When auth is enabled, Then sync/build/deploy still works without embedding secrets or private data in source-controlled specs.


### User Story 3 - Themed Auth Login Page (Priority: P2)

As Danny, I want the dashboard login page to use the same dark and light theme language as the existing meals dashboard, so authentication feels like part of the same product rather than a bare/default auth screen.

**Why this priority**: The login page is now the first visible surface for unauthenticated users. It should preserve dashboard polish, theme consistency, and light/dark readability while still keeping the auth flow simple and secure.

**Independent Test**: Visit the unauthenticated sign-in page in both light and dark theme states and verify the page uses the meals dashboard's existing theme tokens/visual language, readable contrast, dashboard-style background/card/button treatment, and no exposed secret/config values.

**Acceptance Scenarios**:

6. Given an unauthenticated user is redirected to the dashboard sign-in page, When the page renders in dark mode, Then the background, card, typography, and primary sign-in action visually match the existing dark meals dashboard theme rather than the default NextAuth/plain page styling.
7. Given the user switches or has persisted light mode, When the sign-in page renders in light mode, Then it uses the existing meals dashboard light theme treatment with readable contrast and matching card/button styling.
8. Given the login page renders before a dashboard session exists, When it reads theme preference, Then it MUST NOT require private meal/order data and MUST NOT expose OIDC secrets, tokens, session values, or Authentik client secrets.
9. Given the user completes login, When they return to the dashboard, Then existing authenticated dashboard theme behaviour from spec `012-dashboard-theme-toggle` remains preserved.
14. Given the unauthenticated login page renders, When the primary sign-in action is displayed, Then the visible button copy reads exactly `Login to continue` while preserving the existing Authentik sign-in behaviour.

### User Story 4 - Sign Out from Dashboard (Priority: P2)

As Danny, I want to sign out of the meals dashboard from within the authenticated session, so I can switch accounts or end the session without needing to clear browser cookies.

**Why this priority**: Authenticated sessions should have a clear sign-out path. Without it, ending a session requires cookie/cache clearing which is poor UX.

**Independent Test**: Sign in to the dashboard, click the sign-out button, and verify the session is ended and the browser redirects to the sign-in page.

**Acceptance Scenarios**:

10. Given an authenticated session exists, When the user clicks the sign-out button in the dashboard header, Then the session is cleared and the browser redirects to `/auth/signin`.
11. Given the sign-out button is rendered, When it appears on screen, Then it uses a consistent visual treatment with the dashboard theme (matching button/card styling) and is accessible (labelled, keyboard-focusable).
12. Given the user has signed out, When they request the dashboard root again, Then they are redirected to the sign-in page and no meal/order data is shown without re-authentication.
13. Given the sign-out flow completes, When the sign-in page renders, Then it preserves the current theme (light or dark) so the user does not see an unexpected theme shift after sign-out.

## Edge Cases

- Auth callback routes, sign-in, sign-out, and static framework assets needed for the login flow must remain reachable as required by the auth library; dashboard routes and private data endpoints must remain protected.
- Authentik preview deployment support is optional and must be explicitly configured with redirect URIs before relying on preview auth.
- Old Vercel deployments may contain previously bundled data; production must point at the protected deployment, and any sensitive old deployments should be reviewed separately if needed.
- The Authentik issuer URL, client ID, client secret, session secret, and app URL are runtime configuration, not source-controlled values.
- Vercel project environment variables are the approved runtime configuration mechanism for the dashboard OIDC details. A temporary production smoke test successfully displayed non-secret `AUTHENTIK_ISSUER` from Vercel via server-side `process.env`; use this method for OIDC configuration, but never render secret values.
- Authentication must not affect the raw Telegram meals-check report pipeline or scheduled checks.
- The dashboard must not silently degrade to public mode when auth middleware, provider configuration, or environment variables fail.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The meals dashboard MUST integrate with Authentik using OAuth2/OpenID Connect authorization-code flow via a supported Next.js authentication library such as NextAuth/Auth.js.
- **FR-002**: The production dashboard route `/` and all private dashboard pages MUST require an authenticated session before rendering meal/order data.
- **FR-003**: Auth callback, sign-in, sign-out, session, and framework asset routes required for authentication MUST remain reachable without an existing authenticated dashboard session.
- **FR-004**: Access MUST be limited to Authentik users allowed by the Authentik application assignment/policy and, if configured during implementation, by an application group/claim check in the dashboard.
- **FR-005**: Required runtime environment variable names MUST be documented and read from Vercel/runtime environment, not committed values. Initial expected names are `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_ISSUER`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` unless implementation deliberately chooses the Auth.js v5 naming scheme and updates this spec.
- **FR-006**: `AUTHENTIK_CLIENT_SECRET` and `NEXTAUTH_SECRET` MUST never be committed to the dashboard repository, Hermes-Skills repository, generated dashboard data, logs, screenshots, debug banners, or rendered HTML.
- **FR-007**: Authentik provider configuration MUST include the production callback URL `https://meals-dashboard.vercel.app/api/auth/callback/authentik` or the implementation's exact callback path if a different auth library/path is selected.
- **FR-008**: The dashboard MUST refactor private generated meal/order data so it is not imported into public client JavaScript bundles from `lib/real-data.ts` or equivalent static client code.
- **FR-009**: Private dashboard data MUST be loaded only through an authenticated server boundary: either server-side authenticated props/rendering or authenticated API route(s).
- **FR-010**: Unauthenticated requests to private dashboard data endpoints MUST return no meal/order data.
- **FR-011**: The implementation MUST include a build-time or test-time check that public static client chunks do not contain selected known private meal/grocery strings from generated data.
- **FR-012**: The implementation MUST preserve existing dashboard functionality after authentication: theme toggle, headline metrics, Week Meals, meal detail overlay, product detail modal, order item filters, and expiry timeline.
- **FR-013**: The implementation MUST keep meals-check pipeline sync/deploy compatible with authenticated dashboard data loading, including `npm run build` and Vercel production deploy.
- **FR-014**: Missing or invalid OIDC runtime configuration MUST fail closed: no public dashboard fallback and a diagnosable deployment/runtime error.


- **FR-015**: The dashboard sign-in/login page MUST use the same dark and light theme visual language as the authenticated meals dashboard, including matching background treatment, card/surface styling, typography, spacing, and primary action/button treatment where applicable.
- **FR-016**: The login page MUST support both dashboard theme modes: dark mode and light mode. It SHOULD respect the same persisted theme preference mechanism as the dashboard where practical, while remaining safe before authentication.
- **FR-017**: The login page MUST NOT load private meal/order data and MUST NOT render, log, or expose OIDC secrets, tokens, cookies, session contents, `AUTHENTIK_CLIENT_SECRET`, or `NEXTAUTH_SECRET`.
- **FR-018**: The themed login page MUST preserve the existing OIDC/NextAuth/AuthentiK redirect, callback, and fail-closed behaviour; visual theming MUST NOT weaken route protection or data-boundary protections.
- **FR-023**: The themed login page primary sign-in button MUST display the exact visible copy `Login to continue`. This is a copy-only requirement: the button MUST keep the existing `signIn('authentik', { callbackUrl: '/' })` behaviour, theme styling, keyboard/focus behaviour, and secret/privacy constraints from FR-015 through FR-018.

- **FR-019**: The dashboard header (authenticated session only) MUST include a sign-out button that calls `signOut()` and redirects to `/auth/signin`.
- **FR-020**: The sign-out button MUST use visual treatment consistent with the dashboard theme (matching button/card styling, accessible label, keyboard-focusable) and MUST NOT expose any session or OIDC values.
- **FR-021**: After sign-out, the theme preference (light or dark) MUST be preserved so the sign-in page renders in the same theme the user had active before signing out.
- **FR-022**: The sign-out button MUST be rendered server-side or client-side only within an authenticated session context; it MUST NOT appear or be callable on the unauthenticated sign-in page.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — this new feature directory must be listed as an expected artifact; OIDC env vars/secrets are runtime/Vercel state and must not become required chef-profile pipeline env vars until implementation finalises the deployment contract.
- `SKILL.md` changes required: Yes — add this feature to the spec list and dashboard security notes.
- Runtime state changes required: Yes — Vercel project environment variables and Authentik application/provider configuration will be required during implementation.
- Secrets/config changes required: Yes — Authentik client secret and session secret must be configured outside git.
- Cron/hook changes required: No.

### Key Entities

- **Authentik Provider**: OAuth2/OpenID Connect provider configured in Authentik for the meals dashboard application.
- **OIDC Runtime Environment**: Vercel/runtime variables containing issuer, client ID, client secret, app URL, and session secret.
- **Protected Dashboard Route**: A Next.js route that requires an authenticated session before rendering dashboard data.
- **Private Dashboard Data Boundary**: Server-side or authenticated API boundary that serves generated meal/order data only to authenticated sessions.
- **Public Static Asset Boundary**: `_next/static` and equivalent public client assets that must not contain private generated meal/order data.
- **Themed Login Page**: The unauthenticated dashboard sign-in surface, governed by this auth spec and visually aligned with the dark/light theme contract from `012-dashboard-theme-toggle`.
- **Primary Login Button Copy**: The visible label on the unauthenticated sign-in page primary action. The required string is `Login to continue`, matching the sibling trips-dashboard login action wording in `/home/hermes/workspace/trips-dashboard/components/auth-signin-page.jsx:128-145`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An unauthenticated request to production `/` redirects to Authentik and does not render meal/order data.
- **SC-002**: An allowed Authentik user can sign in and view the production meals dashboard.
- **SC-003**: A signed-out/expired session cannot access the dashboard without re-authentication.
- **SC-004**: `npx vercel env ls` or equivalent deployment inspection confirms required OIDC/session env var names are present in the production Vercel environment before production auth is considered complete.
- **SC-004a**: A non-secret env smoke test may verify server-side Vercel env propagation by rendering `AUTHENTIK_ISSUER`; secret env vars must only be verified by name/presence or by successful authenticated flow, never by displaying their values.
- **SC-005**: Build/test evidence shows known private meal/grocery strings are absent from public static client chunks after the data-boundary refactor.
- **SC-006**: Unauthenticated requests to private dashboard data API routes, if used, return no data.
- **SC-007**: Existing dashboard tests and `npm run build` pass after the auth/data refactor.
- **SC-008**: The deployed production alias `https://meals-dashboard.vercel.app` points to the authenticated build after verification.

## Assumptions

- Authentik is reachable from Vercel users at a stable HTTPS issuer URL.
- Danny will create or provide access to an Authentik OAuth2/OIDC provider/application for the meals dashboard.
- NextAuth/Auth.js is acceptable unless implementation analysis finds a better-supported library for the current Next.js version.
- Production custom domain remains `https://meals-dashboard.vercel.app` unless Danny changes it before implementation.
- The login-page theming refinement should reuse the existing dashboard theme design system/tokens where practical rather than creating a second unrelated auth-page theme.

## Out of Scope

- Replacing Authentik with another identity provider.
- Adding per-user dashboard customisation beyond allow/deny access.
- Changing meals-check matching, Tesco parsing, Todoist, Gmail, Calendar, Grocy, or Telegram report behaviour.
- Making Vercel preview deployments fully authenticated unless preview redirect URIs and environment variables are explicitly added.
- Retiring or deleting old Vercel deployments; this may be handled as a separate cleanup if required.

## Clarifications

### Session 2026-06-13 — OIDC target

- Q: Which IdP should protect the meals dashboard? → A: Authentik.
- Q: Where should OIDC details be stored? → A: Authentik stores provider/application settings and allowed redirect URIs; Vercel stores runtime environment variable values; the dashboard repo stores only code that reads env var names; the meals-check spec stores the required variable names and safety boundaries.
- Q: Are the env vars already defined in Vercel? → A: No. `npx vercel env ls` reported no environment variables for `danny-tsangs-projects/meals-dashboard`.

### Session 2026-06-13 — Vercel env smoke-test decision

- Q: Can the dashboard use Vercel environment variables as the method for OIDC details? → A: Yes. Danny confirmed `AUTHENTIK_ISSUER` displayed on the production meals dashboard via server-side `process.env`, so Vercel env vars are the chosen runtime configuration method for OIDC details.
- Q: Can this debug display method be used for all OIDC values? → A: No. It is acceptable only for non-secret values such as `AUTHENTIK_ISSUER`; secrets such as `AUTHENTIK_CLIENT_SECRET` and `NEXTAUTH_SECRET` must never be rendered, logged, committed, or exposed in screenshots.

### Additional Success Criteria — Themed Login Page

- **SC-009**: The unauthenticated login/sign-in page visually matches the existing meals dashboard dark theme when dark mode is active.
- **SC-010**: The unauthenticated login/sign-in page visually matches the existing meals dashboard light theme when light mode is active.
- **SC-011**: Login-page tests or documented checks prove the page does not import private meal/order data and does not render secret OIDC/session values.

### Additional Success Criteria — Sign Out

- **SC-012**: Clicking the sign-out button in the dashboard header clears the session and redirects to `/auth/signin`.
- **SC-013**: After sign-out, a subsequent request to `/` redirects to `/auth/signin` without showing meal/order data.
- **SC-014**: The sign-in page renders in the same theme (light or dark) that was active before sign-out.
- **SC-015**: The unauthenticated sign-in page primary action renders the exact text `Login to continue` in both light and dark mode without changing the Authentik sign-in target.

### Session 2026-06-14 — Login page theme parity

- Q: How should the login page look? → A: It should have the same dark and light theme treatment as the existing meals dashboard, rather than a bare/default auth-page appearance.

### Session 2026-06-14 — Sign-out button and theme preservation

- Q: Where should the sign-out button appear? → A: In the dashboard header, alongside or near the theme toggle, visible only when authenticated. It should not appear on the unauthenticated sign-in page.
- Q: Should signing out change the theme? → A: No. The theme preference (light or dark) is stored in `localStorage` and is independent of the session. After sign-out the sign-in page should render in the same theme the user had active.
- Q: Should the theme toggle remain on the sign-in page after sign-out? → A: Yes. The sign-in page already has a theme toggle (see FR-016). It reads from the same `localStorage` key as the authenticated dashboard, so it automatically preserves the user's theme preference.

### Session 2026-06-20 — Login button copy

- Q: What should the meals-dashboard login button say? → A: The visible primary button text should be exactly `Login to continue`.
- Cross-dashboard reuse check: trips-dashboard already uses `Login to continue` for the analogous primary sign-in button at `/home/hermes/workspace/trips-dashboard/components/auth-signin-page.jsx:128-145`; meals-dashboard should match this wording while keeping its own meal-specific heading/body copy.
