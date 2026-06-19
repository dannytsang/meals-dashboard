import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const BLOB_FILE_NAME = 'dashboard-data.json';

/**
 * POST /api/dashboard-data
 *
 * Spec 028 / 2026-06-19 cleanup: this route used to expose a GET handler
 * that read the legacy single-blob `dashboard-data.json` for the
 * dashboard page's pre-spec-028 read fallback. The dashboard page now
 * uses the spec 028 head()-based split-layout reader exclusively
 * (`lib/blob-storage.ts:readPointer` / `readManifest` / `readJsonBlob`
 * via `lib/dashboard-data.ts:getDashboardData`). The legacy single-blob
 * read path is fully removed in this revision. The GET handler that
 * called `list({ prefix })` (a Vercel Blob Advanced Operation) is gone,
 * along with the `dashboard-data.json` write in `scripts/sync-dashboard-data.py`.
 *
 * POST remains as a one-shot upload path used by ad-hoc admin tooling
 * (not on the cron hot path). It writes `dashboard-data.json` as a
 * private blob with `allowOverwrite: true`. The blob is now an artefact
 * that nothing on the read path consumes; treat it as best-effort
 * convenience storage and let the regular sync populate the split-layout
 * blobs for any dashboard rendering.
 *
 * Auth: `x-dashboard-secret` header must match `MEALS_DASHBOARD_DATA_SECRET`.
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
