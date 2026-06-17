# Dashboard Debug Mode

Server-gated diagnostic surface for the meals dashboard. When enabled, exposes a `/debug` page and `/api/debug/*` JSON routes that surface the runtime state the dashboard sees — the same state that, when wrong, causes a regression to be invisible from the browser.

**Spec**: `022-dashboard-debug-mode` (Proposed, Rev 2).
**Status**: Read-only diagnostic. Never writes to Vercel Blob, the meals-check pipeline, or any other system.

## Enablement

Debug mode has a **two-level switch**:

1. **Deployment gate** — `MEALS_DEBUG_MODE` env var (default off). This is the kill switch for the entire feature per environment.
2. **Per-user switch** — in-header UI toggle (Bug icon) that flips a signed `meals_debug_mode` cookie. This is the per-user switch, so a single operator can enable debug for themselves on a deployment that has the feature on, without bleeding the state to other users of the same deployment.

To turn debug mode **on** in a Vercel environment:

1. Vercel project → meals-dashboard → (target environment) → Settings → Environment Variables
2. Add `MEALS_DEBUG_MODE` = `1`
3. Save and redeploy (or push a commit to trigger a deploy)
4. Open the dashboard — the **Debug** toggle appears in the header (next to the Theme and Sign-out buttons)
5. Click the toggle to enable the debug surface for your user
6. Open `https://<env-host>/debug` for the full debug shell, or stay on `/` and use the inline debug chips that appear next to the Order Items by Category heading

To turn debug mode **off** (deployment-level):

1. Remove the env var (or set to `0`, `false`, `no`, or empty)
2. Redeploy

To turn debug mode **off** (per-user, without redeploying):

1. Click the **Debug** toggle in the header to clear the cookie

The default is **off** in every environment. The production environment **must** have `MEALS_DEBUG_MODE` unset (or set to a falsy value). The Promotion Criteria block in `spec.md` lists the production-deployment evidence required for the spec to move from Proposed to Final.

## Env-Var Contract

| Env var | Required | Accepted values | Default |
|---|---|---|---|
| `MEALS_DEBUG_MODE` | No (debug is off by default) | Truthy: `1`, `true`, `yes` (case-insensitive). Falsy: `0`, `false`, `no`, empty, unset. | unset (off) |

Any value outside the accepted set is treated as off and logs a warning at first read. The warning fires once per process per distinct unknown value (no log flood on a misconfigured deployment).

The single source of truth for "is the env-gate on?" is `lib/debug-mode.ts`. Every other module that needs to check the flag imports `isDebugModeEnabled()` or `effectiveDebugMode()` from that module. No module is allowed to read `process.env.MEALS_DEBUG_MODE` directly.

## Cookie Contract

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

The cookie is the only debug-related persistence. There is no `localStorage`, `sessionStorage`, IndexedDB, or service-worker storage of debug state. Setting `meals_debug_mode=1` directly in devtools without the server's HMAC signature has no effect — `verifyDebugCookie` returns `null` and the effective debug mode is computed as off.

The single source of truth for "is the cookie set?" is `lib/debug-cookie.ts` (`verifyDebugCookie`, `signDebugCookie`, `isDebugCookieOn`).

## The Two-Level Switch

| Env-gate (`MEALS_DEBUG_MODE`) | Per-user cookie | Effective debug mode | What the user sees |
|---|---|---|---|
| off | unset | off | No toggle in header. `/debug` → 404. `/api/debug/*` → 404. No inline chips. |
| off | signed `1` | off (env dominates) | No toggle. `/debug` → 404. The signed cookie alone cannot turn debug on. |
| on | unset | off | Toggle visible (off state). `/debug` → 404. No inline chips. |
| on | signed `1` | on | Toggle visible (on state, amber). `/debug` → 200. Inline chips appear next to Order Items by Category. |

The env-gate **always** dominates. The cookie is a per-user switch; the env-var is a per-deployment kill switch.

## Routes

| Route | When `MEALS_DEBUG_MODE` off | When `MEALS_DEBUG_MODE` on, cookie unset | When `MEALS_DEBUG_MODE` on, cookie set |
|---|---|---|---|
| `GET /debug` | 404 (no body) | 404 (no body) | 200, renders the debug shell with available panels |
| `GET /api/debug/items-by-category` | 404 (no body) | 404 (no body) | 200, JSON diagnostic |
| `POST /api/debug/toggle` | 404 (toggle has no effect) | 200, sets signed cookie | 200, sets signed cookie |
| `GET /` | unchanged | unchanged (no debug chrome, toggle visible but off) | inline debug chips next to "Order Items by Category" heading |

The middleware matcher (`middleware.ts`) extends OIDC authentication to `/debug` and `/api/debug/*` so debug mode does not bypass auth (NFR-005). With effective debug mode off, the routes are functionally non-existent — 404 from Next.js, no JSON body, no leak in `__NEXT_DATA__`.

## Panel-Extension Pattern (DS-01..DS-07)

The debug shell is built so new panels can be added with the same architecture. To add a new panel (e.g. for spec 022's deferred surfaces):

1. **Add a typed payload to the `DebugPanel` discriminated union** in `components/debug-shell.tsx`. New panels are first-class union members; the shell renders them based on the `kind` field.

2. **Create the API route** under `app/api/debug/<surface>/route.ts`. Pattern:
   ```ts
   import 'server-only';
   import { cookies } from 'next/headers';
   import { NextResponse } from 'next/server';
   import { effectiveDebugMode } from '@/lib/debug-mode';
   import { DEBUG_COOKIE_NAME } from '@/lib/debug-cookie';
   import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';

   export const dynamic = 'force-dynamic';
   export const runtime = 'nodejs';

   const NOT_FOUND = NextResponse.json({ error: 'not_found' }, { status: 404 });

   export async function GET(): Promise<NextResponse> {
     const cookieRaw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
     if (!effectiveDebugMode(cookieRaw)) return NOT_FOUND;
     const today = ...; // same date math as the main dashboard
     const data = await getDashboardData({ coverageWindow: buildCoverageWindowDates(today, endDate) });
     // ... extract surface-specific state from `data` ...
     return NextResponse.json({ /* surface-specific payload */ });
   }
   ```

3. **Create the panel component** `components/<surface>-debug-panel.tsx`. The existing `items-by-category-debug-panel.tsx` is the reference implementation. Render each variable as a labelled chip with its type and value; include a "Copy as JSON" affordance.

4. **Add the panel to the shell**: extend the `PANELS` array in `components/debug-shell.tsx` with a `DebugPanelMeta` entry describing the new panel.

5. **Optional**: add a debug chip on the main dashboard via `components/dashboard-debug-chips.tsx` if the surface benefits from inline context.

6. **Tests**: add a Vitest test for the new API route's gating behaviour (off → 404, on → 200) and any non-trivial data shape.

The shell's refresh button and footer are all panel-agnostic — they work for any number of panels.

## Security Boundary

What is and is not gated:

- **Gated by the EFFECTIVE debug mode** (env-gate AND per-user signed cookie):
  - The `/debug` page (HTML render)
  - All `/api/debug/*` JSON routes
  - The main-dashboard debug chips (only render when both gates are open)
  - The dynamic-imported `DashboardDebugChips` component code (only fetched when effective mode is on)

- **Gated by the env-gate alone**:
  - The in-header Debug toggle button (rendered as visibly disabled with a tooltip when the env is off)
  - The `/api/debug/toggle` route (returns 404 when the env is off, regardless of cookie state)

- **Not gated by `MEALS_DEBUG_MODE`** (intentional):
  - The OIDC auth gate (debug mode does not bypass it — see NFR-005)
  - The `DashboardDataReader` interface and the Vercel Blob read path
  - The dashboard's existing items-by-category feature (it uses the same data, but is not gated by the env var; only the **debug surface** that inspects the data is gated)
  - The `meals_debug_mode` cookie itself (the user can set/clear it; the server decides what to do with it)

What an attacker sees when the env-gate is off:

- `curl /debug` → 404
- `curl /api/debug/items-by-category` → 404
- `curl -X POST /api/debug/toggle` → 404
- `curl -H "Cookie: meals_debug_mode=1.bogus" /debug` → 404 (the env dominates, the tampered cookie is ignored)
- Static inspection of the served JS bundle → no `DashboardDebugChips` component code, no `MEALS_DEBUG_MODE` string, no `ItemsByCategoryDebugPanel` component
- The header Debug toggle is visibly disabled with a tooltip "Debug mode is disabled in this deployment"

What an attacker sees when the env-gate is on but the per-user cookie is unset:

- `curl /debug` → 404
- `curl /api/debug/items-by-category` → 404
- The header Debug toggle is visible but in the off state; clicking it sets the cookie and reveals the surface
- The main dashboard renders as production; no inline chips

What an attacker sees when the env-gate is on AND the per-user cookie is set:

- `curl /debug` → 200, HTML debug shell
- `curl /api/debug/items-by-category` → 200, JSON diagnostic
- The header Debug toggle is visible and in the on state (amber); clicking it clears the cookie
- The main dashboard shows inline debug chips next to Order Items by Category
- Static inspection reveals the debug code in the `/debug` page bundle and the `/api/debug/items-by-category` route bundle (not in the main page bundle, even with debug on, due to the dynamic-import boundary)

The threat model assumes that whoever enables debug mode (at either level) accepts the risk of a household member with dashboard access seeing internal pipeline state. The operator who flips the env var is the operator who accepts that audit surface.

## Troubleshooting Checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| `/debug` returns 404 in dev | `MEALS_DEBUG_MODE` not set in the environment | Add the env var, redeploy |
| `/debug` returns 404 with env var set | The per-user cookie is unset, OR the middleware matcher doesn't cover `/debug` | Click the Debug toggle in the header; confirm `middleware.ts` matcher includes `/debug` |
| Toggle button is greyed out in the header | `MEALS_DEBUG_MODE` is unset or falsy for the deployment | Add the env var, redeploy (env-gate dominates; the toggle cannot be enabled from the UI alone) |
| Toggle button is interactive but clicking it has no effect | The toggle route is returning 404 (env-gate is off) | Same as above: set the env var |
| Toggle is on but the inline chips don't appear | The server's `router.refresh()` after the toggle click may have failed | Hard-reload the page; the cookie persists for 30 days |
| Cookie is set but `/debug` still 404s | Either the env var is off, OR the cookie was tampered with, OR `NEXTAUTH_SECRET` was rotated | Check env var; check that the cookie is a valid `value.signature` pair (re-click the toggle to overwrite) |
| `Display items: …` chip never resolves | The API route is failing; check server logs | `curl -i <host>/api/debug/items-by-category` to inspect; check that `BLOB_READ_WRITE_TOKEN` and `BLOB_STORE_ID` are set in the env |
| Production bundle contains debug strings | Either the env var was set in production, or the dynamic-import boundary is broken | Verify `MEALS_DEBUG_MODE` is unset in production; check that `components/dashboard-client.tsx` uses `next/dynamic` for `DashboardDebugChips` |
| `latestOrderStatus` says `null_no_order_blob` but the dashboard shows order items | The debug API is computing status before the dashboard applies its window filter; this is a known divergence | Expected. The API's view is the server's; the dashboard's view is the post-filter view. Both are correct. |
| Panel doesn't update after `Refresh all` | The panel key isn't being remounted | Verify the `key={`${panel.kind}-${refreshKey}`}` wrapper in `components/debug-shell.tsx` |
| "Copy as JSON" button does nothing | The browser denied clipboard access (some browsers require user gesture or HTTPS for clipboard API) | Click the button again with a user gesture; verify HTTPS |

## See Also

- Spec: `.specify/specs/022-dashboard-debug-mode/spec.md`
- Reference implementation: `components/items-by-category-debug-panel.tsx` (the canonical first debug surface)
- Helpers: `lib/debug-mode.ts` (env-gate read + effective-mode composition) and `lib/debug-cookie.ts` (signed cookie)
