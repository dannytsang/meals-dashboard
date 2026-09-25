import 'server-only';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { get } from '@vercel/blob';

const MAX_RECORD = 1024 * 1024;
const MAX_TOTAL = 8 * MAX_RECORD;
const MAX_RECORDS = 1000;
const HASH = /^[a-f0-9]{64}$/;
const MAIN = /^meta\/manifest-[a-f0-9]{64}\.json$/;
const PRODUCTS = /^meta\/products-manifest-[a-f0-9]{64}\.json$/;
const SUMMARY = /^meta\/summary-[a-f0-9]{64}\.json$/;
const ORDER = /^orders\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+\.json$/;
const COVERAGE = /^coverage\/\d{4}-\d{2}-\d{2}\.json$/;
const PRODUCT = /^products\/\d+\.json$/;
const exact = (v: unknown, re: RegExp): v is string => typeof v === 'string' && re.exec(v)?.[0] === v;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (): never => { throw new Error('Publication verification failed'); };
function requireTrue(v: unknown): asserts v { if (!v) fail(); }
function recordPath(p: string): boolean {
  return p.length <= 200 && [ORDER, COVERAGE, SUMMARY, PRODUCT].some(re => exact(p, re));
}
function readablePath(p: string): boolean {
  return recordPath(p) || exact(p, MAIN) || exact(p, PRODUCTS) || ['pointers/latest.json', 'publication/latest.json'].includes(p);
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (object(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const canonicalHash = (v: unknown): string => hash(canonical(v));
export interface Verification {
  version: 1; runId: string; generation: number; target: 'primary' | 'secondary';
  mainHash: string; productsHash: string; mainManifestPath: string; productsManifestPath: string;
  expectedRecords: Record<string, string>;
}
export function parseVerification(raw: unknown): Verification {
  requireTrue(object(raw));
  const keys = ['version', 'runId', 'generation', 'target', 'mainHash', 'productsHash', 'mainManifestPath', 'productsManifestPath', 'expectedRecords'];
  requireTrue(Object.keys(raw).length === keys.length && Object.keys(raw).every(k => keys.includes(k)));
  requireTrue(raw.version === 1 && exact(raw.runId, /^[a-f0-9]{32}$/));
  requireTrue(Number.isSafeInteger(raw.generation) && (raw.generation as number) > 0);
  requireTrue(['primary', 'secondary'].includes(raw.target as string));
  requireTrue(exact(raw.mainHash, HASH) && exact(raw.productsHash, HASH));
  requireTrue(exact(raw.mainManifestPath, MAIN) && exact(raw.productsManifestPath, PRODUCTS));
  requireTrue(object(raw.expectedRecords));
  const entries = Object.entries(raw.expectedRecords);
  requireTrue(entries.length > 0 && entries.length <= MAX_RECORDS);
  requireTrue(entries.every(([p, h]) => recordPath(p) && exact(h, HASH)));
  return raw as unknown as Verification;
}

/** Bounded stream consumption; cancellation occurs even for oversized responses. */
export async function boundedText(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; requireTrue(size <= limit); chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Private server-side reader: no list, no URLs supplied by callers, no cache. */
export function createVerificationReader(): (path: string) => Promise<string> {
  const localRoot = process.env.DASHBOARD_STORE_DIR;
  return async path => {
    requireTrue(readablePath(path));
    if (localRoot) {
      let location = resolve(localRoot);
      requireTrue(!(await lstat(location)).isSymbolicLink());
      const parts = path.split('/');
      for (const part of parts.slice(0, -1)) {
        location = join(location, part); const info = await lstat(location);
        requireTrue(info.isDirectory() && !info.isSymbolicLink());
      }
      // Store directory is trusted server config; publication lock serializes writers.
      const file = await open(join(location, parts.at(-1)!), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat(); requireTrue(info.isFile() && info.size <= MAX_RECORD);
        const bytes = Buffer.alloc(MAX_RECORD + 1); let size = 0;
        while (size < bytes.length) {
          const { bytesRead } = await file.read(bytes, size, bytes.length - size, null);
          if (!bytesRead) break; size += bytesRead;
        }
        requireTrue(size <= MAX_RECORD);
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
      } finally { await file.close(); }
    }
    const result = await get(path, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(15_000) });
    requireTrue(result?.statusCode === 200 && result.stream);
    return boundedText(result.stream, MAX_RECORD);
  };
}

/** Caller must authenticate, validate input and own the protocol lock. No writes. */
export async function verifyPublication(expected: Verification, read: (path: string) => Promise<string>) {
  let total = 0;
  const load = async (p: string) => {
    requireTrue(readablePath(p));
    const text = await read(p); const size = Buffer.byteLength(text); total += size;
    requireTrue(size <= MAX_RECORD && total <= MAX_TOTAL);
    const value: unknown = JSON.parse(text); requireTrue(object(value));
    return { text, value };
  };
  const { value: pointer } = await load('pointers/latest.json');
  requireTrue(pointer.manifestPath === expected.mainManifestPath && pointer.productsManifestPath === expected.productsManifestPath);
  const { value: journal } = await load('publication/latest.json');
  requireTrue(journal.runId === expected.runId && journal.generation === expected.generation && journal.target === expected.target && object(journal.phases));
  const mainReceipt = journal.phases.main; const productsReceipt = journal.phases.products;
  requireTrue(object(mainReceipt) && object(productsReceipt));
  requireTrue(mainReceipt.hash === expected.mainHash && productsReceipt.hash === expected.productsHash);
  requireTrue(object(mainReceipt.result) && object(productsReceipt.result));
  requireTrue(mainReceipt.result.publicationProtocol === 1 && productsReceipt.result.publicationProtocol === 1);
  requireTrue(mainReceipt.result.manifestPath === expected.mainManifestPath && productsReceipt.result.manifestPath === expected.mainManifestPath && productsReceipt.result.productsManifestPath === expected.productsManifestPath);
  const main = await load(expected.mainManifestPath); const products = await load(expected.productsManifestPath);
  requireTrue(`meta/manifest-${hash(main.text)}.json` === expected.mainManifestPath);
  requireTrue(`meta/products-manifest-${hash(products.text)}.json` === expected.productsManifestPath);
  const entries = Object.entries(main.value); const productEntries = Object.entries(products.value);
  requireTrue(entries.length <= MAX_RECORDS && productEntries.length <= MAX_RECORDS);
  requireTrue(entries.every(([p, h]) => recordPath(p) && !exact(p, PRODUCT) && exact(h, HASH)));
  requireTrue(productEntries.every(([id, p]) => exact(id, /^\d+$/) && p === `products/${id}.json` && recordPath(p)));
  const paths = [...entries.map(([p]) => p), ...productEntries.map(([, p]) => p as string)];
  requireTrue(paths.length <= MAX_RECORDS && new Set(paths).size === paths.length);
  requireTrue(paths.length === Object.keys(expected.expectedRecords).length && paths.every(p => Object.hasOwn(expected.expectedRecords, p)));
  const records = { orders: 0, coverage: 0, summaries: 0, products: 0 };
  for (const path of paths) {
    const record = await load(path);
    requireTrue(canonicalHash(record.value) === expected.expectedRecords[path]);
    if (Object.hasOwn(main.value, path)) requireTrue(hash(record.text) === main.value[path]);
    if (exact(path, SUMMARY)) { requireTrue(`meta/summary-${hash(record.text)}.json` === path); records.summaries++; }
    else if (exact(path, ORDER)) records.orders++;
    else if (exact(path, COVERAGE)) records.coverage++;
    else records.products++;
  }
  requireTrue(records.summaries === 1);
  // Detect accidental/unfenced control-plane changes; not a substitute for old-writer exclusion.
  requireTrue(canonicalHash((await load('pointers/latest.json')).value) === canonicalHash(pointer));
  requireTrue(canonicalHash((await load('publication/latest.json')).value) === canonicalHash(journal));
  return { ok: true, records, receiptsMatch: true, hashesMatch: true, associationMatch: true };
}
