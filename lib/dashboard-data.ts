import 'server-only';

const API_BASE = '';
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
    const res = await fetch(`${API_BASE}/api/dashboard-data`);
    if (!res.ok) {
      console.error('[dashboard-data] GET /api/dashboard-data failed:', res.status);
      return getEmptyState();
    }
    const data = await res.json() as DashboardBlobData;
    return data;
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
