import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  syncDashboardLayout: vi.fn(),
  syncDashboardProducts: vi.fn(),
  blobCtor: vi.fn(function BlobClient() {
    return { fake: true };
  }),
}));

vi.mock('@/lib/dashboard-sync', () => ({
  syncDashboardLayout: mocks.syncDashboardLayout,
  syncDashboardProducts: mocks.syncDashboardProducts,
}));

vi.mock('@/lib/blob-storage', () => ({
  VercelBlobStorageClient: mocks.blobCtor,
}));

const ORIGINAL_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;

async function loadRoute() {
  vi.resetModules();
  process.env.MEALS_DASHBOARD_DATA_SECRET = 'secret';
  return await import('./route');
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/dashboard-products-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dashboard-secret': 'secret' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.syncDashboardLayout.mockReset();
  mocks.syncDashboardProducts.mockReset();
  mocks.blobCtor.mockClear();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.MEALS_DASHBOARD_DATA_SECRET;
  } else {
    process.env.MEALS_DASHBOARD_DATA_SECRET = ORIGINAL_SECRET;
  }
});

describe('POST /api/dashboard-products-sync', () => {
  it('rejects dashboard payload fields and accepts products only', async () => {
    const { POST } = await loadRoute();
    mocks.syncDashboardProducts.mockResolvedValue({
      manifestPath: 'meta/manifest-aaa.json',
      manifestHash: 'aaa',
      writtenPaths: ['products/123.json'],
      skippedPaths: [],
      totalOps: 2,
      isInitialSync: false,
      suppressedNoopWrites: false,
      productsManifestPath: 'meta/products-manifest-bbb.json',
    });

    const bad = await POST(
      makeRequest({
        orders: [],
        products: [{ productBlobPath: 'products/123.json', tpnc: '123' }],
      }) as unknown as import('next/server').NextRequest
    );
    expect(bad.status).toBe(400);
    expect(mocks.syncDashboardProducts).not.toHaveBeenCalled();

    const good = await POST(
      makeRequest({
        products: [{ productBlobPath: 'products/123.json', tpnc: '123', title: 'Apples' }],
      }) as unknown as import('next/server').NextRequest
    );
    expect(good.status).toBe(200);
    expect(mocks.syncDashboardProducts).toHaveBeenCalledTimes(1);
    expect(mocks.blobCtor).toHaveBeenCalledTimes(1);
  });
});
