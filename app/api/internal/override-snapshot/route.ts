import 'server-only';
import { get } from '@vercel/blob';
import { boundedBody, equalSecret, makeSnapshot, validateEntries, OverrideFailure, OVERRIDE_LIMITS } from '@/lib/override-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const path = 'overrides/manual.json';
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
 * A fenced source adapter must return bytes and its monotonic epoch/revision
 * from the SAME serialized all-writer transaction. The as-working Blob writer
 * has no such generation: it must never be assigned one by timestamp, hash,
 * head/get rereads, or an environment flag. T022 supplies this adapter.
 */
export type FencedRead = () => Promise<{ bytes: Uint8Array | null; epoch: string; revision: number }>;
export async function captureFenced(read: FencedRead) {
  const { bytes, epoch, revision } = await read();
  if (bytes === null) throw new OverrideFailure('missing');
  if (bytes.byteLength > OVERRIDE_LIMITS.bytes) throw new OverrideFailure('too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new OverrideFailure('corrupt'); }
  return makeSnapshot(epoch, revision, parsed);
}

async function inspectLegacyBlob(token: string): Promise<never> {
  const blob = await get(path, { access: 'private', useCache: false, token });
  if (!blob) throw new OverrideFailure('missing');
  if (blob.statusCode !== 200) throw new OverrideFailure('storage_error');
  const reader = blob.stream.getReader(); let size = 0; const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > OVERRIDE_LIMITS.bytes) throw new OverrideFailure('too_large');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))); }
  catch { throw new OverrideFailure('corrupt'); }
  validateEntries(parsed);
  // Presence and validity alone are not a safe capture: the existing direct
  // POST has neither a monotonic revision nor an all-writer transaction.
  throw new OverrideFailure('unfenced_source');
}

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
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { version?: unknown }).version !== 1) throw new OverrideFailure('invalid_request');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        inspectLegacyBlob(token),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OverrideFailure('deadline')), OVERRIDE_LIMITS.milliseconds); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
    return reply({ error: 'unfenced_source' }, 409);
  } catch (e) {
    const code = e instanceof OverrideFailure ? e.code : 'storage_error';
    return reply({ error: code }, code === 'missing' ? 404 : code === 'deadline' ? 504 : code === 'invalid_request' ? 400 : code === 'unfenced_source' ? 409 : 422);
  }
}
