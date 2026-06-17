/**
 * app/api/debug/items-by-category/route.test.ts
 *
 * Spec 022 / Rev 3 / FR-015: integration test that verifies the API
 * route returns 404 when the per-user cookie is unset/malformed and
 * 200 with the expected JSON shape when the cookie is signed "1".
 *
 * The test mocks `effectiveDebugMode` and `getDashboardData` so it
 * can run in isolation without touching Vercel Blob or the env
 * vars. The cookie value passed to `effectiveDebugMode` is also
 * captured so we can assert the route passes the cookie through.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocks must be declared before importing the route module.
const mockEffectiveDebugMode = vi.fn();
const mockGetDashboardData = vi.fn();
const mockTransformCachedOrderSafely = vi.fn();
const mockCookiesGet = vi.fn();
let lastCookieRawSeenByRoute: string | undefined | null = undefined;

vi.mock('@/lib/debug-mode', () => ({
  effectiveDebugMode: (raw: string | undefined | null) => {
    lastCookieRawSeenByRoute = raw;
    return mockEffectiveDebugMode(raw);
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => mockCookiesGet(name),
  }),
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
import { DEBUG_COOKIE_NAME, signDebugCookie } from '@/lib/debug-cookie';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  lastCookieRawSeenByRoute = undefined;
  // Default: the route reads `meals_debug_mode`. The mock returns
  // undefined so the test must explicitly set it.
  mockCookiesGet.mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/debug/items-by-category — gating (Rev 3: cookie-only)', () => {
  it('reads the meals_debug_mode cookie', async () => {
    mockEffectiveDebugMode.mockReturnValue(false);
    await GET();
    expect(mockCookiesGet).toHaveBeenCalledWith(DEBUG_COOKIE_NAME);
  });

  it('passes the cookie value to effectiveDebugMode', async () => {
    const signed = signDebugCookie('1');
    mockCookiesGet.mockReturnValue({ value: signed });
    mockEffectiveDebugMode.mockReturnValue(true);
    mockGetDashboardData.mockResolvedValue({
      coverage: [],
      deliveryWindows: [],
      latestOrder: null,
      mealsCheckSummary: null,
      dataGeneratedAt: '',
      uiUpdatedAt: '',
    });
    mockTransformCachedOrderSafely.mockReturnValue({ items: [] });
    await GET();
    expect(lastCookieRawSeenByRoute).toBe(signed);
  });

  it('returns 404 when cookie is unset', async () => {
    mockCookiesGet.mockReturnValue(undefined);
    mockEffectiveDebugMode.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 404 when cookie is tampered', async () => {
    mockCookiesGet.mockReturnValue({ value: '1.bogus' });
    mockEffectiveDebugMode.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('does not call getDashboardData when cookie is unset', async () => {
    mockEffectiveDebugMode.mockReturnValue(false);
    await GET();
    expect(mockGetDashboardData).not.toHaveBeenCalled();
  });
});

describe('GET /api/debug/items-by-category — payload shape', () => {
  beforeEach(() => {
    mockEffectiveDebugMode.mockReturnValue(true);
    mockCookiesGet.mockReturnValue({ value: signDebugCookie('1') });
  });

  it('returns 200 with the FR-004 fields when cookie is signed "1"', async () => {
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
