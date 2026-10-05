# Implementation Plan: Dashboard Logged-In User Chip

Status: Proposed
Feature: 023-dashboard-logged-in-user-chip
Skill: data-science/meals-check

## Summary

Add a small, read-only chip to the meals dashboard's top-right header showing `👤 Welcome, <name|email|fallback>` for the currently-authenticated user. The chip is derived at the page level (matching the trips-dashboard pattern at `/home/hermes/workspace/trips-dashboard/app/page.jsx:22`), rendered as a non-interactive `<span>` with the `session-user` CSS class (matching the trips-dashboard pattern at `/home/hermes/workspace/trips-dashboard/components/dashboard-session-surface.jsx:192`), and is always-on regardless of `MEALS_DEBUG_MODE`.

This plan is **skeleton only** — it is expanded below for the Proposed phase. The four open questions in `spec.md` are already resolved as of 2026-06-17. Implementation work is now eligible to begin on the `preview` branch of the meals-dashboard repo.

## Technical Context

- **Reference implementation**: `/home/hermes/workspace/trips-dashboard/` — this is the source of truth for chip wording, derivation, JSX shape, CSS class, and fallback string. The meals dashboard adopts it verbatim where practical.
- `lib/auth.ts` — `authOptions` (Authentik provider, JWT strategy). Location: `/home/hermes/workspace/meals-dashboard/lib/auth.ts`. NOT modified by this spec; chip reads from the existing session via `getServerSession(authOptions)`.
- `app/page.tsx` — dashboard entry point. Location: `/home/hermes/workspace/meals-dashboard/app/page.tsx`. Will be extended to derive `userName` and pass it to `<DashboardClient />` as a string prop.
- `components/dashboard-client.tsx` — main dashboard client component. Location: `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx`. The top-right header flex row lives at lines 254-260. Will be extended to render `<UserChip />` as the first child of this row.
- `components/theme-toggle.tsx`, `components/sign-out-button.tsx` — existing header chips. The chip may borrow the rounded-rect styling from `<SignOutButton />` (border + background + border-radius: 0.5rem) for visual consistency, OR adopt the trips-dashboard plain-text treatment. The spec permits both (FR-008, Key Entities §Meals-dashboard chip styling).
- `lib/meals-data.ts` — existing types. May receive the `SessionUser` type, OR the type lives in the new `lib/user-chip.ts` helper module.
- `vitest.config.ts` — Vitest config. New tests: `components/user-chip.test.tsx`, `lib/user-chip.test.ts`, and an integration test in `components/dashboard-client.test.ts` (or a sibling file).

## Constitution Check

- The chip is a presentation-only change downstream of the existing OIDC session (spec 015). No new OIDC claims, no scope changes, no callback URL changes, no middleware changes.
- The chip does not modify the meals-check pipeline, Vercel Blob layout, sync script, or any debug-mode helper.
- The chip is always-on for the household user. It is NOT coupled to the debug-mode feature switch (spec 022), preserving "one user story per feature" and avoiding the operator / user surface mixing.
- The chip reuses the trips-dashboard implementation as the source of truth. Cross-dashboard wording parity (`👤 Welcome, <name>`, fallback `authorised traveller`) is the explicit design goal (US2).
- No new dependencies; reuse Tailwind, existing CSS custom properties. The trips-dashboard uses an inline emoji for the icon, not lucide-react; this spec follows that pattern to maximise reuse.

## Implementation Phases *(to be detailed at Proposed time)*

### Phase 1 — Pure helper + type

- New file `lib/user-chip.ts`:
  - `export const USER_NAME_FALLBACK = 'authorised traveller'` — module-level constant matching trips-dashboard verbatim.
  - `export type SessionUser = { name?: string | null | undefined; email?: string | null | undefined }` — narrow type representing the subset of NextAuth session user the chip reads.
  - `export function resolveUserChipName(user: SessionUser | null | undefined, fallback: string = USER_NAME_FALLBACK): string` — pure function. Returns trimmed `user.name` if non-empty; else trimmed `user.email` if non-empty; else `fallback`. Treats whitespace-only strings as empty.
- New file `lib/user-chip.test.ts`:
  - Vitest cases: name preferred, email fallback when name empty, fallback when both empty, fallback when both null, fallback when both undefined, fallback when both whitespace-only, null user handled, undefined user handled, custom fallback argument respected.

### Phase 2 — Component

- New file `components/user-chip.tsx`:
  - No `'use client'` directive — chip is a pure presentational server-rendered `<span>` with no hooks / state / effects.
  - Props: `{ userName: string; className?: string }`.
  - Renders `<span className="session-user" data-testid="user-chip" data-user-chip-display={userName} title={userName} aria-label={\`Signed in as ${userName}\`} style={{ /* optional rounded-rect treatment */ }}>👤 <span aria-hidden="true">Welcome, </span>{userName}</span>`.
  - Inline emoji `👤` (U+1F464) — same as trips-dashboard.
  - Truncation: `text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 24ch` (or similar — exact value at Proposed time).
  - Optional rounded-rect treatment (border, background, border-radius: 0.5rem, padding, font-size, font-weight) matching `<SignOutButton />`. Decision deferred to implementation; spec permits both plain-text and rounded-rect variants.

### Phase 3 — Wire into dashboard header

- Update `components/dashboard-client.tsx`:
  - Add `userName: string` to the `<DashboardClient />` props interface.
  - Import `<UserChip />` and render it as the first child of the existing top-right flex row (line 255-258), before `<ThemeToggle />`. Final order: `<UserChip /> <ThemeToggle /> <SignOutButton />`.
- Update `app/page.tsx`:
  - Call `resolveUserChipName(session.user)` to derive `userName`.
  - Pass `userName={userName}` to `<DashboardClient />`.

### Phase 4 — Tests

- `components/user-chip.test.tsx`:
  - Renders the picked display value with the `👤 Welcome, ` prefix.
  - Chip text matches regex `/^👤 Welcome, .+$/` or similar.
  - Renders as `<span>` (NOT as `<button>`).
  - Carries `className="session-user"` (matches trips-dashboard).
  - Carries `data-testid="user-chip"`.
  - Carries `data-user-chip-display` matching the picked value.
  - `aria-label="Signed in as <userName>"`.
  - Emoji `<span>` is `aria-hidden="true"`.
  - No `<img>`, no `<a>`, no `fetch`, no `useEffect`.
  - Long display value truncates with ellipsis and `title` attribute.
  - Null / undefined userName handled (should not happen at the page level, but defensive).
- `components/dashboard-client.test.ts` (extend existing):
  - With a stubbed `userName` prop, the chip is rendered in the header.
  - Changing the `userName` prop between renders updates the chip text.
  - Final order: `<UserChip /> <ThemeToggle /> <SignOutButton />`.
- New integration test (in existing test file or sibling):
  - `/` with an authenticated session contains the chip in the rendered HTML.
  - `/auth/signin` does NOT contain the chip.

### Phase 5 — Static inspection + governance

- Manual grep: production JS bundle contains `session-user`, `user-chip`, `USER_NAME_FALLBACK`, `authorised traveller`. Bundle does NOT contain `session.accessToken`, `session.sub`, `gravatar.com`, `session.idToken` from chip-related code.
- Manual cross-dashboard comparison: render the trips-dashboard chip and the meals-dashboard chip side-by-side; confirm wording parity (`👤 Welcome, <name>`) and the fallback string matches.
- Manual smoke: deploy to preview environment; sign in with two Authentik accounts; confirm chip updates; confirm light/dark theme readability; confirm no new network requests in DevTools.
- Update `skill.spec.yaml` `expected_artifacts:` per FR-019.

## Risks

- **CSS class collision**: if the meals dashboard already has a `.session-user` class elsewhere, the new chip may inherit unintended styles. Mitigation: grep `globals.css` / `tailwind.config.ts` for existing `session-user` rules before adding the chip; if a collision is found, scope the chip's CSS to the dashboard surface (e.g. via a parent class) or rename to `user-chip` while keeping the trips-dashboard class as an additional class.
- **CSS custom property divergence**: the trips-dashboard uses `--text-secondary` and `--bg-secondary`. The meals dashboard uses `--text-secondary`, `--bg-secondary`, `--bg-tertiary`, `--border-color`, `--accent-rose`, `--accent-emerald`. The chip must use tokens available in both projects; FR-008 restricts the chip to `--text-secondary` for the text colour. If a meals-dashboard-only styling is added (rounded-rect variant), tokens specific to the meals dashboard are used.
- **Header overflow on narrow viewports**: a long name + a long email could push `<ThemeToggle />` or `<SignOutButton />` off-screen on mobile. Mitigation: `max-width` with ellipsis truncation (FR-012) + the trips-dashboard `flex-wrap: wrap` behaviour on the parent flex container.
- **Cross-dashboard drift**: future trips-dashboard changes might rename the chip class or change the fallback string. Mitigation: the spec lists the trips-dashboard paths in Reference Material; capture any drift as a spec revision.
- **Accidentally coupling to debug mode**: someone in a future session might add the chip to spec 022's debug shell "for consistency". Mitigation: FR-005 + the explicit "no import from debug-mode source" contract; capture in the spec's Key Entities.

## Verification

- `cd /home/hermes/workspace/meals-dashboard && npx vitest run components/user-chip.test.tsx lib/user-chip.test.ts -v` — must pass.
- `cd /home/hermes/workspace/meals-dashboard && npx vitest run` — full suite must pass (existing + new).
- `cd /home/hermes/workspace/meals-dashboard && npx tsc --noEmit` — must pass with no errors.
- `cd /home/hermes/workspace/meals-dashboard && npx next build` — must succeed.
- Manual: deploy to preview; sign in with two Authentik accounts; chip updates; theme toggle still works; sign-out still works; light/dark theme readability holds; cursor is default on hover; no new network requests.
- Manual: deploy with `MEALS_DEBUG_MODE=1`; chip is present on `/` and absent on `/debug`.
- Manual: open trips-dashboard and meals-dashboard side-by-side; confirm chip wording parity (`👤 Welcome, <name>`) and fallback string match.

## Documentation Artifacts

- `spec.md` — feature contract.
- `plan.md` — this implementation plan.
- `tasks.md` — delivery checklist.
- `CHANGELOG.md` — material change history.
- `scenarios.yaml` — machine-readable scenario coverage.
- `traceability.yaml` — machine-readable requirement traceability.