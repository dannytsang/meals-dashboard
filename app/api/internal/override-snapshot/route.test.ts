import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '@/lib/override-snapshot';
const blob = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@vercel/blob', () => ({ get: blob.get }));
import { captureFenced, POST, GET } from './route';

const secret = 'a'.repeat(64);
const entry = {
  meal_date: '2026-01-02', meal_name: 'Fixture', item_name: 'Ingredient', quantity: 2,
  reason: 'synthetic', status: 'partial' as const, created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z', cleared_at: null,
};
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const request = (auth = secret) => new Request('http://localhost/api/internal/override-snapshot', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-override-snapshot-secret': auth }, body: JSON.stringify({ version: 1 }),
});
const result = async (auth = secret) => { const response = await POST(request(auth)); return { status: response.status, body: await response.json() }; };
const source = (value: unknown) => {
  const payload = bytes(value);
  blob.get.mockResolvedValue({ statusCode: 200, stream: new Response(payload).body });
};
beforeEach(() => {
  vi.stubEnv('MEALS_OVERRIDE_SNAPSHOT_ENABLED', '1');
  vi.stubEnv('MEALS_OVERRIDE_SNAPSHOT_SECRET', secret);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-token');
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'other-secret');
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('strict source boundary', () => {
  it('rejects browser/other auth and GET without touching storage', async () => {
    expect((await result('b'.repeat(64))).status).toBe(401);
    expect((await GET()).status).toBe(404);
    expect(blob.get).not.toHaveBeenCalled();
  });
  it('distinguishes missing, corrupt, unexpected shape, storage failure and positive empty without inventing a revision', async () => {
    blob.get.mockResolvedValueOnce(null);
    expect((await result()).body.error).toBe('missing');
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: new Response('{').body });
    expect((await result()).body.error).toBe('corrupt');
    source({ entries: [] });
    expect((await result()).body.error).toBe('invalid_snapshot');
    blob.get.mockRejectedValueOnce(new Error('private fixture token'));
    expect((await result()).body.error).toBe('storage_error');
    source([]);
    expect(await result()).toEqual({ status: 409, body: { error: 'unfenced_source' } });
  });
  it('enforces bounds, request shape and preserves private errors', async () => {
    const malformed = new Request('http://localhost/api/internal/override-snapshot', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-override-snapshot-secret': secret }, body: '{',
    });
    expect((await POST(malformed)).status).toBe(400);
    source(Array.from({ length: 501 }, () => entry));
    expect((await result()).status).toBe(422);
    const huge = new Request('http://localhost/api/internal/override-snapshot', {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '999999', 'x-override-snapshot-secret': secret }, body: '{}',
    });
    expect((await POST(huge)).status).toBe(400);
    blob.get.mockRejectedValueOnce(new Error('private fixture token'));
    expect(JSON.stringify((await result()).body)).not.toContain('private fixture token');
  });
  it('fenced injected transaction preserves every supported field and positive []', async () => {
    expect(await captureFenced(async () => ({ bytes: bytes([]), epoch: 'fixture', revision: 1 }))).toEqual(makeSnapshot('fixture', 1, []));
    expect(await captureFenced(async () => ({ bytes: bytes([entry]), epoch: 'fixture', revision: 2 }))).toEqual(makeSnapshot('fixture', 2, [entry]));
    await expect(captureFenced(async () => ({ bytes: bytes([entry, entry]), epoch: 'fixture', revision: 3 }))).rejects.toMatchObject({ code: 'duplicate_identity' });
    await expect(captureFenced(async () => ({ bytes: null, epoch: 'fixture', revision: 3 }))).rejects.toMatchObject({ code: 'missing' });
  });
});
