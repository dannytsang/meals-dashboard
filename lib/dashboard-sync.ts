import type {
  Meal,
  TescoReceipt,
  DeliveryWindow,
  GroceryItem,
  MatchedItem,
} from './meals-data';
import type { BlobStorageClient, Manifest } from './blob-storage';
import { createHash } from 'node:crypto';

export interface DashboardSummary {
  coverage_percentage: number;
  covered: number;
  missing: number;
  meals_total: number;
  meals_covered: number;
  order_total: number;
  delivery_date: string;
  /** Spec 019 — the upcoming delivery date, used by the dashboard headline card. */
  next_delivery: string;
  /** When the meals-check pipeline generated this data (ISO string). */
  dataGeneratedAt?: string;
  /** When the dashboard UI was last deployed (git HEAD commit time at sync time, ISO string). */
  uiUpdatedAt?: string;
}

/**
 * Per-date coverage entry persisted at `coverage/{date}.json` (FR-02).
 * `meals` is the list of meals on that date with their individual coverage state.
 * On the read path, this is flattened into the existing `DashboardData.coverage: MealCoverage[]`
 * shape that the dashboard client expects.
 */
export interface CoverageBlob {
  date: string;
  sourceOrderBlobPath: string | null;
  meals: CoverageMealEntry[];
}

export interface CoverageMealEntry {
  meal: Meal;
  status: 'covered' | 'partial' | 'missing' | 'unknown';
  coverageScore: number;
  matchedItems: MatchedItem[];
  missingItems: string[];
  missingExplanations?: string[];
  notes?: string;
  /** Set by spec 019 — null/absent in 016. */
  stale?: boolean;
  staleReason?: string | null;
  /** Set by spec 020 — null/absent in 016. */
  source?: 'order' | 'grocy' | 'manual_override';
  /** Spec 019 / FR-06 — list of items that were refunded and caused
   *  the meal to transition to partial. Renders in a distinct section
   *  with a "£X refunded" badge. */
  refundedItems?: string[];
  /** Spec 019 / FR-08 — manual override annotation when Danny marked
   *  the meal covered/partial via the "I have this" button. */
  manualOverride?: { reason: string; item: string; status: string };
}

export interface OrderBlob {
  orderNumber: string;
  deliveryDate: string;
  deliverySlot: string;
  orderTotal: number;
  items: GroceryItem[];
  substitutions: Array<{ original: string; substitutedWith: string; price?: number }>;
  unavailable: Array<{ name: string; quantity: number }>;
  shortLifeItems: Array<{ name: string; daysRemaining: number }>;
  /** Set by spec 018 — defaults to 'active' in 016. */
  status?: 'active' | 'cancelled' | 'superseded' | 'refunded';
  /** Set by spec 018 when a post-delivery refund reduces the order. */
  refundAmount?: number;
}

export interface ProductBlob {
  tpnc: string | null;
  gtin: string | null;
  tpnb: string | null;
  title: string;
  description: string;
  storage: string;
  preparation: string;
  ingredients: string;
  allergens: string;
  nutrition: string;
  brand: string;
  category: string;
  imageUrl: string;
  productUrl: string;
  source: string;
  lastFetched: string;
  // Spec 027 Rev 2: sync-time Firecrawl search snippet. Optional —
  // existing product blobs written before this spec continue to work
  // unchanged. When populated, the dashboard's `resolveProductInfoForItem`
  // consults `snippet` as the third tier of the `description` fallback
  // chain (after Apollo and curated-static, before the placeholder).
  // `status: 'not_found'` means Firecrawl had no data for this product
  // — the next sync will skip the API call (Open Question 5).
  firecrawl?: {
    snippet: string | null;
    lastFetched: string;
    status?: 'ok' | 'not_found';
  };
}

export interface SplitLayoutPayload {
  orders: Array<OrderBlob & { orderBlobPath: string }>;
  coverage: Array<CoverageBlob & { coverageBlobPath: string }>;
  summary: DashboardSummary;
  deliveryWindows: DeliveryWindow[];
  /** ISO date strings in the visible coverage window. */
  coverageWindow: string[];
  /** When the meals-check pipeline generated this data. */
  dataGeneratedAt: string;
  /** When the dashboard UI was last deployed (git HEAD commit time at sync time). */
  uiUpdatedAt: string;
  /**
   * Spec 021 / FR-003 — individual product blobs written to Vercel Blob.
   * Each entry carries the path (products/{tpnc}.json) and the blob content
   * (the full ProductBlob shape). The Python pipeline assembles this array
   * from the enriched order items and POSTs it alongside orders/coverage.
   */
  products?: Array<{ productBlobPath: string } & ProductBlob>;
}

export interface ProductSyncPayload {
  products: Array<{ productBlobPath: string } & ProductBlob>;
}

export interface SyncResult {
  manifestPath: string;
  manifestHash: string;
  /** Paths actually written (not skipped). */
  writtenPaths: string[];
  /** Paths skipped because hash matched current manifest. */
  skippedPaths: string[];
  /** Total blob operations: written + manifest + pointer. */
  totalOps: number;
  /** True when no manifest existed before this call (first sync). */
  isInitialSync: boolean;
  /** True when manifest/pointer publication was deliberately suppressed for a true no-op sync. */
  suppressedNoopWrites: boolean;
  /** Spec 021 / FR-003 — path to the products manifest blob, if any products were written. */
  productsManifestPath?: string | null;
}

const SUMMARY_PATH_FOR = (hash: string) => `meta/summary-${hash}.json`;
const PRODUCTS_MANIFEST_PREFIX = 'meta/products-manifest-';

function serialiseManifest(manifest: Manifest): { manifestContent: string; manifestHash: string; manifestPath: string } {
  const sorted = Object.keys(manifest).sort().reduce<Manifest>((acc, k) => {
    acc[k] = manifest[k]!;
    return acc;
  }, {});
  const manifestContent = JSON.stringify(sorted, null, 2);
  const manifestHash = createHash('sha256').update(manifestContent, 'utf8').digest('hex');
  const manifestPath = `meta/manifest-${manifestHash}.json`;
  return { manifestContent, manifestHash, manifestPath };
}

/**
 * Execute the storage-layout portion of the sync algorithm (spec 016 §Sync Algorithm).
 *
 * Algorithm (7 steps):
 *  1. Read pointer (manifest path) — null/empty = first sync
 *  2. Fetch current manifest from blob — empty = first sync
 *  3. Build local data blobs (orders, coverage, summary)
 *  4. For each local data blob: compute SHA-256; write if hash differs, skip otherwise
 *  5. Build new manifest dict: start from current, update entries for all written/skipped
 *  6. Serialise new manifest → compute its SHA-256
 *  7. Write manifest to `meta/manifest-{hash}.json`; then write pointer
 *
 * Spec 021 / FR-003 — product blobs are written first (individual products/{tpnc}.json),
 * then a products manifest maps tpnc → productBlobPath. The products manifest path
 * is included in the pointer so the read path can locate it.
 *
 * If step 7 (manifest) fails, the previous manifest remains valid (FR-07).
 * If the pointer write fails, the next sync retries with the same valid manifest (FR-08).
 *
 * @param payload The split-layout payload from the sync script.
 * @param client The Blob storage client (real Vercel SDK in prod, in-memory in tests).
 * @param options.dryRun When true, compute hashes and report what would change but skip writes.
 */
export async function syncDashboardLayout(
  payload: SplitLayoutPayload,
  client: BlobStorageClient,
  options: { dryRun?: boolean } = {}
): Promise<SyncResult> {
  const { dryRun = false } = options;

  // Step 1 + 2: read pointer and current manifest.
  const pointer = await client.readPointer();
  const currentManifest: Manifest = pointer
    ? await client.readManifest(pointer.manifestPath)
    : {};
  const isInitialSync = !pointer;

  // Spec 019 / FR-02 + FR-04 — normalise defaults on the payload so the
  // contract is enforced at the Blob-write boundary regardless of payload
  // provenance (Python sync, hand-built tests, future producers).
  const normalisedPayload = normaliseSplitLayoutPayload(payload);

  // Step 3: build local data blobs.
  // Each blob is keyed by its path; we serialise once and reuse the string for hashing.
  const dataBlobs: Array<{ path: string; content: string }> = [];
  for (const order of normalisedPayload.orders) {
    dataBlobs.push({ path: order.orderBlobPath, content: JSON.stringify(order, null, 2) });
  }
  for (const cov of normalisedPayload.coverage) {
    dataBlobs.push({ path: cov.coverageBlobPath, content: JSON.stringify(cov, null, 2) });
  }
  // Summary is also a content-addressable data blob (FR-13).
  // Inject timestamps into the summary so they survive Blob storage and round-trip.
  const summaryWithTimestamps = {
    ...normalisedPayload.summary,
    dataGeneratedAt: normalisedPayload.dataGeneratedAt ?? '',
    uiUpdatedAt: normalisedPayload.uiUpdatedAt ?? '',
  };
  const summaryContent = JSON.stringify(summaryWithTimestamps, null, 2);
  const summaryHash = client.computeHash(summaryContent);
  const summaryPath = SUMMARY_PATH_FOR(summaryHash);
  dataBlobs.push({ path: summaryPath, content: summaryContent });

  // Step 4: hash dedup + write each data blob.
  const writtenPaths: string[] = [];
  const skippedPaths: string[] = [];
  const newManifest: Manifest = {};

  // Spec 021 / FR-003 — write product blobs and build the products manifest.
  // The products manifest is keyed by tpnc (string) → productBlobPath.
  let productsManifestPath: string | null | undefined = undefined;
  if (normalisedPayload.products && normalisedPayload.products.length > 0) {
    const productsManifest: Record<string, string> = {};
    for (const product of normalisedPayload.products) {
      // Validate path format: products/{tpnc}.json
      if (!/^products\/\d+\.json$/.test(product.productBlobPath)) {
        throw new Error(`Invalid productBlobPath: ${product.productBlobPath}`);
      }
      const content = JSON.stringify(product, null, 2);
      if (!dryRun) {
        const result = await client.writeBlobIfChanged(product.productBlobPath, content, currentManifest);
        newManifest[product.productBlobPath] = result.hash;
        if (result.written) writtenPaths.push(product.productBlobPath);
        else skippedPaths.push(product.productBlobPath);
      } else {
        const hash = client.computeHash(content);
        newManifest[product.productBlobPath] = hash;
        if (currentManifest[product.productBlobPath] === hash) {
          skippedPaths.push(product.productBlobPath);
        } else {
          writtenPaths.push(product.productBlobPath);
        }
      }
      // Extract tpnc from path (e.g. "products/123456.json" → "123456")
      const tpnc = product.productBlobPath.replace('products/', '').replace('.json', '');
      productsManifest[tpnc] = product.productBlobPath;
    }
    // Write products manifest (content-addressable by its own hash).
    const manifestContent = JSON.stringify(productsManifest, null, 2);
    const manifestHash = client.computeHash(manifestContent);
    const computedProductsManifestPath = `${PRODUCTS_MANIFEST_PREFIX}${manifestHash}.json`;
    productsManifestPath = computedProductsManifestPath;
    if (!dryRun) {
      const result = await client.writeBlobIfChanged(computedProductsManifestPath, manifestContent, newManifest);
      newManifest[computedProductsManifestPath] = result.hash;
      if (result.written) writtenPaths.push(computedProductsManifestPath);
      else skippedPaths.push(computedProductsManifestPath);
    }
  }

  for (const { path, content } of dataBlobs) {
    if (!dryRun) {
      const result = await client.writeBlobIfChanged(path, content, currentManifest);
      newManifest[path] = result.hash;
      if (result.written) writtenPaths.push(path);
      else skippedPaths.push(path);
    } else {
      const hash = client.computeHash(content);
      newManifest[path] = hash;
      if (currentManifest[path] === hash) {
        skippedPaths.push(path);
      } else {
        writtenPaths.push(path);
      }
    }
  }

  const { manifestPath, manifestHash } = serialiseManifest(newManifest);
  const currentProductsManifestPath = pointer?.productsManifestPath ?? null;
  const computedProductsManifestPath = productsManifestPath ?? null;
  const trueNoOp =
    !dryRun &&
    !isInitialSync &&
    writtenPaths.length === 0 &&
    pointer !== null &&
    pointer.manifestPath === manifestPath &&
    currentProductsManifestPath === computedProductsManifestPath;

  if (trueNoOp) {
    return {
      manifestPath,
      manifestHash,
      writtenPaths,
      skippedPaths,
      totalOps: 0,
      isInitialSync,
      suppressedNoopWrites: true,
      productsManifestPath: computedProductsManifestPath,
    };
  }

  if (!dryRun) {
    // Step 5–7: write manifest then pointer.
    await client.writeManifest(newManifest);
    await client.writePointer(manifestPath, computedProductsManifestPath);
    return {
      manifestPath,
      manifestHash,
      writtenPaths,
      skippedPaths,
      totalOps: writtenPaths.length + 2, // +manifest +pointer
      isInitialSync,
      suppressedNoopWrites: false,
      productsManifestPath: computedProductsManifestPath,
    };
  }

  // Dry run: report what would change, skip all writes.
  return {
    manifestPath,
    manifestHash: 'dry-run',
    writtenPaths,
    skippedPaths,
    totalOps: writtenPaths.length + 2,
    isInitialSync,
    suppressedNoopWrites:
      !isInitialSync &&
      writtenPaths.length === 0 &&
      pointer !== null &&
      pointer.manifestPath === manifestPath &&
      currentProductsManifestPath === computedProductsManifestPath,
    productsManifestPath: computedProductsManifestPath,
  };
}

/**
 * Execute the product-only publication path (spec 032).
 *
 * The main dashboard manifest is preserved via the existing pointer; this
 * helper only writes products/{tpnc}.json blobs, the products manifest, and
 * the pointer's productsManifestPath.
 */
export async function syncDashboardProducts(
  payload: ProductSyncPayload,
  client: BlobStorageClient,
  options: { dryRun?: boolean } = {}
): Promise<SyncResult> {
  const { dryRun = false } = options;
  const pointer = await client.readPointer();
  if (!pointer) {
    throw new Error(
      'syncDashboardProducts: no manifest pointer exists yet; cannot publish products before an initial dashboard sync.'
    );
  }

  const currentMainManifest: Manifest = await client.readManifest(pointer.manifestPath);
  const currentProductsManifest: Record<string, string> = pointer.productsManifestPath
    ? (await client.readManifest(pointer.productsManifestPath))
    : {};

  const writtenPaths: string[] = [];
  const skippedPaths: string[] = [];
  const newProductsManifest: Record<string, string> = { ...currentProductsManifest };

  for (const product of payload.products ?? []) {
    if (!/^products\/\d+\.json$/.test(product.productBlobPath)) {
      throw new Error(`Invalid productBlobPath: ${product.productBlobPath}`);
    }
    const content = JSON.stringify(product, null, 2);
    if (!dryRun) {
      const result = await client.writeBlobIfChanged(product.productBlobPath, content, currentMainManifest);
      if (result.written) writtenPaths.push(product.productBlobPath);
      else skippedPaths.push(product.productBlobPath);
    } else {
      const hash = client.computeHash(content);
      if (currentMainManifest[product.productBlobPath] === hash) {
        skippedPaths.push(product.productBlobPath);
      } else {
        writtenPaths.push(product.productBlobPath);
      }
    }
    const tpnc =
      typeof product.tpnc === 'string' && product.tpnc
        ? product.tpnc
        : product.productBlobPath.replace('products/', '').replace('.json', '');
    newProductsManifest[tpnc] = product.productBlobPath;
  }

  const currentProductsManifestContent = JSON.stringify(currentProductsManifest, null, 2);
  const currentProductsManifestHash = client.computeHash(currentProductsManifestContent);
  const productsManifestContent = JSON.stringify(newProductsManifest, null, 2);
  const productsManifestHash = client.computeHash(productsManifestContent);
  const productsManifestPath = `${PRODUCTS_MANIFEST_PREFIX}${productsManifestHash}.json`;
  const { manifestHash } = serialiseManifest(currentMainManifest);
  const trueNoOp = !dryRun && writtenPaths.length === 0 && pointer.productsManifestPath === productsManifestPath;

  if (trueNoOp) {
    return {
      manifestPath: pointer.manifestPath,
      manifestHash,
      writtenPaths,
      skippedPaths,
      totalOps: 0,
      isInitialSync: false,
      suppressedNoopWrites: true,
      productsManifestPath,
    };
  }

  if (!dryRun) {
    const currentProductsManifestRef: Manifest =
      pointer.productsManifestPath === productsManifestPath
        ? { [productsManifestPath]: currentProductsManifestHash }
        : {};
    const result = await client.writeBlobIfChanged(
      productsManifestPath,
      productsManifestContent,
      currentProductsManifestRef
    );
    if (result.written) writtenPaths.push(productsManifestPath);
    else skippedPaths.push(productsManifestPath);
    await client.writePointer(pointer.manifestPath, productsManifestPath);
    return {
      manifestPath: pointer.manifestPath,
      manifestHash,
      writtenPaths,
      skippedPaths,
      totalOps: writtenPaths.length + 1,
      isInitialSync: false,
      suppressedNoopWrites: false,
      productsManifestPath,
    };
  }

  return {
    manifestPath: pointer.manifestPath,
    manifestHash: 'dry-run',
    writtenPaths,
    skippedPaths,
    totalOps: writtenPaths.length + 1,
    isInitialSync: false,
    suppressedNoopWrites: writtenPaths.length === 0 && pointer.productsManifestPath === productsManifestPath,
    productsManifestPath,
  };
}

/**
 * Build the split-layout blob paths from the raw sync payload.
 * Pure function — exported for tests.
 */
export function buildOrderBlobPath(deliveryDate: string, orderNumber: string): string {
  return `orders/${deliveryDate}/${orderNumber}.json`;
}

export function buildCoverageBlobPath(date: string): string {
  return `coverage/${date}.json`;
}

/**
 * Spec 019 / FR-01 — coverage invalidation trigger.
 *
 * When an order changes (amendment content, cancellation, move, refund),
 * the meals-check pipeline should invalidate every coverage blob whose
 * `sourceOrderBlobPath` matches the affected order. The trigger rewrites
 * each matching blob twice:
 *
 *   1. transient write with `stale: true` + `staleReason = reason`
 *      (race-condition safety: a read during this window shows the
 *      "⚠️ stale coverage" indicator and does not use the data)
 *   2. fresh write with `stale: false` + `staleReason = null`
 *      (the data is the same content; the recalculation is owned by
 *      the Python pipeline which decides what new coverage to compute)
 *
 * Coverage blobs whose `sourceOrderBlobPath` does not match the
 * affected order are left untouched.
 *
 * @param orderPath The order blob path (e.g. `orders/2026-06-15/5421-8594-00.json`).
 * @param reason One of `order_updated`, `order_cancelled`, `order_superseded`, `order_refunded`.
 * @param client The Blob storage client (in-memory in tests, real Vercel SDK in prod).
 */
export async function invalidateCoverageForOrder(
  orderPath: string,
  reason: 'order_updated' | 'order_cancelled' | 'order_superseded' | 'order_refunded',
  client: BlobStorageClient,
  options: { dryRun?: boolean } = {}
): Promise<SyncResult> {
  const { dryRun = false } = options;

  const pointer = await client.readPointer();
  if (!pointer) {
    throw new Error(
      `invalidateCoverageForOrder: no manifest pointer exists yet; cannot invalidate coverage for ${orderPath} before an initial sync.`
    );
  }
  const currentManifest: Manifest = await client.readManifest(pointer.manifestPath);

  // Identify coverage blobs whose sourceOrderBlobPath matches the affected order.
  const matchingPaths: string[] = [];
  for (const [blobPath, _hash] of Object.entries(currentManifest)) {
    if (!blobPath.startsWith('coverage/') || !blobPath.endsWith('.json')) continue;
    const blob = await client.readJsonBlob<{ sourceOrderBlobPath?: string | null }>(blobPath);
    if (blob && blob.sourceOrderBlobPath === orderPath) {
      matchingPaths.push(blobPath);
    }
  }

  const writtenPaths: string[] = [];
  const newManifest: Manifest = { ...currentManifest };

  if (!dryRun) {
    // (1) transient stale write per matching blob
    for (const path of matchingPaths) {
      const blob = await client.readJsonBlob<{
        date: string;
        sourceOrderBlobPath: string | null;
        meals: Array<Record<string, unknown>>;
      }>(path);
      if (!blob) continue;
      const staleContent = JSON.stringify(
        {
          ...blob,
          meals: blob.meals.map((meal) => ({
            ...meal,
            stale: true,
            staleReason: reason,
          })),
        },
        null,
        2
      );
      const staleResult = await client.writeBlobIfChanged(path, staleContent, currentManifest);
      newManifest[path] = staleResult.hash;
      if (staleResult.written) writtenPaths.push(path);
    }

    // (2) fresh write per matching blob (same content, stale cleared)
    for (const path of matchingPaths) {
      const blob = await client.readJsonBlob<{
        date: string;
        sourceOrderBlobPath: string | null;
        meals: Array<Record<string, unknown>>;
      }>(path);
      if (!blob) continue;
      const freshContent = JSON.stringify(
        {
          ...blob,
          meals: blob.meals.map((meal) => ({
            ...meal,
            stale: false,
            staleReason: null,
          })),
        },
        null,
        2
      );
      const freshResult = await client.writeBlobIfChanged(path, freshContent, newManifest);
      newManifest[path] = freshResult.hash;
      if (freshResult.written) writtenPaths.push(path);
    }

    // (3) new manifest + pointer update
    const { manifestPath, manifestHash } = await client.writeManifest(newManifest);
    await client.writePointer(manifestPath);

    return {
      manifestPath,
      manifestHash,
      writtenPaths,
      skippedPaths: [],
      // The trigger does not write a summary; only +manifest +pointer overhead
      // beyond the matching coverage rewrites.
      totalOps: writtenPaths.length + 2,
      isInitialSync: false,
      suppressedNoopWrites: false,
      productsManifestPath: null,
    };
  } else {
    // Dry run: report what would be written without making any changes.
    for (const path of matchingPaths) {
      writtenPaths.push(path);
      writtenPaths.push(path);
    }
    return {
      manifestPath: pointer.manifestPath,
      manifestHash: 'dry-run',
      writtenPaths,
      skippedPaths: [],
      totalOps: writtenPaths.length + 2,
      isInitialSync: false,
      suppressedNoopWrites: false,
      productsManifestPath: null,
    };
  }
}

/**
 * Spec 019 / FR-02 + FR-04 — normalise coverage and matched-item schema
 * defaults at the Blob-write boundary so the contract is enforced
 * regardless of payload provenance.
 *
 * - Each CoverageMealEntry gets `stale: false` and `staleReason: null`.
 * - Each MatchedItem gets `source: "order"` and `use_by_warning: false`.
 *   `shelf_life_days` and `use_by_date` are intentionally left absent
 *   (undefined) when the source is order and no shelf-life data is
 *   present; per FR-04 those fields are optional and only present when
 *   enrichment data supplies them.
 */
export function normaliseSplitLayoutPayload(payload: SplitLayoutPayload): SplitLayoutPayload {
  return {
    ...payload,
    coverage: payload.coverage.map((cov) => ({
      ...cov,
      meals: cov.meals.map((meal) => ({
        ...meal,
        stale: meal.stale ?? false,
        staleReason: meal.staleReason ?? null,
        matchedItems: meal.matchedItems.map((item) => ({
          ...item,
          source: (item.source ?? 'order') as MatchedItem['source'],
          use_by_warning: item.use_by_warning ?? false,
        })),
      })),
    })),
  };
}
