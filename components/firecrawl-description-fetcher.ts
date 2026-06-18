/**
 * components/firecrawl-description-fetcher.ts
 *
 * Client-side helper that calls the server-side Route Handler at
 * /api/firecrawl-description. Spec 027 / Rev 1.
 *
 * Why a separate file: keeps the fetch logic testable in isolation
 * from the dashboard-client component. The function is async, returns
 * null on any failure, and never throws — the caller (dashboard-client
 * useEffect) is safe to invoke it without try/catch.
 *
 * No imports of `server-only` here; this is a client-safe module.
 */

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^Generated Tesco product details are incomplete for this item\.$/,
  /^Product information not available in generated data or the local product database\.$/,
];

/**
 * Returns true when the given description text is one of the placeholder
 * strings the resolver emits when neither Apollo nor curated-static had
 * a populated description. Used to decide whether the Firecrawl fallback
 * should fire for the modal-open.
 */
export function isPlaceholderDescription(description: string): boolean {
  if (!description) return true;
  return PLACEHOLDER_PATTERNS.some(re => re.test(description.trim()));
}

export type FirecrawlDescriptionResponse = {
  description: string | null;
  error?: string;
};

/**
 * Call the Route Handler with the cleaned item name. Returns the
 * Firecrawl snippet (string) or null on any failure / disabled
 * fallback / budget exhaustion.
 *
 * Never throws.
 */
export async function fetchFirecrawlDescriptionFromRoute(
  cleanName: string
): Promise<string | null> {
  if (!cleanName || cleanName.trim() === '') return null;
  try {
    const res = await fetch(
      `/api/firecrawl-description?name=${encodeURIComponent(cleanName)}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as FirecrawlDescriptionResponse;
    if (typeof body.description !== 'string') return null;
    const trimmed = body.description.trim();
    return trimmed === '' ? null : trimmed;
  } catch {
    return null;
  }
}
