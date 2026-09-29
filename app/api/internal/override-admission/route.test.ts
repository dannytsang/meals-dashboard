import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const fake = vi.hoisted(() => ({
  files: new Map<string, { bytes: Uint8Array; etag: string }>(),
  next: 0,
}));

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) => {
    const found = fake.files.get(path);
    if (!found) return null;
    return {
      statusCode: 200,
      blob: { size: found.bytes.byteLength },
      stream: new ReadableStream({ start(controller) { controller.enqueue(found.bytes); controller.close(); } }),
    };
  }),
  put: vi.fn(async (path: string, value: Buffer, options: { allowOverwrite: boolean }) => {
    if (!options.allowOverwrite && fake.files.has(path)) throw new Error('exists');
    const etag = String(++fake.next);
    fake.files.set(path, { bytes: new Uint8Array(value), etag });
    return { url: `https://fixture.invalid/${path}`, etag };
  }),
  del: vi.fn(async (url: string, options: { ifMatch: string }) => {
    const path = new URL(url).pathname.slice(1);
    if (fake.files.get(path)?.etag !== options.ifMatch) throw new Error('etag');
    fake.files.delete(path);
  }),
}));

import { ADMISSION_PATH, AUTHORITY_DATA_PATH, LEGACY_DATA_PATH, SOURCE_NAMESPACE } from '@/lib/override-source-store';
import { DELETE, GET, POST } from './route';

const secret = 'machine-secret';
const release = 'a'.repeat(40);
const entries = [{
  meal_date: '2030-01-02', meal_name: 'Synthetic', item_name: 'Ingredient', quantity: 2,
  reason: 'fixture', status: 'partial', created_at: '2030-01-01T00:00:00Z',
  updated_at: '2030-01-02T00:00:00Z', cleared_at: null,
}];
const seedLegacy = () => {
  const bytes = Buffer.from(JSON.stringify(entries));
  fake.files.set(LEGACY_DATA_PATH, { bytes, etag: String(++fake.next) });
  return createHash('sha256').update(bytes).digest('hex');
};
const request = (body: unknown, supplied = secret, url = 'http://localhost/api/internal/override-admission') => new Request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-dashboard-secret': supplied },
  body: JSON.stringify(body),
});
const body = (legacySha256: string) => ({
  version: 1,
  namespace: SOURCE_NAMESPACE,
  release,
  legacySha256,
  confirm: 'admit-legacy-overrides-v3-once',
});

beforeEach(() => {
  fake.files.clear();
  fake.next = 0;
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', secret);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', release);
});
afterEach(() => vi.unstubAllEnvs());

describe('temporary override admission route', () => {
  it('is unavailable unless fully configured and disables non-POST methods', async () => {
    expect((await GET()).status).toBe(404);
    expect((await DELETE()).status).toBe(404);
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'not-canonical');
    expect((await POST(request(body('0'.repeat(64))))).status).toBe(404);
  });

  it('authenticates before parsing and accepts only exact commit-bound input', async () => {
    const legacySha256 = seedLegacy();
    expect((await POST(request(body(legacySha256), 'wrong'))).status).toBe(401);
    expect((await POST(request({ ...body(legacySha256), extra: true }))).status).toBe(400);
    expect((await POST(request({ ...body(legacySha256), release: 'b'.repeat(40) }))).status).toBe(409);
    expect((await POST(request(body(legacySha256), secret, 'http://localhost/api/internal/override-admission?x=1'))).status).toBe(400);
    expect(fake.files.has(AUTHORITY_DATA_PATH)).toBe(false);
  });

  it('admits exact legacy bytes once and refuses replay without returning private entries', async () => {
    const legacySha256 = seedLegacy();
    const response = await POST(request(body(legacySha256)));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const admitted = await response.json();
    expect(admitted).toMatchObject({ admitted: true, namespace: SOURCE_NAMESPACE, release, rawHash: legacySha256, count: 1 });
    expect(admitted).not.toHaveProperty('entries');
    expect(fake.files.has(AUTHORITY_DATA_PATH)).toBe(true);
    expect(fake.files.has(ADMISSION_PATH)).toBe(true);
    const replay = await POST(request(body(legacySha256)));
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: 'admission_replayed' });
  });

  it('refuses identity mismatch without creating v3 authority', async () => {
    seedLegacy();
    const response = await POST(request(body('0'.repeat(64))));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'source_identity_mismatch' });
    expect(fake.files.has(AUTHORITY_DATA_PATH)).toBe(false);
    expect(fake.files.has(ADMISSION_PATH)).toBe(false);
  });
});
