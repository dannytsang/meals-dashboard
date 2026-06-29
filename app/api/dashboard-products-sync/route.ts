import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { syncDashboardProducts, type ProductSyncPayload } from '@/lib/dashboard-sync';

export const runtime = 'nodejs';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const PRODUCT_BLOB_PATH_RE = /^products\/\d+\.json$/;

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

  const parsed = parseProductPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Invalid payload', detail: parsed.error }, { status: 400 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1' || (body as Record<string, unknown>)['dryRun'] === true;

  try {
    const client = new VercelBlobStorageClient();
    const result = await syncDashboardProducts(parsed.value, client, { dryRun });
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
    console.error('[dashboard-products-sync] Sync failed:', message, err);
    return NextResponse.json(
      { error: 'Failed to store data', detail: message },
      { status: 500 }
    );
  }
}

function parseProductPayload(
  body: unknown
): { ok: true; value: ProductSyncPayload } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body must be an object' };
  }
  const b = body as Record<string, unknown>;

  if (
    b.orders !== undefined ||
    b.coverage !== undefined ||
    b.summary !== undefined ||
    b.deliveryWindows !== undefined ||
    b.coverageWindow !== undefined ||
    b.dataGeneratedAt !== undefined ||
    b.uiUpdatedAt !== undefined
  ) {
    return { ok: false, error: 'dashboard payload fields must not be included' };
  }

  if (!Array.isArray(b.products)) {
    return { ok: false, error: 'products must be an array' };
  }

  if (b.mainManifestPath !== undefined && typeof b.mainManifestPath !== 'string') {
    return { ok: false, error: 'mainManifestPath must be a string when provided' };
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
  }

  return {
    ok: true,
    value: {
      products: b.products as ProductSyncPayload['products'],
      mainManifestPath: (b.mainManifestPath as string | undefined) ?? null,
    },
  };
}
