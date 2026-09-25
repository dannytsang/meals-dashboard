// @vitest-environment node
// App002 FR-002/FR-003/NFR-002/NFR-003, AS-007 (independent finding F1).
// Real authenticated routes, recovery, sync and Blob adapter; only SDK transport is synthetic.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VercelBlobStorageClient } from '@/lib/blob-storage';

const blobs = vi.hoisted(() => new Map<string, { body: string; etag: string }>());
const wire = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock('@vercel/blob', () => ({ ...wire, head: vi.fn(), list: vi.fn() }));
type Fault = 'none' | 'pointer-before' | 'pointer-after' | 'receipt-before' | 'receipt-after';
let fault: Fault;
let sequence: number;
let pausePointer: (() => Promise<void>) | undefined;
const identity = { version: 1, runId: 'b'.repeat(32), generation: 100, target: 'primary', phase: 'main' };
const payload = {
  orders: [{ orderBlobPath: 'orders/2026-09-25/synthetic.json', orderNumber: 'synthetic', items: [] }],
  coverage: [{ coverageBlobPath: 'coverage/2026-09-25.json', date: '2026-09-25', meals: [] }],
  summary: {}, deliveryWindows: [], coverageWindow: ['2026-09-25'],
  dataGeneratedAt: '2026-09-25T00:00:00Z', uiUpdatedAt: '2026-09-25T00:00:00Z', publication: identity,
};
const product = { productBlobPath: 'products/1.json', tpnc: '1', title: 'SYNTHETIC' };
const request = (body: unknown) => new Request('http://localhost/api/dashboard-sync', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-dashboard-secret': 'synthetic-auth' }, body: JSON.stringify(body),
}) as never;

beforeEach(() => {
  vi.stubEnv('MEALS_PUBLICATION_PROTOCOL', '1');
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'synthetic-auth');
  vi.stubEnv('DASHBOARD_STORE_DIR', '');
  fault = 'none'; sequence = 0; pausePointer = undefined;
  wire.put.mockImplementation(async (path: string, body: string, options) => {
    if (options.allowOverwrite === false && blobs.has(path)) throw new Error('synthetic lock busy');
    if (path === 'pointers/latest.json' && pausePointer) await pausePointer();
    const point = path === 'pointers/latest.json' ? 'pointer'
      : path === 'publication/latest.json' && JSON.parse(body).phases.products?.result ? 'receipt' : null;
    const active = fault;
    if (point && fault.startsWith(point)) fault = 'none';
    if (active === `${point}-before`) throw new Error('synthetic transient PUT failure');
    const etag = String(++sequence);
    blobs.set(path, { body, etag });
    if (active === `${point}-after`) throw new Error('synthetic lost PUT acknowledgment');
    return { url: path, etag };
  });
  wire.get.mockImplementation(async (path: string) => {
    const blob = blobs.get(path);
    return blob ? { statusCode: 200, stream: new Response(blob.body).body } : null;
  });
  wire.del.mockImplementation(async (path: string, options) => {
    if (options.ifMatch !== undefined) expect(options.ifMatch).toBe(blobs.get(path)?.etag);
    blobs.delete(path);
  });
  vi.resetModules();
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); blobs.clear(); });

async function setup() {
  const main = await import('./dashboard-sync/route');
  const products = await import('./dashboard-products-sync/route');
  const first = await main.POST(request(payload));
  expect(first.status).toBe(200);
  const ack = await first.json();
  const body = { products: [product], mainManifestPath: ack.manifestPath, publication: { ...identity, phase: 'products' } };
  const store = new VercelBlobStorageClient('synthetic');
  const manifest = await store.readManifest(ack.manifestPath);
  expect(Object.keys(manifest)).toHaveLength(3);
  const mainRecords = Object.fromEntries(Object.keys(manifest).map(path => [path, blobs.get(path)!.body]));
  const mainReceipt = JSON.parse(blobs.get('publication/latest.json')!.body).phases.main;
  wire.put.mockClear(); wire.del.mockClear();
  return { main, products, ack, body, store, manifest, mainRecords, mainReceipt };
}

it.each<Fault>(['none', 'pointer-before', 'pointer-after', 'receipt-before', 'receipt-after'])(
  'AS-007: %s retains main and recovers only products with exact readback', async (injected) => {
    const { products, ack, body, store, manifest, mainRecords, mainReceipt } = await setup();
    const oldPointer = await store.readPointer();
    fault = injected;
    const attempt = await products.POST(request(body));
    expect(attempt.status).toBe(injected === 'none' ? 200 : 500);
    expect(fault).toBe('none'); // the requested fault window really executed
    expect(blobs.has('publication/lock.json')).toBe(false);
    const afterFault = await store.readPointer();
    expect(afterFault?.manifestPath).toBe(ack.manifestPath);
    if (injected === 'pointer-before') expect(afterFault).toEqual(oldPointer);
    const journalAfterFault = JSON.parse(blobs.get('publication/latest.json')!.body);
    expect(journalAfterFault.phases.main).toEqual(mainReceipt);
    expect(Boolean(journalAfterFault.phases.products.result)).toBe(['none', 'receipt-after'].includes(injected));

    // No main request or recovery workaround is performed.
    const replay = await products.POST(request(body));
    expect(replay.status).toBe(200);
    const result = await replay.json();
    const pointer = await store.readPointer();
    expect(pointer).toEqual({ manifestPath: ack.manifestPath, productsManifestPath: result.productsManifestPath });
    expect(await store.readManifest(pointer!.manifestPath)).toEqual(manifest);
    for (const [path, content] of Object.entries(mainRecords)) {
      expect(blobs.get(path)?.body).toBe(content);
      expect(store.computeHash(content)).toBe(manifest[path]);
    }
    expect(await store.readJsonBlob(pointer!.productsManifestPath!)).toEqual({ '1': 'products/1.json' });
    expect(await store.readJsonBlob('products/1.json')).toEqual(product);
    const journal = JSON.parse(blobs.get('publication/latest.json')!.body);
    expect(journal).toMatchObject({ generation: 100, runId: identity.runId, target: 'primary', phases: {
      main: mainReceipt, products: { hash: journalAfterFault.phases.products.hash, result: {
        manifestPath: ack.manifestPath, productsManifestPath: pointer!.productsManifestPath, publicationProtocol: 1,
      } },
    } });
    expect(wire.put.mock.calls.some(([path]) => path in mainRecords || path === ack.manifestPath)).toBe(false);
    expect(wire.del.mock.calls.every(([path]) => path === 'publication/lock.json')).toBe(true);
    const beforeDuplicate = new Map(blobs);
    const duplicate = await products.POST(request(body));
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual(result);
    expect(blobs).toEqual(beforeDuplicate); // cached receipt, no content mutation
  },
);

it('AS-007: pending product identity conflicts and newer generations remain fenced', async () => {
  const { main, products, body } = await setup();
  fault = 'pointer-before';
  expect((await products.POST(request(body))).status).toBe(500);
  const pending = new Map(blobs);
  const conflict = await products.POST(request({ ...body, products: [{ ...product, title: 'OTHER SYNTHETIC' }] }));
  expect(conflict.status).toBe(409);
  expect(blobs).toEqual(pending);
  const newer = { ...payload, publication: { ...identity, runId: 'c'.repeat(32), generation: 101 } };
  expect((await main.POST(request(newer))).status).toBe(200);
  const committed = new Map(blobs);
  expect((await products.POST(request(body))).status).toBe(409);
  expect((await main.POST(request(payload))).status).toBe(409);
  expect(blobs).toEqual(committed);
});

it('AS-007: a concurrent writer cannot bypass the lock during pointer fault recovery', async () => {
  const { main, products, body } = await setup();
  let entered!: () => void;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  pausePointer = async () => { entered(); await gate; };
  fault = 'pointer-before';
  const pending = products.POST(request(body));
  await blocked;
  try {
    const concurrent = await main.POST(request({ ...payload, publication: { ...identity, generation: 101 } }));
    expect(concurrent.status).toBe(500);
    expect(JSON.parse(blobs.get('publication/latest.json')!.body).generation).toBe(100);
  } finally { release(); }
  expect((await pending).status).toBe(500);
  pausePointer = undefined;
  expect((await products.POST(request(body))).status).toBe(200);
  expect(blobs.has('publication/lock.json')).toBe(false);
});
