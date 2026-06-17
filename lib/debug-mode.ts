/**
 * lib/debug-mode.ts
 *
 * Server-side feature switch for the dashboard's debug surface. The
 * single source of truth for "is debug mode on?" across the dashboard.
 *
 * Spec 022 / FR-001, FR-012: a single env var (MEALS_DEBUG_MODE) gates
 * the entire debug surface. Only this module reads the env var directly;
 * every other module goes through `isDebugModeEnabled()` or
 * `debugModeStatus()`. This makes the env-var contract auditable in
 * one place.
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
