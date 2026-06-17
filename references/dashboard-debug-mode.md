# Dashboard Debug Mode

Server-gated diagnostic surface for the meals dashboard. When enabled, exposes a `/debug` page and `/api/debug/*` JSON routes that surface the runtime state the dashboard sees — the same state that, when wrong, causes a regression to be invisible from the browser.

**Spec**: `022-dashboard-debug-mode` (Proposed).
**Status**: Read-only diagnostic. Never writes to Vercel Blob, the meals-check pipeline, or any other system.

## Enablement

To turn debug mode **on** in a Vercel environment:

1. Vercel project → meals-dashboard → (target environment) → Settings → Environment Variables
2. Add `MEALS_DEBUG_MODE` = `1`
3. Save and redeploy (or push a commit to trigger a deploy)
4. Open `https://<env-host>/debug` in your browser
5. To inspect a specific surface inline on the main dashboard, open `https://<env-host>/?debug=inject`

To turn debug mode **off**:

1. Remove the env var (or set to `0`, `false`, `no`, or empty)
2. Redeploy

The default is **off** in every environment. The production environment **must** have `MEALS_DEBUG_MODE` unset (or set to a falsy value). The Promotion Criteria block in `spec.md` lists the production-deployment evidence required for the spec to move from Proposed to Final.

## Env-Var Contract

| Env var | Required | Accepted values | Default |
|---|---|---|---|
| `MEALS_DEBUG_MODE` | No (debug is off by default) | Truthy: `1`, `true`, `yes` (case-insensitive). Falsy: `0`, `false`, `no`, empty, unset. | unset (off) |

Any value outside the accepted set is treated as off and logs a warning at first read. The warning fires once per process per distinct unknown value (no log flood on a misconfigured deployment).

The single source of truth for "is debug mode on?" is `lib/debug-mode.ts`. Every other module that needs to check the flag imports `isDebugModeEnabled()` or `debugModeStatus()` from that module. No module is allowed to read `process.env.MEALS_DEBUG_MODE` directly.

## Routes

| Route | When `MEALS_DEBUG_MODE` off | When `MEALS_DEBUG_MODE` on |
|---|---|---|
| `GET /debug` | 404 (no body) | 200, renders the debug shell with available panels |
| `GET /api/debug/items-by-category` | 404 (no body) | 200, JSON diagnostic |
| `GET /` | unchanged | unchanged (no debug chrome) |
| `GET /?debug=inject` | unchanged (inject flag silently ignored) | inline debug chips next to "Order Items by Category" heading |

The middleware matcher (`middleware.ts`) extends OIDC authentication to `/debug` and `/api/debug/*` so debug mode does not bypass auth (NFR-005). With debug off, the routes are functionally non-existent — 404 from Next.js, no JSON body, no leak in `__NEXT_DATA__`.

## Panel-Extension Pattern (DS-01..DS-07)

The debug shell is built so new panels can be added with the same architecture. To add a new panel (e.g. for spec 022's deferred surfaces):

1. **Add a typed payload to the `DebugPanel` discriminated union** in `components/debug-shell.tsx`. New panels are first-class union members; the shell renders them based on the `kind` field.

2. **Create the API route** under `app/api/debug/<surface>/route.ts`. Pattern:
   ```ts
   import 'server-only';
   import { NextResponse } from 'next/server';
   import { isDebugModeEnabled } from '@/lib/debug-mode';
   import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';

   export const dynamic = 'force-dynamic';
   export const runtime = 'nodejs';

   const NOT_FOUND = NextResponse.json({ error: 'not_found' }, { status: 404 });

   export async function GET(): Promise<NextResponse> {
     if (!isDebugModeEnabled()) return NOT_FOUND;
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

The shell's `onLoaded` callback, refresh button, and footer are all panel-agnostic — they work for any number of panels.

## Security Boundary

What is and is not gated:

- **Gated by `MEALS_DEBUG_MODE`**:
  - The `/debug` page (HTML render)
  - All `/api/debug/*` JSON routes
  - The `?debug=inject` flag on the main dashboard
  - The main-dashboard debug chips (only render when both flag and env-var are set)
  - The dynamic-imported `DashboardDebugChips` component code (only fetched when `debugInject` is `true`)

- **Not gated by `MEALS_DEBUG_MODE`** (intentional):
  - The OIDC auth gate (debug mode does not bypass it — see NFR-005)
  - The `DashboardDataReader` interface and the Vercel Blob read path
  - The dashboard's existing items-by-category feature (it uses the same data, but is not gated by the env var; only the **debug surface** that inspects the data is gated)

What an attacker sees when `MEALS_DEBUG_MODE=0`:

- `curl /debug` → 404
- `curl /api/debug/items-by-category` → 404
- Static inspection of the served JS bundle → no `DashboardDebugChips` component code, no `MEALS_DEBUG_MODE` string, no `ItemsByCategoryDebugPanel` component
- The `?debug=inject` query param is silently ignored; the main dashboard renders as production

What an attacker sees when `MEALS_DEBUG_MODE=1`:

- `curl /debug` → 200, HTML debug shell
- `curl /api/debug/items-by-category` → 200, JSON diagnostic
- Static inspection reveals the debug code in the `/debug` page bundle and the `/api/debug/items-by-category` route bundle (not in the main page bundle, even with debug on, due to the dynamic-import boundary)

The threat model assumes that whoever enables debug mode accepts the risk of a household member with dashboard access seeing internal pipeline state. The operator who flips the env var is the operator who accepts that audit surface.

## Troubleshooting Checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| `/debug` returns 404 in dev | `MEALS_DEBUG_MODE` not set in the environment | Add the env var, redeploy |
| `/debug` returns 404 with env var set | The middleware matcher doesn't cover `/debug` | Confirm `middleware.ts` matcher includes `/debug` |
| Debug chips don't appear on `/?debug=inject` | Either the env var is off, or the URL is being normalized (some hosts strip query params) | Verify env var, verify URL is exactly `?debug=inject` |
| `Display items: …` chip never resolves | The API route is failing; check server logs | `curl -i <host>/api/debug/items-by-category` to inspect; check that `BLOB_READ_WRITE_TOKEN` and `BLOB_STORE_ID` are set in the env |
| Production bundle contains debug strings | Either the env var was set in production, or the dynamic-import boundary is broken | Verify `MEALS_DEBUG_MODE` is unset in production; check that `components/dashboard-client.tsx` uses `next/dynamic` for `DashboardDebugChips` |
| `latestOrderStatus` says `null_no_order_blob` but the dashboard shows order items | The debug API is computing status before the dashboard applies its window filter; this is a known divergence | Expected. The API's view is the server's; the dashboard's view is the post-filter view. Both are correct. |
| Panel doesn't update after `Refresh all` | The panel key isn't being remounted | Verify the `key={\`${panel.kind}-${refreshKey}\`}` wrapper in `components/debug-shell.tsx` |
| "Copy as JSON" button does nothing | The browser denied clipboard access (some browsers require user gesture or HTTPS for clipboard API) | Click the button again with a user gesture; verify HTTPS |

## See Also

- Spec: `.specify/specs/022-dashboard-debug-mode/spec.md`
- Reference implementation: `components/items-by-category-debug-panel.tsx` (the canonical first debug surface)
- Helper: `lib/debug-mode.ts` (the single source of truth for the env-var read)
