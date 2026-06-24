import { describe, it, expect, beforeEach } from 'vitest';
import { getDashboardData, type DashboardDataReader, buildCoverageWindowDates } from './dashboard-data';
import { InMemoryBlobStorageClient } from './blob-storage';
import { syncDashboardLayout, type SplitLayoutPayload } from './dashboard-sync';
import type { Meal } from './meals-data';

function makeMeal(id: string, date: string, content: string): Meal {
  return { id, content, date, labels: ['adult'], section: 'Planned' };
}

function samplePayload(overrides: Partial<SplitLayoutPayload> = {}): SplitLayoutPayload {
  return {
    orders: [
      {
        orderNumber: '5421-8594-00',
        deliveryDate: '2026-06-15',
        deliverySlot: '20:00-21:00',
        orderTotal: 57.43,
        items: [
          { name: 'Beef mince 500g', quantity: 1, price: 4.5 },
          { name: 'Pasta 500g', quantity: 2, price: 1.2 },
        ],
        substitutions: [],
        unavailable: [],
        shortLifeItems: [],
        status: 'active',
        orderBlobPath: 'orders/2026-06-15/5421-8594-00.json',
      },
    ],
    coverage: [
      {
        date: '2026-06-15',
        sourceOrderBlobPath: 'orders/2026-06-15/5421-8594-00.json',
        meals: [
          {
            meal: makeMeal('m1', '2026-06-15', 'Bolognese'),
            status: 'covered',
            coverageScore: 100,
            matchedItems: [{ ingredient: 'Beef mince 500g', name: 'Beef mince 500g', quantity: 1, price: 4.5 }],
            missingItems: [],
          },
          {
            meal: makeMeal('m2', '2026-06-15', 'Salad'),
            status: 'partial',
            coverageScore: 50,
            matchedItems: [],
            missingItems: ['Lettuce'],
          },
        ],
        coverageBlobPath: 'coverage/2026-06-15.json',
      },
    ],
    summary: {
      coverage_percentage: 75,
      covered: 1,
      missing: 1,
      meals_total: 2,
      meals_covered: 1,
      order_total: 57.43,
      delivery_date: '2026-06-15',
      windows: {
        last_delivery: '2026-06-15',
        next_delivery: '2026-06-19',
        next_window_end: '2026-06-23',
      },
    },
    deliveryWindows: [
      { date: '2026-06-15', slot: '20:00-21:00', orderTotal: 57.43, status: 'pending' },
    ],
    coverageWindow: ['2026-06-15'],
    dataGeneratedAt: '2026-06-15T12:00:00Z',
    uiUpdatedAt: '2026-06-15T12:00:00Z',
    ...overrides,
  };
}

function readerOf(client: InMemoryBlobStorageClient): DashboardDataReader {
  return {
    readPointer: client.readPointer.bind(client),
    readManifest: client.readManifest.bind(client),
    readJsonBlob: client.readJsonBlob.bind(client),
    listPaths: client.listPaths.bind(client),
  };
}

describe('buildCoverageWindowDates', () => {
  it('expands an inclusive date range to every day', () => {
    expect(buildCoverageWindowDates('2026-06-15', '2026-06-18')).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
    ]);
  });
});

describe('getDashboardData — split layout', () => {
  let client: InMemoryBlobStorageClient;
  beforeEach(() => {
    client = new InMemoryBlobStorageClient();
  });

  it('SC-01 — reads pointer → manifest → blobs and composes the DashboardData shape', async () => {
    await syncDashboardLayout(samplePayload(), client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });

    expect(data.coverage).toHaveLength(2);
    expect(data.coverage[0]?.meal.content).toBe('Bolognese');
    expect(data.coverage[0]?.status).toBe('covered');
    expect(data.coverage[1]?.meal.content).toBe('Salad');
    expect(data.coverage[1]?.status).toBe('partial');
    expect(data.coverage[1]?.missingItems).toEqual(['Lettuce']);
    expect(data.latestOrder).not.toBeNull();
    expect(data.latestOrder?.orderNumber).toBe('5421-8594-00');
    expect(data.latestOrder?.orderTotal).toBe(57.43);
    expect(data.mealsCheckSummary?.coverage_percentage).toBe(75);
    expect(data.mealsCheckSummary?.order_total).toBe(57.43);
  });

  it('Spec 018 — preserves order status and refund amount from split order blobs', async () => {
    const payload = samplePayload();
    payload.orders[0] = {
      ...payload.orders[0]!,
      status: 'refunded',
      refundAmount: 4.5,
    };

    await syncDashboardLayout(payload, client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });

    expect(data.latestOrder?.orderStatus).toBe('refunded');
    expect(data.latestOrder?.refundAmount).toBe(4.5);
  });

  it('loads all dates in a window, not just start/end exact dates', async () => {
    const payload = samplePayload();
    payload.coverageWindow = ['2026-06-15', '2026-06-16', '2026-06-17'];
    payload.coverage.push({
      date: '2026-06-16',
      sourceOrderBlobPath: 'orders/2026-06-15/5421-8594-00.json',
      meals: [
        {
          meal: makeMeal('m3', '2026-06-16', 'Curry'),
          status: 'covered',
          coverageScore: 100,
          matchedItems: [],
          missingItems: [],
        },
      ],
      coverageBlobPath: 'coverage/2026-06-16.json',
    });
    await syncDashboardLayout(payload, client);
    const window = buildCoverageWindowDates('2026-06-15', '2026-06-17');
    const data = await getDashboardData({ coverageWindow: window, reader: readerOf(client) });
    expect(data.coverage.map((c) => c.meal.date).sort()).toEqual(['2026-06-15', '2026-06-15', '2026-06-16']);
  });

  it('US1 / FR-006 — composes two delivery windows in the same render', async () => {
    const payload = samplePayload();
    payload.orders.push({
      orderNumber: '9999-0000-11',
      deliveryDate: '2026-06-19',
      deliverySlot: '19:00-20:00',
      orderTotal: 30.0,
      items: [{ name: 'Salmon', quantity: 1, price: 8.0 }],
      substitutions: [],
      unavailable: [],
      shortLifeItems: [],
      status: 'active',
      orderBlobPath: 'orders/2026-06-19/9999-0000-11.json',
    });
    payload.coverage.push({
      date: '2026-06-19',
      sourceOrderBlobPath: 'orders/2026-06-19/9999-0000-11.json',
      meals: [
        {
          meal: makeMeal('m3', '2026-06-19', 'Salmon'),
          status: 'covered',
          coverageScore: 100,
          matchedItems: [{ ingredient: 'Salmon', name: 'Salmon', quantity: 1, price: 8.0 }],
          missingItems: [],
        },
      ],
      coverageBlobPath: 'coverage/2026-06-19.json',
    });
    payload.coverageWindow = ['2026-06-15', '2026-06-19'];

    await syncDashboardLayout(payload, client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15', '2026-06-19'],
      reader: readerOf(client),
    });

    expect(data.coverage).toHaveLength(3);
    expect(data.latestOrder?.orderNumber).toBe('9999-0000-11');
    expect(data.deliveryWindows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getDashboardData — missing-blob fallback (FR-003, SC-03)', () => {
  it('returns empty state when no pointer exists (first-ever sync)', async () => {
    const client = new InMemoryBlobStorageClient();
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });
    expect(data).toEqual({
      coverage: [],
      deliveryWindows: [],
      latestOrder: null,
      mealsCheckSummary: null,
      dataGeneratedAt: '',
      uiUpdatedAt: '',
      loadError: null,
    });
  });

  it('surfaces a sanitised load error when the live-mode pointer read fails', async () => {
    const brokenReader: DashboardDataReader = {
      readPointer: async () => {
        const error = new Error(
          'Vercel Blob rejected the configured credentials (403 Forbidden). Authorization: Bearer ***'
        );
        (error as Error & { statusCode?: number; statusText?: string; resourcePath?: string }).statusCode = 403;
        (error as Error & { statusText?: string; resourcePath?: string }).statusText = 'Forbidden';
        (error as Error & { resourcePath?: string }).resourcePath = 'pointers/latest.json';
        throw error;
      },
      readManifest: async () => ({}),
      readJsonBlob: async () => null,
      listPaths: async () => ['dashboard-data.json'],
    };

    const data = await getDashboardData({ coverageWindow: ['2026-06-15'], reader: brokenReader });

    expect((data as any).loadError).toBeDefined();
    expect((data as any).loadError.source).toBe('pointer');
    expect((data as any).loadError.title).toBe('Meals dashboard unavailable.');
    expect((data as any).loadError.message).toContain('403 Forbidden');
    expect((data as any).loadError.message).not.toContain('Bearer abc123');
  });

  it('returns empty state on pointer read failure instead of silently using legacy fallback', async () => {
    const brokenReader: DashboardDataReader = {
      readPointer: async () => { throw new Error('pointer read failed'); },
      readManifest: async () => ({}),
      readJsonBlob: async () => null,
      listPaths: async () => ['dashboard-data.json'],
    };
    const data = await getDashboardData({ coverageWindow: ['2026-06-15'], reader: brokenReader });
    expect(data.coverage).toEqual([]);
    expect(data.deliveryWindows).toEqual([]);
    expect(data.latestOrder).toBeNull();
    expect((data as any).loadError?.title).toBe('Meals dashboard unavailable.');
    expect((data as any).loadError?.message).toContain('pointer read failed');
  });

  it('falls back to null/empty for missing coverage blob without crashing', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = samplePayload();
    payload.coverage = [];
    await syncDashboardLayout(payload, client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });
    expect(data.latestOrder).not.toBeNull();
    expect(data.mealsCheckSummary).not.toBeNull();
    expect(data.coverage).toEqual([]);
  });

  it('falls back to empty deliveryWindows when order blobs are missing', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = samplePayload();
    payload.orders = [];
    await syncDashboardLayout(payload, client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });
    expect(data.latestOrder).toBeNull();
    // With spec 019 / FR-02: next_delivery from the summary is added to
    // deliveryWindows even when no order blobs exist, so the Week-view header
    // shows a delivery marker for the upcoming delivery.
    // The sample fixture also sets next_window_end='2026-06-23'; that boundary
    // chip is also surfaced so the Week Meals grid shows both calendar slots.
    expect(data.deliveryWindows).toEqual([
      { date: '2026-06-19', slot: 'Evening', orderTotal: 0, status: 'scheduled' },
      { date: '2026-06-23', slot: 'Evening', orderTotal: 0, status: 'scheduled' },
    ]);
    expect(data.coverage).toHaveLength(2);
    expect(data.mealsCheckSummary).not.toBeNull();
  });

  it('SC-next_window_end-01: surfaces next_window_end as a delivery chip when no order blob exists for it', async () => {
    // Setup mirrors Danny's 24 June scenario:
    //   - One order blob exists (26 June), so next_delivery is "covered" by an order blob and falls out of additionalDates.
    //   - summary.windows.next_window_end (30 June) has no order blob backing it.
    //   - The Week Meals grid must render a Delivery chip for 30 June.
    const client = new InMemoryBlobStorageClient();
    const payload = samplePayload();
    payload.orders = [
      {
        ...payload.orders[0]!,
        orderNumber: '7421-8166-90',
        deliveryDate: '2026-06-26',
        orderBlobPath: 'orders/2026-06-26/7421-8166-90.json',
      },
    ];
    payload.summary = {
      ...payload.summary,
      delivery_date: '2026-06-26',
      windows: {
        last_delivery: '2026-06-19',
        next_delivery: '2026-06-26',
        next_window_end: '2026-06-30',
      },
    };
    payload.coverageWindow = ['2026-06-26'];

    await syncDashboardLayout(payload, client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-26'],
      reader: readerOf(client),
    });

    const dates = data.deliveryWindows.map((w) => w.date).sort();
    expect(dates).toEqual(['2026-06-26', '2026-06-30']);
    const windowEnd = data.deliveryWindows.find((w) => w.date === '2026-06-30');
    expect(windowEnd).toEqual({
      date: '2026-06-30',
      slot: 'Evening',
      orderTotal: 0,
      status: 'scheduled',
    });
  });

  it('SC-next_window_end-02: deduplicates next_window_end against next_delivery and order-blob dates', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = samplePayload();
    payload.orders = [];
    // Both summary fields point at the same date (defensive: pipeline edge case).
    payload.summary = {
      ...payload.summary,
      windows: {
        last_delivery: '2026-06-15',
        next_delivery: '2026-06-19',
        next_window_end: '2026-06-19', // same as next_delivery
      },
    };
    await syncDashboardLayout(payload, client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });
    // Should not appear twice.
    expect(data.deliveryWindows.filter((w) => w.date === '2026-06-19')).toHaveLength(1);
  });

  it('SC-next_window_end-03: skips next_window_end when null (pipeline reports no end-of-window date)', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = samplePayload();
    payload.orders = [];
    payload.summary = {
      ...payload.summary,
      windows: {
        last_delivery: '2026-06-15',
        next_delivery: '2026-06-19',
        next_window_end: null,
      },
    };
    await syncDashboardLayout(payload, client);
    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });
    // Only next_delivery surfaces, no extra undefined-date entry.
    expect(data.deliveryWindows.map((w) => w.date)).toEqual(['2026-06-19']);
  });
});


/* -------------------------------------------------------------------------- */
/* Regression coverage for spec 017 / FR-03 + 'past order in latestOrder'.   */
/* The original file's tests use deliveryDate='2026-06-15', which lies inside */
/* the default coverage window. The bug only surfaced when an order's         */
/* deliveryDate falls before `today` (server's local now), which can happen   */
/* when the order's actual_delivery_date is older than today but the order    */
/* is still the most recent one we have. The reader must include the latest  */
/* past order in `latestOrder` so the dashboard ORDER ITEMS list renders.     */
/* -------------------------------------------------------------------------- */

async function seedPastOrderDashboard(): Promise<InMemoryBlobStorageClient> {
  const client = new InMemoryBlobStorageClient();
  client.seed(
    'orders/2026-06-16/5421-8594-00.json',
    JSON.stringify({
      orderNumber: '5421-8594-00',
      deliveryDate: '2026-06-16',
      deliverySlot: '20:00-21:00',
      orderTotal: 57.43,
      items: [{ name: 'Beef mince 500g', quantity: 1, price: 4.5 }],
      substitutions: [],
      unavailable: [],
      shortLifeItems: [],
      status: 'active',
    }),
  );
  client.seed(
    'coverage/2026-06-17.json',
    JSON.stringify({
      date: '2026-06-17',
      sourceOrderBlobPath: 'orders/2026-06-16/5421-8594-00.json',
      meals: [],
    }),
  );
  client.seed(
    'coverage/2026-06-18.json',
    JSON.stringify({
      date: '2026-06-18',
      sourceOrderBlobPath: 'orders/2026-06-16/5421-8594-00.json',
      meals: [],
    }),
  );
  client.seed(
    'meta/summary-fixture.json',
    JSON.stringify({
      dataGeneratedAt: '2026-06-17T00:00:00Z',
      uiUpdatedAt: '2026-06-17T00:00:00Z',
      coverage_percentage: 0,
      covered: 0,
      missing: 0,
      meals_total: 0,
      meals_covered: 0,
      order_total: 57.43,
      delivery_date: '2026-06-17',
    }),
  );

  // Build manifest with hashes.
  const manifest: Record<string, string> = {};
  const paths = await client.listPaths('');
  for (const path of paths) {
    const blob = await client.readJsonBlob<unknown>(path);
    if (blob !== null) {
      manifest[path] = client.computeHash(JSON.stringify(blob));
    }
  }
  const { manifestPath } = await client.writeManifest(manifest);
  await client.writePointer(manifestPath);
  return client;
}

describe('getDashboardData — past order inclusion (window-edge regression)', () => {
  it('returns latestOrder for an order whose deliveryDate is yesterday (outside window)', async () => {
    const window: string[] = [];
    for (let d = 17; d <= 30; d++) {
      window.push(`2026-06-${String(d).padStart(2, '0')}`);
    }
    const client = await seedPastOrderDashboard();
    const data = await getDashboardData({ coverageWindow: window, reader: client });
    expect(data.latestOrder).not.toBeNull();
    expect(data.latestOrder?.orderNumber).toBe('5421-8594-00');
    expect(data.latestOrder?.deliveryDate).toBe('2026-06-16');
    expect(data.latestOrder?.items.length).toBe(1);
  });
});
