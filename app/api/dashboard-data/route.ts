import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const BLOB_STORE_NAME = process.env.BLOB_STORE_NAME ?? 'meals-dashboard-blob';
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
