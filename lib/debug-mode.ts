/**
 * lib/debug-mode.ts
 *
 * Server-side helper for the dashboard's debug surface. The single
 * source of truth for "is debug mode on for this request?" across
 * the dashboard.
 *
 * Spec 022 / Rev 3. The debug surface is gated on a per-user
 * signed cookie (`meals_debug_mode`, HMAC-SHA-256 keyed on
 * `NEXTAUTH_SECRET`). The cookie is the only gate — there is
 * no env-var, no URL flag, no per-deployment kill switch. The
 * OIDC middleware gate (inherited from the rest of the dashboard)
 * is the deployment-level access control. The cookie is the
 * per-user access control.
 *
 * This module is `server-only` and is never bundled into client code.
 *
 * Server-side code that decides whether to render debug UI MUST go
 * through `effectiveDebugMode(cookieRaw)`. The cookie value is
 * read from the request via `next/headers` `cookies()` and passed
 * in. No module is allowed to call `verifyDebugCookie` from
 * `lib/debug-cookie.ts` directly for gating decisions — they go
 * through `effectiveDebugMode` so the contract is auditable in
 * one place.
 */
import 'server-only';
import { verifyDebugCookie } from './debug-cookie';

/**
 * The effective debug mode for a given request: signed cookie
 * decoded-as-on. The OIDC middleware gate runs before this helper
 * is reached, so this is the *only* gate specific to debug mode.
 *
 * `cookieRaw` is the raw cookie string as read from the request
 * headers. Pass `undefined` for "no cookie present" — the function
 * will treat the cookie as unset and return `false`.
 */
export function effectiveDebugMode(cookieRaw: string | undefined | null): boolean {
  return verifyDebugCookie(cookieRaw)?.value === '1';
}
