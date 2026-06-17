import 'server-only';
import type { DashboardDataReader } from '../dashboard-data';
import type { Manifest, PointerContents } from '../blob-storage';
import type { SplitLayoutPayload } from '../dashboard-sync';

/**
 * lib/fixtures/static-fixture-reader.ts
 *
 * Spec 024 / FR-003 / FR-011 / FR-012 — Demo-mode DashboardDataReader.
 *
 * Reads from the bundled fixture JSON (`lib/fixtures/dashboard-fixture.json`,
 * generated at build time by `lib/fixtures/scripts/generate-fixture.mjs`).
 * The fixture conforms to SplitLayoutPayload, the same shape the production
 * Python sync pipeline writes to Vercel Blob.
 *
 * At module init:
 *   - JSON is parsed via top-level import (Next.js bundles it)
 *   - Path index is built: every path the fixture references
 *     (orders/{date}/{num}.json, coverage/{date}.json,
 *      products/{tpnc}.json, meta/summary-{hash}.json,
 *      meta/manifest-{hash}.json) maps to the parsed JSON content
 *   - Shape is validated; throws on mismatch
 *
 * At request time:
 *   - readPointer() returns a synthetic pointer pointing at the bundled manifest
 *   - readManifest(path) returns the bundled manifest
 *   - readJsonBlob(path) returns the bundled content for the path, or null
 *   - listPaths(prefix) returns every indexed path starting with prefix
 *
 * The reader makes NO network requests (NFR-007). All data is in-memory.
 */
import fixtureData from './dashboard-fixture.json';

// ---------------------------------------------------------------------------
// Validate the fixture at module init. Throw on mismatch — the consumer
// (StaticFixtureReader) cannot serve meaningful data with a broken fixture,
// and a clear throw at module load beats silent empty responses.
// ---------------------------------------------------------------------------

interface RawFixture {
  orders?: Array<{ orderBlobPath?: string } & Record<string, unknown>>;
  coverage?: Array<{ coverageBlobPath?: string } & Record<string, unknown>>;
  products?: Array<{ productBlobPath?: string } & Record<string, unknown>>;
  summary?: Record<string, unknown>;
  coverageWindow?: string[];
  dataGeneratedAt?: string;
  uiUpdatedAt?: string;
  deliveryWindows?: unknown[];
}

const fixture = fixtureData as unknown as RawFixture;

// After validateFixture runs, fixture.orders, fixture.coverage, fixture.summary,
// etc. are guaranteed to be defined and well-typed. Re-cast to a non-optional
// type so the rest of the module can use the values without `!` everywhere.
type ValidatedFixture = {
  orders: Array<{ orderBlobPath: string } & Record<string, unknown>>;
  coverage: Array<{ coverageBlobPath: string; date: string } & Record<string, unknown>>;
  products: Array<{ productBlobPath: string; tpnc: string } & Record<string, unknown>>;
  summary: Record<string, unknown>;
  coverageWindow: string[];
  dataGeneratedAt: string;
  uiUpdatedAt: string;
  deliveryWindows?: unknown[];
};

const validFixture: ValidatedFixture = fixture as ValidatedFixture;

function validateFixture(f: RawFixture): void {
  if (!f || typeof f !== 'object') {
    throw new Error('StaticFixtureReader: fixture JSON is not an object');
  }
  if (!Array.isArray(f.orders) || f.orders.length === 0) {
    throw new Error('StaticFixtureReader: fixture has no orders');
  }
  if (!Array.isArray(f.coverage) || f.coverage.length === 0) {
    throw new Error('StaticFixtureReader: fixture has no coverage blobs');
  }
  if (!f.summary || typeof f.summary !== 'object') {
    throw new Error('StaticFixtureReader: fixture has no summary');
  }
  if (!Array.isArray(f.coverageWindow) || f.coverageWindow.length === 0) {
    throw new Error('StaticFixtureReader: fixture has no coverageWindow');
  }
  if (typeof f.dataGeneratedAt !== 'string') {
    throw new Error('StaticFixtureReader: fixture has no dataGeneratedAt');
  }
  if (typeof f.uiUpdatedAt !== 'string') {
    throw new Error('StaticFixtureReader: fixture has no uiUpdatedAt');
  }
  for (const order of f.orders) {
    if (typeof order.orderBlobPath !== 'string') {
      throw new Error('StaticFixtureReader: order missing orderBlobPath');
    }
  }
  for (const cov of f.coverage) {
    if (typeof cov.coverageBlobPath !== 'string') {
      throw new Error('StaticFixtureReader: coverage missing coverageBlobPath');
    }
  }
  if (f.products) {
    for (const product of f.products) {
      if (typeof product.productBlobPath !== 'string') {
        throw new Error('StaticFixtureReader: product missing productBlobPath');
      }
    }
  }
}

validateFixture(fixture);

// ---------------------------------------------------------------------------
// Build the in-memory path index. Each known path maps to the parsed JSON
// content (already-validated, so the consumer can use it directly).
// ---------------------------------------------------------------------------

/** Deterministic placeholder hashes (not real sha256s — these are *fixture* paths,
 *  not production ones). The blob-storage reader never validates them, it just
 *  stores them in the manifest map. Using short stable strings keeps the JSON
 *  output small and the test assertions simple. */
function syntheticHash(prefix: string, key: string): string {
  return `${prefix}-${key}`;
}

const orderBlobIndex = new Map<string, Record<string, unknown>>();
for (const order of validFixture.orders) {
  orderBlobIndex.set(order.orderBlobPath, order);
}

const coverageBlobIndex = new Map<string, Record<string, unknown>>();
for (const cov of validFixture.coverage) {
  coverageBlobIndex.set(cov.coverageBlobPath, cov);
}

const productBlobIndex = new Map<string, Record<string, unknown>>();
if (validFixture.products) {
  for (const product of validFixture.products) {
    productBlobIndex.set(product.productBlobPath, product);
  }
}

// Synthetic summary blob. Stored at meta/summary-<hash>.json like production.
const summaryPath = `meta/summary-tf-${syntheticHash(
  'sum',
  String(validFixture.orders[0]?.orderNumber ?? 'unknown')
)}.json`;
const summaryContent: Record<string, unknown> = { ...validFixture.summary };

// Synthetic products manifest (the tpnc → path map the production flow writes).
// Stored at meta/products-manifest-<hash>.json.
const productsManifest: Record<string, string> = {};
for (const product of validFixture.products ?? []) {
  const tpnc = String((product as Record<string, unknown>).tpnc ?? '');
  if (tpnc) productsManifest[tpnc] = product.productBlobPath;
}
const productsManifestPath: string | null =
  Object.keys(productsManifest).length > 0
    ? `meta/products-manifest-tf-${syntheticHash(
        'pm',
        Object.keys(productsManifest).join(',').slice(0, 32)
      )}.json`
    : null;

// Synthetic manifest: every blob path → synthetic hash. Same shape as the
// Vercel Blob reader's `Manifest` type (`path → sha256 hex`).
const manifest: Manifest = {};
for (const order of validFixture.orders) {
  manifest[order.orderBlobPath] = syntheticHash('ord', order.orderBlobPath);
}
for (const cov of validFixture.coverage) {
  manifest[cov.coverageBlobPath] = syntheticHash('cov', cov.date);
}
for (const product of validFixture.products ?? []) {
  manifest[product.productBlobPath] = syntheticHash(
    'prod',
    String((product as Record<string, unknown>).tpnc ?? '')
  );
}
manifest[summaryPath] = syntheticHash('sum', String(Object.keys(manifest).length));
if (productsManifestPath) {
  manifest[productsManifestPath] = syntheticHash(
    'pm',
    String(Object.keys(productsManifest).length)
  );
}

const manifestPath = `meta/manifest-tf-${syntheticHash(
  'm',
  String(Object.keys(manifest).length)
)}.json`;

// All indexed paths (for listPaths). Includes the synthetic pointer path,
// manifest path, summary path, products manifest path, and every blob.
const allPaths: string[] = [
  'pointers/latest.json',
  manifestPath,
  summaryPath,
  ...Array.from(orderBlobIndex.keys()),
  ...Array.from(coverageBlobIndex.keys()),
  ...Array.from(productBlobIndex.keys()),
];
if (productsManifestPath) allPaths.push(productsManifestPath);

// ---------------------------------------------------------------------------
// StaticFixtureReader
// ---------------------------------------------------------------------------

export class StaticFixtureReader implements DashboardDataReader {
  /**
   * Synthetic pointer. The Vercel Blob flow reads `pointers/latest.json`
   * to discover which manifest to fetch; the fixture reader returns a
   * pointer pointing at the synthetic manifest above. The contents match
   * `PointerContents` from `lib/blob-storage.ts` (manifestPath +
   * productsManifestPath).
   */
  async readPointer(): Promise<PointerContents | null> {
    return {
      manifestPath,
      productsManifestPath: productsManifestPath ?? null,
    };
  }

  async readManifest(_path: string): Promise<Manifest> {
    // The argument is the path returned by `readPointer()`; in fixture
    // mode there's only one manifest, so we return it regardless.
    void _path;
    return manifest;
  }

  async readJsonBlob<T = unknown>(path: string): Promise<T | null> {
    if (path === 'pointers/latest.json') {
      return {
        manifestPath,
        productsManifestPath: productsManifestPath ?? null,
      } as unknown as T;
    }
    if (path === manifestPath) return manifest as unknown as T;
    if (path === summaryPath) return summaryContent as unknown as T;
    if (path === productsManifestPath) return productsManifest as unknown as T;
    const order = orderBlobIndex.get(path);
    if (order) return order as unknown as T;
    const cov = coverageBlobIndex.get(path);
    if (cov) return cov as unknown as T;
    const product = productBlobIndex.get(path);
    if (product) return product as unknown as T;
    return null;
  }

  async listPaths(prefix: string): Promise<string[]> {
    return allPaths.filter((p) => p.startsWith(prefix));
  }
}

// ---------------------------------------------------------------------------
// Exposed for tests + introspection (NOT part of the DashboardDataReader
// interface). The dashboard read path uses these to render the same UI
// surfaces from fixture data without extra plumbing.
// ---------------------------------------------------------------------------

/** The synthetic manifest path the fixture's pointer resolves to. */
export const FIXTURE_MANIFEST_PATH = manifestPath;

/** The synthetic summary blob path. */
export const FIXTURE_SUMMARY_PATH = summaryPath;

/** The synthetic products-manifest blob path (or null if no products). */
export const FIXTURE_PRODUCTS_MANIFEST_PATH = productsManifestPath;

/** The raw fixture object (already validated). */
export const FIXTURE_PAYLOAD: SplitLayoutPayload = validFixture as unknown as SplitLayoutPayload;