// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_LIMITS, exportSource, hashBytes, POINTER, OVERRIDES, boundedBytes, category } from './source-export';
import { parseExportJson } from './source-export-json';
import { createSourceExportReader } from './source-export-reader';
import * as route from '../app/api/internal/source-export/route';

const sdk = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), del: vi.fn(), list: vi.fn(), head: vi.fn(), copy: vi.fn() }));
vi.mock('@vercel/blob', () => sdk);
const encode = (v: unknown) => Buffer.from(JSON.stringify(v));
const secret = 'ab'.repeat(32); // synthetic only
const product = (id: string) => ({ tpnc: id, gtin: null, tpnb: null, ...Object.fromEntries(['title', 'description', 'storage', 'preparation', 'ingredients', 'allergens', 'nutrition', 'brand', 'category', 'imageUrl', 'productUrl', 'source', 'lastFetched'].map(k => [k, ''])) });
export function fixture(options: { empty?: boolean; mutate?: (data: Record<string, unknown>) => void; independent?: boolean } = {}) {
  const records = new Map<string, Buffer>(); const data: Record<string, unknown> = {};
  if (!options.empty) for (const day of ['2030-01-01', '2030-01-02']) {
    data[`orders/${day}/synthetic-${day}.json`] = { orderNumber: `synthetic-${day}`, deliveryDate: day, deliverySlot: '', orderTotal: 0, items: [{ name: 'SYNTHETIC_PRIVATE_SENTINEL', quantity: 1, tpnc: '100' }], substitutions: [], unavailable: [], shortLifeItems: [] };
    data[`coverage/${day}.json`] = { date: day, sourceOrderBlobPath: `orders/${day}/synthetic-${day}.json`, meals: [] };
  }
  if (!options.empty) data['products/100.json'] = product('100');
  options.mutate?.(data);
  const manifest: Record<string, string> = {};
  for (const [path, value] of Object.entries(data)) { const bytes = encode(value); records.set(path, bytes); if (!options.independent || !path.startsWith('products/')) manifest[path] = hashBytes(bytes); }
  const summary = encode({ coverage_percentage: 0, covered: 0, missing: 0, meals_total: 0, meals_covered: 0, order_total: 0, delivery_date: '', windows: { last_delivery: null, next_delivery: null, next_window_end: null } });
  const summaryPath = `meta/summary-${hashBytes(summary)}.json`; records.set(summaryPath, summary); manifest[summaryPath] = hashBytes(summary);
  const pm = encode(Object.fromEntries(Object.keys(data).filter(p => p.startsWith('products/')).map(p => [p.split('/')[1].split('.')[0], p])));
  const productManifestPath = `meta/products-manifest-${hashBytes(pm)}.json`; records.set(productManifestPath, pm);
  if (!options.independent) manifest[productManifestPath] = hashBytes(pm);
  const m = encode(manifest), manifestPath = `meta/manifest-${hashBytes(m)}.json`; records.set(manifestPath, m);
  records.set(POINTER, encode({ manifestPath, productsManifestPath: productManifestPath })); records.set(OVERRIDES, Buffer.from('[ ]\n'));
  return { records, manifestPath, summaryPath, productManifestPath };
}
let f = fixture();
function mockGet(path: string) {
  const bytes = f.records.get(path); if (!bytes) return null;
  return { statusCode: 200, stream: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }), blob: { pathname: path, size: bytes.length, contentType: 'application/json' } };
}
function request(body = '{"version":1}', headers: Record<string, string> = {}, suffix = '') {
  return new Request(`https://synthetic.invalid/api/internal/source-export${suffix}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-source-export-secret': secret, ...headers }, body });
}
beforeEach(() => {
  vi.resetAllMocks(); f = fixture(); sdk.get.mockImplementation(mockGet);
  vi.stubEnv('MEALS_SOURCE_EXPORT_ENABLED', '1'); vi.stubEnv('MEALS_SOURCE_EXPORT_SECRET', secret);
  vi.stubEnv('MEALS_SOURCE_EXPORT_EXPIRES_AT', '2099-01-01T00:00:00Z'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-blob-token');
  for (const k of ['MEALS_DASHBOARD_DATA_SECRET', 'MEALS_PUBLICATION_VERIFY_SECRET', 'NEXTAUTH_SECRET']) vi.stubEnv(k, 'synthetic-other');
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('export route authorization, privacy and nonmutation', () => {
  it.each([
    ['MEALS_SOURCE_EXPORT_ENABLED', ''], ['MEALS_SOURCE_EXPORT_SECRET', ''], ['MEALS_SOURCE_EXPORT_SECRET', 'weak'],
    ['MEALS_SOURCE_EXPORT_SECRET', secret + '\n'], ['BLOB_READ_WRITE_TOKEN', ''], ['MEALS_SOURCE_EXPORT_EXPIRES_AT', ''],
    ['MEALS_SOURCE_EXPORT_EXPIRES_AT', 'invalid'], ['MEALS_SOURCE_EXPORT_EXPIRES_AT', '2020-01-01T00:00:00Z'],
    ['MEALS_DASHBOARD_DATA_SECRET', secret], ['MEALS_PUBLICATION_VERIFY_SECRET', secret], ['NEXTAUTH_SECRET', secret], ['BLOB_READ_WRITE_TOKEN', secret],
  ])('fails closed without metadata for config %s', async (key, value) => {
    vi.stubEnv(key, value); const r = await route.POST(request()); expect(r.status).toBe(404); expect(await r.json()).toEqual({ error: 'unavailable' }); expect(sdk.get).not.toHaveBeenCalled();
  });
  it.each(['', 'wrong', 'x'.repeat(1025)])('denies missing/wrong/excessive secret', async supplied => {
    const r = await route.POST(request(undefined, { 'x-source-export-secret': supplied, cookie: 'next-auth.session-token=synthetic', 'x-dashboard-secret': secret }));
    expect(r.status).toBe(401); expect(await r.json()).toEqual({ error: 'unauthorized' }); expect(sdk.get).not.toHaveBeenCalled();
  });
  it('does not authorize URL credentials or browser cookies', async () => {
    const r = await route.POST(request(undefined, { 'x-source-export-secret': '', cookie: 'synthetic' }, '?token=synthetic'));
    expect(r.status).toBe(401); expect(sdk.get).not.toHaveBeenCalled();
  });
  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const)('denies %s without reading storage', async method => {
    const r = route[method](); expect(r.status).toBe(404); expect(r.headers.get('cache-control')).toContain('no-store'); expect(sdk.get).not.toHaveBeenCalled();
  });
  it.each(['{}', 'null', '{"version":2}', '{"version":1,"path":"../private"}', '{"version":1,"version":1}', '{', ' '.repeat(257)])('rejects invalid/bounded body', async body => {
    expect((await route.POST(request(body))).status).toBe(400); expect(sdk.get).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ 'content-type': 'text/plain' }, { 'content-encoding': 'gzip' }, { 'content-length': '257' }, { 'content-length': 'wat' }])('rejects unsupported body headers', async headers => {
    expect((await route.POST(request(undefined, headers))).status).toBe(400); expect(sdk.get).not.toHaveBeenCalled();
  });
  it('rejects query even with valid header and a null body', async () => {
    expect((await route.POST(request(undefined, {}, '?path=private'))).status).toBe(400);
    expect((await route.POST(new Request('https://synthetic.invalid', { method: 'POST', headers: { 'content-type': 'application/json', 'x-source-export-secret': secret } }))).status).toBe(400);
    expect(sdk.get).not.toHaveBeenCalled();
  });
  it('exports exact deterministic bytes/history with no writes, listings, household logs or provider metadata', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    const before = [...f.records].map(([p, b]) => [p, hashBytes(b)]);
    const a = await route.POST(request()), text = await a.text(), b = await route.POST(request());
    expect(a.status).toBe(200); expect(await b.text()).toBe(text);
    expect(a.headers.get('content-type')).toContain('application/json'); expect(a.headers.get('cache-control')).toContain('no-store'); expect(a.headers.get('content-disposition')).toContain('attachment');
    expect(text).not.toContain('synthetic-blob-token'); expect(text).not.toContain(secret); expect(text).not.toContain('downloadUrl');
    const archive = JSON.parse(text); expect(archive.atomicSnapshot).toBe(false); expect(archive.records).toHaveLength(f.records.size);
    const paths = archive.records.map((r: { path: string }) => r.path); expect(paths).toEqual([...f.records.keys()].sort());
    expect(paths.filter((p: string) => p.startsWith('orders/'))).toHaveLength(2);
    for (const r of archive.records) { expect(Buffer.from(r.base64, 'base64')).toEqual(f.records.get(r.path)); expect(r.sha256).toBe(hashBytes(f.records.get(r.path)!)); expect(r.identity).toBe(hashBytes(r.path)); expect(r.bytes).toBe(f.records.get(r.path)!.length); }
    expect([...f.records].map(([p, b]) => [p, hashBytes(b)])).toEqual(before);
    for (const name of ['put', 'del', 'list', 'head', 'copy'] as const) expect(sdk[name]).not.toHaveBeenCalled();
    for (const log of logs) { expect(log).not.toHaveBeenCalled(); log.mockRestore(); }
    for (const [, opts] of sdk.get.mock.calls) expect(opts).toMatchObject({ access: 'private', useCache: false, token: 'synthetic-blob-token' });
  });
  it('denies concurrent export and releases its slot on abort', async () => {
    sdk.get.mockImplementation(() => new Promise(() => {})); const controller = new AbortController();
    const first = route.POST(new Request(request(), { signal: controller.signal }));
    expect((await route.POST(request())).status).toBe(429); controller.abort(); expect((await first).status).toBe(504);
    sdk.get.mockImplementation(mockGet); expect((await route.POST(request())).status).toBe(200);
  });
  it('bounds hung SDK and request-body reads by deadline', async () => {
    vi.useFakeTimers(); sdk.get.mockImplementation(() => new Promise(() => {})); const pending = route.POST(request());
    await vi.advanceTimersByTimeAsync(EXPORT_LIMITS.milliseconds + 1); expect((await pending).status).toBe(504);
    const req = new Request('https://synthetic.invalid', { method: 'POST', headers: { 'content-type': 'application/json', 'x-source-export-secret': secret }, body: new ReadableStream({ pull: () => new Promise(() => {}) }), duplex: 'half' } as RequestInit);
    const next = route.POST(req); await vi.advanceTimersByTimeAsync(EXPORT_LIMITS.milliseconds + 1); expect((await next).status).toBe(504);
  });
});

describe('graph completeness, strict data and bounded fresh reads', () => {
  it('exports independent products and positively verified empty state', async () => {
    f = fixture({ independent: true }); expect((await route.POST(request())).status).toBe(200);
    f = fixture({ empty: true }); const r = await route.POST(request()); expect(r.status).toBe(200); const a = await r.json(); expect(a.records).toHaveLength(5);
    expect(Buffer.from(a.records.find((r: { path: string }) => r.path === OVERRIDES).base64, 'base64').toString()).toBe('[ ]\n');
  });
  it.each([POINTER, 'manifest', 'summary', 'productsManifest', 'products/100.json', OVERRIDES, 'coverage/2030-01-01.json', 'orders/2030-01-01/synthetic-2030-01-01.json'])('missing %s cannot become empty/success', async path => {
    f.records.delete(path === 'manifest' ? f.manifestPath : path === 'summary' ? f.summaryPath : path === 'productsManifest' ? f.productManifestPath : path);
    const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
  });
  it.each([undefined, null, 'https://synthetic.invalid/private'])('requires explicit valid independent product manifest %s', async value => {
    f.records.set(POINTER, encode({ manifestPath: f.manifestPath, productsManifestPath: value })); expect((await route.POST(request())).status).toBe(422);
  });
  it.each(['{}', '[{"meal_date":"invalid"}]', '{"a":1,"a":2}', '1e999', '[', 'null'])('rejects corrupt/malformed override %s', async raw => {
    f.records.set(OVERRIDES, Buffer.from(raw)); expect((await route.POST(request())).status).toBe(422);
  });
  it.each([POINTER, 'products/100.json', OVERRIDES, 'coverage/2030-01-01.json'])('detects pointer or in-place %s movement', async path => {
    let n = 0; sdk.get.mockImplementation((p: string) => {
      if (p === path && ++n === 2) f.records.set(path, Buffer.concat([f.records.get(path)!, Buffer.from(' ')])); return mockGet(p);
    });
    const r = await route.POST(request()); expect(r.status).toBe(409); expect(await r.json()).toEqual({ error: 'inconclusive' });
  });
  it.each([POINTER, OVERRIDES, 'productsManifest'])('reports disappearing or moving %s as inconclusive', async kind => {
    const path = kind === 'productsManifest' ? f.productManifestPath : kind; let n = 0;
    sdk.get.mockImplementation((p: string) => {
      if (p === path && ++n === 2) {
        if (kind === 'productsManifest') f.records.set(path, Buffer.concat([f.records.get(path)!, Buffer.from(' ')]));
        else f.records.delete(path);
      }
      return mockGet(p);
    });
    const r = await route.POST(request()); expect(r.status).toBe(409); expect(await r.json()).toEqual({ error: 'inconclusive' });
  });
  it('distinguishes storage failures from true empty and sanitizes provider errors', async () => {
    sdk.get.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_SENTINEL https://private.invalid/?token=synthetic'));
    const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
  });
  it('rejects schema and cross-reference corruption even with matching hashes', async () => {
    for (const mutate of [
      (d: Record<string, unknown>) => { d['coverage/2030-01-01.json'] = {}; },
      (d: Record<string, unknown>) => { (d['coverage/2030-01-01.json'] as Record<string, unknown>).sourceOrderBlobPath = 'orders/2030-01-01/missing.json'; },
      (d: Record<string, unknown>) => { (d['orders/2030-01-02/synthetic-2030-01-02.json'] as Record<string, unknown>).orderNumber = 'synthetic-2030-01-01'; },
      (d: Record<string, unknown>) => { d['products/100.json'] = product('999'); },
    ]) { f = fixture({ mutate }); expect((await route.POST(request())).status).toBe(422); }
  });
  it('rejects hash mismatches and unsupported/cyclic/traversal manifest references before reading them', async () => {
    const m = encode({ '../private.json': 'a'.repeat(64) }), path = `meta/manifest-${hashBytes(m)}.json`;
    f.records.set(path, m); f.records.set(POINTER, encode({ manifestPath: path, productsManifestPath: f.productManifestPath }));
    expect((await route.POST(request())).status).toBe(422); expect(sdk.get.mock.calls.some(([p]) => p === '../private.json')).toBe(false);
    f = fixture(); f.records.set('products/100.json', Buffer.concat([f.records.get('products/100.json')!, Buffer.from(' ')])); expect((await route.POST(request())).status).toBe(422);
    expect(category('orders/2030-01-01/name.json\n')).toBe(null);
  });
  it('bounds object count without silently truncating', async () => {
    f = fixture({ mutate: d => { for (let i = 0; i < 1001; i++) d[`products/${i + 1000}.json`] = product(String(i + 1000)); } });
    expect((await route.POST(request())).status).toBe(422);
  });
  it('bounds total bytes INCLUDING consistency rereads', async () => {
    f = fixture({ mutate: d => { for (const id of ['100', '101', '102']) d[`products/${id}.json`] = { ...product(id), description: 'x'.repeat(750000) }; } });
    expect((await route.POST(request())).status).toBe(422);
  });
  it('rejects oversized object before or during streaming, wrong path/type/size and non-200', async () => {
    for (const mutate of [
      (r: ReturnType<typeof mockGet>) => { r!.blob.size = EXPORT_LIMITS.objectBytes + 1; },
      (r: ReturnType<typeof mockGet>) => { r!.blob.pathname = 'other'; },
      (r: ReturnType<typeof mockGet>) => { r!.blob.contentType = 'text/html'; },
      (r: ReturnType<typeof mockGet>) => { r!.blob.size++; },
      (r: ReturnType<typeof mockGet>) => { r!.statusCode = 304; },
    ]) { sdk.get.mockImplementation((p: string) => { const r = mockGet(p); mutate(r); return r; }); expect((await route.POST(request())).status).toBe(422); }
    const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(Buffer.alloc(EXPORT_LIMITS.objectBytes + 1)); }, cancel });
    sdk.get.mockResolvedValue({ statusCode: 200, stream, blob: { pathname: POINTER, contentType: 'application/json', size: 10 } });
    expect((await route.POST(request())).status).toBe(422); expect(cancel).toHaveBeenCalled();
  });
  it('cancels a hung stream at deadline', async () => {
    const cancel = vi.fn(), controller = new AbortController();
    const pending = boundedBytes(new ReadableStream({ pull: () => new Promise(() => {}), cancel }), 10, controller.signal);
    controller.abort(); await expect(pending).rejects.toThrow('deadline'); expect(cancel).toHaveBeenCalled();
  });
  it('read adapter rejects an arbitrary URL without an SDK call', async () => {
    await expect(createSourceExportReader('synthetic')('https://synthetic.invalid', 10, new AbortController().signal)).rejects.toThrow('incomplete'); expect(sdk.get).not.toHaveBeenCalled();
  });
  it('strict JSON rejects duplicate decoded keys, invalid UTF-8, deep/nonfinite data', () => {
    for (const b of [Buffer.from('{"a":1,"\\u0061":2}'), Buffer.from([255]), Buffer.from('['.repeat(70) + '0' + ']'.repeat(70)), Buffer.from('1e999')]) expect(() => parseExportJson(b)).toThrow('invalid_json');
  });
  it('core checks dishonest reader bounds too', async () => {
    await expect(exportSource(async () => Buffer.alloc(EXPORT_LIMITS.objectBytes + 1), new AbortController().signal)).rejects.toThrow('incomplete');
  });
});
