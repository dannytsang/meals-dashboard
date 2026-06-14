import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const BLOB_FILE_NAME = 'dashboard-data.json';

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

  try {
    const payload =
      typeof body === 'string' ? body : JSON.stringify(body);

    const result = await put(BLOB_FILE_NAME, payload, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });

    return NextResponse.json({ ok: true, url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dashboard-data] Blob write failed:', message, err);
    return NextResponse.json(
      { error: 'Failed to store data', detail: message },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const blobs = await list({ prefix: BLOB_FILE_NAME });
    const latest = blobs.blobs[0];
    if (!latest) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }

    const res = await fetch(latest.url);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch blob' }, { status: 500 });
    }

    const text = await res.text();
    return NextResponse.json(JSON.parse(text));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dashboard-data] Blob read failed:', message, err);
    return NextResponse.json({ error: 'Failed to read data', detail: message }, { status: 500 });
  }
}

