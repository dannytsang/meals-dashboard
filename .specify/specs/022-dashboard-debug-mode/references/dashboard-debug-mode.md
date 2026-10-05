# Dashboard Debug Mode — Operator & Extension Guide

**Spec**: `022-dashboard-debug-mode` (Rev 4, Final 2026-06-22 — docs reconciliation; runtime contract unchanged from Rev 3)
**Audience**: Danny, future agents, anyone extending the debug surface
**TL;DR**: The signed cookie `meals_debug_mode` is the only gate. Click the toggle in the header to flip it. There is no env-var kill switch. The toggle is always rendered for authenticated users, so first-time enablement is a single click — no env-var, no curl, no pre-existing cookie required.

> **Rev 4 (2026-06-22)**: this file was already cookie-only in Rev 3. Rev 4 is the audit. The Rev 3 audit was correct on this file; the *stale* env-var references were in the meals-dashboard code repo's `references/dashboard-debug-mode.md` (still being reconciled by the coder profile per plan.md Phase 12 T120) and in `components/debug-shell.tsx` / `PREVIEW_ENVIRONMENT.md` / `SKILL.md` (also Phase 12). This file is the spec-source-of-truth; the contract is FR-020 (operator-facing reference docs reflect the cookie-only design — no env-var mentions).

## Enablement

There is nothing to enable. The debug surface is wired and live in every deployment.

The only gate is the per-user signed cookie `meals_debug_mode`. The in-header Debug toggle (in the user menu next to Theme and Sign-out) is rendered for every authenticated user regardless of cookie state, so first-time enablement is a single click. Click the toggle, the cookie is set to `1`, the inline debug chips appear on the main dashboard, and `/debug` returns 200 with the items-by-category panel. Click the toggle again, the cookie is cleared, the chips disappear, and `/debug` returns 404.

There is no `MEALS_DEBUG_MODE` env-var. There is no deployment-level kill switch. If a global disable is ever needed, the answer is "delete the toggle component" or "revert the merge", not "set an env-var and re-deploy". The cookie is HMAC-signed against `NEXTAUTH_SECRET`, so a user cannot bypass the gate by setting the cookie in devtools without the server's signature.

## Enablement steps (cookie-only, by user)

1. Sign in to the meals dashboard.
2. Open the user menu (top right, next to the user chip).
3. Click the **Debug** row. The row is always visible; its visual state reflects the current cookie value (off / on, with an amber highlight when on).
4. After clicking, the page state updates: the inline debug chip appears next to `Order Items by Category` and `/debug` returns 200.
5. To disable: open the user menu and click the **Debug** row again. The cookie is cleared, the inline chip disappears, and `/debug` returns 404.

No redeploy, no env-var, no URL flag, no `curl` required.

## What is gated

- **Gated by the per-user signed cookie** (the only gate):
  - The `/debug` page (HTML render) — 404 with cookie unset, 200 with cookie set.
  - All `/api/debug/*` JSON routes — 404 with cookie unset, 200 with cookie set.
  - The main-dashboard inline debug chips — only render when the cookie is set.
  - The dynamic-imported `DashboardDebugChips` component code — only fetched when the cookie is set (tree-shake boundary).
  - The in-header Debug toggle button — always rendered for authenticated users; the *visual state* (off/on) reflects the cookie, the *visibility* does not (per FR-021).

- **Not gated by anything debug-mode-related** (intentional):
  - The OIDC auth gate (debug mode does not bypass it — see NFR-005 in spec.md).
  - The `DashboardDataReader` interface and the Vercel Blob read path.
  - The dashboard's existing items-by-category feature (it uses the same data, but is not gated by the debug cookie; only the *debug surface* that inspects the data is gated).
  - The `meals_debug_mode` cookie itself (the user can set/clear it; the server decides what to do with it).

## What an attacker sees

- `curl /debug` → 404 (or 307 to OIDC signin if unauthenticated).
- `curl /api/debug/items-by-category` → 404 (or 307 to OIDC signin if unauthenticated).
- `curl -X POST /api/debug/toggle` → 200 (it sets or clears the user's own cookie; this is the user's own state, not server state).
- `curl -H "Cookie: meals_debug_mode=1.bogus" /debug` → 404 (the tampered signature fails verification; the cookie is treated as unset).
- Static inspection of the served JS bundle → no `DashboardDebugChips` component code, no `ItemsByCategoryDebugPanel` code, no `meals_debug_mode` / `MEALS_DEBUG_MODE` / `isDebugModeEnabled` / `envEnabled` strings.
- The header Debug row is always visible; clicking it with a valid signature is what enables debug.

## Cookie contract

| Field | Value |
|---|---|
| Name | `meals_debug_mode` |
| Format | `<value>.<base64url-hmac-sha256>` (HMAC keyed on `NEXTAUTH_SECRET`) |
| Value | `0` or `1` |
| Path | `/` |
| HttpOnly | yes |
| SameSite | `Lax` |
| Secure | yes in production, no in dev (so localhost over HTTP works) |
| Max-Age | 30 days |

The single source of truth for "is the cookie set?" is `lib/debug-cookie.ts` (`verifyDebugCookie`, `signDebugCookie`). The single source of truth for "is debug mode on for this request?" is `lib/debug-mode.ts` (`effectiveDebugMode(cookieRaw): boolean` — cookie-only, no env-var check).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/debug` returns 404 | The `meals_debug_mode` cookie is unset, OR the cookie is tampered, OR the OIDC session is not present (307 to signin if unauthenticated) | Open the user menu and click the Debug row; confirm you are signed in |
| Toggle button click does nothing visually | The toggle component is rendering but the POST to `/api/debug/toggle` failed | Check the network tab; confirm the toggle route is reachable (it should be — it is always 200 for authenticated requests) |
| Toggle button click works, the inline chip appears, but `/debug` still 404s | The cookie was set by a path that did not sign it (e.g. devtools), or `NEXTAUTH_SECRET` was rotated | Re-click the toggle to overwrite the cookie with a valid signature; check the secret rotation log |
| `/debug` is 200 with no items-by-category panel showing | The dashboard data is empty (no orders blob, no pointer) — this is a data state, not a debug-mode state | The items-by-category panel still renders with `latestOrder: null` and a reason in `latestOrderStatus`. Confirm the dashboard itself shows the same data |
| Operator-facing copy somewhere says "set `MEALS_DEBUG_MODE=1`" | A stale references doc — the spec contract is FR-020, so any such doc is a spec bug | File it as a spec bug against spec 022 and reconcile the wording |

## See Also

- Spec: `.specify/specs/022-dashboard-debug-mode/spec.md`
- Reference implementation: `components/items-by-category-debug-panel.tsx` (the canonical first debug surface)
- Helpers: `lib/debug-mode.ts` (cookie-only effective mode composition) and `lib/debug-cookie.ts` (signed cookie)
- Coder-profile pick-up list for the meals-dashboard code repo: spec `022-dashboard-debug-mode/plan.md` Phase 12 (T120..T126)
- `lib/debug-cookie.ts` — the cookie sign/verify helpers
- `lib/debug-mode.ts` — the `effectiveDebugMode` wrapper (cookie-only, no env-var)
- `app/api/debug/toggle/route.ts` — the toggle endpoint
- `app/api/debug/items-by-category/route.ts` — the first debug surface
