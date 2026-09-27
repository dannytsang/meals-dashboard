// @vitest-environment node
// S2: actual authenticated protocol routes and adapters; SDK transport is synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { BlobStorageClient, PointerContents } from './blob-storage';
import type { SplitLayoutPayload } from './dashboard-sync';

const wire = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn(), head: vi.fn(), list: vi.fn() }));
vi.mock('@vercel/blob', () => wire);
const bytes = new Map<string, string>();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const encode = (v: unknown) => JSON.stringify(v, null, 2);
const day = '2030-01-01';
const SECRET = 'synthetic-s2-auth';
const HOSTILE = 'PRIVATE_PAYLOAD_SENTINEL Bearer synthetic-credential';
let root = '';
let count = 0;
let failAt = 0;
let after = false;
let observed: string[] = [];
let pause: (() => Promise<void>) | undefined;
function kind(p: string, text: string): string {
  if (p === 'publication/latest.json') return Object.values(JSON.parse(text).phases).some((v: any) => v.result) ? 'receipt' : 'reservation';
  if (p === 'pointers/latest.json') return 'pointer';
  return p.split('/')[0] === 'meta' ? p.split('/')[1]!.split('-')[0]! : p.split('/')[0]!;
}
async function boundary(p: string, text: string, write: () => Promise<void>) {
  if (p === 'publication/lock.json') return write();
  const n = ++count; observed.push(kind(p, text));
  if (pause && p.startsWith('orders/')) await pause();
  if (n === failAt && !after) throw new Error(HOSTILE);
  await write();
  if (n === failAt && after) throw new Error(HOSTILE);
}
function products(version: number) {
  return ['1', '2'].map(id => ({ productBlobPath: `products/${id}.json`, tpnc: id, gtin: null, tpnb: null, title: `Synthetic ${id} v${version}`, description: '', storage: '', preparation: '', ingredients: '', allergens: '', nutrition: '', brand: '', category: '', imageUrl: '', productUrl: '', source: 'synthetic', lastFetched: '' }));
}
function payload(version: number): SplitLayoutPayload {
  return {
    orders: ['one', 'two'].map((id, n) => ({ orderBlobPath: `orders/${day}/${id}.json`, orderNumber: id, deliveryDate: day, deliverySlot: '', orderTotal: version, items: [{ name: `Synthetic v${version}`, quantity: version, price: 1, tpnc: String(n + 1), productBlobPath: `products/${n + 1}.json` }], substitutions: [], unavailable: [], shortLifeItems: [] })),
    coverage: ['2030-01-01', '2030-01-02'].map((date, n) => ({ coverageBlobPath: `coverage/${date}.json`, date, sourceOrderBlobPath: `orders/${day}/${n ? 'two' : 'one'}.json`, meals: [{ meal: { id: `meal-${n}`, content: `Synthetic v${version}`, date, labels: [], section: 'Planned' }, status: 'covered', coverageScore: 100, matchedItems: [], missingItems: [], notes: `version ${version}` }] })),
    summary: { coverage_percentage: 100, covered: 2, missing: 0, meals_total: 2, meals_covered: 2, order_total: version, delivery_date: day, windows: { last_delivery: day, next_delivery: null, next_window_end: null } },
    coverageWindow: [day, '2030-01-02'], deliveryWindows: [], dataGeneratedAt: `2030-01-01T00:00:0${version}Z`, uiUpdatedAt: '',
  };
}
const identity = (generation: number, phase: string) => ({ version: 1, runId: generation.toString(16).padStart(32, '0'), generation, phase, target: 'primary' });
const req = (body: unknown) => new Request('http://synthetic.invalid/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dashboard-secret': SECRET }, body: JSON.stringify(body) }) as never;
beforeEach(() => {
  vi.stubEnv('MEALS_PUBLICATION_PROTOCOL', '1'); vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', SECRET); vi.stubEnv('DASHBOARD_STORE_DIR', '');
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External network forbidden'); }));
  count = 0; failAt = 0; after = false; observed = []; pause = undefined; bytes.clear();
  wire.put.mockImplementation(async (p: string, text: string, options: { allowOverwrite?: boolean }) => {
    if (options.allowOverwrite === false && bytes.has(p)) throw new Error('Synthetic lock busy');
    await boundary(p, text, async () => { bytes.set(p, text); }); return { url: p, etag: sha(text) };
  });
  wire.get.mockImplementation(async (p: string) => bytes.has(p) ? { statusCode: 200, stream: new Response(bytes.get(p)!).body } : null);
  wire.del.mockImplementation(async (p: string, options: { ifMatch?: string }) => { expect(options.ifMatch).toBe(sha(bytes.get(p)!)); bytes.delete(p); });
  vi.resetModules();
});
afterEach(async () => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(HOSTILE);
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  if (root) { await rm(root, { recursive: true, force: true }); root = ''; }
});
async function setup(mode: 'blob' | 'local') {
  const storage = await import('./blob-storage');
  if (mode === 'local') {
    root = await mkdtemp(join(tmpdir(), 'immutable-s2-'));
    vi.stubEnv('DASHBOARD_STORE_DIR', root);
    const Local = (storage as unknown as { LocalFileStorageClient: { prototype: { atomicWrite(p: string, text: string): Promise<void> } } }).LocalFileStorageClient;
    const original = Local.prototype.atomicWrite;
    vi.spyOn(Local.prototype, 'atomicWrite').mockImplementation(async function(this: typeof Local.prototype, p, text) { return boundary(p, text, () => original.call(this, p, text)); });
  }
  const store = new storage.VercelBlobStorageClient();
  const main = await import('../app/api/dashboard-sync/route');
  const productRoute = await import('../app/api/dashboard-products-sync/route');
  const read = async (p: string) => mode === 'local' ? readFile(join(root, p), 'utf8') : bytes.get(p)!;
  const list = async () => mode === 'local' ? (await readdir(root, { recursive: true })).filter(p => p.endsWith('.json')).map(p => String(p)) : [...bytes.keys()];
  return { store, main, productRoute, read, list };
}
async function initial(s: Awaited<ReturnType<typeof setup>>) {
  expect((await s.main.POST(req({ ...payload(1), publication: identity(100, 'main') }))).status).toBe(200);
  const p = (await s.store.readPointer())!;
  expect((await s.productRoute.POST(req({ products: products(1), mainManifestPath: p.manifestPath, publication: identity(100, 'products') }))).status).toBe(200);
  return (await s.store.readPointer())!;
}
async function graph(s: Awaited<ReturnType<typeof setup>>, p: PointerContents) {
  const collected = new Map<string, string>();
  const load = async (path: string) => {
    const raw = await s.read(path); expect(raw, path).toBeTypeOf('string'); collected.set(path, raw);
    if (/^(meta\/|.*-[a-f0-9]{64}\.json$)/.test(path)) expect(path.endsWith(`-${sha(raw)}.json`), path).toBe(true);
    return JSON.parse(raw);
  };
  const manifest = await load(p.manifestPath) as Record<string, string>;
  for (const [path, hash] of Object.entries(manifest)) {
    const v = await load(path); expect(sha(collected.get(path)!)).toBe(hash);
    if (path.startsWith('coverage/') && v.sourceOrderBlobPath) expect(Object.hasOwn(manifest, v.sourceOrderBlobPath)).toBe(true);
  }
  if (p.productsManifestPath) {
    const pm = await load(p.productsManifestPath);
    for (const [id, path] of Object.entries(pm)) { const value = await load(path as string); expect(value.tpnc).toBe(id); }
  }
  return collected;
}
async function unchanged(s: Awaited<ReturnType<typeof setup>>, old: Map<string, string>) {
  for (const [path, raw] of old) expect(await s.read(path), path).toBe(raw);
}
async function displayed(s: Awaited<ReturnType<typeof setup>>, p: PointerContents, version: number, productVersion: number | null) {
  const { getDashboardData } = await import('./dashboard-data');
  const pinned = Object.create(s.store) as BlobStorageClient; pinned.readPointer = async () => p;
  const data = await getDashboardData({ reader: pinned, coverageWindow: [day, '2030-01-02'] });
  expect(data.loadError).toBeNull(); expect(data.validOrders).toHaveLength(2); expect(data.coverage).toHaveLength(2);
  expect(data.validOrders.every(o => o.orderTotal === version)).toBe(true);
  expect(data.coverage.every(c => c.meal.content === `Synthetic v${version}`)).toBe(true);
  if (productVersion !== null) for (const id of ['1', '2']) expect(data.products[id]!.title).toBe(`Synthetic ${id} v${productVersion}`);
}
// This list is deliberately explicit: assertions prove every targeted write was exercised.
const mainBoundaries = ['reservation', 'orders', 'orders', 'coverage', 'coverage', 'summary', 'manifest', 'pointer', 'receipt'];
const productBoundaries = ['reservation', 'products', 'products', 'products', 'pointer', 'receipt'];
// SOURCE_MODES: the primary source tree has no local adapter.
describe.each(['blob'] as const)('S2 immutable snapshot via %s adapter', mode => {
  for (const phase of ['main', 'products'] as const) {
    const boundaries = phase === 'main' ? mainBoundaries : productBoundaries;
    it.each(boundaries.flatMap((label, index) => [false, true].map(after => ({ index: index + 1, label, after }))))(`${phase}: fault $index/$label after=$after retains old graph and recovers`, async fault => {
      const s = await setup(mode); const oldPointer = await initial(s); const old = await graph(s, oldPointer);
      const body = phase === 'main' ? { ...payload(2), publication: identity(101, phase) } : { products: products(2), mainManifestPath: oldPointer.manifestPath, publication: identity(101, phase) };
      const route = phase === 'main' ? s.main : s.productRoute;
      count = 0; observed = []; failAt = fault.index; after = fault.after;
      const result = await route.POST(req(body));
      expect(result.status).toBe(500); expect(await result.text()).not.toMatch(/SENTINEL|Bearer|credential/);
      expect(count).toBe(fault.index); expect(observed).toEqual(boundaries.slice(0, fault.index));
      await unchanged(s, old); await graph(s, oldPointer); await displayed(s, oldPointer, 1, 1);
      const current = (await s.store.readPointer())!; await graph(s, current);
      const pointerIndex = boundaries.indexOf('pointer') + 1;
      if (fault.index < pointerIndex || fault.index === pointerIndex && !fault.after) expect(current).toEqual(oldPointer);
      else expect(current).not.toEqual(oldPointer);
      failAt = 0;
      // New request constructs a fresh adapter over persisted storage and identity.
      const recovered = await import(phase === 'main' ? '../app/api/dashboard-sync/route' : '../app/api/dashboard-products-sync/route');
      const retry = await recovered.POST(req(body)); expect(retry.status).toBe(200);
      const committed = (await s.store.readPointer())!; await graph(s, committed); await unchanged(s, old);
      await displayed(s, committed, phase === 'main' ? 2 : 1, phase === 'main' ? null : 2);
      const beforeReplay = count; expect((await recovered.POST(req(body))).status).toBe(200); expect(count).toBe(beforeReplay);
      // Every retained main manifest remains hash-valid and reaches its original order/coverage bytes.
      for (const path of await s.list()) if (path.startsWith('meta/manifest-')) await graph(s, { manifestPath: path });
    });
  }
  it('successful changed orders/coverage/products publish retains legacy and immutable graphs', async () => {
    const s = await setup(mode);
    // Historical stable-path fixture: never rewritten, even when its logical IDs recur.
    const p = payload(1); const manifest: Record<string, string> = {};
    for (const v of [...p.orders, ...p.coverage]) {
      const path = 'orderBlobPath' in v ? v.orderBlobPath : v.coverageBlobPath;
      manifest[path] = (await s.store.writeBlobIfChanged(path, encode(v), {})).hash;
    }
    const summary = encode({ ...p.summary, dataGeneratedAt: p.dataGeneratedAt, uiUpdatedAt: p.uiUpdatedAt });
    const sp = `meta/summary-${sha(summary)}.json`; manifest[sp] = (await s.store.writeBlobIfChanged(sp, summary, {})).hash;
    const pm: Record<string, string> = {};
    for (const product of products(1)) { await s.store.writeBlobIfChanged(product.productBlobPath, encode(product), {}); pm[product.tpnc] = product.productBlobPath; }
    const pp = `meta/products-manifest-${sha(encode(pm))}.json`; await s.store.writeBlobIfChanged(pp, encode(pm), {});
    const m = await s.store.writeManifest(manifest); await s.store.writePointer(m.manifestPath, pp);
    const legacyPointer = (await s.store.readPointer())!; const legacy = await graph(s, legacyPointer);
    const oldPointer = await initial(s); const old = await graph(s, oldPointer);
    expect((await s.main.POST(req({ ...payload(2), publication: identity(101, 'main') }))).status).toBe(200);
    const main = (await s.store.readPointer())!;
    expect((await s.productRoute.POST(req({ products: products(2), mainManifestPath: main.manifestPath, publication: identity(101, 'products') }))).status).toBe(200);
    const latest = (await s.store.readPointer())!; await graph(s, latest); await displayed(s, latest, 2, 2);
    await unchanged(s, legacy); await unchanged(s, old); await displayed(s, legacyPointer, 1, 1); await displayed(s, oldPointer, 1, 1);
    expect(await s.store.readPointer()).toEqual(latest);
  });
  it('main-only immutable graph never enriches from legacy mutable aliases', async () => {
    const s = await setup(mode);
    for (const product of products(9)) await s.store.writeBlobIfChanged(product.productBlobPath, encode(product), {});
    expect((await s.main.POST(req({ ...payload(1), publication: identity(100, 'main') }))).status).toBe(200);
    const p = (await s.store.readPointer())!; expect(p.productsManifestPath).toBeFalsy();
    const { getDashboardData } = await import('./dashboard-data');
    const data = await getDashboardData({ reader: s.store, coverageWindow: [day, '2030-01-02'] });
    expect(data.products).toEqual({ '1': null, '2': null });
    await displayed(s, p, 1, null);
  });
  it('stale identities and simultaneous changed writers cannot mix generations', async () => {
    const s = await setup(mode); const oldPointer = await initial(s); const old = await graph(s, oldPointer);
    let entered!: () => void; let release!: () => void;
    const held = new Promise<void>(r => { entered = r; }); const gate = new Promise<void>(r => { release = r; });
    pause = async () => { entered(); await gate; };
    const writer = s.main.POST(req({ ...payload(2), publication: identity(102, 'main') })); await held;
    const concurrent = s.main.POST(req({ ...payload(3), publication: identity(101, 'main') }));
    await displayed(s, oldPointer, 1, 1); release();
    expect((await writer).status).toBe(200); expect([409, 500]).toContain((await concurrent).status); pause = undefined;
    const committed = (await s.store.readPointer())!; const baseline = count;
    expect((await s.main.POST(req({ ...payload(1), publication: identity(100, 'main') }))).status).toBe(409);
    expect((await s.productRoute.POST(req({ products: products(1), mainManifestPath: oldPointer.manifestPath, publication: identity(100, 'products') }))).status).toBe(409);
    expect(count).toBe(baseline); await graph(s, committed); await displayed(s, committed, 2, null); await unchanged(s, old);
  });
  it.each([1, 2, 3, 4].flatMap(index => [false, true].map(after => ({ index, after }))))('invalidation fault $index after=$after preserves committed coverage and product association', async fault => {
    const s = await setup(mode);
    const p = payload(1); p.coverage[0]!.meals[0]!.stale = true; p.coverage[0]!.meals[0]!.staleReason = 'earlier';
    expect((await s.main.POST(req({ ...p, publication: identity(100, 'main') }))).status).toBe(200);
    const main = (await s.store.readPointer())!;
    expect((await s.productRoute.POST(req({ products: products(1), mainManifestPath: main.manifestPath, publication: identity(100, 'products') }))).status).toBe(200);
    const oldPointer = (await s.store.readPointer())!; const old = await graph(s, oldPointer);
    const { invalidateCoverageForOrder } = await import('./dashboard-sync');
    const lock = vi.spyOn(s.store, 'withLock');
    count = 0; observed = []; failAt = fault.index; after = fault.after;
    await expect(invalidateCoverageForOrder(p.orders[0]!.orderBlobPath, 'order_updated', s.store)).rejects.toThrow(HOSTILE);
    expect(lock).toHaveBeenCalledTimes(1); expect(count).toBe(fault.index);
    expect(observed).toEqual(['coverage', 'coverage', 'manifest', 'pointer'].slice(0, fault.index));
    await unchanged(s, old); await graph(s, oldPointer); await graph(s, (await s.store.readPointer())!);
    failAt = 0;
    const result = await invalidateCoverageForOrder(p.orders[0]!.orderBlobPath, 'order_updated', s.store);
    expect(result.productsManifestPath).toBe(oldPointer.productsManifestPath);
    const current = (await s.store.readPointer())!;
    const manifest = await s.store.readManifest(current.manifestPath);
    const ref = Object.keys(manifest).find(path => path.startsWith(`coverage/${day}-`))!;
    const coverage = (await s.store.readJsonBlob<{ meals: Array<{ stale: boolean; staleReason: string | null }> }>(ref))!;
    expect(coverage.meals[0]).toMatchObject({ stale: false, staleReason: null });
    await unchanged(s, old); await graph(s, current);
  });
});
