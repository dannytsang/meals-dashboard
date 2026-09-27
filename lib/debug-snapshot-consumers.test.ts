// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VercelBlobStorageClient } from './blob-storage';
import { syncDashboardLayout } from './dashboard-sync';
import { getDashboardData } from './dashboard-data';
import { coverageDateFromPath } from './debug-observability';
import { GET as freshness } from '../app/api/debug/blob-read-freshness/route';
import { GET as items } from '../app/api/debug/items-by-category/route';

const sdk = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn(), head: vi.fn(), list: vi.fn() }));
const auth = vi.hoisted(() => ({ enabled: true }));
vi.mock('@vercel/blob', () => sdk);
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'synthetic' }) }) }));
vi.mock('./debug-cookie', () => ({ DEBUG_COOKIE_NAME: 'debug', verifyDebugCookie: () => auth.enabled ? { value: '1' } : null }));
vi.mock('./runtime-mode', () => ({ runtimeModeStatus: () => ({ blobConfigured: true }) }));
const objects = new Map<string, string>();
const day = '2030-01-01', sparse = '2030-02-01';
const product = { productBlobPath: 'products/1.json', tpnc: '1', gtin: null, tpnb: null, title: 'Synthetic committed product', description: '', storage: '', preparation: '', ingredients: '', allergens: '', nutrition: '', brand: '', category: '', imageUrl: '', productUrl: '', source: 'synthetic', lastFetched: `${day}T12:00:00Z` };

beforeEach(() => {
  objects.clear(); vi.clearAllMocks(); auth.enabled = true;
  vi.stubEnv('DASHBOARD_STORE_DIR', ''); vi.stubEnv('MEALS_PUBLICATION_PROTOCOL', '1');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  sdk.put.mockImplementation(async (path: string, text: string) => { objects.set(path, text); return { url: path, etag: 'synthetic' }; });
  sdk.get.mockImplementation(async (path: string) => objects.has(path) ? { statusCode: 200, stream: new Response(objects.get(path)!).body } : null);
  sdk.del.mockImplementation(async (path: string) => { objects.delete(path); });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function publish(withProducts = true, tpnc = '1') {
  const store = new VercelBlobStorageClient();
  const payload = {
    orders: [{ orderBlobPath: `orders/${day}/one.json`, orderNumber: 'one', deliveryDate: day, deliverySlot: '', orderTotal: 1,
      items: [{ name: 'Synthetic item', quantity: 1, price: 1, tpnc }], substitutions: [], unavailable: [], shortLifeItems: [] }],
    coverage: [day, sparse].map(date => ({ coverageBlobPath: `coverage/${date}.json`, date, sourceOrderBlobPath: `orders/${day}/one.json`, meals: [] })),
    summary: { coverage_percentage: 0, covered: 0, missing: 0, meals_total: 0, meals_covered: 0, order_total: 1, delivery_date: day, windows: { last_delivery: day, next_delivery: null, next_window_end: null } },
    coverageWindow: [day], deliveryWindows: [], dataGeneratedAt: `${day}T12:00:00Z`, uiUpdatedAt: '', products: withProducts ? [{ ...product, tpnc, productBlobPath: `products/${tpnc}.json` }] : [],
  };
  await syncDashboardLayout(payload as Parameters<typeof syncDashboardLayout>[0], store);
  const pointer = (await store.readPointer())!;
  const manifest = await store.readManifest(pointer.manifestPath);
  const products = pointer.productsManifestPath ? await store.readManifest(pointer.productsManifestPath) : {};
  return { store, pointer, manifest, products };
}

it('keeps exact sparse coverage references and windowed item diagnostics', async () => {
  const f = await publish(); const paths = Object.keys(f.manifest).filter(path => path.startsWith('coverage/'));
  const before = [...objects]; sdk.get.mockClear();
  const body = await (await freshness()).json();
  expect(body.selectedCoverageBlobPaths).toEqual(paths);
  expect(body.manifestDateCoverage).toEqual([day, sparse]);
  expect(body.manifestDateCoverageMiss).toEqual([]);
  expect(body.productReads).toEqual([{ path: f.products['1'], status: 'ok', lastFetched: product.lastFetched }]);
  expect((await (await items()).json()).coverageReads).toEqual([{ path: paths[0], status: 'ok' }]);
  expect(sdk.get.mock.calls.map(call => call[0])).not.toContain('products/1.json');
  expect([...objects]).toEqual(before); expect(fetch).not.toHaveBeenCalled();
});

it('reports missing committed coverage/product, never a stale mutable alias', async () => {
  const f = await publish(); const path = Object.keys(f.manifest).find(p => p.startsWith(`coverage/${sparse}`))!;
  objects.delete(path); objects.delete(f.products['1']!);
  objects.set('products/1.json', JSON.stringify({ ...product, title: 'STALE ALIAS' }));
  const body = await (await freshness()).json();
  expect(body.manifestDateCoverageMiss).toEqual([sparse]);
  expect(body.productReads).toEqual([{ path: f.products['1'], status: 'missing' }]);
  expect((await getDashboardData({ reader: f.store, coverageWindow: [day] })).products['1']).toBeNull();
});

it.each(['main-only', 'missing-entry', 'missing-manifest'] as const)('does not read stable products for %s graphs', async mode => {
  const f = await publish(mode !== 'main-only');
  if (mode === 'missing-entry') objects.set(f.pointer.productsManifestPath!, '{}');
  if (mode === 'missing-manifest') objects.delete(f.pointer.productsManifestPath!);
  objects.set('products/1.json', JSON.stringify(product)); sdk.get.mockClear();
  const body = await (await freshness()).json();
  expect(body.productReads).toEqual([]);
  expect(sdk.get.mock.calls.map(call => call[0])).not.toContain('products/1.json');
});

it.each([false, true])('preserves legacy stable references with products manifest=%s', async withManifest => {
  const f = await publish();
  const legacy: Record<string, string> = {};
  for (const [path, hash] of Object.entries(f.manifest)) {
    const stable = path.startsWith('meta/') ? path : path.replace(/-[a-f0-9]{64}\.json$/, '.json');
    objects.set(stable, objects.get(path)!); legacy[stable] = hash;
  }
  objects.set(f.pointer.manifestPath, JSON.stringify(legacy));
  objects.set('products/1.json', JSON.stringify(product));
  if (withManifest) objects.set(f.pointer.productsManifestPath!, JSON.stringify({ '1': 'products/1.json' }));
  else objects.set('pointers/latest.json', JSON.stringify({ ...f.pointer, productsManifestPath: null }));
  const body = await (await freshness()).json();
  expect(body.productReads).toEqual([{ path: 'products/1.json', status: 'ok', lastFetched: product.lastFetched }]);
  expect(body.manifestDateCoverage).toEqual([day, sparse]);
  expect((await (await items()).json()).coverageReads).toEqual([{ path: `coverage/${day}.json`, status: 'ok' }]);
});

it.each(['freshness', 'items'])('pins %s diagnostics to one committed pointer while another generation publishes', async route => {
  const a = await publish(true, '1'); const pointerA = objects.get('pointers/latest.json')!;
  await publish(true, '2'); const pointerB = objects.get('pointers/latest.json')!;
  let pointerReads = 0;
  sdk.get.mockImplementation(async (path: string) => {
    const text = path === 'pointers/latest.json' ? (++pointerReads === 1 ? pointerA : pointerB) : objects.get(path);
    return text ? { statusCode: 200, stream: new Response(text).body } : null;
  });
  const body = await (await (route === 'freshness' ? freshness() : items())).json();
  expect(body.manifestPath).toBe(a.pointer.manifestPath);
  if (route === 'freshness') expect(body.productReads).toEqual([{ path: a.products['1'], status: 'ok', lastFetched: product.lastFetched }]);
  else expect(body.latestOrder.items[0].tpnc).toBe('1');
  expect(pointerReads).toBe(1);
});

it('keeps debug denial ahead of all storage reads', async () => {
  auth.enabled = false;
  expect((await freshness()).status).toBe(404); expect((await items()).status).toBe(404);
  expect(sdk.get).not.toHaveBeenCalled(); expect(sdk.put).not.toHaveBeenCalled();
});

it.each(['coverage/2030-01-01-bad.json', 'coverage/2030-01-01/' + 'a'.repeat(64) + '.json', 'orders/2030-01-01/one.json'])('rejects non-contract coverage path %s', path => {
  expect(coverageDateFromPath(path)).toBeNull();
});
