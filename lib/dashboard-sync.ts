import type {
  Meal,
  TescoReceipt,
  DeliveryWindow,
  GroceryItem,
  MatchedItem,
} from './meals-data';
import type { BlobStorageClient, Manifest } from './blob-storage';

export interface DashboardSummary {
  coverage_percentage: number;
  covered: number;
  missing: number;
  meals_total: number;
  meals_covered: number;
  order_total: number;
  delivery_date: string;
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

export interface SplitLayoutPayload {
  orders: Array<OrderBlob & { orderBlobPath: string }>;
  coverage: Array<CoverageBlob & { coverageBlobPath: string }>;
  summary: DashboardSummary;
  deliveryWindows: DeliveryWindow[];
  /** ISO date strings in the visible coverage window. */
  coverageWindow: string[];
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
}

const SUMMARY_PATH_FOR = (hash: string) => `meta/summary-${hash}.json`;

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

  // Step 3: build local data blobs.
  // Each blob is keyed by its path; we serialise once and reuse the string for hashing.
  const dataBlobs: Array<{ path: string; content: string }> = [];
  for (const order of payload.orders) {
    dataBlobs.push({ path: order.orderBlobPath, content: JSON.stringify(order, null, 2) });
  }
  for (const cov of payload.coverage) {
    dataBlobs.push({ path: cov.coverageBlobPath, content: JSON.stringify(cov, null, 2) });
  }
  // Summary is also a content-addressable data blob (FR-13).
  const summaryContent = JSON.stringify(payload.summary, null, 2);
  const summaryHash = client.computeHash(summaryContent);
  const summaryPath = SUMMARY_PATH_FOR(summaryHash);
  dataBlobs.push({ path: summaryPath, content: summaryContent });

  // Step 4: hash dedup + write each data blob.
  const writtenPaths: string[] = [];
  const skippedPaths: string[] = [];
  const newManifest: Manifest = {};

  if (!dryRun) {
    for (const { path, content } of dataBlobs) {
      const result = await client.writeBlobIfChanged(path, content, currentManifest);
      newManifest[path] = result.hash;
      if (result.written) writtenPaths.push(path);
      else skippedPaths.push(path);
    }

    // Step 5–7: write manifest then pointer.
    const { manifestPath, manifestHash } = await client.writeManifest(newManifest);
    await client.writePointer(manifestPath);

    return {
      manifestPath,
      manifestHash,
      writtenPaths,
      skippedPaths,
      totalOps: writtenPaths.length + 2, // +manifest +pointer
      isInitialSync,
    };
  } else {
    // Dry run: compute hashes, report what would change, skip all writes.
    for (const { path, content } of dataBlobs) {
      const hash = client.computeHash(content);
      newManifest[path] = hash;
      if (currentManifest[path] === hash) {
        skippedPaths.push(path);
      } else {
        writtenPaths.push(path);
      }
    }
    // No blob writes in dry-run; totalOps reflects intent.
    return {
      manifestPath: `meta/manifest-${client.computeHash(
        JSON.stringify(
          Object.keys(newManifest).sort().reduce<Manifest>((acc, k) => {
            acc[k] = newManifest[k]!;
            return acc;
          }, {}),
          null,
          2
        )
      )}.json`,
      manifestHash: 'dry-run',
      writtenPaths,
      skippedPaths,
      totalOps: writtenPaths.length + 2,
      isInitialSync,
    };
  }
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
