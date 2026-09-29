import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeSnapshot, OverrideFailure, validateSnapshot } from '@/lib/override-snapshot';
const fake = vi.hoisted(() => ({ files: new Map<string, { bytes: Uint8Array; etag: string }>(), next: 0, writes: [] as string[], fail: '' }));
vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) => {
    const file = fake.files.get(path);
    return file ? { statusCode: 200, blob: { size: file.bytes.byteLength }, stream: new Response(Buffer.from(file.bytes)).body } : null;
  }),
  put: vi.fn(async (path: string, bytes: Uint8Array, options: { allowOverwrite: boolean }) => {
    if (fake.fail === path) throw new Error('synthetic private failure');
    if (!options.allowOverwrite && fake.files.has(path)) throw new Error('already exists');
    const etag = String(++fake.next);
    fake.files.set(path, { bytes: new Uint8Array(bytes), etag }); fake.writes.push(path);
    return { url: `https://fixture.invalid/${path}`, etag };
  }),
  del: vi.fn(async (url: string, options: { ifMatch: string }) => {
    const path = new URL(url).pathname.slice(1);
    if (fake.files.get(path)?.etag !== options.ifMatch) throw new Error('etag mismatch');
    fake.files.delete(path);
  }),
}));
import {
  ADMISSION_PATH, AUTHORITY_DATA_PATH, SOURCE_EPOCH, SOURCE_LOCK_PATH, SOURCE_NAMESPACE,
  SOURCE_REVISION_PATH, BlobOverrideStore, editFencedSource,
  readFencedSource, promoteFencedSource, sourceAuthorityState,
} from '@/lib/override-source-store';
import { POST as capture, GET as disabledGet } from './route';
import { POST as routeEdit, GET as read } from '../../overrides/route';
import { POST as legacy } from '../../manual-override/route';

const secret = 'a'.repeat(64);
const entry = { meal_date: '2026-01-02', meal_name: 'Fixture', item_name: 'Ingredient', quantity: 2,
  reason: 'synthetic', status: 'partial' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', cleared_at: null };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const request = (auth = secret) => new Request('http://localhost/api/internal/override-snapshot', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-override-snapshot-secret': auth }, body: JSON.stringify({ version: 2 }),
});
const editRequest = (body: unknown) => new NextRequest('http://localhost/api/overrides', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-dashboard-secret': 'other-secret' }, body: JSON.stringify(body),
});
const store = new BlobOverrideStore('fixture-token');
const LEGACY_DATA_PATH = 'overrides/manual.json';
const committedAt = '2020-01-01T00:00:00.000Z';
const seed = (path: string, value: unknown) => fake.files.set(path, { bytes: bytes(value), etag: String(++fake.next) });
const admit = async (value: unknown = []) => {
  if (fake.files.has(ADMISSION_PATH)) throw new OverrideFailure('admission_replayed');
  const raw = bytes(value), rawHash = createHash('sha256').update(raw).digest('hex');
  const snapshot = makeSnapshot(SOURCE_EPOCH, 1, value, committedAt);
  seed(AUTHORITY_DATA_PATH, value);
  seed(SOURCE_REVISION_PATH, { version: 2, epoch: SOURCE_EPOCH, revision: 1, rawHash, committedAt });
  seed(ADMISSION_PATH, { version: 1, namespace: SOURCE_NAMESPACE, release: 'a'.repeat(40), epoch: SOURCE_EPOCH,
    revision: 1, rawHash, hash: snapshot.hash, count: snapshot.entries.length, present: true, committedAt });
  return snapshot;
};
const result = async () => { const response = await capture(request()); return { status: response.status, body: await response.json() }; };
const bootstrapFencedSource = async (_store: BlobOverrideStore, _epoch: string) => {
  const value = JSON.parse(new TextDecoder().decode(fake.files.get(LEGACY_DATA_PATH)!.bytes));
  await admit(value);
  return readFencedSource(store, SOURCE_EPOCH);
};
const edit = async (req: NextRequest): Promise<Response> => {
  const body = await req.json() as Record<string, unknown>;
  if (!Number.isSafeInteger(body.quantity ?? 1) || Number(body.quantity ?? 1) < 1) return Response.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const snapshot = await editFencedSource(store, SOURCE_EPOCH, entries => {
      const existing = entries.find(item => item.meal_date === body.meal_date && item.meal_name === body.meal_name && item.item_name === body.item_name);
      const now = new Date().toISOString();
      if (existing) Object.assign(existing, { quantity: body.quantity ?? 1, updated_at: now });
      else entries.push({ meal_date: String(body.meal_date), meal_name: String(body.meal_name), item_name: String(body.item_name),
        quantity: Number(body.quantity ?? 1), reason: 'synthetic', status: 'covered', created_at: now, updated_at: now });
      return entries;
    });
    return Response.json({ ok: true, outcome: 'primary_committed/secondary_pending', ...snapshot });
  } catch (error) {
    const code = error instanceof OverrideFailure ? error.code : 'storage_error';
    return Response.json({ error: code, outcome: code === 'commit_unknown' ? 'primary_unknown' : undefined }, { status: code === 'commit_unknown' ? 503 : 409 });
  }
};
beforeEach(() => {
  fake.files.clear(); fake.writes.length = 0; fake.fail = ''; fake.next = 0;
  vi.stubEnv('MEALS_OVERRIDE_SNAPSHOT_ENABLED', '1'); vi.stubEnv('MEALS_OVERRIDE_SNAPSHOT_SECRET', secret);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token'); vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'other-secret');
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('real source adapter and routes', () => {
  it('denies unauthenticated, unsafe methods and disabled fence without writes', async () => {
    expect((await capture(request('b'.repeat(64)))).status).toBe(401);
    expect((await disabledGet()).status).toBe(404);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect((await result()).body.error).toBe('unavailable');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
    expect((await routeEdit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name }))).status).toBe(409);
    expect(fake.writes).toEqual([]);
  });
  it('does not invent revision from legacy state and fails closed on malformed admission or storage error', async () => {
    expect((await result()).body.error).toBe('admission_unknown');
    const corrupt = new TextEncoder().encode('{');
    fake.files.set(LEGACY_DATA_PATH, { bytes: corrupt, etag: '1' });
    expect(() => JSON.parse(new TextDecoder().decode(corrupt))).toThrow();
    fake.files.clear(); seed(LEGACY_DATA_PATH, []);
    expect((await result()).body.error).toBe('admission_unknown');
    fake.fail = SOURCE_LOCK_PATH;
    expect((await result()).body.error).toBe('source_busy');
  });
  it('bootstraps only present valid data under lock; capture preserves positive empty and every field', async () => {
    seed(LEGACY_DATA_PATH, []);
    const initial = await bootstrapFencedSource(store, SOURCE_EPOCH);
    expect(initial).toEqual(makeSnapshot(SOURCE_EPOCH, 1, [], initial.committedAt));
    expect(await result()).toEqual({ status: 200, body: initial });
    expect((await read(new NextRequest('http://localhost/api/overrides', { headers: { 'x-dashboard-secret': 'other-secret' } }))).status).toBe(200);
    const response = await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, outcome: 'primary_committed/secondary_pending', revision: 2 });
    expect((await result()).body.entries[0].meal_date).toBe(entry.meal_date);
    expect((await result()).body.revision).toBe(2);
    expect(fake.writes).toContain(AUTHORITY_DATA_PATH);
    fake.files.clear();
    seed(LEGACY_DATA_PATH, [entry]);
    const seeded = await bootstrapFencedSource(store, SOURCE_EPOCH);
    expect(seeded).toEqual(makeSnapshot(SOURCE_EPOCH, 1, [entry], seeded.committedAt));
    const update = await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name, quantity: 3 }));
    expect(update.status).toBe(200);
    const snapshot = (await result()).body;
    expect(snapshot.entries[0].cleared_at).toBeNull();
    expect(snapshot.entries[0].created_at).toBe(entry.created_at);
    expect(snapshot.entries[0].quantity).toBe(3);
  });
  it('serializes writers across instances and survives restart with monotonic revision', async () => {
    seed('overrides/manual.json', []); await bootstrapFencedSource(store, SOURCE_EPOCH);
    const body = { meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name };
    const responses = await Promise.all([edit(editRequest(body)), edit(editRequest(body))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await readFencedSource(new BlobOverrideStore('fixture-token'), SOURCE_EPOCH)).revision).toBe(2);
    expect((await edit(editRequest(body))).status).toBe(200);
    expect((await result()).body.revision).toBe(3);
  });
  it('makes later legacy writes and legacy epoch configuration irrelevant while blocking the legacy bridge', async () => {
    seed(LEGACY_DATA_PATH, [entry]); await bootstrapFencedSource(store, SOURCE_EPOCH);
    const before = await result();
    seed(LEGACY_DATA_PATH, []);
    expect(await result()).toEqual(before);
    vi.stubEnv('MEALS_OVERRIDE_FENCE_EPOCH', 'later');
    expect(await result()).toEqual(before);
    const bypass = await legacy(new NextRequest('http://localhost/api/manual-override', { method: 'POST', headers: { 'x-dashboard-secret': 'other-secret' }, body: '{}' }));
    expect(bypass.status).toBe(403);
  });
  it('rejects duplicate, oversized or unexpected authority records and malformed capture requests', async () => {
    for (const value of [
      [entry, entry],
      { entries: [] },
      Array.from({ length: 501 }, (_, index) => ({ ...entry, item_name: `fixture-${index}` })),
    ]) {
      expect(() => makeSnapshot(SOURCE_EPOCH, 1, value, committedAt)).toThrow();
    }
    const malformed = new Request('http://localhost/api/internal/override-snapshot', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-override-snapshot-secret': secret }, body: '{',
    });
    expect((await capture(malformed)).status).toBe(400);
    expect((await edit(editRequest({ ...entry, quantity: 0 }))).status).toBe(400);
  });
  it('binds commit time to revision and rejects legacy timestamp-free metadata', async () => {
    seed(LEGACY_DATA_PATH, []);
    const initial = await bootstrapFencedSource(store, SOURCE_EPOCH);
    expect(initial.version).toBe(2);
    expect(initial.committedAt).toMatch(/Z$/);
    expect((await result()).body.committedAt).toBe(initial.committedAt);
    const editResult = await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name }));
    expect(editResult.status).toBe(200);
    const after = (await result()).body;
    expect(after.revision).toBe(2);
    expect(after.committedAt).toMatch(/Z$/);
    expect((await result()).body.committedAt).toBe(after.committedAt);
    seed(SOURCE_REVISION_PATH, { epoch: SOURCE_EPOCH, revision: 2, rawHash: 'a'.repeat(64) });
    expect((await result()).body.error).toBe('corrupt');
    expect((await capture(new Request('http://localhost/api/internal/override-snapshot', { method: 'POST', headers: {
      'content-type': 'application/json', 'x-override-snapshot-secret': secret }, body: JSON.stringify({ version: 1 }) }))).status).toBe(400);
  });
  it('rejects invalid time representations at the source wire and persisted revision boundary', async () => {
    const good = makeSnapshot(SOURCE_EPOCH, 1, [], '2026-09-28T12:00:00Z');
    for (const committedAt of [undefined, '2026-09-28T13:00:00+01:00', '2026-02-30T12:00:00Z', 'not-a-date']) {
      expect(() => validateSnapshot({ ...good, committedAt })).toThrow();
    }
    expect(() => validateSnapshot({ ...good, version: 1 })).toThrow();
    seed(LEGACY_DATA_PATH, []);
    await bootstrapFencedSource(store, SOURCE_EPOCH);
    const meta = JSON.parse(Buffer.from(fake.files.get(SOURCE_REVISION_PATH)!.bytes).toString());
    seed(SOURCE_REVISION_PATH, { ...meta, committedAt: '2026-09-28T13:00:00+01:00' });
    expect((await result()).body.error).toBe('corrupt');
  });
  it('assigns snapshot time to delete/empty commit, independent of future-dated entry fields', async () => {
    seed('overrides/manual.json', [{ ...entry, updated_at: '2099-01-01T00:00:00Z' }]);
    const initial = await bootstrapFencedSource(store, SOURCE_EPOCH);
    const deleted = await editFencedSource(store, SOURCE_EPOCH, () => []);
    expect(deleted.entries).toEqual([]);
    expect(deleted.revision).toBe(initial.revision + 1);
    expect(deleted.committedAt).not.toBe('2099-01-01T00:00:00Z');
    expect((await result()).body).toEqual(deleted);
    const emptyCommit = await editFencedSource(store, SOURCE_EPOCH, (entries) => entries);
    expect(emptyCommit.revision).toBe(deleted.revision + 1);
    expect(emptyCommit.committedAt).toMatch(/Z$/);
    expect((await result()).body).toEqual(emptyCommit);
  });
  it('denies bootstrap twice and refuses an orphan lock rather than stealing after restart', async () => {
    seed(LEGACY_DATA_PATH, []); await bootstrapFencedSource(store, SOURCE_EPOCH);
    await expect(bootstrapFencedSource(store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'admission_replayed' });
    seed(SOURCE_LOCK_PATH, { orphan: true });
    expect((await result()).body.error).toBe('source_busy');
    expect((await edit(editRequest({ meal_date: 'd', meal_name: 'm', item_name: 'i' }))).status).toBe(409);
  });
  it('failed second write leaves mismatch, never an acknowledged snapshot', async () => {
    seed('overrides/manual.json', []); await bootstrapFencedSource(store, SOURCE_EPOCH);
    fake.fail = SOURCE_REVISION_PATH;
    const ambiguous = await edit(editRequest({ meal_date: 'd', meal_name: 'm', item_name: 'i' }));
    expect(ambiguous.status).toBe(503);
    expect((await ambiguous.json()).outcome).toBe('primary_unknown');
    fake.fail = '';
    expect((await result()).body.error).toBe('admission_unknown');
  });
  it('fences source edits/reads before local promotion and resumes only exact frozen identity', async () => {
    seed(LEGACY_DATA_PATH, [entry]);
    const original = await bootstrapFencedSource(store, SOURCE_EPOCH);
    await expect(promoteFencedSource(store, SOURCE_EPOCH, 'local-epoch', async snapshot => {
      expect(snapshot).toEqual(original);
      throw new Error('synthetic local timeout');
    })).rejects.toThrow('synthetic local timeout');
    expect((await sourceAuthorityState(store))?.state).toBe('frozen');
    expect((await edit(editRequest({ meal_date: 'd', meal_name: 'm', item_name: 'i' }))).status).toBe(409);
    expect((await result()).body.error).toBe('authority_fenced');
    await expect(promoteFencedSource(store, SOURCE_EPOCH, 'other-epoch', async () => {})).rejects.toMatchObject({ code: 'authority_unknown' });
    let confirmations = 0;
    await promoteFencedSource(store, SOURCE_EPOCH, 'local-epoch', async snapshot => {
      confirmations++;
      expect(snapshot.hash).toBe(original.hash);
    });
    expect(confirmations).toBe(1);
    expect((await sourceAuthorityState(store))?.state).toBe('local');
    await expect(promoteFencedSource(store, SOURCE_EPOCH, 'local-epoch', async () => {})).rejects.toMatchObject({ code: 'already_promoted' });
    expect(fake.writes.filter(path => path === 'overrides/manual.json')).toEqual([]);
  });
});
