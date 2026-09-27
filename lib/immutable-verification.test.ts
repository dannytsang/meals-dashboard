// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { InMemoryBlobStorageClient } from './blob-storage';
import { syncDashboardLayout, syncDashboardProducts } from './dashboard-sync';
import { publishRecoverably } from './publication-recovery';
import { canonicalHash, parseVerification, verifyPublication } from './publication-verification';
import { getDashboardData } from './dashboard-data';

const product = { productBlobPath: 'products/1.json', tpnc: '1', title: 'Synthetic v1' };
async function fixture() {
  vi.stubEnv('MEALS_PUBLICATION_PROTOCOL', '1');
  // Single-threaded verifier fixture only; real protocol locks are exercised
  // through authenticated routes and the SDK in immutable-snapshot.test.ts.
  const store = Object.assign(new InMemoryBlobStorageClient(), {
    withLock: async <T>(operation: () => Promise<T>): Promise<T> => operation(),
  });
  const id = { version: 1, runId: 'a'.repeat(32), generation: 100, target: 'primary', phase: 'main' };
  const main = { orders: [{ orderBlobPath: 'orders/2030-01-01/synthetic.json', orderNumber: 'synthetic', deliveryDate: '2030-01-01', items: [{ tpnc: '1' }] }], coverage: [{ coverageBlobPath: 'coverage/2030-01-01.json', sourceOrderBlobPath: 'orders/2030-01-01/synthetic.json', meals: [] }], summary: {}, products: [product], deliveryWindows: [], coverageWindow: [], dataGeneratedAt: '', uiUpdatedAt: '', publication: id };
  const first = await publishRecoverably(store, main, 'main', false, c => syncDashboardLayout(main as never, c));
  const previous = (await store.readManifest(first.productsManifestPath!))['1']!;
  const body = { products: [{ ...product, title: 'Synthetic v2' }], mainManifestPath: first.manifestPath, publication: { ...id, phase: 'products' } };
  const next = await publishRecoverably(store, body, 'products', false, c => syncDashboardProducts(body as never, c));
  const current = (await store.readManifest(next.productsManifestPath!))['1']!;
  const records = Object.fromEntries([...store.store].filter(([p]) => /^(orders|coverage|products)\//.test(p) || p.startsWith('meta/summary-')).map(([p, v]) => [p, canonicalHash(JSON.parse(v.content))]));
  const expected = parseVerification({ version: 1, runId: id.runId, generation: 100, target: 'primary', mainHash: canonicalHash(main), productsHash: canonicalHash(body), mainManifestPath: first.manifestPath, productsManifestPath: next.productsManifestPath, expectedRecords: records });
  const read = async (p: string) => { const entry = store.store.get(p); if (!entry) throw new Error('missing'); return entry.content; };
  return { store, previous, current, expected, read };
}
afterEach(() => vi.unstubAllEnvs());
it('verifies retained full-layout products and independently advanced product-only graph', async () => {
  const f = await fixture();
  expect(f.current).not.toBe(f.previous);
  expect((await verifyPublication(f.expected, f.read)).records).toEqual({ orders: 1, coverage: 1, summaries: 1, products: 2 });
  const view = await getDashboardData({ reader: f.store, coverageWindow: ['2030-01-01'] });
  expect(view.products['1']!.title).toBe('Synthetic v2');
});
it.each(['previous', 'current'] as const)('rejects exact-byte-only corruption of %s product despite unchanged canonical hash', async key => {
  const f = await fixture(); const path = f[key]; const before = await f.read(path);
  f.store.seed(path, `${before}\n`);
  expect(canonicalHash(JSON.parse(await f.read(path)))).toBe(f.expected.expectedRecords[path]);
  await expect(verifyPublication(f.expected, f.read)).rejects.toThrow('Publication verification failed');
});
it('does not read legacy mutable aliases when a committed product manifest omits an ID', async () => {
  const f = await fixture(); f.store.seed('products/1.json', JSON.stringify({ ...product, title: 'STALE LEGACY' }));
  const content = '{}'; const pm = `meta/products-manifest-${f.store.computeHash(content)}.json`;
  f.store.seed(pm, content); await f.store.writePointer(f.expected.mainManifestPath, pm);
  const read = vi.spyOn(f.store, 'readJsonBlob');
  const view = await getDashboardData({ reader: f.store, coverageWindow: ['2030-01-01'] });
  expect(view.products['1']).toBeNull();
  expect(read.mock.calls.some(([p]) => p === 'products/1.json')).toBe(false);
});
