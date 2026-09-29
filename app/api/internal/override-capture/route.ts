import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { BlobOverrideStore, LEGACY_DATA_PATH } from '@/lib/override-source-store';
import { boundedBody, OverrideFailure, OVERRIDE_LIMITS, validateEntries } from '@/lib/override-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const reply = (value: unknown, status: number) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
const unavailable = () => reply({ error: 'unavailable' }, 404);
export const GET = unavailable; export const HEAD = unavailable; export const PUT = unavailable; export const PATCH = unavailable; export const DELETE = unavailable;
const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string | null, b: string | undefined) => !!a && !!b && a.length <= 1024 && b.length <= 1024 && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MEALS_DASHBOARD_DATA_SECRET, token = process.env.BLOB_READ_WRITE_TOKEN, release = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!secret || !token || !release || !/^[a-f0-9]{40}$/.test(release)) return unavailable();
  if (!equal(request.headers.get('x-dashboard-secret'), secret)) return reply({ error: 'unauthorized' }, 401);
  if (new URL(request.url).search) return reply({ error: 'invalid_request' }, 400);
  try {
    const body = await boundedBody(request) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'confirm,release,version' ||
        body.version !== 1 || body.release !== release || body.confirm !== 'capture-legacy-overrides-v3-backup') throw new OverrideFailure('invalid_request');
    const store = new BlobOverrideStore(token);
    const first = await store.read(LEGACY_DATA_PATH, OVERRIDE_LIMITS.bytes), second = await store.read(LEGACY_DATA_PATH, OVERRIDE_LIMITS.bytes);
    if (!first || !second || !Buffer.from(first).equals(Buffer.from(second))) throw new OverrideFailure(first ? 'source_changed' : 'missing');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(first));
    const entries = validateEntries(value);
    return new Response(Buffer.from(first), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'X-Override-SHA256': digest(first), 'X-Override-Count': String(entries.length) } });
  } catch (error) {
    const code = error instanceof OverrideFailure ? error.code : 'invalid_snapshot';
    return reply({ error: code }, ['invalid_request', 'invalid_snapshot'].includes(code) ? 400 : 409);
  }
}
