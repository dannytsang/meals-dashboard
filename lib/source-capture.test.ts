// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureSource } from './source-capture';
import { EXPORT_LIMITS, hashBytes, OVERRIDES, POINTER } from './source-export';
import * as route from '../app/api/internal/source-export/route';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const sdk = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), del: vi.fn(), list: vi.fn(), head: vi.fn(), copy: vi.fn() }));
vi.mock('@vercel/blob', () => sdk);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const secret = 'ab'.repeat(32); // synthetic only
function fixture(options: { pointer?: 'absent' | 'null' | 'referenced'; overrides?: unknown; data?: Record<string, unknown>; manifest?: Record<string, string> } = {}) {
  const records = new Map<string, Buffer>();
  const summary = encode({ rawLegacySummary: true });
  const summaryPath = `meta/summary-${hashBytes(summary)}.json`;
  records.set(summaryPath, summary);
  const data = options.data ?? {
    'orders/2030-01-01/legacy.json': { orderId: 'legacy', items: [{ name: 'SYNTHETIC_CAPTURE_PRIVATE', qty: '2 kg', tpnc: '00100', productBlobPath: 'products/00100.json' }] },
    'coverage/2030-01-01.json': { meals: [], sourceOrderBlobPath: 'orders/2030-01-01/legacy.json' },
    'products/00100.json': { arbitraryProduct: 'SYNTHETIC_CAPTURE_PRIVATE' },
  };
  const manifest: Record<string, string> = { [summaryPath]: hashBytes(summary), ...options.manifest };
  for (const [path, value] of Object.entries(data)) { const bytes = encode(value); records.set(path, bytes); if (!path.startsWith('products/')) manifest[path] = hashBytes(bytes); }
  const pm = encode({ '00100': 'products/00100.json' }), pmPath = `meta/products-manifest-${hashBytes(pm)}.json`;
  records.set(pmPath, pm); // orphan unless explicitly referenced; never implies history complete
  const rawManifest = encode(manifest), manifestPath = `meta/manifest-${hashBytes(rawManifest)}.json`;
  records.set(manifestPath, rawManifest);
  const pointer: Record<string, unknown> = { manifestPath };
  if (options.pointer !== 'absent') pointer.productsManifestPath = options.pointer === 'referenced' ? pmPath : null;
  records.set(POINTER, encode(pointer)); records.set(OVERRIDES, encode(options.overrides ?? []));
  return { records, summaryPath, manifestPath, pmPath };
}
let f = fixture();
const request = (body = '{"version":2,"mode":"compatibility"}', headers: Record<string, string> = {}, suffix = '') => new Request(`https://synthetic.invalid/api/internal/source-export${suffix}`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-source-export-secret': secret, ...headers } });
beforeEach(() => {
  vi.resetAllMocks(); f = fixture();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
  for (const name of ['log', 'error', 'warn'] as const) vi.spyOn(console, name).mockImplementation(() => {});
  vi.stubEnv('MEALS_SOURCE_EXPORT_ENABLED', '1'); vi.stubEnv('MEALS_SOURCE_EXPORT_SECRET', secret);
  vi.stubEnv('MEALS_SOURCE_EXPORT_EXPIRES_AT', '2099-01-01T00:00:00Z'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-blob');
  for (const key of ['MEALS_DASHBOARD_DATA_SECRET', 'MEALS_PUBLICATION_VERIFY_SECRET', 'NEXTAUTH_SECRET']) vi.stubEnv(key, 'synthetic-other');
  sdk.get.mockImplementation(async (path: string) => {
    const bytes = f.records.get(path); return bytes ? { statusCode: 200, blob: { pathname: path, size: bytes.length, contentType: 'application/json' }, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) } : null;
  });
});
afterEach(() => {
  for (const key of ['put', 'del', 'list', 'head', 'copy']) expect(sdk[key as keyof typeof sdk]).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  for (const name of ['log', 'error', 'warn'] as const) expect(console[name]).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});
const capture = () => captureSource(async p => f.records.get(p) ?? null, new AbortController().signal);

it.each(['absent', 'null', 'referenced'] as const)('preserves %s product pointer and derives products without completeness claims', async pointer => {
  f = fixture({ pointer }); const before = [...f.records].map(([p, b]) => [p, Buffer.from(b)]);
  const result = await capture();
  expect(result.assessment).toMatchObject({ productPointer: pointer, historicalCompleteness: 'not-inventoried', behaviorParity: 'not-certified', recordValidation: 'raw-json-not-application-schema', importReady: false });
  expect(result.records.some(r => r.path === 'products/00100.json')).toBe(true);
  expect(result.records.some(r => r.path === f.pmPath)).toBe(pointer === 'referenced');
  for (const record of result.records) expect(Buffer.from(record.base64, 'base64')).toEqual(f.records.get(record.path));
  expect([...f.records]).toEqual(before);
});
it.each([{ overrides: [] }, { overrides: [{ unsupportedApplicationValue: ['preserved', 3] }] }])('derives positive override presence, never application validity', async ({ overrides }) => {
  f = fixture({ overrides }); const result = await capture();
  expect(result.assessment.overrides).toBe(overrides.length ? 'present-nonempty' : 'present-empty');
  expect(result.assessment.recordValidation).toBe('raw-json-not-application-schema');
});
it('traverses coverage-only orders and path-only legacy products', async () => {
  f = fixture({ data: { 'coverage/2030-01-01.json': { meals: [], sourceOrderBlobPath: 'orders/2030-01-01/derived.json' } } });
  f.records.set('orders/2030-01-01/derived.json', encode({ orderId: 'raw', items: [{ qty: '1 ea', productBlobPath: 'products/777.json' }] }));
  f.records.set('products/777.json', encode({ raw: true }));
  const result = await capture();
  expect(result.records.filter(r => r.category === 'orders')).toHaveLength(1);
  expect(result.records.filter(r => r.category === 'products').map(r => r.path)).toEqual(['products/777.json']);
});
it('retains a main-linked products manifest even without products pointer', async () => {
  const pm = encode({ '777': 'products/777.json' }); const path = `meta/products-manifest-${hashBytes(pm)}.json`;
  f = fixture({ pointer: 'absent', data: {}, manifest: { [path]: hashBytes(pm) } });
  f.records.set(path, pm); f.records.set('products/777.json', encode({ raw: true }));
  const result = await capture(); expect(result.records.some(r => r.path === path)).toBe(true);
  expect(result.assessment.productPointer).toBe('absent'); expect(result.assessment.historicalCompleteness).toBe('not-inventoried');
});
it.each(['summary-unreferenced', 'bad-utf8', 'missing-declared-products', 'bad-overrides'])('refuses %s without fabricating a capture', async kind => {
  if (kind === 'summary-unreferenced') { const m = encode({}); const path = `meta/manifest-${hashBytes(m)}.json`; f.records.set(path, m); f.records.set(POINTER, encode({ manifestPath: path })); }
  if (kind === 'bad-utf8') f.records.set(OVERRIDES, Buffer.from([0xff]));
  if (kind === 'missing-declared-products') { f = fixture({ pointer: 'referenced' }); f.records.delete(f.pmPath); }
  if (kind === 'bad-overrides') f.records.set(OVERRIDES, encode({ overrides: [] }));
  const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
});
it('empty category counts do not invent history completeness', async () => {
  f = fixture({ data: {}, pointer: 'absent' }); expect((await capture()).records).toHaveLength(4);
});
it.each(['pointer', 'summary', 'manifest', 'product', 'order', 'overrides'])('missing %s fails closed without capture', async missing => {
  const path = { pointer: POINTER, summary: f.summaryPath, manifest: f.manifestPath, product: 'products/00100.json', order: 'orders/2030-01-01/legacy.json', overrides: OVERRIDES }[missing]!;
  f.records.delete(path); const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
});
it.each([false, 100, [], {}, '100\r', '100\n', '', '../private'])('rejects invalid typed product reference %j', async tpnc => {
  f = fixture({ data: { 'orders/2030-01-01/legacy.json': { items: [{ tpnc }] } } });
  await expect(capture()).rejects.toThrow();
});
it('rejects contradictory product path', async () => {
  f = fixture({ data: { 'orders/2030-01-01/legacy.json': { items: [{ tpnc: '100', productBlobPath: 'products/200.json' }] }, 'products/100.json': {}, 'products/200.json': {} } });
  await expect(capture()).rejects.toThrow();
});
it.each([null, [], false, { items: null }, { items: [null] }])('refuses untraversable order %j', async value => {
  f = fixture({ data: { 'orders/2030-01-01/legacy.json': value } }); await expect(capture()).rejects.toThrow();
});
it.each(['{"manifestPath":1,"manifestPath":2}', '{', '[ ]', '{"x":1e999}', '\ufeff{}'])('strict pointer JSON rejects %s', async raw => {
  f.records.set(POINTER, Buffer.from(raw)); const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
});
it.each(['extra-pointer-key', 'main-hash', 'content-hash', 'missing-summary', 'bad-coverage-reference', 'bad-product-manifest'])('fails integrity/graph %s', async kind => {
  if (kind === 'extra-pointer-key') f.records.set(POINTER, encode({ ...JSON.parse(f.records.get(POINTER)!.toString()), unknown: true }));
  if (kind === 'main-hash') f.records.set(f.manifestPath, Buffer.from('{}'));
  if (kind === 'content-hash') f.records.set('orders/2030-01-01/legacy.json', Buffer.from('{"items":[]}'));
  if (kind === 'missing-summary') { f.records.delete(f.summaryPath); }
  if (kind === 'bad-coverage-reference') f = fixture({ data: { 'coverage/2030-01-01.json': { meals: [], sourceOrderBlobPath: ['orders/2030-01-01/legacy.json'] } } });
  if (kind === 'bad-product-manifest') { f = fixture({ pointer: 'referenced' }); f.records.set(f.pmPath, encode({ bad: 'products/100.json' })); }
  await expect(capture()).rejects.toThrow();
});
it.each(['pointer', 'product', 'overrides', 'disappearance'])('reread %s movement is inconclusive and does not retry', async kind => {
  const counts = new Map<string, number>(); const target = kind === 'pointer' ? POINTER : kind === 'overrides' ? OVERRIDES : 'products/00100.json';
  await expect(captureSource(async p => { const n = (counts.get(p) ?? 0) + 1; counts.set(p, n); return p === target && n === 2 ? kind === 'disappearance' ? null : Buffer.from('{} ') : f.records.get(p) ?? null; }, new AbortController().signal)).rejects.toThrow('inconclusive');
  expect(Math.max(...counts.values())).toBe(2);
});
it('mutable provider buffers cannot rewrite previously observed bytes', async () => {
  let first = true; const pointer = f.records.get(POINTER)!;
  await expect(captureSource(async p => { if (p !== POINTER && first) { first = false; pointer.fill(32); } return f.records.get(p) ?? null; }, new AbortController().signal)).rejects.toThrow('inconclusive');
});
it.each(['throw', 'metadata', 'stream', 'object-cap'])('provider %s failure is closed and private', async kind => {
  sdk.get.mockImplementation(async () => {
    if (kind === 'throw') throw new Proxy({}, { get() { throw new Error('SYNTHETIC_CAPTURE_PRIVATE'); } });
    if (kind === 'metadata') return { statusCode: 200, blob: { pathname: 'private-secret', size: 1, contentType: 'application/json' }, stream: new ReadableStream() };
    const value = kind === 'object-cap' ? new Uint8Array(EXPORT_LIMITS.objectBytes + 1) : new Uint8Array([123]);
    return { statusCode: 200, blob: { pathname: POINTER, size: kind === 'object-cap' ? 1 : 2, contentType: 'application/json' }, stream: new ReadableStream({ start(c) { c.enqueue(value); c.close(); } }) };
  });
  const r = await route.POST(request()); expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: 'incomplete' });
});
it.each(['object', 'total', 'records'])('enforces %s cap', async kind => {
  if (kind === 'object') f.records.set(OVERRIDES, Buffer.from(' '.repeat(EXPORT_LIMITS.objectBytes + 1)));
  if (kind === 'total') {
    f = fixture({ data: Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`orders/2030-01-01/${i}.json`, { items: [], raw: 'x'.repeat(730000) }])) });
  }
  if (kind === 'records') f = fixture({ data: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`orders/2030-01-01/${i}.json`, { items: [] }])) });
  await expect(capture()).rejects.toThrow();
});
it('enforces serialized response cap after successful bounded traversal', async () => {
  const stringify = JSON.stringify;
  vi.spyOn(JSON, 'stringify').mockImplementation(((value: unknown, ...args: unknown[]) => {
    if (typeof value === 'object' && value !== null && 'format' in value && value.format === 'meal-planner-source-capture.v2') return 'x'.repeat(EXPORT_LIMITS.responseBytes + 1);
    return (stringify as (...a: unknown[]) => string)(value, ...args);
  }) as typeof JSON.stringify);
  await expect(capture()).rejects.toThrow('incomplete');
});
it('aborts a stalled SDK operation and releases busy state', async () => {
  vi.useFakeTimers(); sdk.get.mockImplementationOnce(() => new Promise(() => {}));
  const pending = route.POST(request()); await vi.advanceTimersByTimeAsync(10);
  expect((await route.POST(request())).status).toBe(429);
  await vi.advanceTimersByTimeAsync(EXPORT_LIMITS.milliseconds);
  expect((await pending).status).toBe(504);
  expect((await route.POST(request())).status).toBe(200);
});
it('request cancellation returns only deadline', async () => {
  const controller = new AbortController(); controller.abort();
  const r = await route.POST(new Request(request(), { signal: controller.signal })); expect(r.status).toBe(504);
});
it.each(['', 'wrong', 'x'.repeat(1025)])('denies export credentials %s', async value => {
  const r = await route.POST(request(undefined, { 'x-source-export-secret': value, cookie: 'synthetic', 'x-dashboard-secret': secret })); expect(r.status).toBe(401); expect(sdk.get).not.toHaveBeenCalled();
});
it.each(['MEALS_SOURCE_EXPORT_ENABLED', 'MEALS_SOURCE_EXPORT_SECRET', 'MEALS_SOURCE_EXPORT_EXPIRES_AT', 'BLOB_READ_WRITE_TOKEN'])('requires config %s', async name => {
  vi.stubEnv(name, ''); expect((await route.POST(request())).status).toBe(404); expect(sdk.get).not.toHaveBeenCalled();
});
it.each(['{"version":2}', '{"version":1,"mode":"compatibility"}', '{"version":2,"mode":"compatibility","path":"private"}', '{"version":2,"version":2,"mode":"compatibility"}', ' '.repeat(257)])('rejects invalid compatibility request %s', async body => {
  expect((await route.POST(request(body))).status).toBe(400); expect(sdk.get).not.toHaveBeenCalled();
});
it('URL credential input is refused and success remains private/no-store', async () => {
  expect((await route.POST(request(undefined, {}, '?token=synthetic'))).status).toBe(400); expect(sdk.get).not.toHaveBeenCalled();
  const r = await route.POST(request()); expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toContain('no-store'); expect(r.headers.get('content-disposition')).toContain('attachment');
});
it('keeps strict v1 and v2 diagnosis rejection for a null products pointer', async () => {
  expect((await route.POST(request('{"version":1}'))).status).toBe(422);
  const diagnostic = await route.POST(request('{"version":2,"mode":"diagnose"}'));
  expect(await diagnostic.json()).toMatchObject({ invariant: 'products_null', outcome: 'incomplete' });
  expect((await route.POST(request())).status).toBe(200);
});
describe.skipIf(!process.env.MEAL_PLANNER_REVIEW_ROOT)('independent actual v2 consumer', () => {
  it.each(['absent', 'null', 'referenced'] as const)('validates source capture and independently rejects forged %s claims', async pointer => {
    const { parseSourceCapture } = await import(/* @vite-ignore */ pathToFileURL(resolve(process.env.MEAL_PLANNER_REVIEW_ROOT!, 'lib/source-capture-archive.ts')).href);
    f = fixture({ pointer }); const raw = await capture(); const parsed = parseSourceCapture(encode(raw));
    expect(parsed.assessment).toEqual(raw.assessment); expect(parsed.report.importReady).toBe(false);
    expect(JSON.stringify(parsed.report)).not.toContain('SYNTHETIC_CAPTURE_PRIVATE');
    raw.assessment.productPointer = pointer === 'null' ? 'absent' : 'null'; expect(() => parseSourceCapture(encode(raw))).toThrow('source_capture_invalid');
  });
});
