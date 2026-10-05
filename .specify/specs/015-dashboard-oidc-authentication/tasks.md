# Tasks: Dashboard OIDC Authentication

**Input**: `.specify/specs/015-dashboard-oidc-authentication/spec.md`

## Phase 1: Authentik and Vercel Configuration Planning

- [x] T001 [US1] Confirm final production dashboard URL and Authentik issuer URL for the meals-dashboard application.
- [x] T002 [US1] Create or verify Authentik OAuth2/OIDC provider and application for meals-dashboard. *(Inferred from configured Vercel OIDC env vars and production redirect to Authentik sign-in; allowed-user login remains manual.)*
- [x] T003 [US1] Configure Authentik redirect URI `https://meals-dashboard.vercel.app/api/auth/callback/authentik` or update spec/code if implementation selects a different callback path.
- [x] T004 [US1] Decide whether app-level access is enforced only by Authentik application assignment/policy or additionally by dashboard-side group/claim checks. *(Current implementation relies on Authentik application assignment/policy; no dashboard-side group claim check.)*
- [x] T005 [US1] Add required Vercel production env vars without committing values: `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_ISSUER`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` unless implementation deliberately updates names for Auth.js v5.

## Phase 2: Auth Library Integration

- [x] T010 [US1] Add the selected Next.js auth dependency (`next-auth` or Auth.js equivalent) to the dashboard repository.
- [x] T011 [US1] Add Authentik provider configuration that reads only environment variables, with no committed secret values.
- [x] T012 [US1] Add App Router auth route(s) for sign-in, callback, session, and sign-out.
- [x] T013 [US1] Add route protection middleware or server-side session guard for the dashboard.
- [x] T014 [US1] Ensure auth/session/callback routes and required framework static assets remain reachable without an existing session.
- [x] T015 [US1] Add a sign-in/sign-out affordance or documented session flow appropriate for the dashboard UI. *(Current flow uses automatic unauthenticated redirect plus NextAuth `/api/auth/signout`; no bespoke dashboard sign-out button is implemented.)*

## Phase 3: Private Data Boundary Refactor

- [x] T020 [US2] Refactor `DashboardClient` so it no longer imports private generated data directly from `lib/real-data.ts` in client-bundled code.
- [x] T021 [US2] Implement authenticated server-side data passing or an authenticated dashboard-data API route.
- [x] T022 [US2] Ensure unauthenticated private data requests return no meal/order data.
- [x] T023 [US2] Preserve dashboard sync compatibility with generated data updates from `sync-dashboard-data.py`.
- [x] T024 [US2] Add static bundle privacy scan/check for known generated meal/grocery strings.

## Phase 4: Tests and Local Verification

- [x] T030 [US1] Add tests or documented checks for unauthenticated dashboard access redirect/challenge.
- [x] T031 [US1] Add tests or documented checks for authenticated access rendering the dashboard.
- [x] T032 [US1] Add tests or documented checks for unauthorised user/group denial if dashboard-side claim checks are implemented. *(N/A: dashboard-side group claim checks are not implemented; access is enforced by Authentik application assignment/policy per T004.)*
- [x] T033 [US1] Add tests or documented checks proving missing/invalid auth configuration fails closed.
- [x] T034 [US2] Add tests proving compact/static client chunks no longer contain private generated data after build.
- [x] T035 [US1/US2] Run `npm test -- --run`.
- [x] T036 [US1/US2] Run `npm run build`.

## Phase 5: Production Deployment Verification

- [x] T040 [US1] Verify `npx vercel env ls` lists required production env var names without exposing values.
- [x] T041 [US1] Deploy to Vercel production after env vars and Authentik provider are configured.
- [x] T042 [US1] Verify unauthenticated request to production dashboard redirects/challenges and does not return dashboard content.
- [x] T043 [US1] Verify allowed Authentik login reaches the production dashboard. *(Manual evidence: Danny confirmed on 2026-06-14 that authentication is working.)*
- [x] T044 [US1] Verify sign-out or session expiry blocks renewed access. *(Current implemented flow relies on NextAuth session expiry and `/api/auth/signout`; Danny confirmed authentication works on 2026-06-14, and unauthenticated production access redirects rather than rendering data.)*
- [x] T045 [US2] Verify public production static assets do not expose selected known private meal/grocery strings.
- [x] T046 [US1/US2] Run the owning-skill validator.

## Requirement-to-Task Mapping

- FR-001 → T010, T011, T012, T035, T036
- FR-002 → T013, T030, T042
- FR-003 → T012, T014, T030
- FR-004 → T002, T004, T032, T043
- FR-005 → T005, T011, T040
- FR-006 → T005, T011, T040, T046
- FR-007 → T003, T012, T041
- FR-008 → T020, T024, T034, T045
- FR-009 → T021, T022, T031
- FR-010 → T022, T030, T042
- FR-011 → T024, T034, T045
- FR-012 → T031, T035, T036, T043
- FR-013 → T023, T036, T041
- FR-014 → T033, T042
- SC-001 → T030, T042
- SC-002 → T031, T043
- SC-003 → T032, T044
- SC-004 → T040
- SC-005 → T034, T045
- SC-006 → T022, T042
- SC-007 → T035, T036
- SC-008 → T041, T042, T043, T045


## Phase 6: Login Page Theme Parity

- [x] T050 [US3] Replace/default-customise the dashboard sign-in/login page so it uses the same dark theme visual language as the existing meals dashboard.
- [x] T051 [US3] Add light-theme login page styling matching the existing meals dashboard light theme.
- [x] T052 [US3] Reuse or align with the dashboard theme preference/tokens where practical without requiring an authenticated session or private meal/order data.
- [x] T053 [US3] Add tests or documented checks for dark-mode and light-mode login page rendering, readable contrast, and absence of default/bare auth styling.
- [x] T054 [US3] Verify the themed login page does not expose OIDC secrets/session values and does not import private dashboard meal/order data.
- [x] T055 [US3] Run dashboard tests/build, unauthenticated redirect smoke, static private-data scan, and owning-skill validator before promoting back to Final.

## Additional Mapping

- FR-015 → T050, T051, T052, T053, T055
- FR-016 → T050, T051, T052, T053, T055
- FR-017 → T054, T055
- FR-018 → T054, T055
- SC-009 → T050, T053, T055
- SC-010 → T051, T053, T055
- SC-011 → T054, T055

## Phase 7: Sign Out from Dashboard (User Story 4)

- [x] T060 [US4] Add a sign-out button component to the authenticated dashboard header, session-gated so it does not render on the unauthenticated sign-in page.
- [x] T061 [US4] Wire the sign-out button to `signOut()` from `next-auth/react` and route the post-signout redirect to `/auth/signin?callbackUrl=/`.
- [x] T062 [US4] Style the sign-out button to match the dashboard theme tokens (matching card/button styling) and ensure it is accessible (labelled, keyboard-focusable, focus ring).
- [x] T063 [US4] Add focused tests proving: (a) the sign-out button is rendered in the dashboard header, (b) it is NOT rendered by the unauthenticated sign-in component, (c) it does not import generated private meal/order data, and (d) it does not render OIDC secrets, tokens, session values, `AUTHENTIK_CLIENT_SECRET`, or `NEXTAUTH_SECRET`.
- [x] T064 [US4] Run `npm test -- --run`, `npx tsc --noEmit`, `npm run build`, and `npm run scan:static-private-data`; all must pass.
- [x] T065 [US4] Deploy to Vercel production and verify manually (or via curl + a credentialed session) that clicking the sign-out button clears the session and a subsequent request to `/` redirects to `/auth/signin?callbackUrl=/` without rendering meal/order data; verify theme preference (light/dark) is preserved through sign-out via the shared `meals-dashboard-theme` `localStorage key`.

## Additional Mapping (User Story 4)

- FR-019 → T060, T061, T063, T064, T065
- FR-020 → T062, T063, T064
- FR-021 → T063, T064, T065
- FR-022 → T060, T063, T064
- SC-012 → T061, T063, T064, T065
- SC-013 → T060, T063, T064, T065
- SC-014 → T063, T064, T065


## Phase 8: Login Button Copy

- [x] T070 [US3] Rename the unauthenticated sign-in page primary button visible text from the current provider-specific copy to exactly `Login to continue`.
- [x] T071 [US3] Add or update focused dashboard tests asserting the exact `Login to continue` button copy in light/dark themed sign-in rendering while preserving the Authentik sign-in click handler/callback.
- [x] T072 [US3] Run dashboard tests/build/static-private-data scan and the owning-skill validator after implementation.

## Additional Mapping (Login Button Copy)

- FR-023 → T070, T071, T072
- SC-015 → T070, T071, T072
