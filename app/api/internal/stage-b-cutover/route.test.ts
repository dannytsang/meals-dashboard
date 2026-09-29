import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '@/lib/override-snapshot';

const fake = vi.hoisted(() => ({ files: new Map<string, { bytes: Uint8Array; etag: string }>(), next: 0 }));
vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) => {
    const file = fake.files.get(path);
    return file ? { statusCode: 200, blob: { size: file.bytes.byteLength }, stream: new Response(Buffer.from(file.bytes)).body } : null;
  }),
  put: vi.fn(async (path: string, bytes: Uint8Array, options: { allowOverwrite: boolean }) => {
    if (!options.allowOverwrite && fake.files.has(path)) throw new Error('already exists');
    const etag = String(++fake.next);
    fake.files.set(path, { bytes: new Uint8Array(bytes), etag });
    return { url: `https://fixture.invalid/${path}`, etag };
  }),
  del: vi.fn(async (url: string, options: { ifMatch: string }) => {
    const path = new URL(url).pathname.slice(1);
    if (fake.files.get(path)?.etag !== options.ifMatch) throw new Error('etag mismatch');
    fake.files.delete(path);
  }),
}));

import { ADMISSION_PATH, AUTHORITY_DATA_PATH, AUTHORITY_PATH, SOURCE_EPOCH, SOURCE_REVISION_PATH, SOURCE_NAMESPACE } from '@/lib/override-source-store';
import { POST, GET } from './route';

const secret = 'a'.repeat(64);
const localEpoch = 'local-stage-b';
const committedAt = '2026-09-29T20:00:00.000Z';
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const seed = () => {
  const raw = bytes([]);
  const rawHash = createHash('sha256').update(raw).digest('hex');
  const snapshot = makeSnapshot(SOURCE_EPOCH, 1, [], committedAt);
  fake.files.set(AUTHORITY_DATA_PATH, { bytes: raw, etag: String(++fake.next) });
  fake.files.set(SOURCE_REVISION_PATH, { bytes: bytes({ version: 2, epoch: SOURCE_EPOCH, revision: 1, rawHash, committedAt }), etag: String(++fake.next) });
  fake.files.set(ADMISSION_PATH, { bytes: bytes({ version: 1, namespace: SOURCE_NAMESPACE, release: 'b'.repeat(40), epoch: SOURCE_EPOCH,
    revision: 1, rawHash, hash: snapshot.hash, count: 0, present: true, committedAt }), etag: String(++fake.next) });
  return snapshot;
};
const request = (action: string, auth = secret) => new Request('https://preview.invalid/api/internal/stage-b-cutover', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-stage-b-operator-secret': auth }, body: JSON.stringify({ action }),
});

beforeEach(() => {
  fake.files.clear(); fake.next = 0;
  vi.stubEnv('MEALS_STAGE_B_OPERATOR_SECRET', secret);
  vi.stubEnv('MEALS_STAGE_B_LOCAL_ORIGIN', 'https://local.invalid');
  vi.stubEnv('MEALS_STAGE_B_LOCAL_EPOCH', localEpoch);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'dashboard-secret');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('temporary Stage B source operator', () => {
  it('is fail-closed and exposes no read method', async () => {
    expect((await POST(request('probe', 'c'.repeat(64)))).status).toBe(401);
    expect((await GET()).status).toBe(404);
    vi.stubEnv('MEALS_STAGE_B_OPERATOR_SECRET', 'dashboard-secret');
    expect((await POST(request('probe'))).status).toBe(404);
    expect(fake.files.size).toBe(0);
  });

  it('proves create-if-absent, fresh exact read and ownership-aware cleanup', async () => {
    const response = await POST(request('probe'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, createIfAbsent: true, freshExactRead: true, conditionalRelease: true, cleaned: true });
    expect([...fake.files.keys()].filter(path => path.includes('stage-b-probe'))).toEqual([]);
  });

  it('freezes source, confirms exact local promotion and records external high-water', async () => {
    const snapshot = seed();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({ snapshot, activationEpoch: localEpoch });
      return Response.json({ epoch: localEpoch, revision: snapshot.revision, hash: snapshot.hash, committedAt: snapshot.committedAt });
    }));
    const response = await POST(request('promote'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, state: 'local', sourceEpoch: SOURCE_EPOCH, activationEpoch: localEpoch,
      revision: 1, hash: snapshot.hash, committedAt });
    expect(JSON.parse(new TextDecoder().decode(fake.files.get(AUTHORITY_PATH)!.bytes))).toMatchObject({ state: 'local', activationEpoch: localEpoch });
  });

  it('leaves source frozen when local confirmation fails', async () => {
    seed();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'denied' }, { status: 401 })));
    const response = await POST(request('promote'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'local_confirmation_failed' });
    expect(JSON.parse(new TextDecoder().decode(fake.files.get(AUTHORITY_PATH)!.bytes)).state).toBe('frozen');
  });
});
