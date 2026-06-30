import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  client: {
    readPointer: vi.fn(),
    readManifest: vi.fn(),
    readJsonBlob: vi.fn(),
    writePointer: vi.fn(),
  },
  blobCtor: vi.fn(function BlobClient() {
    return mocks.client;
  }),
  getDashboardData: vi.fn(),
  buildCoverageWindowDates: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  put: mocks.put,
  del: mocks.del,
}));

vi.mock('@/lib/blob-storage', () => ({
  VercelBlobStorageClient: mocks.blobCtor,
}));

vi.mock('@/lib/dashboard-data', () => ({
  getDashboardData: mocks.getDashboardData,
  buildCoverageWindowDates: mocks.buildCoverageWindowDates,
}));

const ORIGINAL_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const ORIGINAL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function loadRoute() {
  vi.resetModules();
  process.env.MEALS_DASHBOARD_DATA_SECRET = 'secret';
  process.env.BLOB_READ_WRITE_TOKEN = 'blob-token';
  return await import('./route');
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/internal/product-reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dashboard-secret': 'secret' },
    body: JSON.stringify(body),
  });
}

function seedReader() {
  mocks.client.readPointer.mockResolvedValue({
    manifestPath: 'meta/manifest-main.json',
    productsManifestPath: 'meta/products-manifest-old.json',
  });
  mocks.client.readManifest.mockResolvedValue({
    '111': 'products/111.json',
    '222': 'products/222.json',
    '333': 'products/333.json',
    '444': 'products/444.json',
  });
  mocks.client.readJsonBlob.mockImplementation(async (path: string) => {
    if (path === 'products/111.json') {
      return { tpnc: '111', title: 'Keep me', lastFetched: '2026-06-28T00:00:00.000Z' };
    }
    if (path === 'products/222.json') {
      return { tpnc: '222', title: 'Old order item', lastFetched: '2026-06-28T00:00:00.000Z' };
    }
    if (path === 'products/333.json') {
      return null;
    }
    if (path === 'products/444.json') {
      return { tpnc: '444', title: 'Expired current item', lastFetched: '2026-05-01T00:00:00.000Z' };
    }
    return null;
  });
  mocks.getDashboardData.mockResolvedValue({
    latestOrder: {
      orderNumber: '6521-8284-142',
      deliveryDate: '2026-06-30',
      items: [
        { name: 'Keep me', tpnc: '111' },
        { name: 'Expired current item', tpnc: '444' },
      ],
    },
  });
  mocks.buildCoverageWindowDates.mockReturnValue(['2026-06-29', '2026-06-30']);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
  mocks.put.mockReset();
  mocks.del.mockReset();
  mocks.client.readPointer.mockReset();
  mocks.client.readManifest.mockReset();
  mocks.client.readJsonBlob.mockReset();
  mocks.client.writePointer.mockReset();
  mocks.blobCtor.mockReset();
  mocks.getDashboardData.mockReset();
  mocks.buildCoverageWindowDates.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.MEALS_DASHBOARD_DATA_SECRET;
  } else {
    process.env.MEALS_DASHBOARD_DATA_SECRET = ORIGINAL_SECRET;
  }
  if (ORIGINAL_BLOB_TOKEN === undefined) {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  } else {
    process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_BLOB_TOKEN;
  }
});

describe('POST /api/internal/product-reconcile', () => {
  it('dry-runs product manifest reconciliation without writing or deleting', async () => {
    seedReader();
    const { POST } = await loadRoute();

    const res = await POST(makeRequest({ dryRun: true }) as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.productCountBefore).toBe(4);
    expect(body.productCountAfter).toBe(1);
    expect(body.kept.map((p: { tpnc: string }) => p.tpnc)).toEqual(['111']);
    expect(body.removed.map((p: { tpnc: string; reason: string }) => [p.tpnc, p.reason])).toEqual([
      ['222', 'not-in-upcoming-order'],
      ['333', 'not-in-upcoming-order'],
      ['444', 'expired'],
    ]);
    expect(body.wouldDeletePaths).toEqual(['products/222.json', 'products/333.json', 'products/444.json']);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.client.writePointer).not.toHaveBeenCalled();
  });

  it('writes a replacement products manifest, preserves main manifest, and deletes removed product blobs', async () => {
    seedReader();
    const { POST } = await loadRoute();

    const res = await POST(makeRequest({}) as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.productCountAfter).toBe(1);
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.put.mock.calls[0][0]).toMatch(/^meta\/products-manifest-[a-f0-9]{64}\.json$/);
    expect(JSON.parse(mocks.put.mock.calls[0][1])).toEqual({ '111': 'products/111.json' });
    expect(mocks.client.writePointer).toHaveBeenCalledWith('meta/manifest-main.json', mocks.put.mock.calls[0][0]);
    expect(mocks.del).toHaveBeenCalledWith(
      ['products/222.json', 'products/333.json', 'products/444.json'],
      { token: 'blob-token' }
    );
  });
});
