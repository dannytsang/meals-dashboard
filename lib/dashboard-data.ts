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

export async function getDashboardData(): Promise<DashboardBlobData> {
  try {
    const blobs = await list({ prefix: BLOB_FILE_NAME });
    const latest = blobs.blobs[0];
    if (!latest) {
      return getEmptyState();
    }

    // Use the blob URL directly — @vercel/blob handles auth internally in serverless
    const res = await fetch(latest.url);
    if (!res.ok) {
      console.error('[dashboard-data] blob fetch failed:', res.status);
      return getEmptyState();
    }

    const text = await res.text();
    return JSON.parse(text) as DashboardBlobData;
  } catch (err) {
    console.error('[dashboard-data] getDashboardData error:', err);
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

export type DashboardData = DashboardBlobData;
