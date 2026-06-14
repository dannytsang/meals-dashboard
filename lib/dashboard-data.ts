import 'server-only';
import { list } from '@vercel/blob';

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
  try {
    const blobs = await list({
      prefix: BLOB_FILE_NAME,
      mode: 'folded',
    });
    console.log('[dashboard-data] blob list result:', JSON.stringify({ count: blobs.blobs.length, hasMore: blobs.hasMore }));
    const latest = blobs.blobs[0];
    if (!latest) {
      console.log('[dashboard-data] no blob found with prefix:', BLOB_FILE_NAME);
      return null;
    }
    console.log('[dashboard-data] fetching blob URL:', latest.url);

    const res = await fetch(latest.url);
    console.log('[dashboard-data] blob fetch status:', res.status, 'content-length:', res.headers.get('content-length'));
    if (!res.ok) {
      console.error('[dashboard-data] blob fetch not ok:', res.status, res.statusText);
      return null;
    }

    const text = await res.text();
    console.log('[dashboard-data] blob content length:', text.length);
    const parsed = JSON.parse(text) as DashboardBlobData;
    console.log('[dashboard-data] parsed OK, keys:', Object.keys(parsed).join(', '));
    return parsed;
  } catch (err) {
    console.error('[dashboard-data] fetchFromBlob error:', err);
    return null;
  }
}

export async function getDashboardData(): Promise<DashboardBlobData> {
  console.log('[dashboard-data] getDashboardData called');
  try {
    const data = await fetchFromBlob();
    console.log('[dashboard-data] fetchFromBlob result:', data ? `got ${Object.keys(data).join(', ')}` : 'null');
    if (data) return data;
  } catch (err) {
    console.error('[dashboard-data] getDashboardData outer error:', err);
  }

  // Graceful fallback — dashboard renders with empty state
  console.log('[dashboard-data] returning fallback empty state');
  return {
    coverage: [],
    deliveryWindows: [],
    latestOrder: null,
    mealsCheckSummary: null,
  };
}

export type DashboardData = DashboardBlobData;
