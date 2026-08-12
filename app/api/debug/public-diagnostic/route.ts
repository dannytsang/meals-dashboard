import 'server-only';
import { NextResponse } from 'next/server';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { hasDebugAuthorization } from '@/lib/debug-authorization';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Defense-in-depth diagnostic endpoint. Middleware protects this path,
// and this route also requires an authenticated session plus signed debug cookie.
export async function GET(): Promise<NextResponse> {
  if (!(await hasDebugAuthorization())) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const client = new VercelBlobStorageClient();
    const pointer = await client.readPointer();
    if (!pointer) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const manifest = await client.readManifest(pointer.manifestPath);
    return NextResponse.json({ pointer, manifest, coverageKeys: Object.keys(manifest).filter(k => k.startsWith('coverage/')).sort(), orderKeys: Object.keys(manifest).filter(k => k.startsWith('orders/')).sort() });
  } catch (error) {
    console.error('[debug/public-diagnostic] read failed', { error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
