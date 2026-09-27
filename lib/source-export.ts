import 'server-only';
import { createHash } from 'node:crypto';
import { parseExportJson } from './source-export-json';
import { ExportFailure, atStage, atStageAsync, verifyExport, verifyPointer, type DiagnosticCategory } from './source-export-diagnostic';
export { ExportFailure } from './source-export-diagnostic';

export const EXPORT_LIMITS = Object.freeze({ records: 1000, objectBytes: 1048576, totalBytes: 4194304, responseBytes: 3670016, milliseconds: 25000, requestBytes: 256 });
export const POINTER = 'pointers/latest.json';
export const OVERRIDES = 'overrides/manual.json';
export const hashBytes = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
function check(ok: unknown): asserts ok { if (!ok) throw new ExportFailure('incomplete'); }
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, re: RegExp): v is string => typeof v === 'string' && re.exec(v)?.[0] === v;
const date = (v: unknown): v is string => exact(v, /^\d{4}-\d{2}-\d{2}$/) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown) => finite(v) && Number.isSafeInteger(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
export function category(p: string): DiagnosticCategory | null {
  if (p.length > 200) return null;
  if (p === POINTER) return 'pointer';
  if (p === OVERRIDES) return 'overrides';
  for (const [name, re] of [
    ['dashboardManifest', /^meta\/manifest-[a-f0-9]{64}\.json$/],
    ['productsManifest', /^meta\/products-manifest-[a-f0-9]{64}\.json$/],
    ['summary', /^meta\/summary-[a-f0-9]{64}\.json$/],
    ['coverage', /^coverage\/\d{4}-\d{2}-\d{2}\.json$/],
    ['orders', /^orders\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+\.json$/],
    ['products', /^products\/\d+\.json$/],
  ] as const) if (exact(p, re)) return name;
  return null;
}

/** Matches the existing offline inventory storage schema, not meal-policy parity. */
function validateRecord(cat: string, path: string, v: unknown): void {
  if (cat === 'overrides') {
    check(Array.isArray(v)); const ids = new Set<string>();
    for (const e of v) {
      check(object(e) && date(e.meal_date) && ['meal_name', 'item_name', 'reason', 'created_at', 'updated_at'].every(k => typeof e[k] === 'string') && finite(e.quantity) && typeof e.status === 'string' && ['covered', 'partial'].includes(e.status));
      const id = JSON.stringify([e.meal_date, e.meal_name, e.item_name]); check(!ids.has(id)); ids.add(id);
    }
    return;
  }
  if (cat === 'pointer') verifyPointer(object(v), 'pointer_object');
  check(object(v));
  if (cat === 'summary') check(['covered', 'missing', 'meals_total', 'meals_covered'].every(k => integer(v[k])) && finite(v.coverage_percentage) && v.coverage_percentage <= 100 && finite(v.order_total) && typeof v.delivery_date === 'string' && object(v.windows) && ['last_delivery', 'next_delivery', 'next_window_end'].every(k => (v.windows as Record<string, unknown>)[k] === null || date((v.windows as Record<string, unknown>)[k])) && Number(v.meals_covered) <= Number(v.meals_total));
  if (cat === 'coverage') check(date(v.date) && path === `coverage/${v.date}.json` && (v.sourceOrderBlobPath === null || typeof v.sourceOrderBlobPath === 'string' && category(v.sourceOrderBlobPath) === 'orders') && Array.isArray(v.meals) && v.meals.every(e => object(e) && object(e.meal) && typeof e.meal.id === 'string' && typeof e.meal.content === 'string' && e.meal.date === v.date && strings(e.meal.labels) && typeof e.meal.section === 'string' && typeof e.status === 'string' && ['covered', 'partial', 'missing', 'unknown'].includes(e.status) && finite(e.coverageScore) && Array.isArray(e.matchedItems) && strings(e.missingItems)));
  if (cat === 'orders') check(typeof v.orderNumber === 'string' && !!v.orderNumber && date(v.deliveryDate) && path.startsWith(`orders/${v.deliveryDate}/`) && typeof v.deliverySlot === 'string' && finite(v.orderTotal) && ['substitutions', 'unavailable', 'shortLifeItems'].every(k => Array.isArray(v[k])) && Array.isArray(v.items) && v.items.every(e => object(e) && typeof e.name === 'string' && finite(e.quantity) && (e.tpnc == null || exact(e.tpnc, /^\d+$/))) && (v.status === undefined || typeof v.status === 'string' && ['active', 'cancelled', 'superseded', 'refunded'].includes(v.status)));
  if (cat === 'products') check((v.tpnc === null || typeof v.tpnc === 'string' && path === `products/${v.tpnc}.json`) && ['gtin', 'tpnb'].every(k => v[k] === null || typeof v[k] === 'string') && ['title', 'description', 'storage', 'preparation', 'ingredients', 'allergens', 'nutrition', 'brand', 'category', 'imageUrl', 'productUrl', 'source', 'lastFetched'].every(k => typeof v[k] === 'string'));
}

/** Abort even if an SDK/test stream stalls; never wait for cancellation to settle. */
export async function abortable<T>(call: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new ExportFailure('deadline');
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([call(), new Promise<never>((_, reject) => {
      onAbort = () => reject(new ExportFailure('deadline'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    })]);
  } finally { signal.removeEventListener('abort', onAbort); }
}
export async function boundedBytes(stream: ReadableStream<Uint8Array>, limit: number, signal: AbortSignal): Promise<Buffer> {
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(() => reader.read(), signal); if (done) break;
      size += value.byteLength; verifyExport(size <= limit, 'source_bound', 'none'); chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export type ExportReader = (path: string, maxBytes: number, signal: AbortSignal) => Promise<Uint8Array | null>;
export type ExportRecord = { path: string; identity: string; sha256: string; bytes: number; base64: string };
export type SourceArchive = {
  format: 'meal-planner-source-export.v1'; scope: 'active-reachable-with-retained-history';
  consistency: 'observed-records-rechecked-not-atomic'; atomicSnapshot: false; records: ExportRecord[];
};

/** Read-only traversal: no listing, URL following, locks, writer or producer dependencies. */
export async function exportSource(read: ExportReader, signal: AbortSignal): Promise<SourceArchive> {
  const records = new Map<string, { bytes: Uint8Array; value: unknown }>(); let total = 0;
  const load = async (path: string, reread = false): Promise<Uint8Array> => {
    const cat = category(path); verifyExport(cat, 'graph_schema', 'none');
    const limit = Math.min(EXPORT_LIMITS.objectBytes, EXPORT_LIMITS.totalBytes - total); verifyExport(limit > 0, 'source_bound', cat);
    const bytes = await atStageAsync('provider_read', cat, () => abortable(() => read(path, limit, signal), signal));
    if (reread && bytes === null) throw new ExportFailure('inconclusive', 'consistency', cat);
    verifyExport(bytes instanceof Uint8Array, 'provider_read', cat);
    verifyExport(bytes.byteLength <= limit, 'source_bound', cat);
    total += bytes.byteLength; return bytes;
  };
  const add = async (path: string, expected?: string): Promise<unknown> => {
    const cat = category(path) ?? 'none';
    let rec = records.get(path);
    if (!rec) {
      verifyExport(records.size < EXPORT_LIMITS.records, 'source_bound', cat);
      const bytes = await load(path);
      const value = atStage('record_json', cat, () => parseExportJson(bytes));
      atStage('record_schema', cat, () => validateRecord(cat, path, value));
      rec = { bytes, value }; records.set(path, rec);
    }
    const digest = hashBytes(rec.bytes);
    if (expected !== undefined) verifyExport(exact(expected, /^[a-f0-9]{64}$/) && digest === expected, 'integrity', cat);
    if (path.startsWith('meta/')) verifyExport(path.endsWith(`-${digest}.json`), 'integrity', cat);
    return rec.value;
  };
  const pointer = await add(POINTER); verifyPointer(object(pointer), 'pointer_object');
  verifyPointer(Object.hasOwn(pointer, 'manifestPath'), 'main_absent');
  verifyPointer(typeof pointer.manifestPath === 'string' && category(pointer.manifestPath) === 'dashboardManifest', 'main_invalid');
  verifyPointer(Object.hasOwn(pointer, 'productsManifestPath'), 'products_absent');
  verifyPointer(pointer.productsManifestPath !== null, 'products_null');
  verifyPointer(typeof pointer.productsManifestPath === 'string' && category(pointer.productsManifestPath) === 'productsManifest', 'products_invalid');
  verifyPointer(Object.keys(pointer).every(k => ['manifestPath', 'productsManifestPath'].includes(k)), 'pointer_keys');
  const manifest = await add(pointer.manifestPath); verifyExport(object(manifest), 'graph_schema', 'dashboardManifest');
  verifyExport(Object.keys(manifest).length <= EXPORT_LIMITS.records, 'source_bound', 'dashboardManifest');
  for (const [path, hash] of Object.entries(manifest).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    verifyExport(['summary', 'coverage', 'orders', 'products', 'productsManifest'].includes(category(path) ?? '') && typeof hash === 'string', 'graph_schema', 'dashboardManifest');
    await add(path, hash);
  }
  await add(pointer.productsManifestPath);
  const productPaths = new Set<string>();
  for (const [path, { value }] of [...records]) if (category(path) === 'productsManifest') {
    verifyExport(object(value), 'graph_schema', 'productsManifest');
    verifyExport(Object.keys(value).length <= EXPORT_LIMITS.records, 'source_bound', 'productsManifest');
    for (const [id, pp] of Object.entries(value)) {
      verifyExport(exact(id, /^\d+$/) && pp === `products/${id}.json`, 'graph_schema', 'productsManifest');
      productPaths.add(pp as string); await add(pp as string);
    }
  }
  await add(OVERRIDES);
  verifyExport([...records.keys()].filter(p => category(p) === 'summary').length === 1, 'graph_schema', 'summary');
  const identities = new Set<string>();
  const unique = (id: string, cat: DiagnosticCategory) => { verifyExport(!identities.has(id), 'references', cat); identities.add(id); };
  for (const [path, { value }] of records) {
    if (!object(value)) continue;
    if (category(path) === 'orders') {
      unique(`order:${value.orderNumber}`, 'orders');
      for (const item of value.items as Record<string, unknown>[]) if (item.tpnc != null) verifyExport(productPaths.has(`products/${item.tpnc}.json`), 'references', 'orders');
    }
    if (category(path) === 'coverage') {
      if (typeof value.sourceOrderBlobPath === 'string') verifyExport(records.has(value.sourceOrderBlobPath), 'references', 'coverage');
      for (const entry of value.meals as { meal: { id: string } }[]) unique(`meal:${entry.meal.id}`, 'coverage');
    }
  }
  // Exact-byte rereads include independent products and authoritative overrides.
  // Finish with pointer again; this detects movement, not ABA or atomic whole-store state.
  for (const path of [...records.keys()].filter(p => p !== POINTER).sort().concat(POINTER)) {
    if (hashBytes(await load(path, true)) !== hashBytes(records.get(path)!.bytes)) throw new ExportFailure('inconclusive', 'consistency', category(path)!);
  }
  return atStage('serialization', 'none', () => {
    const archive: SourceArchive = {
      format: 'meal-planner-source-export.v1', scope: 'active-reachable-with-retained-history',
      consistency: 'observed-records-rechecked-not-atomic', atomicSnapshot: false,
      records: [...records].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, { bytes }]) => ({
        path, identity: hashBytes(path), sha256: hashBytes(bytes), bytes: bytes.byteLength, base64: Buffer.from(bytes).toString('base64'),
      })),
    };
    verifyExport(Buffer.byteLength(JSON.stringify(archive)) <= EXPORT_LIMITS.responseBytes, 'serialization', 'none');
    if (signal.aborted) throw new ExportFailure('deadline');
    return archive;
  });
}
