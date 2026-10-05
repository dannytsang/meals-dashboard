# Implementation Plan: Dashboard OIDC Authentication

Status: Final
Feature: 015-dashboard-oidc-authentication
Skill: data-science/meals-check

## Summary

Plan for protecting the Vercel meals dashboard with Authentik-backed OAuth2/OIDC authentication and refactoring generated meal/order data so private household data is not bundled into public client JavaScript assets. The expected implementation path is NextAuth/Auth.js with an Authentik OIDC provider, Vercel environment variables for runtime secrets/configuration, and a server-side or authenticated API data boundary for dashboard data.

## Technical Context

- Runtime profile: `chef` owns meals-check domain and dashboard sync workflow.
- Dashboard repository: `/home/hermes/workspace/meals-dashboard`
- Deployment target: Vercel project `danny-tsangs-projects/meals-dashboard`
- Production alias: `https://meals-dashboard.vercel.app`
- Current framework: Next.js 15 App Router, React 19.
- Current auth state: no auth dependencies in `package.json`; `npx vercel env ls` reports no environment variables.
- Current data risk: `components/dashboard-client.tsx` imports generated data from `lib/real-data.ts`, causing private generated data to appear in public client bundles.
- Candidate auth library: `next-auth` v4 currently supports Next.js 15/React 19 peer dependencies and has an Authentik provider; Auth.js v5 is acceptable if implementation deliberately chooses that route and updates env names/docs consistently.

## Constitution Check

- Raw report is the product: Pass — dashboard auth does not change Telegram raw report delivery.
- Observable pipeline behaviour beats guesswork: Pass — production env inspection and static bundle scans are required verification.
- Runtime state is declared, not committed: Pass — OIDC secrets live in Vercel/AuthentiK runtime configuration, never in source.
- Production side effects are bounded: Pass with caution — implementation requires Vercel env changes, Authentik provider/application configuration, production deploy, and live login verification.

## Scope

In scope:
- Add OIDC authentication to the Next.js dashboard using Authentik.
- Protect production dashboard routes and private data routes.
- Configure documented Vercel environment variable names.
- Document Authentik redirect URI and issuer/client settings.
- Refactor generated dashboard data loading so private data is not bundled into public client chunks.
- Add tests/checks for route protection and public static chunk privacy.
- Preserve existing dashboard UI behaviours after login.

Out of scope:
- Changing meals-check matching/reporting/scheduled pipeline behaviour.
- Per-user meal preferences or role-specific dashboard views.
- Full preview-deployment auth unless redirect URIs/envs are explicitly configured.
- Deleting old Vercel deployments.

## Scenario Coverage Matrix

- Positive: unauthenticated production dashboard access redirects to Authentik → FR-001, FR-002, SC-001, T030, T070.
- Positive: allowed Authentik user signs in and views dashboard → FR-004, SC-002, T031, T070.
- Negative: unauthorised/unassigned Authentik user cannot access dashboard → FR-004, SC-003, T032, T070.
- Negative: missing OIDC env configuration fails closed rather than public → FR-014, T033, T060.
- Boundary: auth callback/session/static routes remain reachable while private dashboard/data routes are protected → FR-003, T020, T030.
- Integration-isolated: generated data no longer appears in public static chunks → FR-008, FR-011, SC-005, T040, T041, T042.
- Regression: existing dashboard behaviours still build/test after auth/data refactor → FR-012, FR-013, SC-007, T050, T051, T060.
- Deployment: Vercel env vars exist and production alias points to authenticated deployment → FR-005, FR-006, FR-007, SC-004, SC-008, T060, T070.

## Implementation Approach

1. Add authentication dependency and config:
   - Install `next-auth` or selected Auth.js package.
   - Create auth options/provider config using Authentik OIDC env vars.
   - Add App Router auth route under `app/api/auth/[...nextauth]/route.ts` or equivalent.
2. Protect routes:
   - Add `middleware.ts` or server-side session guard.
   - Exclude auth callbacks/session endpoints and required static assets.
3. Refactor data boundary:
   - Stop importing generated private data directly into client components.
   - Prefer server-side authenticated load in `app/page.tsx` or an authenticated `app/api/dashboard-data/route.ts`.
   - Pass data into `DashboardClient` as props or fetch it from an authenticated API after session validation.
4. Configure runtime secrets/configuration:
   - Add production Vercel env vars for issuer, client ID, client secret, app URL, and session secret.
   - Configure Authentik application/provider callback URL.
5. Verify:
   - Unit/component tests for protected states where practical.
   - Build succeeds.
   - Static chunk privacy scan passes.
   - Live production login works through Authentik.

## Risk & Safety

- Do not commit OIDC client secrets, session secrets, Authentik tokens, exported Vercel env values, or `.env.local`.
- Do not leave a public fallback path if auth configuration fails.
- Do not rely on middleware alone while private generated data remains in public client bundles.
- Coordinate Authentik and Vercel changes carefully; a bad callback URL or missing env can lock out dashboard access until fixed.
- Production deployment should happen only after env vars are present and a rollback path is known.

## Verification

Required before promoting to Final:

- `npx vercel env ls` shows the required production env var names exist without exposing values.
- `npm test -- --run` passes, including added auth/data-boundary tests.
- `npm run build` passes.
- Static bundle scan confirms known private meal/grocery strings are absent from public `_next/static` chunks.
- Unauthenticated HTTP check to `https://meals-dashboard.vercel.app/` redirects/challenges rather than returning dashboard content.
- Authenticated browser/manual test through Authentik reaches the dashboard. *(Manual evidence: Danny confirmed authentication is working on 2026-06-14.)*
- Sign-out/session-expiry blocks renewed access through the implemented NextAuth session/signout flow; unauthenticated production access redirects rather than rendering dashboard content.
- `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` passes.

## Login Page Theme Parity Refinement

The OIDC/authentication implementation was refined for visual parity: the unauthenticated login/sign-in page uses the same dark and light theme language as the existing meals dashboard. This is a UI/theming change around the auth surface only; it must not alter OIDC secrets handling, route protection, callback behaviour, or private dashboard data boundaries.

Verification should include both theme modes, readable contrast, preservation of the Authentik/NextAuth flow, no private meal/order data import on the login page, and no rendering/logging of secret values.


## Login Button Copy Refinement

The OIDC/authentication implementation was refined for the copy-only slice: the unauthenticated login page primary sign-in button reads exactly `Login to continue`, matching the analogous trips-dashboard sign-in action. This does not alter Authentik/NextAuth wiring, callback URL, route protection, data-boundary behaviour, theme styling, or secret handling.

Verification should include a focused component/unit assertion for the exact visible copy, plus existing auth sign-in tests/build/static-private-data scan.
