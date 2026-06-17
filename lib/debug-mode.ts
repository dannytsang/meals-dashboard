/**
 * lib/debug-mode.ts
 *
 * Server-side feature switch for the dashboard's debug surface. The
 * single source of truth for "is debug mode on for this request?" across
 * the dashboard.
 *
 * Spec 022 / FR-001, FR-011. The switch has two levels:
 *
 *   1. **Deployment gate** (env var `MEALS_DEBUG_MODE`, default off).
 *      This is the kill switch for the entire feature per environment.
 *      The toggle UI is only rendered when the env is on.
 *
 *   2. **Per-user cookie** (`meals_debug_mode`, HMAC-SHA-256 signed with
 *      `NEXTAUTH_SECRET`). This is the per-user switch, flipped by the
 *      in-header UI toggle. The cookie is opaque to the client (the
 *      signature is what makes it tamper-evident).
 *
 * The **effective** debug mode for a given request is the AND of both:
 * effective = env_on AND cookie_signed_as_1.
 *
 * All server-side code that decides whether to render debug UI MUST go
 * through one of:
 *   - `isDebugModeEnabled()` — env-only check, used by the toggle route
 *     to decide whether to accept the cookie flip.
 *   - `effectiveDebugMode(cookieRaw)` — env+cookie check, used by
 *     `/debug` and `/api/debug/*` to decide whether to serve the surface.
 *
 * No module is allowed to read `process.env.MEALS_DEBUG_MODE` directly
 * or accept a cookie value from a request without going through
 * `verifyDebugCookie` (in `lib/debug-cookie.ts`).
 *
 * Accepted truthy values: `1`, `true`, `yes` (case-insensitive).
 * Accepted falsy values: `0`, `false`, `no`, empty string, unset.
 * Any other value is treated as off and logs a warning at first read.
 *
 * The `onceWarn` guard ensures the warning fires at most once per
 * process per distinct unknown value, so a misconfigured deployment
 * doesn't flood the logs on every request.
 */
import 'server-only';
import { verifyDebugCookie } from './debug-cookie';

const DEBUG_MODE_ENV = 'MEALS_DEBUG_MODE';

const TRUTHY = new Set(['1', 'true', 'yes']);
const FALSY = new Set(['0', 'false', 'no', '']);

const onceWarn = new Set<string>();

export interface DebugModeStatus {
  enabled: boolean;
  raw: string;
  deploymentId: string | null;
}

function readRaw(): string {
  // `process.env.MEALS_DEBUG_MODE` is a string | undefined in Node;
  // coerce undefined → '' so the rest of the parser can be uniform.
  return process.env[DEBUG_MODE_ENV] ?? '';
}

export function isDebugModeEnabled(): boolean {
  const raw = readRaw();
  const lower = raw.toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;

  // Unknown value — warn once per process per distinct value.
  if (!onceWarn.has(raw)) {
    onceWarn.add(raw);
    // eslint-disable-next-line no-console
    console.warn(
      `[debug-mode] ${DEBUG_MODE_ENV}=${JSON.stringify(raw)} is not a recognised value; treating as off. Accepted truthy: 1, true, yes (case-insensitive). Accepted falsy: 0, false, no, empty/unset.`
    );
  }
  return false;
}

export function debugModeStatus(): DebugModeStatus {
  return {
    enabled: isDebugModeEnabled(),
    raw: readRaw(),
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  };
}

/**
 * The effective debug mode for a given request: env-gate AND signed-cookie.
 * Used by `/debug` and `/api/debug/*` to decide whether to serve the
 * surface. The env dominates: a signed "1" cookie cannot turn debug on
 * when the env is off.
 *
 * `cookieRaw` is the raw cookie string as read from the request headers.
 * Pass `undefined` for "no cookie present" — the function will treat
 * the cookie as unset and return `false`.
 */
export function effectiveDebugMode(cookieRaw: string | undefined | null): boolean {
  if (!isDebugModeEnabled()) return false;
  return verifyDebugCookie(cookieRaw)?.value === '1';
}
