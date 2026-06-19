/**
 * app/api/debug/items-by-category/route.test.ts
 *
 * Spec 031 / FR-002, FR-005, FR-008: integration test for the updated
 * /api/debug/items-by-category payload. The route stays cookie-gated,
 * but now exposes the pointer/manifest provenance and the selected
 * latest-order candidate path/date alongside the existing counts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDashboardData = vi.fn();
const mockTransformCachedOrderSafely = vi.fn();
const mockCookiesGet = vi.fn();
const mockReader = {
  readPointer: vi.fn(),
  readManifest: vi.fn(),
  readJsonBlob: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => mockCookiesGet(name),
  }),
}));

vi.mock('@/lib/runtime-mode', () => ({
  runtimeModeStatus: () => ({ blobConfigured: true }),
}));

vi.mock('@/lib/fixtures/static-fixture-reader', () => ({
  StaticFixtureReader: vi.fn(function StaticFixtureReader() {
    return mockReader as never;
  }),
}));

vi.mock('@/lib/blob-storage', () => ({
  VercelBlobStorageClient: vi.fn(function VercelBlobStorageClient() {
    return mockReader as never;
  }),
}));

vi.mock('@/lib/dashboard-data', () => ({
  getDashboardData: (...args: unknown[]) => mockGetDashboardData(...args),
  buildCoverageWindowDates: () => ['2026-06-17', '2026-06-18'],
}));

vi.mock('@/lib/dashboard-ui-utils', () => ({
  transformCachedOrderSafely: (order: unknown) => mockTransformCachedOrderSafely(order),
}));

import { GET } from './route';
import { DEBUG_COOKIE_NAME, signDebugCookie } from '@/lib/debug-cookie';

beforeEach(() => {
  vi.clearAllMocks();
  mockCookiesGet.mockReturnValue(undefined);
  mockReader.readPointer.mockResolvedValue({
    manifestPath: 'meta/manifest-123.json',
    productsManifestPath: 'products/manifest-123.json',
  });
  mockReader.readManifest.mockResolvedValue({
    'meta/summary-123.json': 'sha256-summary',
    'coverage/2026-06-17.json': 'sha256-cov-1',
    'orders/2026-06-17/ORD-123.json': 'sha256-order-1',
  });
  mockReader.readJsonBlob.mockResolvedValue(null);
  mockGetDashboardData.mockResolvedValue({
    coverage: [],
    deliveryWindows: [],
    latestOrder: {
      orderNumber: 'ORD-123',
      deliveryDate: '2026-06-17',
      orderBlobPath: 'orders/2026-06-17/ORD-123.json',
      items: [
        { name: 'Eggs x12', quantity: 1, price: 3.5 },
        { name: 'Bread', quantity: 1, price: 1.2 },
      ],
    },
    mealsCheckSummary: null,
    dataGeneratedAt: '2026-01-01T00:00:00Z',
    uiUpdatedAt: '2026-01-01T00:00:00Z',
    loadError: null,
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/debug/items-by-category', () => {
  it('returns 404 when the signed debug cookie is missing', async () => {
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns the richer provenance payload when the cookie is signed on', async () => {
    mockCookiesGet.mockReturnValue({ value: signDebugCookie('1') });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual(expect.objectContaining({
      latestOrderStatus: 'ok',
      latestOrderBlobPath: 'orders/2026-06-17/ORD-123.json',
      candidateLatestOrderPath: 'orders/2026-06-17/ORD-123.json',
      candidateLatestOrderDate: '2026-06-17',
      receiptItemsLength: 2,
      unmatchedItemsLength: 2,
      displayItemsLength: 2,
      chosenFilterState: 'all',
      chosenFilterReason: 'server_default',
      showCount: 10,
      filter: 'all',
      cats: [],
      dataGen: '2026-01-01T00:00:00Z',
      uiUpdatedAt: '2026-01-01T00:00:00Z',
      pointerPath: 'pointers/latest.json',
      manifestPath: 'meta/manifest-123.json',
      productsManifestPath: 'products/manifest-123.json',
      summaryPath: 'meta/summary-123.json',
    }));

    expect(mockReader.readPointer).toHaveBeenCalled();
    expect(mockReader.readManifest).toHaveBeenCalledWith('meta/manifest-123.json');
    expect(mockGetDashboardData).toHaveBeenCalled();
    expect(mockTransformCachedOrderSafely).toHaveBeenCalled();
    expect(mockCookiesGet).toHaveBeenCalledWith(DEBUG_COOKIE_NAME);
  });
});
