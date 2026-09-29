import 'server-only';
import { randomUUID } from 'node:crypto';
import { configuredSource, promoteFencedSource, sourceAuthorityState, BlobOverrideStore } from '@/lib/override-source-store';
import { boundedBody, equalSecret, OverrideFailure, type OverrideSnapshot } from '@/lib/override-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});
const unavailable = () => reply({ error: 'unavailable' }, 404);
export const GET = unavailable;
export const HEAD = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;

function settings(request: Request) {
  const secret = process.env.MEALS_STAGE_B_OPERATOR_SECRET;
  const localOrigin = process.env.MEALS_STAGE_B_LOCAL_ORIGIN;
  const localEpoch = process.env.MEALS_STAGE_B_LOCAL_EPOCH;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret) || !token ||
      [process.env.MEALS_DASHBOARD_DATA_SECRET, process.env.NEXTAUTH_SECRET].includes(secret) ||
      !localEpoch || !/^[A-Za-z0-9_-]{1,64}$/.test(localEpoch) ||
      !localOrigin) return null;
  let origin: string;
  try {
    const parsed = new URL(localOrigin);
    if (parsed.protocol !== 'https:' || parsed.origin !== localOrigin || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    origin = parsed.origin;
  } catch { return null; }
  if (!equalSecret(request.headers.get('x-stage-b-operator-secret'), secret)) return false;
  if (new URL(request.url).search) return false;
  return { secret, localOrigin: origin, localEpoch, token };
}

async function probeSerialization(token: string) {
  const store = new BlobOverrideStore(token);
  const path = `override-authority/stage-b-probe/${randomUUID()}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify({ schema: 1, synthetic: true }));
  let created: { url: string; etag: string } | undefined;
  let duplicateDenied = false;
  let wrongReleaseDenied = false;
  try {
    if (await store.read(path, 1024)) throw new OverrideFailure('probe_path_exists');
    created = await store.write(path, bytes, false);
    try { await store.write(path, bytes, false); } catch { duplicateDenied = true; }
    const fresh = await store.read(path, 1024);
    if (!fresh || !Buffer.from(fresh).equals(Buffer.from(bytes))) throw new OverrideFailure('probe_fresh_read_failed');
    try { await store.remove(created.url, 'definitely-wrong-etag'); } catch { wrongReleaseDenied = true; }
    if (!(await store.read(path, 1024))) throw new OverrideFailure('probe_wrong_release_removed');
    await store.remove(created.url, created.etag);
    created = undefined;
    if (await store.read(path, 1024)) throw new OverrideFailure('probe_cleanup_failed');
    if (!duplicateDenied || !wrongReleaseDenied) throw new OverrideFailure('probe_precondition_failed');
    return { ok: true, createIfAbsent: true, freshExactRead: true, conditionalRelease: true, cleaned: true };
  } finally {
    if (created) await store.remove(created.url, created.etag).catch(() => undefined);
  }
}

function sameIdentity(value: unknown, snapshot: OverrideSnapshot): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return body.epoch === snapshot.epoch && body.revision === snapshot.revision &&
    body.hash === snapshot.hash && body.committedAt === snapshot.committedAt;
}

export async function POST(request: Request): Promise<Response> {
  const config = settings(request);
  if (config === null) return unavailable();
  if (config === false) return reply({ error: 'unauthorized' }, 401);
  try {
    const body = await boundedBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'action') {
      throw new OverrideFailure('invalid_request');
    }
    const action = (body as { action?: unknown }).action;
    if (action === 'probe') return reply(await probeSerialization(config.token), 200);
    if (action !== 'promote') throw new OverrideFailure('invalid_request');
    const { store, epoch } = configuredSource();
    await promoteFencedSource(store, epoch, config.localEpoch, async (snapshot, activationEpoch) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${config.localOrigin}/api/internal/stage-b-cutover`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'content-type': 'application/json', 'x-stage-b-operator-secret': config.secret },
          body: JSON.stringify({ action: 'promote', snapshot, activationEpoch }),
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok || !sameIdentity(result, { ...snapshot, epoch: activationEpoch })) {
          throw new OverrideFailure('local_confirmation_failed');
        }
      } finally { clearTimeout(timer); }
    });
    const final = await sourceAuthorityState(store);
    if (!final || final.state !== 'local') throw new OverrideFailure('authority_unknown');
    return reply({ ok: true, state: final.state, sourceEpoch: final.sourceEpoch, activationEpoch: final.activationEpoch,
      revision: final.revision, hash: final.hash, committedAt: final.committedAt }, 200);
  } catch (error) {
    const code = error instanceof OverrideFailure ? error.code : 'operator_failed';
    return reply({ error: code }, code === 'invalid_request' ? 400 : 503);
  }
}
