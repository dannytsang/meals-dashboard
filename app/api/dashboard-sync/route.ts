import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import {
  syncDashboardLayout,
  type SplitLayoutPayload,
  type ProductBlob,
} from '@/lib/dashboard-sync';

export const runtime = 'nodejs';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const ORDER_BLOB_PATH_RE = /^orders\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+\.json$/;
const COVERAGE_BLOB_PATH_RE = /^coverage\/\d{4}-\d{2}-\d{2}\.json$/;
const PRODUCT_BLOB_PATH_RE = /^products\/\d+\.json$/;

/**
 * POST /api/dashboard-sync
 *
 * Accepts a split-layout payload from the meals-check sync script and writes it
 * to Vercel Blob using the content-hash dedup + manifest + pointer layout
 * (spec `016-dashboard-blob-storage-layout`).
 *
 * Authenticated with `x-dashboard-secret` header (same contract as the
 * legacy `/api/dashboard-data` POST). Spec 028 / 2026-06-19 cleanup: the
 * legacy single-blob endpoint now only handles ad-hoc admin POSTs; the
 * Python sync no longer writes `dashboard-data.json` there.
 *
 * Request body shape:
 *   {
 *     "orders": [{...orderBlob..., "orderBlobPath": "orders/.../...json"}],
 *     "coverage": [{...coverageBlob..., "coverageBlobPath": "coverage/...json"}],
 *     "summary": {...},
 *     "deliveryWindows": [...],
 *     "coverageWindow": ["2026-06-15", ...],
 *     "dataGeneratedAt": "2026-06-16T07:38:33+00:00",
 *     "uiUpdatedAt": "2026-06-16T00:41:00+00:00",
 *     "products": [{...productBlob, "productBlobPath": "products/123456.json"}, ...]
 *   }
 *
 * Spec 021 / FR-003 — the optional `products` array carries individual product
 * blobs to be written before the manifest. Each entry must have a valid
 * `productBlobPath` matching `^products/\d+\.json$`.
 *
 * Response:
 *   200 { "ok": true, "manifestPath": "meta/manifest-...json", "productsManifestPath": "meta/products-manifest-...json", "written": [...], "skipped": [...], "totalOps": N }
 *   400 { "error": "Invalid payload" }
 *   401 { "error": "Unauthorized" }
 *   500 { "error": "Server not configured" | "Failed to store data" }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const parsed = parseSplitLayoutPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Invalid payload', detail: parsed.error }, { status: 400 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1' || (body as Record<string, unknown>)['dryRun'] === true;

  try {
    const client = new VercelBlobStorageClient();
    const result = await syncDashboardLayout(parsed.value, client, { dryRun });
    return NextResponse.json({
      ok: true,
      manifestPath: result.manifestPath,
      manifestHash: result.manifestHash,
      written: result.writtenPaths,
      skipped: result.skippedPaths,
      totalOps: result.totalOps,
      isInitialSync: result.isInitialSync,
      suppressedNoopWrites: result.suppressedNoopWrites,
      productsManifestPath: result.productsManifestPath ?? null,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dashboard-sync] Sync failed:', message, err);
    return NextResponse.json(
      { error: 'Failed to store data', detail: message },
      { status: 500 }
    );
  }
}

function parseSplitLayoutPayload(
  body: unknown
): { ok: true; value: SplitLayoutPayload } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body must be an object' };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.orders)) return { ok: false, error: 'orders must be an array' };
  if (!Array.isArray(b.coverage)) return { ok: false, error: 'coverage must be an array' };
  if (!b.summary || typeof b.summary !== 'object') {
    return { ok: false, error: 'summary must be an object' };
  }
  if (!Array.isArray(b.deliveryWindows)) {
    return { ok: false, error: 'deliveryWindows must be an array' };
  }
  if (!Array.isArray(b.coverageWindow)) {
    return { ok: false, error: 'coverageWindow must be an array' };
  }

  for (const o of b.orders) {
    if (!o || typeof o !== 'object') return { ok: false, error: 'each order must be an object' };
    const ob = o as Record<string, unknown>;
    if (typeof ob.orderBlobPath !== 'string') {
      return { ok: false, error: 'each order must have orderBlobPath' };
    }
    if (!ORDER_BLOB_PATH_RE.test(ob.orderBlobPath)) {
      return { ok: false, error: `invalid orderBlobPath: ${ob.orderBlobPath}` };
    }
  }
  for (const c of b.coverage) {
    if (!c || typeof c !== 'object') return { ok: false, error: 'each coverage must be an object' };
    const cb = c as Record<string, unknown>;
    if (typeof cb.coverageBlobPath !== 'string') {
      return { ok: false, error: 'each coverage must have coverageBlobPath' };
    }
    if (!COVERAGE_BLOB_PATH_RE.test(cb.coverageBlobPath)) {
      return { ok: false, error: `invalid coverageBlobPath: ${cb.coverageBlobPath}` };
    }
  }

  // Spec 021 / FR-003 — validate products array if present.
  if (b.products !== undefined) {
    if (!Array.isArray(b.products)) {
      return { ok: false, error: 'products must be an array' };
    }
    for (const p of b.products) {
      if (!p || typeof p !== 'object') return { ok: false, error: 'each product must be an object' };
      const pb = p as Record<string, unknown>;
      if (typeof pb.productBlobPath !== 'string') {
        return { ok: false, error: 'each product must have productBlobPath' };
      }
      if (!PRODUCT_BLOB_PATH_RE.test(pb.productBlobPath)) {
        return { ok: false, error: `invalid productBlobPath: ${pb.productBlobPath}` };
      }
      // Validate required ProductBlob fields (non-strict: just ensure they exist as strings/nulls).
      const productBlob = pb as unknown as ProductBlob;
      if (typeof productBlob.tpnc !== 'string' && productBlob.tpnc !== null) {
        return { ok: false, error: 'product tpnc must be string | null' };
      }
    }
  }

  return {
    ok: true,
    value: {
      orders: b.orders as SplitLayoutPayload['orders'],
      coverage: b.coverage as SplitLayoutPayload['coverage'],
      summary: b.summary as SplitLayoutPayload['summary'],
      deliveryWindows: b.deliveryWindows as SplitLayoutPayload['deliveryWindows'],
      coverageWindow: b.coverageWindow as string[],
      dataGeneratedAt: (b as Record<string, unknown>).dataGeneratedAt as string ?? '',
      uiUpdatedAt: (b as Record<string, unknown>).uiUpdatedAt as string ?? '',
      products: (b.products as SplitLayoutPayload['products']) ?? undefined,
    },
  };
}
