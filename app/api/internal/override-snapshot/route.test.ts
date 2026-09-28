import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeSnapshot, validateSnapshot } from '@/lib/override-snapshot';
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
import { BlobOverrideStore, bootstrapFencedSource, editFencedSource, readFencedSource } from '@/lib/override-source-store';
import { POST as capture, GET as disabledGet } from './route';
import { POST as edit, GET as read } from '../../overrides/route';
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
const seed = (path: string, value: unknown) => fake.files.set(path, { bytes: bytes(value), etag: String(++fake.next) });
const result = async () => { const response = await capture(request()); return { status: response.status, body: await response.json() }; };
beforeEach(() => {
  fake.files.clear(); fake.writes.length = 0; fake.fail = ''; fake.next = 0;
  vi.stubEnv('MEALS_OVERRIDE_SNAPSHOT_ENABLED', '1'); vi.stubEnv('MEALS_OVERRIDE_SNAPSHOT_SECRET', secret);
  vi.stubEnv('MEALS_OVERRIDE_FENCE_ENABLED', '1'); vi.stubEnv('MEALS_OVERRIDE_FENCE_EPOCH', 'fixture');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token'); vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'other-secret');
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('real source adapter and routes', () => {
  it('denies unauthenticated, unsafe methods and disabled fence without writes', async () => {
    expect((await capture(request('b'.repeat(64)))).status).toBe(401);
    expect((await disabledGet()).status).toBe(404);
    vi.stubEnv('MEALS_OVERRIDE_FENCE_ENABLED', '0');
    expect((await result()).body.error).toBe('fence_disabled');
    expect((await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name }))).status).toBe(503);
    expect(fake.writes).toEqual([]);
  });
  it('does not invent revision for missing, corrupt or valid legacy [] and fails closed on storage error', async () => {
    expect((await result()).body.error).toBe('missing');
    fake.files.set('overrides/manual.json', { bytes: new TextEncoder().encode('{'), etag: '1' });
    expect((await result()).body.error).toBe('corrupt');
    seed('overrides/manual.json', []);
    expect(await result()).toEqual({ status: 409, body: { error: 'unfenced_source' } });
    fake.fail = 'overrides/source-lock.json';
    expect((await result()).body.error).toBe('source_busy');
  });
  it('bootstraps only present valid data under lock; capture preserves positive empty and every field', async () => {
    seed('overrides/manual.json', []);
    const initial = await bootstrapFencedSource(store, 'fixture');
    expect(initial).toEqual(makeSnapshot('fixture', 1, [], initial.committedAt));
    expect(await result()).toEqual({ status: 200, body: initial });
    expect((await read(new NextRequest('http://localhost/api/overrides', { headers: { 'x-dashboard-secret': 'other-secret' } }))).status).toBe(200);
    const response = await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name }));
    expect(response.status).toBe(200);
    expect((await result()).body.entries[0].meal_date).toBe(entry.meal_date);
    expect((await result()).body.revision).toBe(2);
    expect(fake.writes).toContain('overrides/manual.json');
    fake.files.clear();
    seed('overrides/manual.json', [entry]);
    const seeded = await bootstrapFencedSource(store, 'fixture');
    expect(seeded).toEqual(makeSnapshot('fixture', 1, [entry], seeded.committedAt));
    const update = await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name, quantity: 3 }));
    expect(update.status).toBe(200);
    const snapshot = (await result()).body;
    expect(snapshot.entries[0].cleared_at).toBeNull();
    expect(snapshot.entries[0].created_at).toBe(entry.created_at);
    expect(snapshot.entries[0].quantity).toBe(3);
  });
  it('serializes writers across instances and survives restart with monotonic revision', async () => {
    seed('overrides/manual.json', []); await bootstrapFencedSource(store, 'fixture');
    const body = { meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name };
    const responses = await Promise.all([edit(editRequest(body)), edit(editRequest(body))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await readFencedSource(new BlobOverrideStore('fixture-token'), 'fixture')).revision).toBe(2);
    expect((await edit(editRequest(body))).status).toBe(200);
    expect((await result()).body.revision).toBe(3);
  });
  it('refuses stale raw bytes, wrong epoch, interrupted metadata and legacy subprocess bypass', async () => {
    seed('overrides/manual.json', [entry]); await bootstrapFencedSource(store, 'fixture');
    seed('overrides/manual.json', []);
    expect((await result()).body.error).toBe('inconsistent_source');
    expect((await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name }))).status).toBe(409);
    seed('overrides/manual.json', [entry]);
    vi.stubEnv('MEALS_OVERRIDE_FENCE_EPOCH', 'later');
    expect((await result()).body.error).toBe('wrong_epoch');
    const bypass = await legacy(new NextRequest('http://localhost/api/manual-override', { method: 'POST', headers: { 'x-dashboard-secret': 'other-secret' }, body: '{}' }));
    expect(bypass.status).toBe(403);
  });
  it('rejects duplicate/oversize/unexpected records and malformed request without serving []', async () => {
    seed('overrides/manual.json', [entry, entry]);
    expect((await result()).body.error).toBe('duplicate_identity');
    seed('overrides/manual.json', { entries: [] });
    expect((await result()).body.error).toBe('invalid_snapshot');
    seed('overrides/manual.json', Array.from({ length: 501 }, (_, index) => ({ ...entry, item_name: `fixture-${index}` })));
    expect((await result()).body.error).toBe('invalid_snapshot');
    const malformed = new Request('http://localhost/api/internal/override-snapshot', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-override-snapshot-secret': secret }, body: '{',
    });
    expect((await capture(malformed)).status).toBe(400);
    expect((await edit(editRequest({ ...entry, quantity: 0 }))).status).toBe(400);
  });
  it('binds commit time to revision and rejects legacy timestamp-free metadata', async () => {
    seed('overrides/manual.json', []);
    const initial = await bootstrapFencedSource(store, 'fixture');
    expect(initial.version).toBe(2);
    expect(initial.committedAt).toMatch(/Z$/);
    expect((await result()).body.committedAt).toBe(initial.committedAt);
    const editResult = await edit(editRequest({ meal_date: entry.meal_date, meal_name: entry.meal_name, item_name: entry.item_name }));
    expect(editResult.status).toBe(200);
    const after = (await result()).body;
    expect(after.revision).toBe(2);
    expect(after.committedAt).toMatch(/Z$/);
    expect((await result()).body.committedAt).toBe(after.committedAt);
    seed('overrides/source-revision.json', { epoch: 'fixture', revision: 2, rawHash: 'a'.repeat(64) });
    expect((await result()).body.error).toBe('corrupt');
    expect((await capture(new Request('http://localhost/api/internal/override-snapshot', { method: 'POST', headers: {
      'content-type': 'application/json', 'x-override-snapshot-secret': secret }, body: JSON.stringify({ version: 1 }) }))).status).toBe(400);
  });
  it('rejects invalid time representations at the source wire and persisted revision boundary', async () => {
    const good = makeSnapshot('fixture', 1, [], '2026-09-28T12:00:00Z');
    for (const committedAt of [undefined, '2026-09-28T13:00:00+01:00', '2026-02-30T12:00:00Z', 'not-a-date']) {
      expect(() => validateSnapshot({ ...good, committedAt })).toThrow();
    }
    expect(() => validateSnapshot({ ...good, version: 1 })).toThrow();
    seed('overrides/manual.json', []);
    await bootstrapFencedSource(store, 'fixture');
    const meta = JSON.parse(Buffer.from(fake.files.get('overrides/source-revision.json')!.bytes).toString());
    seed('overrides/source-revision.json', { ...meta, committedAt: '2026-09-28T13:00:00+01:00' });
    expect((await result()).body.error).toBe('corrupt');
  });
  it('assigns snapshot time to delete/empty commit, independent of future-dated entry fields', async () => {
    seed('overrides/manual.json', [{ ...entry, updated_at: '2099-01-01T00:00:00Z' }]);
    const initial = await bootstrapFencedSource(store, 'fixture');
    const deleted = await editFencedSource(store, 'fixture', () => []);
    expect(deleted.entries).toEqual([]);
    expect(deleted.revision).toBe(initial.revision + 1);
    expect(deleted.committedAt).not.toBe('2099-01-01T00:00:00Z');
    expect((await result()).body).toEqual(deleted);
    const emptyCommit = await editFencedSource(store, 'fixture', (entries) => entries);
    expect(emptyCommit.revision).toBe(deleted.revision + 1);
    expect(emptyCommit.committedAt).toMatch(/Z$/);
    expect((await result()).body).toEqual(emptyCommit);
  });
  it('denies bootstrap twice and refuses an orphan lock rather than stealing after restart', async () => {
    seed('overrides/manual.json', []); await bootstrapFencedSource(store, 'fixture');
    await expect(bootstrapFencedSource(store, 'fixture')).rejects.toMatchObject({ code: 'already_initialized' });
    seed('overrides/source-lock.json', { orphan: true });
    expect((await result()).body.error).toBe('source_busy');
    expect((await edit(editRequest({ meal_date: 'd', meal_name: 'm', item_name: 'i' }))).status).toBe(409);
  });
  it('failed second write leaves mismatch, never an acknowledged snapshot', async () => {
    seed('overrides/manual.json', []); await bootstrapFencedSource(store, 'fixture');
    fake.fail = 'overrides/source-revision.json';
    expect((await edit(editRequest({ meal_date: 'd', meal_name: 'm', item_name: 'i' }))).status).toBe(503);
    fake.fail = '';
    expect((await result()).body.error).toBe('inconsistent_source');
  });
});
