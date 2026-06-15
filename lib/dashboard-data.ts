import 'server-only';
import type {
  DeliveryWindow,
  MealCoverage,
  TescoReceipt,
  MatchedItem,
  Meal,
} from './meals-data';
import { VercelBlobStorageClient, type BlobStorageClient } from './blob-storage';
import type { CoverageBlob, CoverageMealEntry, DashboardSummary, OrderBlob } from './dashboard-sync';

/**
 * Dashboard Blob Data Layer
 *
 * Spec: `017-dashboard-blob-read-path` — reads from the split Blob storage
 * layout defined by `016-dashboard-blob-storage-layout`.
 *
 * Read path (server-only):
 *   1. Read `pointers/latest.json` to get the manifest path.
 *   2. Fetch the manifest blob in parallel with the `meta/summary-*` blob
 *      (resolved via manifest entries).
 *   3. Fetch the visible-window coverage blobs (`coverage/{date}.json`) in parallel.
 *   4. Fetch the order blobs (`orders/{date}/{num}.json`) for any deliveries in
 *      the visible window.
 *   5. Compose into the existing `DashboardData` shape the dashboard client expects.
 *
 * Fallback behaviour (FR-03): any individual fetch that fails returns null/empty
 * for that portion; the page must not crash. If the pointer itself is unreadable
 * (e.g. brand-new install before the first sync) we fall back to the legacy single-blob
 * `dashboard-data.json` so the dashboard still renders something useful.
 *
 * Privacy (FR-07 / SC-04): all Blob fetches happen server-side; the client bundle
 * never imports `@vercel/blob` and the static-bundle scan enforces this.
 */

const LEGACY_BLOB_FILE_NAME = 'dashboard-data.json';

export interface DashboardBlobData {
  coverage: MealCoverage[];
  deliveryWindows: DeliveryWindow[];
  latestOrder: TescoReceipt | null;
  mealsCheckSummary: DashboardSummary | null;
}

export interface DashboardData extends DashboardBlobData {}

/** Client-injectable for tests. */
export type DashboardDataReader = Pick<BlobStorageClient, 'readPointer' | 'readManifest' | 'readJsonBlob' | 'listPaths'>;

export async function getDashboardData(
  options: {
    coverageWindow?: string[];
    reader?: DashboardDataReader;
  } = {}
): Promise<DashboardBlobData> {
  const reader = options.reader ?? new VercelBlobStorageClient();
  const coverageWindow = options.coverageWindow ?? defaultCoverageWindow();

  // 1. Try the new split layout. Null means "no pointer present, try legacy".
  const split = await readFromSplitLayout(reader, coverageWindow);
  if (split !== null) return split;

  // 2. Fall back to legacy single-blob layout only when there is genuinely no pointer yet.
  return readFromLegacyLayout(reader);
}

export function buildCoverageWindowDates(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function defaultCoverageWindow(): string[] {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 14);
  return buildCoverageWindowDates(toIsoDate(today), toIsoDate(end));
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readFromSplitLayout(
  reader: DashboardDataReader,
  coverageWindow: string[]
): Promise<DashboardBlobData | null> {
  let pointer;
  try {
    pointer = await reader.readPointer();
  } catch (err) {
    console.error('[dashboard-data] pointer read failed:', err);
    return getEmptyState();
  }

  if (!pointer || !pointer.manifestPath) {
    return null; // No pointer → fall back to legacy.
  }

  let manifest;
  try {
    manifest = await reader.readManifest(pointer.manifestPath);
  } catch (err) {
    console.error('[dashboard-data] manifest read failed:', err);
    return getEmptyState();
  }

  try {
    // 2. Resolve the summary path from the manifest (content-addressable).
    const summaryPath = Object.keys(manifest).find((p) => p.startsWith('meta/summary-'));
    const coveragePaths = coverageWindow
      .map((d) => `coverage/${d}.json`)
      .filter((p) => p in manifest);

    // Find the order blobs whose delivery date falls within the coverage window.
    const orderPaths = Object.keys(manifest)
      .filter((p) => p.startsWith('orders/'))
      .filter((p) => {
        const m = /^orders\/(\d{4}-\d{2}-\d{2})\//.exec(p);
        return m ? coverageWindow.includes(m[1]!) : false;
      });

    // 3. Parallel fetches (FR-05, FR-02): summary + coverage + orders in parallel.
    const [summary, coverageResults, orderResults] = await Promise.all([
      summaryPath ? reader.readJsonBlob<DashboardSummary>(summaryPath) : Promise.resolve(null),
      Promise.all(coveragePaths.map((p) => reader.readJsonBlob<CoverageBlob>(p))),
      Promise.all(orderPaths.map((p) => reader.readJsonBlob<OrderBlob>(p))),
    ]);

    // 4. Compose into the existing DashboardData shape.
    const coverage: MealCoverage[] = [];
    for (const cb of coverageResults) {
      if (!cb || !Array.isArray(cb.meals)) continue;
      for (const m of cb.meals) {
        coverage.push(coverageMealToDashboardCoverage(m));
      }
    }

    // Pick the latest order (by delivery date) as latestOrder.
    const validOrders = orderResults.filter((o): o is OrderBlob => Boolean(o));
    const latestOrder = validOrders.length
      ? orderBlobToTescoReceipt(
          validOrders.sort((a, b) => (a.deliveryDate < b.deliveryDate ? 1 : -1))[0]!
        )
      : null;

    // deliveryWindows are composed from the order blobs; spec 016 explicitly dropped
    // the 2026-06-14 "deliveryWindows on pointer" refinement, so we compose them here.
    const deliveryWindows: DeliveryWindow[] = validOrders.map((o) => ({
      date: o.deliveryDate,
      slot: o.deliverySlot,
      orderTotal: o.orderTotal,
      status: o.status === 'active' || o.status === undefined ? 'pending' : 'pending',
    }));

    return {
      coverage,
      deliveryWindows,
      latestOrder,
      mealsCheckSummary: summary ?? null,
    };
  } catch (err) {
    console.error('[dashboard-data] split-layout read failed, falling back:', err);
    return null;
  }
}

function coverageMealToDashboardCoverage(m: CoverageMealEntry): MealCoverage {
  const matchedItems: MatchedItem[] = (m.matchedItems ?? []).map((mi) => ({
    ingredient: mi.ingredient,
    name: mi.name,
    quantity: mi.quantity,
    price: mi.price,
  }));
  return {
    meal: m.meal as Meal,
    status: m.status,
    coverageScore: m.coverageScore,
    matchedItems,
    missingItems: m.missingItems ?? [],
    missingExplanations: m.missingExplanations,
    notes: m.notes,
  };
}

function orderBlobToTescoReceipt(o: OrderBlob): TescoReceipt {
  return {
    orderNumber: o.orderNumber,
    deliveryDate: o.deliveryDate,
    deliverySlot: o.deliverySlot,
    orderTotal: o.orderTotal,
    items: o.items as TescoReceipt['items'],
    substitutions: o.substitutions as TescoReceipt['substitutions'],
    unavailable: o.unavailable as TescoReceipt['unavailable'],
    shortLifeItems: o.shortLifeItems as TescoReceipt['shortLifeItems'],
    orderStatus: o.status,
    refundAmount: o.refundAmount,
  };
}

async function readFromLegacyLayout(
  reader: DashboardDataReader
): Promise<DashboardBlobData> {
  // The legacy reader used the Vercel Blob SDK's `list` + `fetch` directly.
  // The BlobStorageClient interface doesn't include `list({prefix})` (only `listPaths`),
  // but we can reuse listPaths here with the prefix.
  try {
    const paths = await reader.listPaths(LEGACY_BLOB_FILE_NAME);
    const match = paths.find((p) => p === LEGACY_BLOB_FILE_NAME);
    if (!match) return getEmptyState();
    const text = await reader.readJsonBlob<DashboardBlobData>(match);
    return text ?? getEmptyState();
  } catch (err) {
    console.error('[dashboard-data] legacy-layout read failed:', err);
    return getEmptyState();
  }
}

function getEmptyState(): DashboardBlobData {
  return {
    coverage: [],
    deliveryWindows: [],
    latestOrder: null,
    mealsCheckSummary: null,
  };
}
