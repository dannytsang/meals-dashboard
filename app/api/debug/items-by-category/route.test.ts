/**
 * app/api/debug/items-by-category/route.test.ts
 *
 * Spec 022 / FR-015: integration test that verifies the API route
 * returns 404 when debug mode is off and 200 with the expected JSON
 * shape when debug mode is on. Uses the InMemoryBlobStorageClient to
 * seed a deterministic dataset so the assertion is reproducible.
 *
 * The test mocks `isDebugModeEnabled` and `getDashboardData` so it
 * can run in isolation without touching Vercel Blob or the env vars.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocks must be declared before importing the route module.
const mockIsDebugModeEnabled = vi.fn();
const mockGetDashboardData = vi.fn();
const mockTransformCachedOrderSafely = vi.fn();

vi.mock('@/lib/debug-mode', () => ({
  isDebugModeEnabled: () => mockIsDebugModeEnabled(),
  debugModeStatus: () => ({ enabled: mockIsDebugModeEnabled(), raw: '1', deploymentId: 'dpl_test' }),
}));

vi.mock('@/lib/dashboard-data', () => ({
  getDashboardData: (...args: unknown[]) => mockGetDashboardData(...args),
  buildCoverageWindowDates: (today: string, endDate: string) => {
    // Simple deterministic window for the test.
    const start = new Date(today);
    const end = new Date(endDate);
    const out: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  },
}));

vi.mock('@/lib/dashboard-ui-utils', () => ({
  transformCachedOrderSafely: (order: unknown) => mockTransformCachedOrderSafely(order),
}));

import { GET } from './route';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MEALS_DEBUG_MODE;
  delete process.env.VERCEL_DEPLOYMENT_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/debug/items-by-category — gating', () => {
  it('returns 404 when debug mode is off', async () => {
    mockIsDebugModeEnabled.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 404 even when the env var is set to a falsy value', async () => {
    mockIsDebugModeEnabled.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('does not call getDashboardData when debug mode is off', async () => {
    mockIsDebugModeEnabled.mockReturnValue(false);
    await GET();
    expect(mockGetDashboardData).not.toHaveBeenCalled();
  });
});

describe('GET /api/debug/items-by-category — payload shape', () => {
  beforeEach(() => {
    mockIsDebugModeEnabled.mockReturnValue(true);
  });

  it('returns 200 with the FR-004 fields when debug mode is on', async () => {
    mockGetDashboardData.mockResolvedValue({
      coverage: [],
      deliveryWindows: [],
      latestOrder: {
        orderNumber: 'ORD-123',
        deliveryDate: '2026-06-17',
        orderTotal: 42.42,
        items: [
          { name: 'Eggs x12', quantity: 1, price: 3.5 },
          { name: 'Bread', quantity: 1, price: 1.2 },
        ],
      },
      mealsCheckSummary: null,
      dataGeneratedAt: '2026-01-01T00:00:00Z',
      uiUpdatedAt: '2026-01-01T00:00:00Z',
    });
    mockTransformCachedOrderSafely.mockReturnValue({
      orderNumber: 'ORD-123',
      deliveryDate: '2026-06-17',
      orderTotal: 42.42,
      items: [
        { name: 'Eggs x12', quantity: 1, price: 3.5 },
        { name: 'Bread', quantity: 1, price: 1.2 },
      ],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({
      latestOrder: expect.objectContaining({ orderNumber: 'ORD-123' }),
      latestOrderStatus: 'ok',
      receiptItemsLength: 2,
      unmatchedItemsLength: 2,
      displayItemsLength: 2,
      showCount: 10,
      filter: 'all',
      cats: [],
      dataGen: '2026-01-01T00:00:00Z',
      pointerPath: 'pointers/latest.json',
      fetchedAt: expect.any(String),
    }));
  });

  it('reports latestOrderStatus=null_no_order_blob when latestOrder is null', async () => {
    mockGetDashboardData.mockResolvedValue({
      coverage: [],
      deliveryWindows: [],
      latestOrder: null,
      mealsCheckSummary: null,
      dataGeneratedAt: '',
      uiUpdatedAt: '',
    });
    mockTransformCachedOrderSafely.mockReturnValue({ items: [] });

    const res = await GET();
    const body = await res.json();
    expect(body.latestOrderStatus).toBe('null_no_order_blob');
    expect(body.latestOrder).toBeNull();
    expect(body.receiptItemsLength).toBe(0);
    expect(body.unmatchedItemsLength).toBe(0);
    expect(body.displayItemsLength).toBe(0);
  });
});
