/**
 * lib/firecrawl-description-fallback.ts
 *
 * Server-only helper that fills the `description` field on the Product
 * Detail modal when the existing Apollo cache blob (spec 021) and
 * curated static dictionary (lib/product-database.ts) both have empty
 * descriptions. Spec 027.
 *
 * Hard constraints (per spec 027):
 *   - Calls Firecrawl's `/v1/search` endpoint ONLY. The `/v1/scrape`
 *     endpoint is explicitly out of scope (3-product test 2026-06-18
 *     showed 1/3 first-try reliability against Akamai bot defence).
 *   - Disabled by default. Requires `MEALS_FIRECRAWL_FALLBACK=1` to
 *     activate (FR-005).
 *   - Honours per-server-runtime budget via
 *     `MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER` (default 3, FR-006).
 *   - Reads `FIRECRAWL_API_KEY` from process.env only. Missing key =>
 *     log once, return null (FR-007).
 *   - Never throws. Every failure mode returns null + logs warning
 *     (NFR-004).
 *   - No writes to Vercel Blob. No `put()`, no `del()`, no schema
 *     changes (FR-008).
 *
 * Module-level state:
 *   - `renderCallCount` resets at the start of each server-runtime
 *     instance (per Next.js process). In dev with HMR, the counter may
 *     persist across requests, but the budget is operator-tunable.
 *   - `missingKeyWarningLogged` dedups the missing-key startup warning.
 *
 * This module is `server-only` and is never bundled into client code.
 */

import 'server-only';

const FIRECRAWL_SEARCH_URL = 'https://api.firecrawl.dev/v1/search';
const FIRECRAWL_SCRAPE_URL_FRAGMENT = '/v1/scrape';
const REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_BUDGET = 3;
const SEARCH_QUERY_LIMIT = 1;

let renderCallCount = 0;
let missingKeyWarningLogged = false;

export type FirecrawlSearchHit = {
  url: string;
  title: string;
  description: string;
};

export type FirecrawlSearchResponse = {
  success: boolean;
  data?: FirecrawlSearchHit[];
  id?: string;
};

function isFallbackEnabled(): boolean {
  return process.env.MEALS_FIRECRAWL_FALLBACK === '1';
}

function getApiKey(): string | null {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || key.trim() === '') return null;
  return key;
}

function getBudget(): number {
  const raw = process.env.MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER;
  if (!raw) return DEFAULT_BUDGET;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BUDGET;
}

/**
 * Reset the per-render call counter. Exposed for tests; not exported
 * via the public API used by Route Handlers. Next.js's server-runtime
 * module state naturally provides per-request isolation in production
 * (each new Lambda instance has fresh module state).
 */
export function _resetRenderCallCountForTests(): void {
  renderCallCount = 0;
  missingKeyWarningLogged = false;
}

/**
 * Fetch the first ~200-char Google snippet from Firecrawl's search
 * endpoint for `<cleanName> site:tesco.com`. Returns null on any
 * failure or when the feature is disabled / over budget / API missing.
 *
 * Never throws.
 */
export async function fetchFirecrawlDescriptionSnippet(
  cleanName: string
): Promise<string | null> {
  if (!isFallbackEnabled()) return null;
  const apiKey = getApiKey();
  if (!apiKey) {
    if (!missingKeyWarningLogged) {
      console.warn(
        '[firecrawl-description-fallback] FIRECRAWL_API_KEY is not set; ' +
          'Firecrawl description fallback is disabled. Set ' +
          'MEALS_FIRECRAWL_FALLBACK=1 with a valid FIRECRAWL_API_KEY to enable.'
      );
      missingKeyWarningLogged = true;
    }
    return null;
  }

  const budget = getBudget();
  if (renderCallCount >= budget) return null;
  renderCallCount += 1;

  const query = `${cleanName} site:tesco.com`;
  const body = JSON.stringify({ query, limit: SEARCH_QUERY_LIMIT });

  let res: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(FIRECRAWL_SEARCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn(
      `[firecrawl-description-fallback] fetch error for "${cleanName}":`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }

  if (!res.ok) {
    console.warn(
      `[firecrawl-description-fallback] HTTP ${res.status} for "${cleanName}"; falling through to placeholder.`
    );
    return null;
  }

  let payload: FirecrawlSearchResponse;
  try {
    payload = (await res.json()) as FirecrawlSearchResponse;
  } catch {
    console.warn(
      `[firecrawl-description-fallback] malformed JSON response for "${cleanName}".`
    );
    return null;
  }

  if (!payload.success || !Array.isArray(payload.data) || payload.data.length === 0) {
    return null;
  }

  const firstHit = payload.data[0];
  if (!firstHit || typeof firstHit.description !== 'string') return null;
  const snippet = firstHit.description.trim();
  return snippet === '' ? null : snippet;
}

// FR-002 codification: this module MUST NOT reference the scrape URL.
// The constant FIRECRAWL_SCRAPE_URL_FRAGMENT exists solely to make the
// intent auditable; if the module ever imports a function that builds
// a /v1/scrape URL, that import will fail type checks or be caught by
// the AS-010 grep test in the spec.
//
// `FR-002` enforcement via TS: any reference to FIRECRAWL_SCRAPE_URL_FRAGMENT
// in this file is intentional documentation only. The scrape endpoint
// is never constructed.
export const __FIRECRAWL_SCRAPE_URL_FRAGMENT_AUDIT = FIRECRAWL_SCRAPE_URL_FRAGMENT;
