import 'server-only';
import { configuredSource, readFencedSource } from '@/lib/override-source-store';
import { boundedBody, equalSecret, makeSnapshot, OverrideFailure, OVERRIDE_LIMITS } from '@/lib/override-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const reply = (value: unknown, status: number) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
});
const unavailable = () => reply({ error: 'unavailable' }, 404);
export const GET = unavailable;
export const HEAD = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;

/**
 * Storage-enforced source operations in override-source-store serialize reads
 * with edits and verify a monotonic epoch/revision bound to exact raw bytes.
 * This pure parser remains available for synthetic malformed-record tests.
 */
export type FencedRead = () => Promise<{ bytes: Uint8Array | null; epoch: string; revision: number; committedAt: string }>;
export async function captureFenced(read: FencedRead) {
  const { bytes, epoch, revision, committedAt } = await read();
  if (bytes === null) throw new OverrideFailure('missing');
  if (bytes.byteLength > OVERRIDE_LIMITS.bytes) throw new OverrideFailure('too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new OverrideFailure('corrupt'); }
  return makeSnapshot(epoch, revision, parsed, committedAt);
}

/** A successful capture is read under the same storage lock used by all new edits. */

/** Never return an unaudited [] or a synthetic source revision. */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MEALS_OVERRIDE_SNAPSHOT_SECRET;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (process.env.MEALS_OVERRIDE_SNAPSHOT_ENABLED !== '1' || !secret || !/^[a-f0-9]{64}$/.test(secret) || !token ||
      [token, process.env.MEALS_DASHBOARD_DATA_SECRET, process.env.NEXTAUTH_SECRET].includes(secret)) return unavailable();
  if (!equalSecret(request.headers.get('x-override-snapshot-secret'), secret)) return reply({ error: 'unauthorized' }, 401);
  if (new URL(request.url).search) return reply({ error: 'invalid_request' }, 400);
  try {
    const body = await boundedBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { version?: unknown }).version !== 2) throw new OverrideFailure('invalid_request');
    const { store, epoch } = configuredSource();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([
        readFencedSource(store, epoch),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OverrideFailure('deadline')), OVERRIDE_LIMITS.milliseconds); }),
      ]);
      return reply(snapshot, 200);
    } finally { if (timer) clearTimeout(timer); }
  } catch (e) {
    const code = e instanceof OverrideFailure ? e.code : 'storage_error';
    return reply({ error: code }, code === 'missing' ? 404 : code === 'deadline' ? 504 : code === 'invalid_request' ? 400 : code === 'unfenced_source' ? 409 : 422);
  }
}
