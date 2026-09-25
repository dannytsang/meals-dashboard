/** TEST-ONLY execution entrypoint. Never deployed as an application route. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Agent, setGlobalDispatcher } from 'undici';
import { put, get, del, BlobPreconditionFailedError } from '@vercel/blob';
import { POST as main } from '../app/api/dashboard-sync/route';
import { POST as products } from '../app/api/dashboard-products-sync/route';
import { POST as verify } from '../app/api/internal/publication-verify/route';
import { VercelBlobStorageClient } from '../lib/blob-storage';
import { canonicalHash } from '../lib/publication-verification';

const digest = (s: string) => createHash('sha256').update(s).digest();
const assert = (v: unknown) => { if (!v) throw new Error('Synthetic assertion failed'); };
let claimed = false;
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.STAGE2_SECRET;
  const supplied = req.headers['x-stage2-secret'];
  if (req.method !== 'POST' || !key || typeof supplied !== 'string' || !timingSafeEqual(digest(key), digest(supplied))) { res.statusCode = 401; res.end('{}'); return; }
  if (claimed || process.env.VERCEL_ENV !== 'preview' || !process.env.STAGE2_PROJECT_ID || process.env.VERCEL_PROJECT_ID !== process.env.STAGE2_PROJECT_ID || !process.env.STAGE2_STORE_ID || process.env.BLOB_STORE_ID !== process.env.STAGE2_STORE_ID || process.env.DASHBOARD_STORE_DIR || process.env.VERCEL_BLOB_RETRIES !== '0') { res.statusCode = 409; res.end('{"error":"Isolation or once-only gate"}'); return; }
  claimed = true;
  let operations = 0; let uploadBytes = 0; let phase = 'once-only';
  const checks: string[] = [];
  // Counts actual requests, including any SDK retry; cap before dispatch. Never logs auth/body.
  class BudgetAgent extends Agent {
    dispatch(options: Parameters<Agent['dispatch']>[0], handler: Parameters<Agent['dispatch']>[1]) {
      // Continuation ledger reserves40 prior +30 setup/cleanup operations.
      if (operations >= 130) throw new TypeError('Synthetic operation cap');
      operations++;
      return super.dispatch(options, handler);
    }
  }
  setGlobalDispatcher(new BudgetAgent());
  const count = (text: string) => { uploadBytes += Buffer.byteLength(text); assert(uploadBytes <= 90 * 1024); };
  const proto = VercelBlobStorageClient.prototype;
  const write = proto.writeBlobIfChanged; const manifest = proto.writeManifest; const pointer = proto.writePointer; const lock = proto.withLock;
  let fault: 'none' | 'pointer' | 'receipt' = 'none';
  proto.writeBlobIfChanged = async function(p, text, m) {
    count(text);
    if (fault === 'receipt' && p === 'publication/latest.json' && JSON.parse(text).phases.products?.result) { fault = 'none'; throw new Error('Synthetic receipt fault'); }
    return write.call(this, p, text, m);
  };
  proto.writeManifest = async function(m) { count(JSON.stringify(m, null, 2)); return manifest.call(this, m); };
  proto.writePointer = async function(m, p) { count(JSON.stringify({ manifestPath: m, productsManifestPath: p ?? null }, null, 2)); if (fault === 'pointer') { fault = 'none'; throw new Error('Synthetic pointer fault'); } return pointer.call(this, m, p); };
  proto.withLock = async function<T>(fn: () => Promise<T>): Promise<T> { count('{}'); return lock.call(this, fn) as Promise<T>; };
  const request = (body: unknown, verification = false, auth = true) => new Request('https://synthetic.invalid/api', { method: 'POST', headers: auth ? { [verification ? 'x-publication-verify-secret' : 'x-dashboard-secret']: process.env[verification ? 'MEALS_PUBLICATION_VERIFY_SECRET' : 'MEALS_DASHBOARD_DATA_SECRET']! } : {}, body: JSON.stringify(body) }) as never;
  const store = new VercelBlobStorageClient();
  try {
    // Cross-instance once-only fence, not deleted by suite; store teardown removes it.
    count('{}'); await put('publication/suite-once.json', '{}', { access: 'private', addRandomSuffix: false, allowOverwrite: false });
    phase = 'primitives';
    count('{"owner":1}'); const held = await put('publication/lock.json', '{"owner":1}', { access: 'private', addRandomSuffix: false, allowOverwrite: false });
    let excluded = false; let entered = false;
    try { await store.withLock(async () => { entered = true; }); } catch (error) { excluded = error instanceof Error && /exists|overwrite/i.test(error.message); }
    assert(excluded && !entered);
    let wrongEtagDenied = false;
    try { await del(held.url, { ifMatch: '"not-the-etag"' }); } catch (error) { wrongEtagDenied = error instanceof BlobPreconditionFailedError; }
    assert(wrongEtagDenied);
    const fresh = await get('publication/lock.json', { access: 'private', useCache: false });
    assert(fresh?.statusCode === 200 && (await new Response(fresh.stream).json()).owner === 1);
    await del(held.url, { ifMatch: held.etag });
    assert(await get('publication/lock.json', { access: 'private', useCache: false }) === null);
    checks.push('create-if-absent-exclusion', 'fresh-read', 'conditional-release');

    const id = { version: 1, runId: 'a'.repeat(32), generation: 100, target: 'primary', phase: 'main' };
    const order = { orderBlobPath: 'orders/2026-09-25/synthetic.json', items: [] };
    const coverage = { coverageBlobPath: 'coverage/2026-09-25.json', meals: [] };
    const stamp = '2026-09-25T00:00:00Z';
    const payload = { orders: [order], coverage: [coverage], summary: {}, deliveryWindows: [], coverageWindow: [], dataGeneratedAt: stamp, uiUpdatedAt: stamp, publication: id };
    phase = 'main';
    assert((await main(request(payload, false, false))).status === 401);
    const mr = await main(request(payload)); assert(mr.status === 200); const ack = await mr.json();
    const before = await store.readJsonBlob('publication/latest.json');
    assert((await main(request(payload))).status === 200);
    assert(canonicalHash(await store.readJsonBlob('publication/latest.json')) === canonicalHash(before));
    assert((await main(request({ ...payload, publication: { ...id, generation: 99 } }))).status === 409);
    assert((await main(request({ ...payload, summary: { changed: true } }))).status === 409);
    checks.push('authenticated-main', 'duplicate-receipt', 'stale-generation', 'identity-conflict');
    const product = { productBlobPath: 'products/1.json', tpnc: '1', title: 'SYNTHETIC ONLY' };
    const body = { products: [product], mainManifestPath: ack.manifestPath, publication: { ...id, phase: 'products' } };
    phase = 'pointer-fault'; fault = 'pointer';
    assert((await products(request(body))).status === 500); assert(String(fault) === 'none');
    assert((await store.readPointer())?.manifestPath === ack.manifestPath);
    phase = 'receipt-fault'; fault = 'receipt';
    assert((await products(request(body))).status === 500); assert(String(fault) === 'none');
    phase = 'replay'; const pr = await products(request(body)); assert(pr.status === 200); const pa = await pr.json();
    const finalJournal = await store.readJsonBlob<any>('publication/latest.json');
    assert(canonicalHash(finalJournal.phases.main) === canonicalHash((before as any).phases.main));
    assert((await products(request(body))).status === 200);
    checks.push('pointer-fault-preserves-main', 'receipt-fault-replay', 'successful-main-not-replayed');
    const summary = { dataGeneratedAt: stamp, uiUpdatedAt: stamp };
    const sh = createHash('sha256').update(JSON.stringify(summary, null, 2)).digest('hex');
    const expected = { version: 1, runId: id.runId, generation: 100, target: 'primary', mainHash: canonicalHash(payload), productsHash: canonicalHash(body), mainManifestPath: ack.manifestPath, productsManifestPath: pa.productsManifestPath, expectedRecords: { [order.orderBlobPath]: canonicalHash(order), [coverage.coverageBlobPath]: canonicalHash(coverage), [`meta/summary-${sh}.json`]: canonicalHash(summary), [product.productBlobPath]: canonicalHash(product) } };
    phase = 'exact-verification';
    assert((await verify(request(expected, true, false))).status === 401);
    const vr = await verify(request(expected, true)); assert(vr.status === 200); assert((await vr.json()).hashesMatch === true);
    assert((await verify(request({ ...expected, operation: 'delete' }, true))).status === 400);
    assert((await verify(request({ ...expected, mainHash: 'b'.repeat(64) }, true))).status === 409);
    checks.push('server-only-exact-readback', 'separate-verification-auth', 'arbitrary-operation-refused', 'mismatch-refused');
    phase = 'inventory';
    assert(await get('publication/lock.json', { access: 'private', useCache: false }) === null);
    res.statusCode = 200; res.end(JSON.stringify({ ok: true, checks, operations, uploadBytes, source: process.env.STAGE2_SOURCE_SHA, projectId: process.env.VERCEL_PROJECT_ID, storeId: process.env.STAGE2_STORE_ID, cleanupRequired: true }));
  } catch {
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, phase, checks, operations, uploadBytes, cleanupRequired: true }));
  } finally { proto.writeBlobIfChanged = write; proto.writeManifest = manifest; proto.writePointer = pointer; proto.withLock = lock; }
}
