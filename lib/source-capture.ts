import 'server-only';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import { abortable, category, EXPORT_LIMITS, ExportFailure, hashBytes, object, OVERRIDES, POINTER, type ExportReader, type ExportRecord } from './source-export';
import { parseExportJson } from './source-export-json';

/** A preservation envelope, deliberately NOT the strict v1 complete archive. */
export type SourceCapture = {
  format: 'meal-planner-source-capture.v2'; scope: 'active-references-and-derived-products';
  consistency: 'observed-records-rechecked-not-atomic'; atomicSnapshot: false;
  assessment: {
    productPointer: 'absent' | 'null' | 'referenced';
    productDiscovery: 'references-only-history-unknown';
    overrides: 'present-empty' | 'present-nonempty';
    recordValidation: 'raw-json-not-application-schema';
    historicalCompleteness: 'not-inventoried'; behaviorParity: 'not-certified'; importReady: false;
  };
  records: (ExportRecord & { category: string })[];
};
function check(value: unknown): asserts value { if (!value) throw new ExportFailure('incomplete'); }
const digits = (v: unknown): v is string => typeof v === 'string' && /^[0-9]+$/.exec(v)?.[0] === v;
const sha = (v: unknown): v is string => typeof v === 'string' && v.length === 64 && /^[a-f0-9]+$/.test(v);

/** A monotonic budget: timers alone cannot observe synchronous/microtask work. */
export function createCaptureDeadline(signal: AbortSignal): () => void {
  const end = performance.now() + EXPORT_LIMITS.milliseconds;
  return () => { if (signal.aborted || performance.now() >= end) throw new ExportFailure('deadline'); };
}

/** No listing: history stays unknown. No application coercion or schema-valid claim. */
export async function captureSource(read: ExportReader, signal: AbortSignal, checkDeadline = createCaptureDeadline(signal)): Promise<SourceCapture> {
  const records = new Map<string, { bytes: Uint8Array; value: unknown; digest: string }>();
  let total = 0, steps = 0;
  const cooperate = async () => {
    checkDeadline();
    // Service cancellation/timers even when every read is already cached/resolved.
    if (++steps % 256 === 0) { await setImmediate(); checkDeadline(); }
  };
  const load = async (path: string, reread = false) => {
    checkDeadline();
    check(category(path));
    const limit = Math.min(EXPORT_LIMITS.objectBytes, EXPORT_LIMITS.totalBytes - total);
    check(limit > 0);
    const bytes = await abortable(() => read(path, limit, signal), signal);
    checkDeadline();
    if (reread && bytes === null) throw new ExportFailure('inconclusive');
    check(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= limit);
    total += bytes.byteLength;
    // Own the bytes: providers must not mutate an observed buffer after validation.
    return Uint8Array.from(bytes);
  };
  const add = async (path: string, expected?: unknown): Promise<unknown> => {
    await cooperate();
    check(category(path));
    let rec = records.get(path);
    if (!rec) {
      check(records.size < EXPORT_LIMITS.records);
      const bytes = await load(path);
      const value = parseExportJson(bytes);
      checkDeadline();
      check(category(path) === 'overrides' ? Array.isArray(value) : object(value));
      // Cache only our owned immutable bytes; each expected hash is still checked.
      const digest = hashBytes(bytes);
      checkDeadline();
      rec = { bytes, value, digest }; records.set(path, rec);
    }
    const { digest } = rec;
    if (expected !== undefined) check(sha(expected) && digest === expected);
    if (path.startsWith('meta/')) check(path.endsWith(`-${digest}.json`));
    return rec.value;
  };
  const pointer = await add(POINTER);
  check(object(pointer) && Object.keys(pointer).every(k => ['manifestPath', 'productsManifestPath'].includes(k)));
  check(typeof pointer.manifestPath === 'string' && category(pointer.manifestPath) === 'dashboardManifest');
  const productPointer = !Object.hasOwn(pointer, 'productsManifestPath') ? 'absent' : pointer.productsManifestPath === null ? 'null' : 'referenced';
  if (productPointer === 'referenced') check(typeof pointer.productsManifestPath === 'string' && category(pointer.productsManifestPath) === 'productsManifest');
  const manifest = await add(pointer.manifestPath); check(object(manifest));
  check(Object.keys(manifest).length <= EXPORT_LIMITS.records);
  for (const [path, expected] of Object.entries(manifest).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    check(['summary', 'coverage', 'orders', 'products', 'productsManifest'].includes(category(path) ?? '') && sha(expected));
    await add(path, expected);
  }
  if (productPointer === 'referenced') await add(pointer.productsManifestPath as string);
  // Map iteration visits newly discovered coverage-order/product dependencies too.
  for (const [path, { value }] of records) {
    check(object(value));
    switch (category(path)) {
      case 'productsManifest':
        check(Object.keys(value).length <= EXPORT_LIMITS.records);
        for (const [id, productPath] of Object.entries(value)) {
          check(digits(id) && productPath === `products/${id}.json`);
          await add(productPath as string);
        }
        break;
      case 'coverage':
        check(Array.isArray(value.meals));
        if (value.sourceOrderBlobPath != null) {
          check(typeof value.sourceOrderBlobPath === 'string' && category(value.sourceOrderBlobPath) === 'orders');
          await add(value.sourceOrderBlobPath);
        }
        break;
      case 'orders':
        check(Array.isArray(value.items));
        for (const item of value.items) {
          await cooperate();
          check(object(item));
          if (item.tpnc != null) {
            check(digits(item.tpnc));
            await add(`products/${item.tpnc}.json`);
          }
          if (item.productBlobPath != null) {
            check(typeof item.productBlobPath === 'string' && category(item.productBlobPath) === 'products');
            if (item.tpnc != null) check(item.productBlobPath === `products/${item.tpnc}.json`);
            await add(item.productBlobPath);
          }
        }
        break;
    }
  }
  const overrides = await add(OVERRIDES); check(Array.isArray(overrides));
  check([...records.keys()].filter(p => category(p) === 'summary').length === 1);
  for (const path of [...records.keys()].filter(p => p !== POINTER).sort().concat(POINTER)) {
    const digest = hashBytes(await load(path, true));
    checkDeadline();
    if (digest !== records.get(path)!.digest) throw new ExportFailure('inconclusive');
  }
  const capture: SourceCapture = {
    format: 'meal-planner-source-capture.v2', scope: 'active-references-and-derived-products',
    consistency: 'observed-records-rechecked-not-atomic', atomicSnapshot: false,
    assessment: {
      productPointer, productDiscovery: 'references-only-history-unknown',
      overrides: overrides.length === 0 ? 'present-empty' : 'present-nonempty',
      recordValidation: 'raw-json-not-application-schema', historicalCompleteness: 'not-inventoried',
      behaviorParity: 'not-certified', importReady: false,
    },
    records: [...records].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, { bytes, digest }]) => {
      checkDeadline();
      return { path, category: category(path)!, identity: hashBytes(path), sha256: digest, bytes: bytes.byteLength, base64: Buffer.from(bytes).toString('base64') };
    }),
  };
  const size = Buffer.byteLength(JSON.stringify(capture));
  checkDeadline();
  check(size <= EXPORT_LIMITS.responseBytes);
  return capture;
}
