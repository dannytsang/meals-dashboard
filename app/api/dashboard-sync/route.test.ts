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
  return new Request('http://localhost/api/dashboard-sync', {
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

describe('POST /api/dashboard-sync', () => {
  it('rejects unexpected products payload data', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ products: [{ productBlobPath: 'products/123.json', tpnc: '123' }] }) as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(400);
    expect(mocks.syncDashboardLayout).not.toHaveBeenCalled();
    expect(mocks.blobCtor).not.toHaveBeenCalled();
  });

  it('accepts dashboard-only payloads', async () => {
    const { POST } = await loadRoute();
    mocks.syncDashboardLayout.mockResolvedValue({
      manifestPath: 'meta/manifest-aaa.json',
      manifestHash: 'aaa',
      writtenPaths: ['orders/2026-06-15/5421.json'],
      skippedPaths: [],
      totalOps: 3,
      isInitialSync: false,
      suppressedNoopWrites: false,
      productsManifestPath: null,
    });

    const res = await POST(
      makeRequest({
        orders: [],
        coverage: [],
        summary: {},
        deliveryWindows: [],
        coverageWindow: [],
        dataGeneratedAt: '2026-06-20T00:00:00Z',
        uiUpdatedAt: '2026-06-20T00:00:00Z',
      }) as unknown as import('next/server').NextRequest
    );

    expect(res.status).toBe(200);
    expect(mocks.syncDashboardLayout).toHaveBeenCalledTimes(1);
    expect(mocks.blobCtor).toHaveBeenCalledTimes(1);
  });
});
