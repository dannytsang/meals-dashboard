// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ head: vi.fn(), put: vi.fn() }));
vi.mock('@vercel/blob', () => sdk);
const valid = { meal_date: '2030-01-01', meal_name: 'Synthetic', item_name: 'Synthetic', quantity: 1, reason: 'synthetic', status: 'covered', created_at: '', updated_at: '' };
beforeEach(() => {
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'synthetic-auth'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-blob');
  vi.resetModules(); vi.spyOn(console, 'error').mockImplementation(() => {}); sdk.put.mockReset();
});
afterEach(() => { expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('HOSTILE_PRIVATE_SENTINEL'); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const req = (method: string) => new Request('http://synthetic.invalid/api/overrides', { method, headers: { 'x-dashboard-secret': 'synthetic-auth', 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(valid) } : {}) }) as never;
it.each([{ snapshot: [] }, { snapshot: [valid] }])('positive valid authoritative snapshot is successful', async ({ snapshot }) => {
  sdk.head.mockResolvedValue({url: 'http://synthetic.invalid/blob'});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot))));
  const route = await import('./overrides/route'); const r = await route.GET(req('GET'));
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ok: true, overrides: snapshot});
});
it.each(['missing', 'transport', 'null', 'entry', 'duplicate', 'date', 'quantity'])('read and read-modify-write refuse %s authority', async fault => {
  sdk.head.mockResolvedValue(fault === 'missing' ? null : {url:'http://synthetic.invalid/blob'});
  let snapshot: unknown = null;
  if (fault === 'entry') snapshot = [{}];
  if (fault === 'duplicate') snapshot = [valid, valid];
  if (fault === 'date') snapshot = [{...valid, meal_date:'2030-02-30'}];
  if (fault === 'quantity') snapshot = [{...valid, quantity:true}];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => fault === 'transport' ? Promise.reject(new Error('HOSTILE_PRIVATE_SENTINEL')) : Promise.resolve(new Response(JSON.stringify(snapshot)))));
  const route = await import('./overrides/route');
  expect((await route.GET(req('GET'))).status).toBe(500);
  expect((await route.POST(req('POST'))).status).toBe(500);
  expect(sdk.put).not.toHaveBeenCalled();
});
