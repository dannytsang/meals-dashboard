import 'server-only';
import { NextResponse } from 'next/server';
import { VercelBlobStorageClient } from '@/lib/blob-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Debug-only endpoint: reads and returns the raw pointer + manifest from Blob.
// No auth required — this is a fire-and-forget diagnostic.
// DO NOT deploy to production without adding auth.
export async function GET(): Promise<NextResponse> {
  const client = new VercelBlobStorageClient();

  const pointer = await client.readPointer();
  if (!pointer) {
    return NextResponse.json({ error: 'No pointer found', pointer: null, manifest: null });
  }

  const manifest = await client.readManifest(pointer.manifestPath);
  const coverageKeys = Object.keys(manifest).filter(k => k.startsWith('coverage/'));
  const orderKeys = Object.keys(manifest).filter(k => k.startsWith('orders/'));

  return NextResponse.json({
    pointer,
    coverageKeys,
    orderKeys,
    allManifestKeys: Object.keys(manifest),
    totalKeys: Object.keys(manifest).length,
  });
}
