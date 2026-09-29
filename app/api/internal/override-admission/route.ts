import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BlobOverrideStore,
  SOURCE_EPOCH,
  SOURCE_NAMESPACE,
  admitLegacySource,
} from '@/lib/override-source-store';
import { boundedBody, OverrideFailure } from '@/lib/override-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const CONFIRM = 'admit-legacy-overrides-v3-once';
const reply = (value: unknown, status: number) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  },
});
const unavailable = () => reply({ error: 'unavailable' }, 404);
export const GET = unavailable;
export const HEAD = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;

function equalMachineSecret(supplied: string | null, expected: string | undefined): boolean {
  if (!expected || !supplied || expected.length > 1024 || supplied.length > 1024) return false;
  const left = createHash('sha256').update(supplied).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: Request): Promise<Response> {
  const machineSecret = process.env.MEALS_DASHBOARD_DATA_SECRET;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const deployedCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!machineSecret || !token || !deployedCommit || !/^[a-f0-9]{40}$/.test(deployedCommit)) return unavailable();
  if (!equalMachineSecret(request.headers.get('x-dashboard-secret'), machineSecret)) return reply({ error: 'unauthorized' }, 401);
  if (new URL(request.url).search) return reply({ error: 'invalid_request' }, 400);
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) return reply({ error: 'invalid_request' }, 400);

  try {
    const value = await boundedBody(request);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OverrideFailure('invalid_request');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).sort().join(',') !== 'confirm,legacySha256,namespace,release,version' ||
        body.version !== 1 || body.namespace !== SOURCE_NAMESPACE || body.release !== deployedCommit ||
        body.confirm !== CONFIRM || typeof body.legacySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.legacySha256)) {
      throw new OverrideFailure(body.release !== deployedCommit ? 'release_mismatch' : 'invalid_request');
    }
    const identity = await admitLegacySource(new BlobOverrideStore(token), SOURCE_EPOCH, deployedCommit, body.legacySha256);
    return reply(identity, 201);
  } catch (error) {
    const code = error instanceof OverrideFailure ? error.code : 'storage_error';
    const status = code === 'missing' ? 404 :
      ['invalid_request', 'wrong_epoch'].includes(code) ? 400 :
      ['release_mismatch', 'source_identity_mismatch', 'source_changed', 'admission_replayed', 'admission_unknown', 'source_busy'].includes(code) ? 409 : 503;
    return reply({ error: code }, status);
  }
}
