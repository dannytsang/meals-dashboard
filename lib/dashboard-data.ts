import 'server-only';
import type {
  DeliveryWindow,
  MealCoverage,
  TescoReceipt,
  MatchedItem,
  Meal,
  GroceryItem,
  GeneratedProductMetadata,
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
 * for that portion; the page must not crash.
 *
 * Spec 028 / 2026-06-19 cleanup: the pre-spec-028 legacy single-blob
 * `dashboard-data.json` fallback is REMOVED. The dashboard page reads
 * exclusively via the spec 028 head()-based split-layout reader
 * (`lib/blob-storage.ts:readPointer` / `readManifest` / `readJsonBlob`).
 * On a fresh install before the first sync, the pointer blob simply
 * doesn't exist yet; `readPointer()` returns null and the page renders
 * the empty state. The `list({prefix})` Advanced Operation that the
 * legacy fallback relied on is gone from the read path.
 *
 * Privacy (FR-07 / SC-04): all Blob fetches happen server-side; the client bundle
 * never imports `@vercel/blob` and the static-bundle scan enforces this.
 */

export interface DashboardLoadError {
  title: string;
  message: string;
  source: 'pointer' | 'manifest' | 'read';
  resourcePath?: string;
  statusCode?: number;
  statusText?: string;
}

export interface DashboardBlobData {
  coverage: MealCoverage[];
  deliveryWindows: DeliveryWindow[];
  latestOrder: TescoReceipt | null;
  mealsCheckSummary: DashboardSummary | null;
  /** When the meals-check pipeline generated this data (ISO string, from cache generated_at). */
  dataGeneratedAt: string;
  /** When the dashboard UI was last deployed (ISO string, git HEAD commit time at sync time). */
  uiUpdatedAt: string;
  loadError: DashboardLoadError | null;
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

  // Spec 028 read path: head() for pointer + manifest, GET for each
  // referenced blob. All Simple Operations. Returns getEmptyState()
  // on any failure (pointer missing, manifest missing, individual
  // blob missing, network error) — never throws.
  return readFromSplitLayout(reader, coverageWindow);
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
): Promise<DashboardBlobData> {
  let pointer;
  try {
    pointer = await reader.readPointer();
  } catch (err) {
    console.error('[dashboard-data] pointer read failed:', err);
    return getEmptyState(formatDashboardLoadError('pointer', err));
  }

  if (!pointer || !pointer.manifestPath) {
    // No pointer yet (fresh install before first sync). Empty state is
    // the right UX — the page renders an empty dashboard. The spec 028
    // reader returns null when the pointer blob doesn't exist.
    return getEmptyState();
  }

  let manifest;
  try {
    manifest = await reader.readManifest(pointer.manifestPath);
  } catch (err) {
    console.error('[dashboard-data] manifest read failed:', err);
    return getEmptyState(formatDashboardLoadError('manifest', err, pointer.manifestPath));
  }

  try {
    // 2. Resolve the summary path from the manifest (content-addressable).
    const summaryPath = Object.keys(manifest).find((p) => p.startsWith('meta/summary-'));
    const coveragePaths = coverageWindow
      .map((d) => `coverage/${d}.json`)
      .filter((p) => p in manifest);

    // Find order blobs in the coverage window OR the most recent past order.
    // The window filter alone misses the latest order once its delivery date
    // is older than `today` (e.g. midnight UTC vs local rollover, or the
    // order's actual_delivery_date / delivery_usable_date mismatch).
    // The dashboard always wants the freshest order displayed, so we keep
    // window-matching orders plus the single most-recent past order.
    const allOrderPaths = Object.keys(manifest)
      .filter((p) => p.startsWith('orders/'));
    const inWindow = allOrderPaths.filter((p) => {
      const m = /^orders\/(\d{4}-\d{2}-\d{2})\//.exec(p);
      return m ? coverageWindow.includes(m[1]!) : false;
    });
    const pastOrders = allOrderPaths
      .filter((p) => !inWindow.includes(p))
      .filter((p) => /^orders\/(\d{4}-\d{2}-\d{2})\//.test(p))
      .sort()
      .reverse();
    const orderPaths = [...inWindow, ...pastOrders.slice(0, 1)];

    // Spec 021 / FR-005 — resolve product blobs by productBlobPath reference.
    // Read the products manifest if present, then fetch product blobs in parallel
    // with orders so item.productMetadata can be injected before composition.
    let productsManifest: Record<string, string> = {};
    if (pointer.productsManifestPath) {
      try {
        const pmRaw = await reader.readJsonBlob<Record<string, string>>(pointer.productsManifestPath);
        if (pmRaw) productsManifest = pmRaw;
      } catch {
        // Products manifest unavailable — skip product enrichment (FR-006 fallback).
        console.warn('[dashboard-data] products manifest unavailable, skipping product enrichment');
      }
    }

    // 3. Parallel fetches (FR-05, FR-02): summary + coverage + orders in parallel.
    const [summary, coverageResults, orderResults] = await Promise.all([
      summaryPath ? reader.readJsonBlob<DashboardSummary>(summaryPath) : Promise.resolve(null),
      Promise.all(coveragePaths.map((p) => reader.readJsonBlob<CoverageBlob>(p))),
      Promise.all(orderPaths.map((p) => reader.readJsonBlob<OrderBlob>(p))),
    ]);

    // 4. Inject productMetadata into order items from product blobs (FR-005).
    // Fetch all referenced product blobs in parallel; individual failures are silent.
    const productBlobPaths = orderResults
      .flatMap((o) => (o?.items ?? []) as GroceryItem[])
      .map((item) => item.productBlobPath)
      .filter((p): p is string => Boolean(p));

    const uniqueProductPaths = [...new Set(productBlobPaths)];
    const productBlobResults = await Promise.all(
      uniqueProductPaths.map((p) => reader.readJsonBlob<GeneratedProductMetadata>(p))
    );
    const productBlobMap = new Map<string, GeneratedProductMetadata>();
    for (let i = 0; i < uniqueProductPaths.length; i++) {
      if (productBlobResults[i]) {
        productBlobMap.set(uniqueProductPaths[i]!, productBlobResults[i]!);
      }
    }

    // Inject resolved productMetadata into each GroceryItem.
    for (const order of orderResults) {
      if (!order || !Array.isArray(order.items)) continue;
      for (const item of order.items as GroceryItem[]) {
        if (item.productBlobPath && productBlobMap.has(item.productBlobPath)) {
          item.productMetadata = productBlobMap.get(item.productBlobPath)!;
        }
      }
    }

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

    // deliveryWindows: merge delivery dates from order blobs with next_delivery from
    // the meals-check summary (spec 019 / FR-02). Order blobs only cover deliveries
    // that have a Tesco email confirmation. The next delivery may only have a
    // calendar event — no order blob yet — so we add it here to ensure the
    // Week-view header shows a delivery marker for Friday 26 June.
    const orderDeliveryDates = new Set(validOrders.map((o) => o.deliveryDate));
    const summaryWindows = (summary as Record<string, unknown> | null)?.windows as
      | { last_delivery: string | null; next_delivery: string | null; next_window_end: string | null }
      | null
      | undefined;
    const additionalDates = [
      ...(summaryWindows?.next_delivery && !orderDeliveryDates.has(summaryWindows.next_delivery)
        ? [summaryWindows.next_delivery]
        : []),
    ];
    const deliveryWindows: DeliveryWindow[] = [
      ...validOrders.map((o) => ({
        date: o.deliveryDate,
        slot: o.deliverySlot,
        orderTotal: o.orderTotal,
        status: (o.status === 'active' || o.status === undefined ? 'pending' : 'pending') as
          | 'pending'
          | 'delivered'
          | 'scheduled',
      })),
      ...additionalDates.map((date) => ({
        date,
        slot: 'Evening',
        orderTotal: 0,
        status: 'scheduled' as const,
      })),
    ];

    return {
      coverage,
      deliveryWindows,
      latestOrder,
      mealsCheckSummary: summary ?? null,
      dataGeneratedAt: (summary as Record<string, unknown> | null)?.dataGeneratedAt as string ?? '',
      uiUpdatedAt: (summary as Record<string, unknown> | null)?.uiUpdatedAt as string ?? '',
      loadError: null,
    };
  } catch (err) {
    // Spec 028 cleanup: the legacy `dashboard-data.json` fallback is
    // gone. On any unexpected failure mid-read, return the empty state
    // — the page renders an empty dashboard rather than crashing.
    console.error('[dashboard-data] split-layout read failed:', err);
    return getEmptyState(formatDashboardLoadError('read', err));
  }
}

function coverageMealToDashboardCoverage(m: CoverageMealEntry): MealCoverage {
  const matchedItems: MatchedItem[] = (m.matchedItems ?? []).map((mi) => ({
    ingredient: mi.ingredient,
    name: mi.name,
    quantity: mi.quantity,
    price: mi.price,
    // Spec 019 / FR-04 — preserve shelf-life metadata through the adapter.
    // These are populated by `annotate_shelf_life` in the Python pipeline
    // and are needed by the "Use today" panel + ⚠️ badge in the meal detail.
    source: mi.source,
    shelf_life_days: mi.shelf_life_days,
    use_by_warning: mi.use_by_warning,
    use_by_date: mi.use_by_date,
  }));
  return {
    meal: m.meal as Meal,
    status: m.status,
    coverageScore: m.coverageScore,
    matchedItems,
    missingItems: m.missingItems ?? [],
    missingExplanations: m.missingExplanations,
    notes: m.notes,
    // Spec 019 / FR-06 — refunded items carried through the adapter so the
    // meal detail can render them in a distinct "refunded" section with
    // the "£X refunded" badge.
    refundedItems: m.refundedItems,
    // Spec 019 / FR-08 — manual override annotation carried through.
    manualOverride: m.manualOverride,
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

function getEmptyState(loadError: DashboardLoadError | null = null): DashboardBlobData {
  return {
    coverage: [],
    deliveryWindows: [],
    latestOrder: null,
    mealsCheckSummary: null,
    dataGeneratedAt: '',
    uiUpdatedAt: '',
    loadError,
  };
}

function formatDashboardLoadError(
  source: 'pointer' | 'manifest' | 'read',
  err: unknown,
  resourcePath?: string
): DashboardLoadError {
  const details = extractDashboardErrorDetails(err);
  const title = 'Meals dashboard unavailable.';
  const context = source === 'pointer'
    ? 'The dashboard could not read the live pointer blob.'
    : source === 'manifest'
      ? `The dashboard could not read the manifest blob${resourcePath ? ` (${resourcePath})` : ''}.`
      : 'The dashboard could not finish loading the live dashboard data.';

  const parts = [context, details.summary].filter(Boolean);
  const message = redactDashboardErrorMessage(parts.join(' '));

  return {
    title,
    message,
    source,
    resourcePath,
    statusCode: details.statusCode,
    statusText: details.statusText,
  };
}

function extractDashboardErrorDetails(err: unknown): { summary: string; statusCode?: number; statusText?: string } {
  if (err instanceof Error) {
    const anyErr = err as Error & { statusCode?: number; statusText?: string };
    return {
      summary: `${err.name}: ${err.message}`,
      statusCode: anyErr.statusCode,
      statusText: anyErr.statusText,
    };
  }
  return { summary: String(err) };
}

function redactDashboardErrorMessage(message: string): string {
  return message
    .replace(/Authorization:\s*Bearer\s+[^\s,;]+/gi, 'Authorization: [redacted]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|access_token|signature|X-Amz-Signature|X-Amz-Security-Token|X-Auth-Token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(Authorization|Cookie):\s*[^\n]+/gi, '$1: [redacted]');
}


