// @vitest-environment node
// Offline only: exact Git source, actual writers, synthetic SDK; never import the Python publisher.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { exportSource, hashBytes, POINTER, OVERRIDES } from './source-export';
import { diagnosticFailure } from './source-export-diagnostic';
import type * as Storage from './blob-storage';
import type * as Sync from './dashboard-sync';
import type * as Data from './dashboard-data';

const PRODUCTION = '621dd3cb2850ae807617e8f9f02231cc10df5830';
const CANDIDATE = '569dca7fab3fa8b3136c89d4d1733e7230cf3d7c';
const LEGACY = '31ee07601b0a2b678e259fbf4d139824e1e36713';
const require = createRequire(import.meta.url);
const historyRoot = process.env.MEALS_SOURCE_HISTORY_ROOT;
const plannerRoot = process.env.MEAL_PLANNER_REVIEW_ROOT;
const sourceText = (revision: string, file: string) => revision === 'current' ? readFileSync(resolve(file), 'utf8') : execFileSync('git', ['-C', historyRoot!, 'show', `${revision}:${file}`], { encoding: 'utf8' });

function writer(revision: string) {
  const records = new Map<string, Buffer>();
  const sdk = {
    put: vi.fn(async (path: string, content: string) => { records.set(path, Buffer.from(content)); return { url: path }; }),
    del: vi.fn(async (path: string) => { records.delete(path); }),
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({ blobs: [...records.keys()].filter(p => p.startsWith(prefix)).map(pathname => ({ pathname, url: pathname })) })),
    head: vi.fn(async (path: string) => records.has(path) ? { url: path } : null),
    get: vi.fn(async (path: string) => records.has(path) ? { statusCode: 200, stream: new Response(records.get(path)!.toString()).body } : null),
  };
  const modules = new Map<string, unknown>();
  const load = (file: string): unknown => {
    if (modules.has(file)) return modules.get(file);
    const module = { exports: {} };
    const code = ts.transpileModule(sourceText(revision, file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code, {
      module, exports: module.exports,
      require: (id: string) => {
        if (id === 'server-only') return {};
        if (id === '@vercel/blob') return sdk;
        if (id === 'node:crypto') return require(id);
        if (id === './blob-storage') return load('lib/blob-storage.ts');
        if (id === './immutable-records') return load('lib/immutable-records.ts');
        throw new Error('Unexpected fixture dependency');
      },
      console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
      process: { env: { MEALS_PUBLICATION_PROTOCOL: '1' } },
      fetch: async (path: string) => new Response(records.get(path)?.toString() ?? null, { status: records.has(path) ? 200 : 404 }),
      Response, Buffer,
    });
    modules.set(file, module.exports); return module.exports;
  };
  const storage = load('lib/blob-storage.ts') as typeof Storage;
  const client = new storage.VercelBlobStorageClient('synthetic-writer-token');
  const sync = () => load('lib/dashboard-sync.ts') as typeof Sync;
  const data = () => load('lib/dashboard-data.ts') as typeof Data;
  const source = {
    pointer: async () => source.get(POINTER),
    get: async (path: string) => records.has(path) ? { bytes: records.get(path)!, value: null } : null,
    list: async () => ({ paths: [...records.keys()], cursor: null }),
  };
  return { records, client, sync, data, source, sdk, storage };
}
const product = { productBlobPath: 'products/100.json', tpnc: '100', gtin: null, tpnb: null, title: 'Synthetic', description: '', storage: '', preparation: '', ingredients: '', allergens: '', nutrition: '', brand: '', category: '', imageUrl: '', productUrl: '', source: '', lastFetched: '' };
function payload(withProducts = false): Sync.SplitLayoutPayload {
  return {
    orders: ['2030-01-01', '2030-01-02'].map(day => ({ orderBlobPath: `orders/${day}/synthetic-${day}.json`, orderNumber: `synthetic-${day}`, deliveryDate: day, deliverySlot: '', orderTotal: 0, items: [], substitutions: [], unavailable: [], shortLifeItems: [] })),
    coverage: [{ coverageBlobPath: 'coverage/2030-01-02.json', date: '2030-01-02', sourceOrderBlobPath: 'orders/2030-01-02/synthetic-2030-01-02.json', meals: [] }],
    summary: { coverage_percentage: 0, covered: 0, missing: 0, meals_total: 0, meals_covered: 0, order_total: 0, delivery_date: '', windows: { last_delivery: null, next_delivery: null, next_window_end: null } },
    dataGeneratedAt: '', uiUpdatedAt: '', coverageWindow: ['2030-01-02'], deliveryWindows: [],
    ...(withProducts ? { products: [product] } : {}),
  };
}
async function consumer() {
  const load = (p: string) => import(/* @vite-ignore */ pathToFileURL(resolve(plannerRoot!, p)).href);
  const { parseSourceExport } = await load('lib/source-export-archive.ts');
  const { inventory } = await load('lib/read-only-inventory.ts');
  return { parseSourceExport, inventory };
}
function manualArchive(records: Map<string, Buffer>) {
  return Buffer.from(JSON.stringify({ format: 'meal-planner-source-export.v1', scope: 'active-reachable-with-retained-history', consistency: 'observed-records-rechecked-not-atomic', atomicSnapshot: false,
    records: [...records].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({ path, identity: hashBytes(path), sha256: hashBytes(bytes), bytes: bytes.length, base64: bytes.toString('base64') })) }));
}
async function exportFailure(w: ReturnType<typeof writer>, invariant: string) {
  const before = [...w.records];
  try { await exportSource(async p => w.records.get(p) ?? null, new AbortController().signal); throw new Error('Unexpected archive success'); }
  catch (error) { expect(diagnosticFailure(error, false, 2)).toMatchObject({ outcome: 'incomplete', stage: 'record_schema', category: 'pointer', invariant }); }
  expect([...w.records]).toEqual(before);
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); })); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe.skipIf(!historyRoot || !plannerRoot)('actual writer/reader/exporter/independent consumer matrix', () => {
  it('pins historical production/candidate writer and reader bytes', () => {
    for (const file of ['lib/blob-storage.ts', 'lib/dashboard-sync.ts', 'lib/dashboard-data.ts', 'scripts/sync-dashboard-data.py', 'scripts/publication_recovery.py']) {
      expect(sourceText(PRODUCTION, file)).toBe(sourceText(CANDIDATE, file));

    }
  });
  describe.each([PRODUCTION, CANDIDATE, 'current'])('writer revision %s', revision => {
    it.each(['absent', 'empty'])('main %s products: display is supported but archive evidence stays incomplete', async kind => {
      const w = writer(revision); const p = payload(); if (kind === 'empty') p.products = [];
      await w.sync().syncDashboardLayout(p, w.client);
      w.records.set(OVERRIDES, Buffer.from('[ ]\n')); // separate positively present authoritative fixture, never exporter synthesis
      expect(w.storage.POINTER_PATH_CONSTANT).toBe(POINTER);
      expect(await w.client.readPointer()).toMatchObject({ productsManifestPath: null });
      expect((await w.data().getDashboardData({ reader: w.client, coverageWindow: p.coverageWindow })).loadError).toBeNull();
      await exportFailure(w, 'products_null');
      const { inventory, parseSourceExport } = await consumer();
      // Existing raw-store inventory is permissive; archive intake is deliberately stricter.
      expect((await inventory(w.source)).complete).toBe(true);
      expect(() => parseSourceExport(manualArchive(w.records))).toThrow('source_export_invalid');
    });
    it.each(['main-products', 'products-phase', 'explicit-empty-products-phase'])('exports actual %s bytes through independent consumer', async kind => {
      const w = writer(revision); await w.sync().syncDashboardLayout(payload(kind === 'main-products'), w.client);
      if (kind !== 'main-products') await w.sync().syncDashboardProducts({ products: kind === 'products-phase' ? [product] : [] }, w.client);
      w.records.set(OVERRIDES, Buffer.from('[ ]\n'));
      const before = [...w.records]; for (const fn of Object.values(w.sdk)) fn.mockClear();
      const archive = await exportSource(async p => w.records.get(p) ?? null, new AbortController().signal);
      for (const record of archive.records) expect(Buffer.from(record.base64, 'base64')).toEqual(w.records.get(record.path));
      expect([...w.records]).toEqual(before);
      for (const fn of Object.values(w.sdk)) expect(fn).not.toHaveBeenCalled();
      const { inventory, parseSourceExport } = await consumer();
      const result = await inventory(parseSourceExport(Buffer.from(JSON.stringify(archive))));
      expect(result.complete).toBe(true); expect(result.categories.orders).toBe(2); expect(result.categories.products).toBe(kind === 'explicit-empty-products-phase' ? 0 : 1);
      expect(archive.records.length).toBe(Object.keys(result.hashes).length);
    });
    it('preserves product association on revised invalidation; historical null stays incomplete', async () => {
      const w = writer(revision); await w.sync().syncDashboardLayout(payload(true), w.client);
      await w.sync().invalidateCoverageForOrder('orders/2030-01-02/synthetic-2030-01-02.json', 'order_updated', w.client);
      w.records.set(OVERRIDES, Buffer.from('[]'));
      expect([...w.records.keys()].some(p => p.startsWith('meta/products-manifest-'))).toBe(true);
      if (revision === 'current') {
        expect((await w.client.readPointer())!.productsManifestPath).toMatch(/^meta\/products-manifest-/);
        const archive = await exportSource(async p => w.records.get(p) ?? null, new AbortController().signal);
        const { inventory, parseSourceExport } = await consumer();
        expect((await inventory(parseSourceExport(Buffer.from(JSON.stringify(archive))))).complete).toBe(true);
      } else await exportFailure(w, 'products_null');
    });
    it.each(['missing-overrides', 'missing-products-manifest', 'legacy-order', 'extra-pointer-metadata'])('preserves failure closure for %s', async kind => {
      const w = writer(revision); const p = payload(true);
      if (kind === 'legacy-order') { const order = p.orders[0] as unknown as Record<string, unknown>; delete order.orderNumber; order.orderId = 'synthetic-legacy'; order.items = [{ name: 'Synthetic', qty: 1 }]; }
      await w.sync().syncDashboardLayout(p, w.client); w.records.set(OVERRIDES, Buffer.from('[]'));
      const pointer = (await w.client.readPointer())!;
      if (kind === 'missing-overrides') w.records.delete(OVERRIDES);
      if (kind === 'missing-products-manifest') w.records.delete(pointer.productsManifestPath!);
      if (kind === 'extra-pointer-metadata') w.records.set(POINTER, Buffer.from(JSON.stringify({ ...pointer, publicationProtocol: 1 })));
      await expect(exportSource(async p => w.records.get(p) ?? null, new AbortController().signal)).rejects.toThrow('incomplete');
      if (kind === 'legacy-order') { const { inventory } = await consumer(); const r = await inventory(w.source); expect(r.complete).toBe(false); expect(r.errors).toContain('invalid_schema'); }
      if (kind === 'extra-pointer-metadata') { const { inventory, parseSourceExport } = await consumer(); expect((await inventory(parseSourceExport(manualArchive(w.records)))).complete).toBe(true); } // existing consumer is permissive; never exporter success
    });
  });
  it('historical pre-products writer emits absent reference, not verified emptiness', async () => {
    const w = writer('current'); await w.sync().syncDashboardLayout(payload(true), w.client); w.records.set(OVERRIDES, Buffer.from('[]'));
    const legacy = writer(LEGACY); await legacy.client.writePointer((await w.client.readPointer())!.manifestPath);
    w.records.set(POINTER, legacy.records.get(POINTER)!);
    expect(Object.keys(JSON.parse(w.records.get(POINTER)!.toString()))).toEqual(['manifestPath']);
    await exportFailure(w, 'products_absent');
    const { parseSourceExport } = await consumer(); expect(() => parseSourceExport(manualArchive(w.records))).toThrow('source_export_invalid');
  });
  it('exports both retained and current immutable product versions without losing exact-byte integrity', async () => {
    const w = writer('current'); await w.sync().syncDashboardLayout(payload(true), w.client);
    const oldPointer = (await w.client.readPointer())!;
    const oldProducts = await w.client.readManifest(oldPointer.productsManifestPath!);
    const oldPath = oldProducts['100']!; const oldBytes = Buffer.from(w.records.get(oldPath)!);
    await w.sync().syncDashboardProducts({ products: [{ ...product, title: 'Synthetic changed' }] }, w.client);
    w.records.set(OVERRIDES, Buffer.from('[ ]\n'));
    expect(w.records.get(oldPath)).toEqual(oldBytes);
    const archive = await exportSource(async p => w.records.get(p) ?? null, new AbortController().signal);
    const { inventory, parseSourceExport } = await consumer();
    const result = await inventory(parseSourceExport(Buffer.from(JSON.stringify(archive))));
    expect(result.complete).toBe(true); expect(result.categories.products).toBe(2);
    // Canonical JSON is unchanged by whitespace, but retained exact hashes must fail.
    w.records.set(oldPath, Buffer.concat([oldBytes, Buffer.from('\n')]));
    await expect(exportSource(async p => w.records.get(p) ?? null, new AbortController().signal)).rejects.toThrow('incomplete');
  });
});
