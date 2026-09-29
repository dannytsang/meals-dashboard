/* Stage A candidate: GET reads only the versioned v3 authority namespace.
 * POST remains maintenance-fenced until Stage B explicitly enables the
 * reviewed coordinator; no request falls back to the legacy object. */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { configuredSource, readFencedSource } from '@/lib/override-source-store';
import { OverrideFailure } from '@/lib/override-snapshot';

export const runtime = 'nodejs';

// All accepted reads use only the storage-enforced v3 lock and revision.
function source() { return configuredSource(); }
function storageFailure(err: unknown): NextResponse {
  const code = err instanceof OverrideFailure ? err.code : 'storage_error';
  return NextResponse.json({ error: code }, { status: code === 'missing' ? 404 : ['source_busy', 'unfenced_source', 'inconsistent_source', 'wrong_epoch', 'authority_fenced', 'authority_unknown'].includes(code) ? 409 : 503 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { store, epoch } = source();
    const snapshot = await readFencedSource(store, epoch);
    return NextResponse.json({ ok: true, overrides: snapshot.entries }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return storageFailure(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ error: 'stage_a_maintenance' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
}
