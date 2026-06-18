import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { fetchFirecrawlDescriptionSnippet } from '@/lib/firecrawl-description-fallback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/firecrawl-description?name=<cleanName>
 *
 * Server-side proxy for the Firecrawl search endpoint. Returns the first
 * ~200-char Google snippet for `<name> site:tesco.com`, or an empty
 * payload when the fallback is disabled, the API key is missing, the
 * per-render budget is exhausted, or Firecrawl returns no useful data.
 *
 * Spec 027 / Rev 1: this Route Handler exists because the Product
 * Detail modal is client-rendered (components/dashboard-client.tsx is
 * `'use client'`). Direct `fetch()` from the client would expose
 * FIRECRAWL_API_KEY and hit Firecrawl CORS. The Route Handler keeps
 * the API key server-side and gives the client a same-origin proxy.
 *
 * Hard constraints preserved:
 *   - No writes to Vercel Blob (FR-008). This handler only calls
 *     fetchFirecrawlDescriptionSnippet, which never touches blob storage.
 *   - The lib/firecrawl-description-fallback.ts module enforces the
 *     disabled-by-default (FR-005), missing-key (FR-007), per-render
 *     budget (FR-006), and never-throws (NFR-004) contracts. This
 *     handler is a thin pass-through.
 *
 * Response shape:
 *   { description: string | null }
 *
 * Always returns HTTP 200 (even when description is null) so the
 * client does not need to handle error states separately — a null
 * description means "fall through to placeholder".
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (!name || name.trim() === '') {
    return NextResponse.json(
      { error: 'Missing required query parameter: name' },
      { status: 400 }
    );
  }

  // Cap input length to avoid sending absurdly long names to Firecrawl.
  // cleanItemName typically yields <120 chars; cap at 200 for safety.
  const cleanName = name.trim().slice(0, 200);

  const description = await fetchFirecrawlDescriptionSnippet(cleanName);

  return NextResponse.json({ description });
}
