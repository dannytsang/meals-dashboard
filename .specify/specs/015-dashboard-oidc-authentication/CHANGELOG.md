# Change Log: Dashboard OIDC Authentication

Feature ID: `015-dashboard-oidc-authentication`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits, status-transition reviews, or “why did this change?” questions.

## Entries

### 2026-06-20 — Finalized login button copy refinement

- Change: Implemented the unauthenticated meals-dashboard sign-in button copy refinement so the primary action now reads exactly `Login to continue` while preserving the Authentik sign-in flow and theme styling.
- Status after change: Final
- Rationale: Danny requested the meals dashboard match the sibling trips-dashboard sign-in wording for the primary unauthenticated action.
- Implementation impact: `components/auth-signin-page.tsx` and its focused regression test were updated; the broader OIDC/authentication feature remains Final because the sign-out slice in User Story 4 was already implemented and verified in the 2026-06-15 finalization.
- Evidence: live production `https://meals-dashboard.vercel.app/auth/signin` renders the exact `Login to continue` copy; live production `https://meals-dashboard.vercel.app/api/auth/providers` returns the Authentik provider config; meals-dashboard commit `df7e40e` pushed to `origin/main`; `npx vitest run components/auth-signin-page.test.ts components/dashboard-client.test.ts`, `npm test`, `npm run build`, and `npm run scan:static-private-data` all passed.

### 2026-06-20 — Proposed login button copy refinement

- Change: Reopened Dashboard OIDC Authentication as Proposed so the unauthenticated meals-dashboard sign-in page primary button displays exactly `Login to continue`. The change is copy-only and must preserve Authentik/NextAuth sign-in behaviour, callback URL, theming, route protection, and private-data boundary.
- Status after change: Proposed
- Rationale: Danny requested renaming the login button on the meals dashboard to `Login to continue`. The trips-dashboard already uses this same primary sign-in wording, so the meals dashboard should reuse the sibling-dashboard copy.
- Implementation impact: Future dashboard work must update `components/auth-signin-page.tsx`, add or update tests for exact button copy and preserved sign-in behaviour, then run dashboard tests/build/static scan and the owning-skill validator. No pipeline, schema, cron, or generated-data change is required.
- Evidence: Spec update requested on 2026-06-20; sibling reference confirmed at `/home/hermes/workspace/trips-dashboard/components/auth-signin-page.jsx:128-145`; current meals button copy is `Continue with Authentik` in `/home/hermes/workspace/meals-dashboard/components/auth-signin-page.tsx:74-91`; runtime implementation intentionally deferred to coder profile.

### 2026-06-15 — Finalised sign-out from dashboard (User Story 4)

- Change: Implemented the dashboard sign-out button in the authenticated header (session-gated, themed, accessible) and wired it to `next-auth/react` `signOut({ callbackUrl: '/auth/signin?callbackUrl=/' })`. Re-promoted User Story 4 of Dashboard OIDC Authentication as fully implemented; tasks T060–T065 added to `tasks.md` to record the work. The sign-out button is rendered only in the authenticated dashboard header; it never appears on the unauthenticated `/auth/signin` page. Theme preference (light/dark) is preserved through sign-out via the shared `meals-dashboard-theme` `localStorage` key.
- Status after change: Final
- Rationale: Danny approved implementing the remaining US4 sign-out slice after the previous OIDC core work (auth, data boundary, themed login) was already verified live. The sign-out button is the last open User Story 4 acceptance scenario from the 2026-06-14 reopening.
- Implementation impact: Added `components/sign-out-button.tsx` and `components/sign-out-button.test.ts`; `components/dashboard-client.tsx` header now renders the new button alongside the existing `ThemeToggle`. No changes to `lib/auth.ts`, `middleware.ts`, `app/page.tsx`, the sign-in page, `lib/dashboard-data.ts`, or any data-loading boundary. Production alias `https://meals-dashboard.vercel.app` now serves the signed-in build.
- Evidence: `npm test` passed 73/74 (one pre-existing refactor drift in `auth-signin-page.test.ts` for `meals-dashboard-theme` was already broken on `main` before this change); `npx tsc --noEmit` clean; `npm run build` clean; `npm run scan:static-private-data` confirmed no private meal/grocery strings in `_next/static` chunks; sign-out button appears 3 times in compiled `app/page.js` and 0 times in compiled `app/auth/signin/page.js`; unauthenticated `curl -I https://meals-dashboard.vercel.app/` returns `307` to `/auth/signin?callbackUrl=%2F`; `curl -I https://meals-dashboard.vercel.app/api/auth/providers` returns Authentik config; meals-dashboard commits `76399f0` pushed to `origin/main`; Vercel production deployment ready in 2m and aliased to `https://meals-dashboard.vercel.app`. Credentialed sign-out click verification (SC-012/013/014) remains a manual check for Danny.

### 2026-06-14 — Draft: add logout button and sign-out to auth spec

- Change: Added User Story 4 (Sign Out from Dashboard) with scenarios 10–13, FR-019 to FR-022, and SC-012 to SC-014 to spec `015-dashboard-oidc-authentication`. Added clarification that sign-in page theme toggle is already implemented (existing `useTheme()` + `toggleTheme()` in `AuthSignInPage`). Theme preference is preserved through sign-out via shared `localStorage` key.
- Status after change: Draft (spec update only; implementation not yet started)
- Rationale: Danny requested logout button on auth page and light/dark theme toggle on sign-in page. The sign-in page theme toggle is already implemented; sign-out button and header placement need implementation.
- Implementation impact: Sign-out button needs to be added to the authenticated dashboard header component.
- Evidence: Implementation already has `useTheme()` + `toggleTheme()` in `components/auth-signin-page.tsx`; `signOut()` from `next-auth/react` not yet wired to a button in the dashboard header.

### 2026-06-14 — Finalised themed Authentik sign-in page

- Change: Implemented a custom `/auth/signin` page using the meals dashboard theme tokens, light/dark theme toggle support, and the existing NextAuth Authentik provider flow; promoted Dashboard OIDC Authentication back to Final.
- Status after change: Final
- Rationale: The unauthenticated login surface now looks like the dashboard instead of the default/bare auth screen while preserving the private data boundary and OIDC secret handling.
- Implementation impact: `app/page.tsx` redirects unauthenticated users to `/auth/signin`; `lib/auth.ts` sets `pages.signIn`; `components/auth-signin-page.tsx` uses `useTheme()` and `signIn('authentik')` without importing generated meal/order data.
- Evidence: `npm test -- --run` passed 63 tests including themed sign-in assertions; `npx tsc --noEmit`, `npm run build`, and `npm run scan:static-private-data` passed; independent review passed after fixes; owning-skill validator passed; dashboard commits `df3f200` and `c48780c` pushed; Vercel production deployment aliased `https://meals-dashboard.vercel.app`; `curl -I --max-redirs 0 https://meals-dashboard.vercel.app/` returns `307` to `/auth/signin?callbackUrl=%2F`.

### 2026-06-14 — Proposed login page theme parity

- Change: Reopened Dashboard OIDC Authentication as Proposed so the unauthenticated login/sign-in page uses the same dark and light theme treatment as the existing meals dashboard.
- Status after change: Proposed
- Rationale: Danny requested that the login page match the meals dashboard theme rather than looking like a default/bare auth screen.
- Implementation impact: Future dashboard auth UI work must style/customise the login page for both dark and light modes, preserve OIDC/NextAuth/AuthentiK flow and fail-closed behaviour, avoid private meal/order data imports, and keep all secrets out of rendered/logged output.
- Evidence: Spec update requested on 2026-06-14; runtime implementation intentionally deferred.

### 2026-06-14 — Finalised OIDC authentication after live auth confirmation

- Change: Promoted Dashboard OIDC Authentication to Final after Danny confirmed the live Authentik authentication flow is working. Recorded that the current dashboard session flow uses automatic redirect plus NextAuth `/api/auth/signout`/session expiry rather than a bespoke sign-out button.
- Status after change: Final
- Rationale: The remaining blocker was manual credentialed browser evidence for allowed-user login/sign-out/session behaviour; Danny supplied the live confirmation. Repository-side tests, build, unauthenticated redirect, env presence, and static privacy checks had already passed.
- Implementation impact: The meals dashboard is considered protected by Authentik/NextAuth with server-side private-data loading. Dashboard-side group claim checks remain intentionally out of scope; access is enforced by Authentik application assignment/policy.
- Evidence: Danny confirmation on 2026-06-14 that authentication is working, plus prior evidence in this changelog for production unauthenticated redirect, Vercel env presence, static private-data scan, tests, build, and validator.

### 2026-06-14 — Implemented and deployed OIDC/data-boundary code; manual login smoke remains

- Change: Verified and deployed the Authentik/NextAuth implementation, server-side data boundary, fail-closed auth configuration, Vercel env presence, unauthenticated production redirect, and static private-data scan. Allowed-user login and sign-out/session-expiry browser checks remain manual because this agent session has no Authentik user credentials.
- Status after change: Proposed
- Rationale: Danny requested implementation of the proposed dashboard meal specs; the OIDC code path can be built, deployed, and unauthenticated-tested here, but authenticated browser flow needs a human credentialed session.
- Implementation impact: Production alias points at the authenticated build; generated data remains server-loaded and absent from public static chunks. The feature should be promoted to Final after T043/T044 manual checks pass.
- Evidence: Dashboard commit `9af0547`; Vercel production deploy ready in 1m and aliased to `https://meals-dashboard.vercel.app`; `curl -I --max-redirs 0 /` returned HTTP 307 to `/api/auth/signin?callbackUrl=%2F`; `npx vercel env ls` listed required encrypted env vars; `npm test -- --run`, `npx tsc --noEmit`, `npm run build`, `npm run scan:static-private-data`, and owning-skill validator passed.

### 2026-06-13 — Promote OIDC authentication spec to Proposed

- Change: Promoted the dashboard OIDC authentication feature from Draft to Proposed after Danny confirmed the Vercel env configuration path and requested promotion.
- Status after change: Proposed
- Rationale: The required OIDC runtime env names are now present in Vercel and the non-secret env propagation smoke test succeeded, so the feature is ready to enter implementation planning/execution.
- Implementation impact: Implementation may now proceed under this spec; finalisation remains blocked until route protection, private data-boundary refactor, Vercel/Authentik configuration, tests, build, and production login verification are complete.
- Evidence: `npx vercel env ls` showed `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_ISSUER`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` present for Production/Preview.

### 2026-06-13 — Confirm Vercel env configuration method after smoke test

- Change: Recorded Danny's decision to use Vercel project environment variables as the runtime configuration method for meals-dashboard OIDC details, based on a successful production smoke test rendering non-secret `AUTHENTIK_ISSUER` via server-side `process.env`.
- Status after change: Draft
- Rationale: Danny confirmed the debug value displayed on the meals dashboard and wants to use the same Vercel env method for OIDC configuration.
- Implementation impact: Future implementation should configure OIDC/session values through Vercel env vars; non-secret values may be smoke-tested by rendering them temporarily, while secret values must be verified only by env-name presence or successful auth flow and must never be displayed.
- Evidence: Production debug banner displayed `AUTHENTIK_ISSUER`; `npx vercel env ls` showed `AUTHENTIK_ISSUER` present for Preview and Production.

### 2026-06-13 — Proposed Authentik OIDC protection for meals dashboard

- Change: Created a Proposed feature spec for Authentik-backed OAuth2/OIDC authentication on the meals dashboard, including route protection, Vercel/Authentik runtime configuration boundaries, and a required private-data loading refactor so generated meal/order data is not bundled into public static JavaScript.
- Status after change: Proposed
- Rationale: Danny asked to write up a spec to implement OIDC for the meals dashboard using Authentik as the IdP. Investigation showed app-level login is possible, but secure implementation must also move private generated data behind an authenticated server/API boundary.
- Implementation impact: Future implementation must add a Next.js auth library/provider setup, configure Authentik and Vercel env vars, protect routes/data APIs, refactor `lib/real-data.ts` client imports, add tests/static-bundle privacy checks, and verify production login.
- Evidence: Spec update requested on 2026-06-13; `npx vercel env ls` showed no current Vercel env vars for `danny-tsangs-projects/meals-dashboard`; package inspection showed no current auth dependency and Next.js 15/React 19 stack.
