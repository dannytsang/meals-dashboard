// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_LIMITS, exportSource, hashBytes, POINTER, OVERRIDES, boundedBytes, category } from './source-export';
import { ADMISSION_PATH, SOURCE_EPOCH, SOURCE_NAMESPACE, SOURCE_REVISION_PATH } from './override-source-store';
import { makeSnapshot } from './override-snapshot';
import { parseExportJson } from './source-export-json';
import { createSourceExportReader } from './source-export-reader';
import * as route from '../app/api/internal/source-export/route';
import * as core from './source-export';
import { diagnosticFailure, ExportFailure, DIAGNOSTIC_STAGES, DIAGNOSTIC_CATEGORIES } from './source-export-diagnostic';

const sdk = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), del: vi.fn(), list: vi.fn(), head: vi.fn(), copy: vi.fn() }));
vi.mock('@vercel/blob', () => sdk);
const encode = (v: unknown) => Buffer.from(JSON.stringify(v));
const committedAt = '2030-01-01T00:00:00.000Z';
function setAdmittedOverrides(records: Map<string, Buffer>, bytes: Buffer): void {
  records.set(OVERRIDES, bytes);
  const entries = JSON.parse(bytes.toString()) as never[];
  const rawHash = hashBytes(bytes);
  let snapshotHash = '0'.repeat(64);
  try { snapshotHash = makeSnapshot(SOURCE_EPOCH, 1, entries, committedAt).hash; } catch { /* malformed fixture is rejected by the route */ }
  records.set(SOURCE_REVISION_PATH, encode({ version: 2, epoch: SOURCE_EPOCH, revision: 1, rawHash, committedAt }));
  records.set(ADMISSION_PATH, encode({ version: 1, namespace: SOURCE_NAMESPACE, release: 'a'.repeat(40), epoch: SOURCE_EPOCH,
    revision: 1, rawHash, hash: snapshotHash, count: entries.length, present: true, committedAt }));
}
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
  records.set(POINTER, encode({ manifestPath, productsManifestPath: productManifestPath })); setAdmittedOverrides(records, Buffer.from('[ ]\n'));
  return { records, manifestPath, summaryPath, productManifestPath };
}
type ScalarField = 'overrideStatus' | 'coverageStatus' | 'orderStatus' | 'tpnc' | 'sourceOrderBlobPath' | 'orderNumber' | 'mealId';
function scalarFixture(field: ScalarField, value: unknown) {
  const entry: Record<string, unknown> = { meal: { id: 'synthetic-meal', content: '', date: '2030-01-01', labels: [], section: '' }, status: 'covered', coverageScore: 1, matchedItems: [], missingItems: [] };
  const overrides = [{ meal_date: '2030-01-01', meal_name: 'Synthetic', item_name: 'Synthetic', quantity: 1, reason: 'synthetic', status: field === 'overrideStatus' ? value : 'covered', created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z' }];
  const result = fixture({ mutate: data => {
    const order = data['orders/2030-01-01/synthetic-2030-01-01.json'] as Record<string, unknown>;
    const coverage = data['coverage/2030-01-01.json'] as Record<string, unknown>;
    coverage.meals = [entry];
    if (field === 'coverageStatus') entry.status = value;
    if (field === 'mealId') (entry.meal as Record<string, unknown>).id = value;
    if (field === 'orderStatus') order.status = value;
    if (field === 'orderNumber') order.orderNumber = value;
    if (field === 'sourceOrderBlobPath') coverage.sourceOrderBlobPath = value;
    if (field === 'tpnc') {
      (order.items as Record<string, unknown>[])[0].tpnc = value;
      if (value === '00100') data['products/00100.json'] = product('00100');
    }
  } });
  setAdmittedOverrides(result.records, encode(overrides)); return result;
}
const invalidScalars: [ScalarField, unknown][] = [
  ['overrideStatus', ['covered']], ['coverageStatus', ['covered']], ['orderStatus', ['active']], ['tpnc', ['100']],
  ['sourceOrderBlobPath', ['orders/2030-01-01/synthetic-2030-01-01.json']], ['orderNumber', ['synthetic-2030-01-01']], ['mealId', ['synthetic-meal']],
  ...(['overrideStatus', 'coverageStatus', 'orderStatus', 'tpnc', 'sourceOrderBlobPath', 'orderNumber', 'mealId'] as const).flatMap(field => [false, 100, {}].map(value => [field, value] as [ScalarField, unknown])),
  ['overrideStatus', null], ['coverageStatus', null], ['orderStatus', null], ['overrideStatus', undefined], ['coverageStatus', undefined],
  ['tpnc', '100\n'], ['tpnc', '1e2'], ['tpnc', ''],
];
const validScalars: [ScalarField, unknown][] = [
  ...['covered', 'partial'].map(value => ['overrideStatus', value] as [ScalarField, unknown]),
  ...['covered', 'partial', 'missing', 'unknown'].map(value => ['coverageStatus', value] as [ScalarField, unknown]),
  ...['active', 'cancelled', 'superseded', 'refunded', undefined].map(value => ['orderStatus', value] as [ScalarField, unknown]),
  ...['100', '00100', null, undefined].map(value => ['tpnc', value] as [ScalarField, unknown]),
  ['sourceOrderBlobPath', null], ['sourceOrderBlobPath', 'orders/2030-01-01/synthetic-2030-01-01.json'],
  ['orderNumber', 'synthetic-2030-01-01'], ['mealId', 'synthetic-meal'],
];
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
    const archive = JSON.parse(text); expect(archive.atomicSnapshot).toBe(false); expect(archive.records).toHaveLength(f.records.size - 2);
    const paths = archive.records.map((r: { path: string }) => r.path); expect(paths).toEqual([...f.records.keys()].filter(p => ![ADMISSION_PATH, SOURCE_REVISION_PATH].includes(p)).sort());
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

describe.each([1, 2] as const)('closed diagnostic mode v%s', version => {
  const body = JSON.stringify({ version, mode: 'diagnose' });
  const envelope = (outcome: string, stage: string, category: string, invariant = 'none') => ({ format: `meal-planner-source-diagnostic.v${version}`, outcome, stage, category, ...(version === 2 ? { invariant } : {}) });
  const logs: ReturnType<typeof vi.spyOn>[] = [];
  beforeEach(() => { for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) logs.push(vi.spyOn(console, method)); });
  afterEach(() => {
    for (const name of ['put', 'del', 'list', 'head', 'copy'] as const) expect(sdk[name]).not.toHaveBeenCalled();
    for (const log of logs.splice(0)) { expect(log).not.toHaveBeenCalled(); log.mockRestore(); }
    vi.restoreAllMocks();
  });
  async function diagnostic(stage: string, cat: string, status = 422, stable = true) {
    const before = [...f.records].map(([p, b]) => [p, hashBytes(b)]);
    const r = await route.POST(request(body)), text = await r.text();
    expect(r.status).toBe(status);
    expect(JSON.parse(text)).toEqual(envelope(status === 200 ? 'valid' : status === 409 ? 'inconclusive' : status === 504 ? 'deadline' : 'incomplete', stage, cat));
    expect(r.headers.get('cache-control')).toContain('private, no-store'); expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(256);
    expect(r.headers.get('content-disposition')).toBeNull();
    const output = text + JSON.stringify([...r.headers]);
    for (const sentinel of ['SYNTHETIC_PRIVATE_SENTINEL', 'synthetic-blob-token', secret, 'synthetic-2030', 'private.invalid', 'products/100.json', f.manifestPath, hashBytes(f.records.get(POINTER) ?? '')]) expect(output).not.toContain(sentinel);
    if (stable) expect([...f.records].map(([p, b]) => [p, hashBytes(b)])).toEqual(before);
    for (const [, opts] of sdk.get.mock.calls) expect(opts).toMatchObject({ access: 'private', useCache: false, token: 'synthetic-blob-token' });
    return r;
  }
  function replaceManifest(value: unknown, products = false) {
    const bytes = encode(value), path = `meta/${products ? 'products-manifest' : 'manifest'}-${hashBytes(bytes)}.json`;
    f.records.set(path, bytes);
    const pointer = JSON.parse(f.records.get(POINTER)!.toString());
    pointer[products ? 'productsManifestPath' : 'manifestPath'] = path; f.records.set(POINTER, encode(pointer));
  }
  it.each(['pointer', 'dashboardManifest', 'productsManifest', 'summary', 'coverage', 'orders', 'products', 'overrides'])('missing %s is an attributed read failure', async cat => {
    const path = [...f.records.keys()].find(p => category(p) === cat)!; f.records.delete(path);
    await diagnostic('provider_read', cat);
    const original = await route.POST(request()); expect(await original.json()).toEqual({ error: 'incomplete' });
  });
  it.each([Buffer.from('{'), Buffer.from([255]), Buffer.from('{"x":1,"\\u0078":2}'), Buffer.from('1e999'), Buffer.from('['.repeat(70) + '0' + ']'.repeat(70))])('closes malformed JSON/UTF8/depth without a payload', async bytes => {
    f.records.set(OVERRIDES, bytes); await diagnostic('record_json', 'overrides');
  });
  it.each(invalidScalars)('preserves strict scalar rejection for %s = %j', async (field, value) => {
    f = scalarFixture(field, value);
    await diagnostic('record_schema', field === 'overrideStatus' ? 'overrides' : ['coverageStatus', 'mealId', 'sourceOrderBlobPath'].includes(field) ? 'coverage' : 'orders');
  });
  it.each(validScalars)('preserves legacy/null/string compatibility for %s = %j', async (field, value) => {
    f = scalarFixture(field, value); await diagnostic('complete', 'none', 200);
  });
  it.each([true, false])('preserves positively validated empty/independent graph %s', async empty => {
    f = fixture({ empty, independent: true }); await diagnostic('complete', 'none', 200);
  });
  it('attributes graph validation to the product manifest after products were read', async () => {
    f = fixture({ independent: true });
    replaceManifest({ 100: 'products/100.json', invalid: 'SYNTHETIC_PRIVATE_SENTINEL' }, true);
    await diagnostic('graph_schema', 'productsManifest');
    expect(sdk.get.mock.calls.at(-1)?.[0]).toBe('products/100.json');
  });
  it('attributes unsafe graph paths before reading them', async () => {
    replaceManifest({ '../SYNTHETIC_PRIVATE_SENTINEL': 'a'.repeat(64) }); await diagnostic('graph_schema', 'dashboardManifest');
    expect(sdk.get.mock.calls.some(([p]) => p.startsWith('../'))).toBe(false);
  });
  it('attributes missing summary cardinality without blaming overrides', async () => {
    replaceManifest({}); await diagnostic('graph_schema', 'summary'); expect(sdk.get.mock.calls.map(call => call[0])).toContain(OVERRIDES);
  });
  it('attributes a missing product reference to the order', async () => {
    f = fixture({ mutate: d => { ((d['orders/2030-01-01/synthetic-2030-01-01.json'] as Record<string, unknown>).items as Record<string, unknown>[])[0].tpnc = '999'; } });
    await diagnostic('references', 'orders');
  });
  it('attributes duplicate order identity to orders', async () => {
    f = fixture({ mutate: d => { (d['orders/2030-01-02/synthetic-2030-01-02.json'] as Record<string, unknown>).orderNumber = 'synthetic-2030-01-01'; } });
    await diagnostic('references', 'orders');
  });
  it.each(['products', 'summary'])('attributes content/path hash mismatch to %s', async cat => {
    const path = [...f.records.keys()].find(p => category(p) === cat)!;
    f.records.set(path, Buffer.concat([f.records.get(path)!, Buffer.from(' ')])); await diagnostic('integrity', cat);
  });
  it.each(['size', 'path', 'type', 'status', 'length', 'missingBlob'])('closes dishonest provider metadata %s', async kind => {
    sdk.get.mockImplementation((p: string) => {
      const r = mockGet(p)!;
      if (kind === 'size') r.blob.size = EXPORT_LIMITS.objectBytes + 1;
      if (kind === 'path') r.blob.pathname = 'SYNTHETIC_PRIVATE_SENTINEL';
      if (kind === 'type') r.blob.contentType = 'text/html';
      if (kind === 'status') r.statusCode = 304;
      if (kind === 'length') r.blob.size++;
      if (kind === 'missingBlob') Object.defineProperty(r, 'blob', { get() { throw new Error('SYNTHETIC_PRIVATE_SENTINEL'); } });
      return r;
    });
    await diagnostic(kind === 'size' ? 'source_bound' : 'provider_metadata', 'pointer');
  });
  it('bounds dishonest streamed bytes and cancels without leaking', async () => {
    const cancel = vi.fn(); sdk.get.mockResolvedValue({ statusCode: 200, blob: { pathname: POINTER, size: 1, contentType: 'application/json' }, stream: new ReadableStream({ start(c) { c.enqueue(Buffer.alloc(EXPORT_LIMITS.objectBytes + 1)); }, cancel }) });
    await diagnostic('source_bound', 'pointer'); expect(cancel).toHaveBeenCalled();
  });
  it('closes stream exceptions and rejected cancellation', async () => {
    sdk.get.mockResolvedValue({ statusCode: 200, blob: { pathname: POINTER, size: 1, contentType: 'application/json' }, stream: new ReadableStream({ pull() { throw new Error('SYNTHETIC_PRIVATE_SENTINEL'); }, cancel() { return Promise.reject(new Error('SYNTHETIC_PRIVATE_SENTINEL')); } }) });
    await diagnostic('provider_read', 'pointer');
  });
  it('bounds manifest entry count', async () => {
    f = fixture({ mutate: d => { for (let i = 0; i < 1001; i++) d[`products/${i + 1000}.json`] = product(String(i + 1000)); } });
    await diagnostic('source_bound', 'dashboardManifest');
  });
  it('bounds total records even when each manifest is within the cap', async () => {
    f = fixture({ empty: true, independent: true, mutate: d => { for (let i = 0; i < 998; i++) d[`products/${i + 1000}.json`] = product(String(i + 1000)); } });
    await diagnostic('source_bound', 'products');
  });
  it('bounds cumulative source bytes including rereads', async () => {
    f = fixture({ mutate: d => { for (const id of ['100', '101', '102']) d[`products/${id}.json`] = { ...product(id), description: 'x'.repeat(750000) }; } });
    await diagnostic('source_bound', 'products'); // includes the remaining-byte limit on reread
  });
  it.each(['cap', 'throw'])('applies archive serialization %s even though diagnosis discards it', async kind => {
    const original = JSON.stringify;
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
      if (value?.format === 'meal-planner-source-export.v1') {
        if (kind === 'throw') throw new Error('SYNTHETIC_PRIVATE_SENTINEL');
        return 'x'.repeat(EXPORT_LIMITS.responseBytes + 1);
      }
      return original(value, ...args);
    });
    try { await diagnostic('serialization', 'none'); } finally { stringify.mockRestore(); }
  });
  it.each(['pointer', 'productsManifest', 'products', 'overrides'])('attributes movement/disappearance to %s', async cat => {
    const path = [...f.records.keys()].find(p => category(p) === cat)!; let n = 0;
    sdk.get.mockImplementation((p: string) => {
      if (p === path && ++n === 2) { if (cat === 'pointer') return null; f.records.set(p, Buffer.concat([f.records.get(p)!, Buffer.from(' ')])); }
      return mockGet(p);
    });
    await diagnostic('consistency', cat, 409, false);
  });
  it('bounds SDK timeout and recovers for an unrelated next request', async () => {
    vi.useFakeTimers(); sdk.get.mockImplementation(() => new Promise(() => {}));
    const pending = diagnostic('provider_read', 'pointer', 504);
    await vi.advanceTimersByTimeAsync(EXPORT_LIMITS.milliseconds + 1); await pending;
    sdk.get.mockImplementation(mockGet); await diagnostic('complete', 'none', 200);
  });
  it('cancels stalled diagnostic streams at deadline', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    sdk.get.mockResolvedValue({ statusCode: 200, blob: { pathname: POINTER, size: 1, contentType: 'application/json' }, stream: new ReadableStream({ pull: () => new Promise(() => {}), cancel }) });
    const pending = diagnostic('provider_read', 'pointer', 504); await vi.advanceTimersByTimeAsync(EXPORT_LIMITS.milliseconds + 1); await pending; expect(cancel).toHaveBeenCalled();
  });
  it.each(['export', 'diagnose'])('isolates mixed concurrent calls while %s is in flight', async mode => {
    let started!: () => void; const entered = new Promise<void>(r => { started = r; });
    sdk.get.mockImplementation(() => { started(); return new Promise(() => {}); });
    const controller = new AbortController();
    const first = route.POST(new Request(request(mode === 'export' ? '{"version":1}' : body), { signal: controller.signal }));
    await entered;
    const busy = await route.POST(request(mode === 'export' ? body : '{"version":1}')); expect(busy.status).toBe(429); expect(await busy.json()).toEqual({ error: 'busy' });
    controller.abort(); const ended = await first; expect(ended.status).toBe(504);
    expect(await ended.json()).toEqual(mode === 'export' ? { error: 'deadline' } : envelope('deadline', 'provider_read', 'pointer'));
    sdk.get.mockImplementation(mockGet); f.records.set(OVERRIDES, Buffer.from('{'));
    await diagnostic('record_json', 'overrides'); const failedArchive = await route.POST(request()); expect(await failedArchive.json()).toEqual({ error: 'incomplete' });
    f = fixture(); await diagnostic('complete', 'none', 200); expect((await route.POST(request())).headers.get('content-disposition')).toContain('attachment');
  });
  it.each(['{"version":1,"mode":"other"}', '{"version":1,"mode":["diagnose"]}', '{"version":1,"mode":null}', '{"version":1,"mode":"diagnose","path":"private"}', '{"version":1,"mode":"diagnose","mode":"diagnose"}'])('denies nonexact diagnostic bodies', async input => {
    const r = await route.POST(request(input)); expect(r.status).toBe(400); expect(await r.json()).toEqual({ error: 'invalid_request' }); expect(sdk.get).not.toHaveBeenCalled();
  });
  it.each(['disabled', 'expired', 'unauthorized', 'encoded', 'query', 'oversized', 'aborted'])('preserves %s denial without diagnostic disclosure', async kind => {
    if (kind === 'disabled') vi.stubEnv('MEALS_SOURCE_EXPORT_ENABLED', '0');
    if (kind === 'expired') vi.stubEnv('MEALS_SOURCE_EXPORT_EXPIRES_AT', '2020-01-01T00:00:00Z');
    const req = request(body, kind === 'unauthorized' ? { 'x-source-export-secret': 'wrong' } : kind === 'encoded' ? { 'content-encoding': 'gzip' } : kind === 'oversized' ? { 'content-length': '257' } : {}, kind === 'query' ? '?private=1' : '');
    const controller = new AbortController(); if (kind === 'aborted') controller.abort();
    const r = await route.POST(new Request(req, { signal: controller.signal }));
    const code = ['disabled', 'expired'].includes(kind) ? 'unavailable' : kind === 'unauthorized' ? 'unauthorized' : kind === 'aborted' ? 'deadline' : 'invalid_request';
    expect(await r.json()).toEqual({ error: code }); expect(sdk.get).not.toHaveBeenCalled();
  });
  it('never inspects hostile thrown objects or trusts duck-typed failure codes', async () => {
    const touched = vi.fn(() => { throw new Error('SYNTHETIC_PRIVATE_SENTINEL'); });
    const hostile = new Proxy({}, { get: touched, getPrototypeOf: touched });
    for (const value of [undefined, null, 'SYNTHETIC_PRIVATE_SENTINEL', { code: 'deadline', stage: 'complete', category: 'products' }, hostile]) {
      sdk.get.mockRejectedValue(value); await diagnostic('provider_read', 'pointer');
      expect(diagnosticFailure(value, false, version)).toEqual(envelope('incomplete', 'unknown', 'none'));
    }
    expect(touched).not.toHaveBeenCalled();
    const exporter = vi.spyOn(core, 'exportSource').mockRejectedValue(hostile);
    try { await diagnostic('unknown', 'none'); expect(touched).not.toHaveBeenCalled(); } finally { exporter.mockRestore(); }
  });
  it('rejects invalid enum coercion and isolates immutable failure metadata', () => {
    const malformed = new ExportFailure(['deadline'] as never, ['complete'] as never, { toString: () => 'products' } as never);
    expect(diagnosticFailure(malformed, false, version)).toEqual(envelope('incomplete', 'unknown', 'none'));
    const good = new ExportFailure('inconclusive', 'consistency', 'overrides'); Object.assign(good, { code: 'SYNTHETIC_PRIVATE_SENTINEL', stage: 'complete', category: 'orders' });
    expect(diagnosticFailure(good, false, version)).toEqual(envelope('inconclusive', 'consistency', 'overrides'));
    expect(Object.isFrozen(DIAGNOSTIC_STAGES)).toBe(true); expect(Object.isFrozen(DIAGNOSTIC_CATEGORIES)).toBe(true);
  });
  it('validates without returning any archive or attachment', async () => {
    const r = await route.POST(request(body)); expect(r.status).toBe(200);
    expect(await r.json()).toEqual(envelope('valid', 'complete', 'none'));
    expect(r.headers.get('content-disposition')).toBeNull();
  });
  it('attributes the null products pointer to pointer schema, not primary cause', async () => {
    f.records.set(POINTER, encode({ manifestPath: f.manifestPath, productsManifestPath: null }));
    const r = await route.POST(request(body)); expect(r.status).toBe(422);
    expect(await r.json()).toEqual(envelope('incomplete', 'record_schema', 'pointer', 'products_null'));
    expect(sdk.get).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['object-null', 'pointer_object'], ['object-array', 'pointer_object'], ['object-string', 'pointer_object'],
    ['main-absent', 'main_absent'], ['main-null', 'main_invalid'], ['main-array', 'main_invalid'], ['main-number', 'main_invalid'], ['main-url', 'main_invalid'],
    ['products-absent', 'products_absent'], ['products-null', 'products_null'], ['products-array', 'products_invalid'], ['products-number', 'products_invalid'], ['products-url', 'products_invalid'],
    ['extra', 'pointer_keys'], ['proto', 'pointer_keys'],
  ])('attributes closed pointer invariant %s without reflecting fields', async (kind, invariant) => {
    let p: unknown = { manifestPath: f.manifestPath, productsManifestPath: f.productManifestPath };
    if (kind.startsWith('object-')) p = kind === 'object-null' ? null : kind === 'object-array' ? [] : 'SYNTHETIC_PRIVATE_SENTINEL';
    else if (kind === 'extra') (p as Record<string, unknown>).SYNTHETIC_PRIVATE_SENTINEL = 'private';
    else if (kind === 'proto') Object.defineProperty(p, '__proto__', { value: { private: true }, enumerable: true });
    else {
      const key = kind.startsWith('main-') ? 'manifestPath' : 'productsManifestPath';
      if (kind.endsWith('absent')) delete (p as Record<string, unknown>)[key];
      else (p as Record<string, unknown>)[key] = kind.endsWith('null') ? null : kind.endsWith('array') ? [f.manifestPath] : kind.endsWith('number') ? 12 : 'https://private.invalid/SYNTHETIC_PRIVATE_SENTINEL';
    }
    f.records.set(POINTER, encode(p)); const before = hashBytes(f.records.get(POINTER)!);
    const r = await route.POST(request(body)); expect(r.status).toBe(422);
    const text = await r.text(); expect(JSON.parse(text)).toEqual(envelope('incomplete', 'record_schema', 'pointer', invariant));
    expect(text).not.toContain('SYNTHETIC_PRIVATE_SENTINEL'); expect(Buffer.byteLength(text)).toBeLessThanOrEqual(256);
    expect(hashBytes(f.records.get(POINTER)!)).toBe(before); expect(sdk.get).toHaveBeenCalledTimes(1);
    const original = await route.POST(request()); expect(await original.json()).toEqual({ error: 'incomplete' });
  });
  it('keeps invalid JSON distinct from pointer schema', async () => {
    f.records.set(POINTER, Buffer.from('{')); await diagnostic('record_json', 'pointer');
  });
  it.each(['{"version":2}', '{"version":"2","mode":"diagnose"}', '{"version":[2],"mode":"diagnose"}', '{"version":2,"mode":"export"}', '{"version":2,"mode":["diagnose"]}', '{"version":2,"mode":"diagnose","extra":true}', '{"version":2,"mode":"diagnose","version":2}'])('denies nonexact v2 request %s', async input => {
    const r = await route.POST(request(input)); expect(r.status).toBe(400); expect(await r.json()).toEqual({ error: 'invalid_request' }); expect(sdk.get).not.toHaveBeenCalled();
  });
  it('keeps invariant metadata private, closed and tied to actual pointer site', () => {
    const touched = vi.fn(() => { throw new Error('SYNTHETIC_PRIVATE_SENTINEL'); });
    for (const spoof of [['products_null'], { toString: touched }, new Proxy({}, { get: touched })]) {
      const e = new ExportFailure('incomplete', 'record_schema', 'pointer', spoof as never);
      expect(diagnosticFailure(e, false, version)).toEqual(envelope('incomplete', 'record_schema', 'pointer'));
    }
    const e = new ExportFailure('incomplete', 'record_schema', 'pointer', 'products_absent');
    Object.assign(e, { invariant: 'SYNTHETIC_PRIVATE_SENTINEL', category: 'products' });
    expect(diagnosticFailure(e, false, version)).toEqual(envelope('incomplete', 'record_schema', 'pointer', 'products_absent'));
    expect(diagnosticFailure(new ExportFailure('incomplete', 'provider_read', 'pointer', 'products_null'), false, version)).toEqual(envelope('incomplete', 'provider_read', 'pointer'));
    expect(diagnosticFailure({ invariant: 'products_null', category: 'pointer', stage: 'record_schema' }, false, version)).toEqual(envelope('incomplete', 'unknown', 'none'));
    expect(touched).not.toHaveBeenCalled();
  });
  it('attributes references to coverage even after reading overrides', async () => {
    f = fixture({ mutate: d => { (d['coverage/2030-01-01.json'] as Record<string, unknown>).sourceOrderBlobPath = 'orders/2030-01-01/missing.json'; } });
    const r = await route.POST(request(body)); expect(r.status).toBe(422);
    expect(sdk.get.mock.calls.map(call => call[0])).toContain(OVERRIDES);
    expect(await r.json()).toEqual(envelope('incomplete', 'references', 'coverage'));
  });
});

describe('graph completeness, strict data and bounded fresh reads', () => {
  it.each(invalidScalars)('rejects malformed scalar %s = %j with no archive or mutation', async (field, value) => {
    f = scalarFixture(field, value); const before = [...f.records].map(([path, bytes]) => [path, hashBytes(bytes)]);
    const r = await route.POST(request()); expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: 'incomplete' }); expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('content-disposition')).toBeNull();
    expect([...f.records].map(([path, bytes]) => [path, hashBytes(bytes)])).toEqual(before);
    for (const name of ['put', 'del', 'list', 'head', 'copy'] as const) expect(sdk[name]).not.toHaveBeenCalled();
  });
  it.each(validScalars)('preserves valid scalar/optional compatibility %s = %j', async (field, value) => {
    f = scalarFixture(field, value); const r = await route.POST(request()); expect(r.status).toBe(200);
    const archive = await r.json();
    for (const rec of archive.records) expect(Buffer.from(rec.base64, 'base64')).toEqual(f.records.get(rec.path));
  });
  it('exports independent products and positively verified empty state', async () => {
    f = fixture({ independent: true }); expect((await route.POST(request())).status).toBe(200);
    f = fixture({ empty: true }); const r = await route.POST(request()); expect(r.status).toBe(200); const a = await r.json(); expect(a.records).toHaveLength(5);
    expect(Buffer.from(a.records.find((r: { path: string }) => r.path === OVERRIDES).base64, 'base64').toString()).toBe('[ ]\n');
  });
  it.each([POINTER, 'manifest', 'summary', 'productsManifest', 'products/100.json', OVERRIDES, 'coverage/2030-01-01.json', 'orders/2030-01-01/synthetic-2030-01-01.json'])('missing %s cannot become empty/success', async path => {
    f.records.delete(path === 'manifest' ? f.manifestPath : path === 'summary' ? f.summaryPath : path === 'productsManifest' ? f.productManifestPath : path);
    const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
  });
  it.each([ADMISSION_PATH, SOURCE_REVISION_PATH])('fails closed when v3 control object %s is missing', async path => {
    f.records.delete(path);
    const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
  });
  it('fails closed when the v3 admission marker does not bind current authority bytes', async () => {
    f.records.set(ADMISSION_PATH, encode({ unknown: true }));
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
