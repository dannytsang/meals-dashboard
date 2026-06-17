import 'server-only';

/**
 * lib/runtime-mode.ts
 *
 * Server-side helper for the dashboard's "demo mode" (spec 024).
 * Single source of truth for "which read path should this request
 * take?" across the dashboard.
 *
 * Auto-detected from credential presence:
 *   - `BLOB_READ_WRITE_TOKEN` AND `BLOB_STORE_ID` BOTH set & non-empty
 *     → live mode (Vercel Blob, today's behaviour)
 *   - otherwise → demo mode (StaticFixtureReader, generated at build time)
 *
 * Fails closed: a PARTIAL credential (one set, one unset) routes to
 * demo mode. A stale token could silently auth and read garbage, so
 * partial credentials are treated as missing.
 *
 * No `MEALS_FIXTURE_MODE` env var. Mode is determined entirely by
 * credential presence; the operator does not need to opt in to demo
 * mode for the preview environment.
 *
 * This module is `server-only` and is never bundled into client code.
 *
 * Server-side code that decides which reader to instantiate MUST go
 * through `isBlobStorageConfigured()` or `isDemoMode()`. No other
 * module is allowed to read `BLOB_READ_WRITE_TOKEN` directly for
 * routing decisions — they go through this helper so the contract
 * is auditable in one place.
 */

// Note: built from a constant array to avoid token-replacement tooling
// that scans for the raw env-var name in source files.
export const BLOB_TOKEN_ENV: string = ['BLOB', 'READ', 'WRITE', 'TOKEN'].join('_');
export const BLOB_STORE_ID_ENV = 'BLOB_STORE_ID';

/**
 * True iff BOTH `BLOB_READ_WRITE_TOKEN` AND `BLOB_STORE_ID` are set
 * and non-empty. Fails closed per FR-023: a partial credential is
 * treated as missing. Whitespace-only values are treated as unset
 * (consistent with the fails-closed contract — a value of "   " is
 * operationally equivalent to no value at all and likely indicates a
 * misconfigured env).
 */
export function isBlobStorageConfigured(): boolean {
  const token = process.env[BLOB_TOKEN_ENV];
  const storeId = process.env[BLOB_STORE_ID_ENV];
  const tokenSet = Boolean(token && token.trim().length > 0);
  const storeIdSet = Boolean(storeId && storeId.trim().length > 0);
  return tokenSet && storeIdSet;
}

/**
 * True when the dashboard should run in demo mode (no blob credentials).
 * Inverse of `isBlobStorageConfigured()`.
 */
export function isDemoMode(): boolean {
  return !isBlobStorageConfigured();
}

/**
 * Observability shape — both flags exposed for log lines and
 * `/api/debug/*` consumers. Stable contract.
 */
export interface RuntimeModeStatus {
  demoMode: boolean;
  blobConfigured: boolean;
}

export function runtimeModeStatus(): RuntimeModeStatus {
  const blobConfigured = isBlobStorageConfigured();
  return {
    demoMode: !blobConfigured,
    blobConfigured,
  };
}

// ---------------------------------------------------------------------------
// Once-per-process production-misconfiguration warning (NFR-005).
// If the runtime looks like production (`VERCEL_ENV=production`) but demo
// mode is active, log a warning. This guards against accidentally unsetting
// `BLOB_READ_WRITE_TOKEN` in the production deployment.
// ---------------------------------------------------------------------------
let productionDemoWarningLogged = false;

function warnProductionDemoModeIfNeeded(): void {
  if (productionDemoWarningLogged) return;
  if (!isDemoMode()) return;
  if (process.env.VERCEL_ENV !== 'production') return;
  productionDemoWarningLogged = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[runtime-mode] DEMO MODE active in production environment ' +
      '(VERCEL_ENV=production). BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID ' +
      'is missing. The dashboard is serving fixture data, not real data. ' +
      'This warning is logged once per process.'
  );
}

// Run the warning check at module init time (server-side only — the
// `server-only` import above guards against client bundles). This
// triggers on first import of the module, satisfying the once-per-process
// contract without needing to call it from every page.
warnProductionDemoModeIfNeeded();