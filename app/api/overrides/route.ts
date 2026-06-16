/**
 * Spec 019 / FR-07 / T062 — durable manual-override persistence.
 *
 * GET  /api/overrides
 *   Auth: x-dashboard-secret header.
 *   Returns the full list of manual override entries as JSON.
 *   Empty list (`[]`) if no overrides have ever been written.
 *
 * POST /api/overrides
 *   Auth: x-dashboard-secret header.
 *   Body: { meal_date, meal_name, item_name, quantity?, reason?, status? }
 *   Upserts an override keyed by the triple (meal_date, meal_name, item_name).
 *   Returns the full list after the write.
 *
 * Storage: a single small blob at `overrides/manual.json`. We deliberately
 * keep this as a single file rather than content-hashed-per-entry because
 * (a) the list is small (handful of entries), (b) we always want a
 * complete-read-modify-write transaction, and (c) the dedup benefit of
 * content-hashing doesn't apply when the file is rewritten on every POST.
 *
 * This replaces the previous design where the dashboard "I have this"
 * button spawned a Python subprocess that wrote to a path on the
 * serverless function's ephemeral disk — that file died on the next
 * cold start, so the override was lost. With this route, the write
 * hits the Vercel blob (durable) and the next Python sync reads it
 * via GET.
 *
 * Auth model matches the other dashboard API routes
 * (`/api/dashboard-data`, `/api/dashboard-sync`, `/api/manual-override`):
 * a shared `MEALS_DASHBOARD_DATA_SECRET` header. The dashboard's server
 * component forwards it from env so the client never sees the secret.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

export const runtime = 'nodejs';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const OVERRIDES_BLOB_PATH = 'overrides/manual.json';

interface ManualOverrideEntry {
  meal_date: string;
  meal_name: string;
  item_name: string;
  quantity: number;
  reason: string;
  status: 'covered' | 'partial';
  created_at: string;
  updated_at: string;
  cleared_at?: string | null;
}

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
    typeof v.meal_date === 'string' &&
    typeof v.meal_name === 'string' &&
    typeof v.item_name === 'string'
  );
}

async function readOverridesBlob(): Promise<ManualOverrideEntry[]> {
  if (!BLOB_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured');
  }
  try {
    const res = await list({ prefix: OVERRIDES_BLOB_PATH, token: BLOB_TOKEN });
    const match = res.blobs.find((b) => b.pathname === OVERRIDES_BLOB_PATH);
    if (!match) return [];
    const resp = await fetch(match.url);
    if (!resp.ok) return [];
    const text = await resp.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as ManualOverrideEntry[]) : [];
  } catch (err) {
    // If the blob doesn't exist yet, list() will throw or return no match.
    // Treat that as "no overrides" so the first POST starts from an empty list.
    return [];
  }
}

async function writeOverridesBlob(entries: ManualOverrideEntry[]): Promise<void> {
  if (!BLOB_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured');
  }
  const payload = JSON.stringify(entries, null, 2) + '\n';
  const result = await put(OVERRIDES_BLOB_PATH, payload, {
    access: 'private',
    token: BLOB_TOKEN,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
  });
  if (!result.url) {
    throw new Error('Override blob write returned no URL');
  }
}

function applyUpsert(entries: ManualOverrideEntry[], body: UpsertRequestBody): ManualOverrideEntry[] {
  const triple = (body.meal_date, body.meal_name, body.item_name);
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
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const entries = await readOverridesBlob();
    return NextResponse.json({ ok: true, overrides: entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to read overrides', detail: message }, { status: 500 });
  }
}

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
    const existing = await readOverridesBlob();
    const updated = applyUpsert(existing, body);
    await writeOverridesBlob(updated);
    return NextResponse.json({ ok: true, overrides: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[overrides] Write failed:', message, err);
    return NextResponse.json(
      { error: 'Failed to persist override', detail: message },
      { status: 500 }
    );
  }
}
