import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookiesGet = vi.fn();
const mockReader = {
  readPointer: vi.fn(),
  readManifest: vi.fn(),
  readJsonBlob: vi.fn(),
};
const mockGetDashboardData = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => mockCookiesGet(name) }),
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

import { GET as GET_BLOB } from './route';
import { GET as GET_PRODUCT } from '../product-resolution/route';
import { signDebugCookie } from '@/lib/debug-cookie';

beforeEach(() => {
  vi.clearAllMocks();
  mockCookiesGet.mockReturnValue({ value: signDebugCookie('1') });
  mockReader.readPointer.mockResolvedValue({
    manifestPath: 'meta/manifest-123.json',
    productsManifestPath: 'products/manifest-123.json',
  });
  mockReader.readManifest.mockResolvedValue({
    'meta/summary-123.json': 'sha256-summary',
    'coverage/2026-06-17.json': 'sha256-cov-1',
    'orders/2026-06-17/ORD-123.json': 'sha256-order-1',
  });
  mockReader.readJsonBlob.mockResolvedValue({ lastFetched: '2026-06-18T10:00:00.000Z' });
  mockGetDashboardData.mockResolvedValue({
    coverage: [],
    deliveryWindows: [],
    latestOrder: {
      orderNumber: 'ORD-123',
      deliveryDate: '2026-06-17',
      orderBlobPath: 'orders/2026-06-17/ORD-123.json',
      items: [
        {
          name: 'Tesco Blueberries 150G',
          tpnc: '123456789',
          productBlobPath: 'products/123456789.json',
          productMetadata: {
            title: 'Tesco Blueberries 150G',
            description: 'Fresh British blueberries.',
            storage: 'Refrigerate',
            preparation: 'Ready to eat',
            ingredients: '',
            allergens: '',
            nutrition: 'Per 100g: energy 44kcal',
            brand: 'Tesco',
            category: 'Fruit',
            imageUrl: '',
            productUrl: 'https://example.test/blueberries',
            source: 'tesco.com',
            lastFetched: '2026-06-18T09:30:00.000Z',
          },
        },
      ],
    },
    mealsCheckSummary: null,
    dataGeneratedAt: '2026-06-18T10:00:00.000Z',
    uiUpdatedAt: '2026-06-18T11:00:00.000Z',
    loadError: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/debug/blob-read-freshness', () => {
  it('exposes the pointer, manifest, coverage and freshness trace', async () => {
    const res = await GET_BLOB();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({
      pointerPath: 'pointers/latest.json',
      pointerRead: 'ok',
      manifestPath: 'meta/manifest-123.json',
      manifestRead: 'ok',
      summaryPath: 'meta/summary-123.json',
      summaryRead: 'ok',
      productsManifestPath: 'products/manifest-123.json',
      productsManifestRead: 'ok',
      coverageWindow: ['2026-06-17', '2026-06-18'],
      summaryFreshness: expect.objectContaining({
        dataGeneratedAt: '2026-06-18T10:00:00.000Z',
        uiUpdatedAt: '2026-06-18T11:00:00.000Z',
      }),
      latestOrderFreshness: expect.objectContaining({
        deliveryDate: '2026-06-17',
      }),
    }));
    expect(body.coverageReads).toEqual([{ path: 'coverage/2026-06-17.json', status: 'ok' }]);
    expect(body.orderReads).toEqual([{ path: 'orders/2026-06-17/ORD-123.json', status: 'ok' }]);
    expect(body.productReads).toEqual([{ path: 'products/123456789.json', status: 'ok', lastFetched: '2026-06-18T10:00:00.000Z' }]);
    expect(mockReader.readPointer).toHaveBeenCalled();
    expect(mockReader.readManifest).toHaveBeenCalledWith('meta/manifest-123.json');
    expect(mockGetDashboardData).toHaveBeenCalled();
  });
});

describe('GET /api/debug/product-resolution', () => {
  it('labels the inspected item provenance as apollo when generated metadata wins', async () => {
    const res = await GET_PRODUCT(new Request('http://localhost/api/debug/product-resolution?tpnc=123456789'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemName).toBe('Tesco Blueberries 150G');
    expect(body.itemTpnc).toBe('123456789');
    expect(body.productSource).toBe('apollo');
    expect(body.descriptionSource).toBe('apollo');
    expect(body.freshness.lastFetched).toBe('2026-06-18T09:30:00.000Z');
    expect(mockGetDashboardData).toHaveBeenCalled();
  });
});
