import 'server-only';
import { NextResponse } from 'next/server';
import { VercelBlobStorageClient } from '@/lib/blob-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// UNPROTECTED DEBUG ENDPOINT — for diagnosis only.
// Shows raw pointer and manifest contents from Vercel Blob.
// Will be removed after diagnosis.
export async function GET(): Promise<NextResponse> {
  const client = new VercelBlobStorageClient();
  const pointer = await client.readPointer();
  if (!pointer) {
    return NextResponse.json({ pointer: null, manifest: null, error: 'no pointer' });
  }
  const manifest = await client.readManifest(pointer.manifestPath);
  return NextResponse.json({
    pointer,
    manifest,
    coverageKeys: Object.keys(manifest).filter(k => k.startsWith('coverage/')).sort(),
    orderKeys: Object.keys(manifest).filter(k => k.startsWith('orders/')).sort(),
  });
}
