import 'server-only';
import { NextResponse } from 'next/server';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { hasDebugAuthorization } from '@/lib/debug-authorization';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  if (!(await hasDebugAuthorization())) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const client = new VercelBlobStorageClient();
  try {
    const pointer = await client.readPointer();
    if (!pointer) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const manifest = await client.readManifest(pointer.manifestPath);
    const coverageKeys = Object.keys(manifest).filter(k => k.startsWith('coverage/'));
    const orderKeys = Object.keys(manifest).filter(k => k.startsWith('orders/'));
    return NextResponse.json({ pointer, coverageKeys, orderKeys, allManifestKeys: Object.keys(manifest), totalKeys: Object.keys(manifest).length });
  } catch (error) {
    console.error('[debug/raw-manifest] read failed', { error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
