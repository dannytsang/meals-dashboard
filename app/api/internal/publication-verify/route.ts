import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { boundedText, createVerificationReader, parseVerification, verifyPublication } from '@/lib/publication-verification';

export const runtime = 'nodejs';
const response = (body: object, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = (s: string) => createHash('sha256').update(s).digest();
/** Separate comparison privilege; never a general read/export/unlock API. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.MEALS_PUBLICATION_VERIFY !== '1' || process.env.MEALS_PUBLICATION_PROTOCOL !== '1') return response({ error: 'Unavailable' }, 404);
  const secret = process.env.MEALS_PUBLICATION_VERIFY_SECRET;
  if (!secret || secret.length < 32 || secret === process.env.MEALS_DASHBOARD_DATA_SECRET) return response({ error: 'Unavailable' }, 503);
  const provided = request.headers.get('x-publication-verify-secret');
  if (!provided || provided.length > 1024 || !timingSafeEqual(digest(provided), digest(secret))) return response({ error: 'Unauthorized' }, 401);
  let expected;
  try {
    if (!request.body || new URL(request.url).search) throw new Error();
    expected = parseVerification(JSON.parse(await boundedText(request.body, 256 * 1024)));
  } catch { return response({ error: 'Invalid verification request' }, 400); }
  try {
    const client = new VercelBlobStorageClient();
    if (!client.withLock) throw new Error();
    const result = await client.withLock(() => verifyPublication(expected, createVerificationReader()));
    return response(result, 200);
  } catch { return response({ error: 'Verification unavailable or mismatch' }, 409); }
}
