import 'server-only';

const BLOB_FILE_NAME = 'dashboard-data.json';

interface DashboardBlobData {
  coverage: import('./meals-data').MealCoverage[];
  deliveryWindows: import('./meals-data').DeliveryWindow[];
  latestOrder: import('./meals-data').TescoReceipt | null;
  mealsCheckSummary: {
    coverage_percentage: number;
    covered: number;
    missing: number;
    meals_total: number;
    meals_covered: number;
    order_total: number;
    delivery_date: string;
  } | null;
}

async function fetchFromBlob(): Promise<DashboardBlobData | null> {
  const { list } = await import('@vercel/blob');

  try {
    const blobs = await list({
      prefix: BLOB_FILE_NAME,
      mode: 'folded',
    });
    console.log('[dashboard-data] blob list result:', JSON.stringify(blobs));
    const latest = blobs.blobs[0];
    if (!latest) {
      console.log('[dashboard-data] no blob found with prefix:', BLOB_FILE_NAME);
      return null;
    }
    console.log('[dashboard-data] fetching blob URL:', latest.url);

    const res = await fetch(latest.url);
    console.log('[dashboard-data] blob fetch status:', res.status);
    if (!res.ok) return null;

    const text = await res.text();
    console.log('[dashboard-data] blob content length:', text.length);
    return JSON.parse(text) as DashboardBlobData;
  } catch (err) {
    console.error('[dashboard-data] fetchFromBlob error:', err);
    return null;
  }
}

export async function getDashboardData(): Promise<DashboardBlobData> {
  const data = await fetchFromBlob();
  if (data) return data;

  // Graceful fallback — dashboard renders with empty state
  return {
    coverage: [],
    deliveryWindows: [],
    latestOrder: null,
    mealsCheckSummary: null,
  };
}

export type DashboardData = DashboardBlobData;
