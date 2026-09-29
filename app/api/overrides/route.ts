/* Offline candidate: both /api/overrides methods now require a store-wide
 * create-if-absent lock and a checked durable revision. The raw array remains
 * at overrides/manual.json for existing read/record semantics; an independent
 * revision object binds its exact bytes. Failed intermediate commits block
 * reads/writes until privately reconciled. Installed production is unchanged. */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { configuredSource, editFencedSource, readFencedSource } from '@/lib/override-source-store';
import { boundedBody, OverrideFailure, type OverrideEntry } from '@/lib/override-snapshot';

export const runtime = 'nodejs';

const OVERRIDES_BLOB_PATH = 'overrides/manual.json';

type ManualOverrideEntry = OverrideEntry;

interface UpsertRequestBody {
  meal_date: string;
  meal_name: string;
  item_name: string;
  quantity?: number;
  reason?: string;
  status?: 'covered' | 'partial';
}

function isUpsertRequestBody(value: unknown): value is UpsertRequestBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.meal_date === 'string' && !!v.meal_date.trim() &&
    typeof v.meal_name === 'string' && !!v.meal_name.trim() &&
    typeof v.item_name === 'string' && !!v.item_name.trim() &&
    (v.quantity === undefined || (Number.isSafeInteger(v.quantity) && (v.quantity as number) >= 1)) &&
    (v.reason === undefined || (typeof v.reason === 'string' && !!v.reason.trim())) &&
    (v.status === undefined || v.status === 'covered' || v.status === 'partial') &&
    Object.keys(v).every((key) => ['meal_date', 'meal_name', 'item_name', 'quantity', 'reason', 'status'].includes(key))
  );
}

// All reads and writes now share the storage-enforced source lock and revision.
// A legacy raw array without metadata is present but unfenced: never map it to [].
function source() { return configuredSource(); }
function storageFailure(err: unknown): NextResponse {
  const code = err instanceof OverrideFailure ? err.code : 'storage_error';
  return NextResponse.json({ error: code }, { status: code === 'missing' ? 404 : ['source_busy', 'unfenced_source', 'inconsistent_source', 'wrong_epoch', 'authority_fenced', 'authority_unknown'].includes(code) ? 409 : 503 });
}

function applyUpsert(entries: ManualOverrideEntry[], body: UpsertRequestBody): ManualOverrideEntry[] {
  const triple: [string, string, string] = [body.meal_date, body.meal_name, body.item_name];
  const now = new Date().toISOString();
  const quantity = body.quantity ?? 1;
  const reason = body.reason ?? 'manual override';
  const status: 'covered' | 'partial' = body.status ?? 'covered';

  const idx = entries.findIndex(
    (e) => e.meal_date === triple[0] && e.meal_name === triple[1] && e.item_name === triple[2]
  );

  if (idx >= 0) {
    const existing = entries[idx];
    entries[idx] = {
      ...existing,
      quantity,
      reason,
      status,
      updated_at: now,
    };
  } else {
    entries.push({
      meal_date: triple[0],
      meal_name: triple[1],
      item_name: triple[2],
      quantity,
      reason,
      status,
      created_at: now,
      updated_at: now,
    });
  }
  return entries;
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

  let body: unknown;
  try {
    body = await boundedBody(request);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON or bounded payload' }, { status: 400 });
  }
  if (!isUpsertRequestBody(body)) {
    return NextResponse.json(
      { error: 'Invalid payload: meal_date, meal_name, item_name are required' },
      { status: 400 }
    );
  }
  if (body.status && body.status !== 'covered' && body.status !== 'partial') {
    return NextResponse.json(
      { error: 'Invalid status: must be "covered" or "partial"' },
      { status: 400 }
    );
  }

  try {
    const { store, epoch } = source();
    const snapshot = await editFencedSource(store, epoch, (entries) => applyUpsert(entries, body));
    // The source transaction is durable, but this serverless route cannot prove
    // private local ingress. The independently authenticated local relay must
    // observe this revision before any response can claim secondary success.
    return NextResponse.json({ ok: true, outcome: 'primary_committed/secondary_pending',
      overrides: snapshot.entries, epoch: snapshot.epoch, revision: snapshot.revision, hash: snapshot.hash,
      committedAt: snapshot.committedAt }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    // A failed response after a Blob write/release can be ambiguous. Never
    // instruct the caller to repeat an edit whose primary commit may exist.
    const code = err instanceof OverrideFailure ? err.code : 'storage_error';
    if (['missing', 'source_busy', 'unfenced_source', 'inconsistent_source', 'wrong_epoch', 'authority_fenced', 'authority_unknown', 'invalid_snapshot', 'duplicate_identity', 'too_large', 'revision_exhausted'].includes(code)) {
      const response = storageFailure(err);
      return response;
    }
    return NextResponse.json({ ok: false, outcome: 'primary_unknown', error: code }, { status: 503 });
  }
}
