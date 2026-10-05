---
name: dashboard-logged-in-user-chip
description: "Display the authenticated user identity on the meals dashboard as a compact, read-only chip in the top-right header, matching the existing trips-dashboard 'Welcome, <Name>' treatment. The chip is derived at the page level from session.user (name preferred, email fallback, hard-coded placeholder last) and rendered as a non-interactive <span> with the 👤 emoji prefix and a Welcome prefix. Always on, independent of debug mode, surfaces nothing more than name/email. Reuses the trips-dashboard JSX/CSS contract verbatim where the meals-dashboard already has matching CSS custom properties, diverges only where meals-dashboard uses a different chip styling (rounded-rect vs pill)."
---

# Feature Specification: Dashboard Logged-In User Chip

Feature ID: `023-dashboard-logged-in-user-chip`

Feature Name: Dashboard Logged-In User Chip

Target Skill: `data-science/meals-check`

Created: 2026-06-17

Status: Final

Change history: CHANGELOG.md

## Background

The meals dashboard's top-right header currently shows two pieces of UI: the light/dark theme toggle (`<ThemeToggle />`) and the sign-out button (`<SignOutButton />`). Both sit in a single flex row to the right of the `🍽️ Meals Dashboard` h1, with `ThemeToggle` rendered before `SignOutButton`. There is no on-screen indication of *who* is signed in.

Danny's household runs two similar dashboards: this meals dashboard and the `trips-dashboard` (located at `/home/hermes/workspace/trips-dashboard`). The trips dashboard already implements a session-identity chip in its top-right header at `app/page.jsx:22` and `components/dashboard-session-surface.jsx:192`:

```jsx
// app/page.jsx
const userName = session.user?.name || session.user?.email || 'authorised traveller';

// components/dashboard-session-surface.jsx
<span className="session-user">👤 Welcome, {userName}</span>

// globals.css
.session-header  { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.session-actions { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; justify-content: flex-end; }
.session-user    { color: var(--text-secondary); font-size: 0.88rem; }
```

Danny asked on 2026-06-17 to "reuse the code from that repository to save time" and add the same chip to the meals dashboard. This spec formalises that reuse. The trips implementation is the reference; the meals dashboard adopts it where the two projects share the same CSS custom properties (`--text-secondary`, `--bg-secondary`, `--border-color`) and diverges only where the meals dashboard uses rounded-rect chips (the existing `<SignOutButton />` style, `border-radius: 0.5rem`) instead of the trips pill style (`border-radius: 999px`).

The chip is always-on regardless of `MEALS_DEBUG_MODE`. It surfaces only `session.user.name` and `session.user.email` from the existing NextAuth session. It triggers no network requests. It is read-only and non-interactive.

## Promotion Criteria for Final

This spec remains at `Status: Proposed, readiness: ready` until the implementation is **deployed to the production meals-dashboard Vercel environment**. Preview-only deployment is necessary but not sufficient.

The status flips to `Final` and `readiness` to `already_satisfied` only when **all** of the following are verified against the production deployment:

- The chip renders in the top-right header with the correct wording (`👤 Welcome, <name|email|fallback>`) for two distinct Authentik sessions
- Light + dark theme readability holds in production
- The production JS bundle is grep-clean for `session.accessToken`, `session.sub`, `session.idToken`, `gravatar.com` from chip-related code
- `<ThemeToggle />` and `<SignOutButton />` ordering and styling are unchanged
- Sign-out still works
- No new network requests appear in DevTools during chip render
- With `MEALS_DEBUG_MODE=1`, chip is present on `/` and absent on `/debug` in production

This rule aligns with the spec-driven-skills convention that `Final` status reflects verified runtime evidence in the live consumer deployment, not a closed task checklist. Danny confirmed on 2026-06-17: "the code should end up in production so its not finalised until its in production".

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Identity Confirmation in the Header (Priority: P1)

As Danny, I want a small, read-only chip in the top-right of the dashboard showing "Welcome, Danny Tsang" (or the equivalent for whichever household member is signed in), so I can confirm at a glance which session is active.

**Why this priority**: The chip is the entire reason for this feature. Without it, this spec has no purpose.

**Independent Test**: Sign in to the dashboard with two different Authentik accounts in sequence. Confirm the chip updates between the two sessions, that the chip shows the *current* session's identity, and that the chip is positioned in the top-right header adjacent to `<ThemeToggle />` and `<SignOutButton />` matching the trips-dashboard layout.

**Acceptance Scenarios**:
1. Given an authenticated OIDC session whose `session.user.name` is non-empty (e.g. "Danny Tsang"), When the dashboard renders, Then the chip's text content reads exactly `👤 Welcome, Danny Tsang` (emoji + space + "Welcome, " + name).
2. Given an authenticated OIDC session whose `session.user.name` is empty/null but `session.user.email` is non-empty (e.g. "danny@example.com"), When the dashboard renders, Then the chip reads `👤 Welcome, danny@example.com` (email used in place of name; the comma + space + "Welcome, " prefix is preserved).
3. Given an authenticated OIDC session whose `session.user.name` AND `session.user.email` are both empty/null, When the dashboard renders, Then the chip reads `👤 Welcome, authorised traveller` — using the same hard-coded fallback string the trips dashboard uses, defined as a module-level constant.
4. Given the chip is rendered, When the header is inspected, Then the chip sits in the top-right header row, immediately before (to the left of) `<ThemeToggle />`. It MUST NOT push other header elements off-screen, MUST NOT change the vertical alignment, and MUST wrap onto a new line on narrow viewports (matching the trips-dashboard `flex-wrap: wrap` treatment on `.session-actions`).

### User Story 2 — Visual Parity with trips-dashboard (Priority: P1)

As Danny, I want the meals-dashboard chip to look and read the same as the trips-dashboard chip so I get a consistent identity affordance across our household's two dashboards.

**Why this priority**: Visual parity is the entire reason for the reuse request. The trips dashboard is the source of truth for this chip's wording and overall treatment.

**Independent Test**: Open the meals dashboard and the trips dashboard side-by-side. Compare the chip text (must match: `👤 Welcome, <Name>`), the chip position (top-right, adjacent to theme toggle), and the chip styling (uses the same CSS custom properties — `--text-secondary`, plus the meals-dashboard's rounded-rect chip border treatment matching `<SignOutButton />`).

**Acceptance Scenarios**:
5. Given both dashboards are open, When the chips are compared, Then the chip text content matches the trips-dashboard format exactly: `👤 Welcome, <name|email|fallback>`. The 👤 emoji MUST be present, the word `Welcome` MUST be present, the comma + space separator MUST be present.
6. Given the chip is rendered, When inspected in DevTools, Then the chip uses CSS class `session-user` (matching trips-dashboard) AND the chip's text colour uses `var(--text-secondary)`. The class name is kept for cross-dashboard consistency and so future CSS changes can target both at once if desired.
7. Given the chip is rendered, When the dashboard is in light vs dark theme, Then the chip text remains readable in both. The chip MUST NOT use a fixed colour; it MUST use the same theme-aware tokens as the surrounding chips.
8. Given the trips-dashboard chip is a plain `<span>` with no border and no background, When the meals-dashboard chip is rendered, Then the meals-dashboard chip MAY add a border + background matching the existing `<SignOutButton />` (rounded-rect treatment) for visual consistency with the surrounding chips in the meals dashboard's header. This divergence from trips is permitted by the spec and documented in Key Entities below.

### User Story 3 — Always-On, Independent of Debug Mode (Priority: P1)

As Danny, I want the user chip to render on the dashboard regardless of whether `MEALS_DEBUG_MODE` is on or off, because the chip is for the household user, not for the operator debugging pipeline state.

**Why this priority**: Mixing this with spec 022 would couple a user-facing identity surface to an operator-gated debug switch. The chips must remain independent.

**Independent Test**: Deploy the dashboard twice — once with `MEALS_DEBUG_MODE` unset, once with `MEALS_DEBUG_MODE=1`. In both cases, sign in and confirm the chip renders. Then navigate to `/debug` (with debug on) and confirm the chip is **not** rendered inside the debug shell.

**Acceptance Scenarios**:
9. Given `MEALS_DEBUG_MODE` is unset (debug off), When the dashboard renders, Then the user chip is visible in the header.
10. Given `MEALS_DEBUG_MODE=1` (debug on), When the dashboard renders at `/`, Then the user chip is visible in the header AND any debug chips from spec 022 (when `?debug=inject` is also set) do not displace the user chip.
11. Given `MEALS_DEBUG_MODE=1`, When the user navigates to `/debug`, Then the debug shell does NOT render the user chip in its header.

### User Story 4 — No Extra Surface Area (Priority: P2)

As Danny, I want the chip to expose exactly what the OIDC session already contains and nothing more — no extra claims, no profile photo fetch, no Gravatar lookup, no email disclosure I haven't asked for.

**Why this priority**: Privacy. The dashboard is household-private; pulling third-party profile data or adding network calls for enrichment is a scope creep that doesn't belong here.

**Independent Test**: Sign in, inspect network traffic in DevTools, confirm the chip's render does not trigger any network request beyond the existing OIDC session refresh. Confirm the chip does not contain links to external services. Confirm the chip does not render `session.accessToken` or any sensitive claim beyond `name` and `email`.

**Acceptance Scenarios**:
12. Given any authenticated session, When the dashboard renders, Then the chip's content is sourced exclusively from `session.user.name` and/or `session.user.email` as exposed by the existing NextAuth session. The chip MUST NOT trigger any network request (no Gravatar, no profile photo fetch, no `/api/*` lookup).
13. Given the chip renders, When DevTools is inspected, Then the chip contains no anchor tags linking to external services.
14. Given the chip renders, When the page source is inspected, Then the chip's text content is exactly the chosen display value (name, email, or `authorised traveller`) prefixed with `👤 Welcome, ` and nothing else. The chip MUST NOT include the OIDC `sub`, `iss`, `aud`, `accessToken`, `idToken`, or any other session claim.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST render a `<span className="session-user">` containing exactly `👤 Welcome, <userName>` in the top-right header. The chip is a sibling of `<ThemeToggle />` and `<SignOutButton />` inside a flex container that matches the trips-dashboard `.session-actions` treatment (`display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; justify-content: flex-end;`). The chip is positioned as the first child of this flex container, immediately before `<ThemeToggle />`.

- **FR-002**: The `userName` string MUST be derived at the page level in `app/page.tsx` using the trips-dashboard derivation: `session.user?.name || session.user?.email || 'authorised traveller'`. The fallback string `authorised traveller` MUST be a hard-coded English string exposed as a module-level constant `USER_NAME_FALLBACK` (or similar) so it can be unit-tested. The fallback MUST be the exact same string the trips dashboard uses, to maintain cross-dashboard wording consistency.

- **FR-003**: The chip MUST be a server-rendered `<span>` (not a client component, not a button). The chip MUST NOT use `useEffect`, `useState`, `useSession`, or any other client-side hook. The `userName` derivation MUST happen in `app/page.tsx` (server component) and be passed as a plain `string` prop to `<DashboardClient />`.

- **FR-004**: The chip MUST be read-only — it MUST NOT be a `<button>`, MUST NOT have an `onClick` handler, MUST NOT have an `href`, and MUST NOT be focusable. Clicking the chip does nothing. The chip exists for visual identity confirmation only; sign-out remains the dedicated escape hatch.

- **FR-005**: The chip MUST render regardless of the value of `MEALS_DEBUG_MODE` (always-on). The chip MUST NOT be conditionally rendered based on any debug-mode feature switch. The chip's render code MUST live in a module that is not imported by spec 022's `/debug` route, so the debug shell's tree-shaken bundle is unaffected.

- **FR-006**: The chip's visible content MUST contain ONLY the 👤 emoji, the literal string `Welcome, `, and the chosen display value (name / email / fallback). It MUST NOT include the OIDC `sub`, `iss`, `aud`, `accessToken`, `idToken`, `email_verified`, `picture`, `locale`, `groups`, or any other session claim. The chip MUST NOT include the user's ID, internal identifier, or any non-display claim.

- **FR-007**: The chip's render MUST NOT trigger any network request beyond the existing NextAuth session refresh that already happens on dashboard load. The chip MUST NOT call `fetch()`, `useSWR`, `useEffect`, or any equivalent. The chip MUST NOT include any `<img>` tag whose `src` is a remote URL.

- **FR-008**: The chip's text colour MUST use `var(--text-secondary)` so it stays readable in both light and dark themes (matches the trips-dashboard `.session-user` rule). On the meals dashboard, the chip MAY additionally use the same border + background treatment as `<SignOutButton />` (rounded-rect, `border: 1px solid var(--border-color)`, `backgroundColor: var(--bg-tertiary)`, `borderRadius: 0.5rem`, `padding: 0.5rem 0.85rem`, `fontSize: 0.85rem`, `fontWeight: 600`) for visual consistency with the surrounding chips. This divergence from the trips pill style is permitted and documented in Key Entities.

- **FR-009**: The chip MUST be passed `userName: string` as a typed prop from `<DashboardClient />`. `app/page.tsx` MUST derive `userName` from `session.user` and pass it to `<DashboardClient />`. The prop MUST be typed (no `any`); the existing `<DashboardClient />` props interface MUST be extended with a `userName: string` field.

- **FR-010**: The `userName` derivation MUST be extracted into a pure function `resolveUserChipName(user: { name?: string | null | undefined; email?: string | null | undefined } | null | undefined, fallback: string): string` so it can be unit-tested without rendering React. The function MUST handle null / undefined input by returning `fallback`. The function MUST trim whitespace before testing for emptiness. The function MUST be exported from a new `lib/user-chip.ts` module.

- **FR-011**: The chip MUST NOT be rendered on the `/auth/signin` page. The sign-in page is owned by spec 015 and is rendered before any session check, so the chip is naturally absent there. The implementation MUST NOT add the chip to `components/auth-signin-page.tsx`.

- **FR-012**: If `userName` exceeds a reasonable length (default: 48 characters), the chip MUST truncate with `text-overflow: ellipsis` and a `title` attribute containing the full value, so long names/emails do not break the header layout. (In practice, names and emails rarely exceed this — the cap is a defensive measure matching the convention used elsewhere in the dashboard for long names.)

- **FR-013**: The chip MUST include `data-testid="user-chip"` and `data-user-chip-display="<userName>"` attributes so the existing test suite can locate it without coupling to text content. The `data-testid` attribute is in addition to (not instead of) the trips-dashboard CSS class `session-user`.

- **FR-014**: The implementation MUST reuse the trips-dashboard JSX shape and CSS where practical. Specifically:
  - JSX: `<span className="session-user" data-testid="user-chip" data-user-chip-display={userName} title={userName} aria-label={\`Signed in as ${userName}\`}>👤 Welcome, {userName}</span>` — emoji + literal `Welcome, ` + `userName`.
  - CSS: the chip uses class `session-user`. The meals-dashboard MAY add a border + background treatment matching `<SignOutButton />` if it improves header consistency.
  - The 👤 emoji MUST be present (U+1F464 BUST IN SILHOUETTE) — the same emoji the trips dashboard uses.

- **FR-015**: The implementation MUST add a Vitest test file `components/user-chip.test.tsx` covering: (a) name preferred over email, (b) email preferred over fallback, (c) fallback when both empty, (d) whitespace-only values treated as empty, (e) null/undefined user handled gracefully, (f) chip text contains the 👤 emoji + `Welcome, ` prefix, (g) chip is rendered as a non-interactive `<span>`, (h) data attributes are present, (i) chip text matches `^[👤] Welcome, .+$`. A separate `lib/user-chip.test.ts` MUST cover the pure function in isolation.

- **FR-016**: The implementation MUST add an integration test asserting the chip is present in the rendered header HTML when an authenticated session exists, and absent on `/auth/signin`. The integration test MAY reuse the existing dashboard rendering test harness.

- **FR-017**: The implementation MUST NOT change the OIDC `authOptions` (spec 015), the NextAuth session strategy (`jwt`), the auth callback URL, the dashboard's protected-route logic, or the OIDC scopes. The chip is a presentation-only change downstream of the existing session.

- **FR-018**: The implementation MUST NOT modify the Vercel Blob layout, the meals-check pipeline, the sync script, the debug-mode helper (spec 022), or any other dashboard feature in this PR. Changes to those modules require their own specs.

- **FR-019**: The implementation MUST update `skill.spec.yaml` `expected_artifacts:` to include this spec directory's six artifacts (spec.md, plan.md, tasks.md, CHANGELOG.md, scenarios.yaml, traceability.yaml) plus the new source files (`components/user-chip.tsx` or similar, `components/user-chip.test.tsx`, `lib/user-chip.ts`, `lib/user-chip.test.ts`).

- **FR-020**: The implementation MUST keep the existing `<ThemeToggle />` and `<SignOutButton />` ordering and styling unchanged. The chip is *added* to the flex row; the existing elements are not moved or restyled.

### Non-Functional Requirements

- **NFR-001**: The chip's render MUST add zero measurable latency to the dashboard's first paint. The chip is a static string derived from the existing session; no I/O, no client-side hydration work beyond the existing `<DashboardClient />` boundary.

- **NFR-002**: The chip's render code MUST add at most ~1 KB to the production JavaScript bundle (component + helper). The pure `resolveUserChipName` function MUST be tree-shakeable when imported only by the page-level derivation.

- **NFR-003**: The chip MUST be accessible: it MUST have a descriptive `aria-label` (e.g. `Signed in as Danny Tsang` or `Signed in as danny@example.com` or `Signed in as authorised traveller`) that screen readers will announce. The aria-label MUST NOT include the OIDC `sub` or any other internal identifier. The 👤 emoji MUST be marked `aria-hidden="true"` so it is not announced as "bust in silhouette" by screen readers — the aria-label carries the semantic meaning.

- **NFR-004**: The chip MUST be localised to English for this Draft. Localisation is a follow-up concern tracked under a future spec (out of scope).

- **NFR-005**: No new npm dependencies. Reuse existing project dependencies (Tailwind, lucide-react). Note: the trips-dashboard uses an inline emoji for the icon, not lucide-react; this spec follows that pattern to maximise reuse.

### Open Questions *(resolved)*

1. **Cross-dashboard wording parity** — Resolved: copy the trips-dashboard wording verbatim. Chip text is `👤 Welcome, <name|email|fallback>`, fallback string is `authorised traveller`. If the trips dashboard later changes its wording, this spec is updated in lockstep to maintain parity.
2. **Meals-dashboard chip styling** — Resolved: keep the trips-dashboard plain `<span>` text treatment as the baseline. The meals dashboard MAY add a border + background matching `<SignOutButton />` for visual consistency with the surrounding chips. This divergence is permitted by FR-008 and documented in Key Entities.
3. **Should the chip be a link to a profile page?** — Resolved: NO. There is no profile page in either dashboard; adding one is out of scope.
4. **Should the chip truncate or wrap on long names?** — Resolved: truncate with ellipsis and a `title` attribute (FR-012). The dashboard header has limited horizontal space; multi-line wrapping would push the theme toggle off-screen on narrow viewports.

### Future Considerations (deferred — listed for awareness, NOT in this Draft's surface)

- **Profile photo avatar**: if a future spec adds an avatar, it would replace the 👤 emoji and source from `session.user.image` only when the IDP provides one. The trips-dashboard uses inline emoji for the same reason — no profile-photo wiring is in either dashboard today.
- **Last-seen timestamp**: showing when the current session was created would be a separate chip / hover tooltip, owned by a future spec.
- **Multi-account switcher**: out of scope. Sign-out + sign-in-as-different-user is the established pattern.
- **Localisation**: see NFR-004 — placeholder + chip text are English-only for now.
- **Cross-dashboard chip consolidation**: if the chip's JSX/CSS grows further, both dashboards could share a `components/session-user-chip.tsx` in a shared library. Out of scope for this Draft; deferred until there are at least 3 dashboards sharing the same chip.

### Key Entities

- **UserName (string)**: The derived display value computed at the page level. Source priority: `session.user.name` (trimmed, non-empty) → `session.user.email` (trimmed, non-empty) → `USER_NAME_FALLBACK` constant (`'authorised traveller'`).
- **SessionUser**: A type representing the subset of the NextAuth session user object the chip reads. Fields: `name?: string | null | undefined`, `email?: string | null | undefined`. Explicitly excludes `image`, `sub`, and other claims.
- **UserChip**: The presentational `<span>` rendered in the dashboard header. Read-only, non-interactive, server-rendered. Text content: `👤 Welcome, <UserName>`. CSS class: `session-user`.
- **Header flex row**: The existing top-right header container in `components/dashboard-client.tsx`. Wraps `<UserChip />`, `<ThemeToggle />`, `<SignOutButton />` in `display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; justify-content: flex-end;` (matches trips-dashboard `.session-actions`). May also live in the existing flex row currently at lines 255-258 — the spec is neutral on whether the meals dashboard adopts the trips `.session-actions` wrapper exactly or extends the existing inner div.
- **Reference implementation (trips-dashboard)**: `/home/hermes/workspace/trips-dashboard/components/dashboard-session-surface.jsx` (line 192), `/home/hermes/workspace/trips-dashboard/app/page.jsx` (line 22), `/home/hermes/workspace/trips-dashboard/app/globals.css` (lines 224-251). Source of truth for chip wording, class name, and fallback string.

### Contract Impact

- `app/page.tsx`: derives `userName` using the trips-dashboard derivation; passes `userName={userName}` to `<DashboardClient />`.
- `components/dashboard-client.tsx`: renders `<UserChip />` in the existing top-right flex row; adds the `userName: string` prop to its interface.
- `components/user-chip.tsx` (new): the chip component. Renders `<span className="session-user" data-testid="user-chip" data-user-chip-display={userName} title={userName} aria-label={`Signed in as ${userName}`} aria-hidden={false}>👤 <span aria-hidden="true">Welcome, </span>{userName}</span>` (or equivalent).
- `lib/user-chip.ts` (new): exports `USER_NAME_FALLBACK` constant and `resolveUserChipName` pure function.
- `components/user-chip.test.tsx` (new): component tests.
- `lib/user-chip.test.ts` (new): pure-function tests.
- `lib/auth.ts`: UNCHANGED. The chip does not modify the OIDC configuration.
- `middleware.ts`: UNCHANGED. The chip does not affect protected-route logic.
- `skill.spec.yaml`: `expected_artifacts:` updated for the new spec directory and source files.

## Verification Plan

- **Unit (`lib/user-chip.test.ts`)**: `resolveUserChipName` returns trimmed name; trimmed email; fallback when both empty/null/undefined; fallback when name is whitespace; fallback when both are whitespace.
- **Unit (`components/user-chip.test.tsx`)**: renders the chosen display; chip text starts with `👤 ` followed by `Welcome, ` followed by the picked value; renders as a `<span>` (not a `<button>`); carries `className="session-user"`; carries `data-testid="user-chip"`; carries `data-user-chip-display`; carries `aria-label="Signed in as <userName>"`; emoji is `aria-hidden="true"`; long display value truncates with ellipsis and `title` attribute; no `<img>`, no anchor, no fetch.
- **Integration (`components/dashboard-client.test.ts` or new file)**: dashboard with a stubbed `userName` prop renders the chip in the header; chip updates when `userName` prop changes; chip is absent on `/auth/signin`.
- **End-to-end (manual)**: sign in with two Authentik accounts sequentially; confirm the chip updates; confirm the chip text matches the trips dashboard exactly for the same user; confirm light/dark theme readability; confirm no new network requests in DevTools.
- **Regression (manual)**: with `MEALS_DEBUG_MODE` unset and set, the chip is present on `/` and absent on `/debug`.
- **Static inspection (manual)**: build the dashboard; grep production JS bundle for `session.accessToken`, `session.sub`, `gravatar.com`, `session.idToken`; assert no hits in chip-related code. Compare the chip text content against the trips dashboard to confirm wording parity.
- **Lint / type / build**: `npx tsc --noEmit`, `npx vitest run`, `npx next build` all pass cleanly with no warnings about unreachable code, unused imports, or new dependencies.

## Reference Material

- **Trips-dashboard implementation** (source of truth for this chip):
  - `/home/hermes/workspace/trips-dashboard/app/page.jsx:22` — `userName` derivation.
  - `/home/hermes/workspace/trips-dashboard/components/dashboard-session-surface.jsx:192` — chip JSX.
  - `/home/hermes/workspace/trips-dashboard/app/globals.css:224-251` — `.session-header`, `.session-actions`, `.session-user` CSS.
- Spec `015-dashboard-oidc-authentication`: owns the OIDC configuration, callback URL, NextAuth session strategy, and middleware. The chip sits downstream of this contract.
- Spec `022-dashboard-debug-mode`: operator-gated debug surface; explicitly independent from this spec. The chip is always-on and user-facing; debug mode is opt-in and operator-facing.
- Spec `012-dashboard-theme-toggle`: the `<ThemeToggle />` component this chip sits next to. Chip borrows the same border / background / typography tokens when the rounded-rect variant is used.
- `lib/auth.ts` `authOptions`: the NextAuth configuration the chip reads from. NOT modified by this spec.
- `app/page.tsx`: the dashboard entry point. Will be updated to derive `userName` and pass it to `<DashboardClient />`.
- `components/dashboard-client.tsx` lines 254-260: the existing top-right header flex row this chip joins.