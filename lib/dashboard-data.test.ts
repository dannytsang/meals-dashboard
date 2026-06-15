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
    },
    deliveryWindows: [
      { date: '2026-06-15', slot: '20:00-21:00', orderTotal: 57.43, status: 'pending' },
    ],
    coverageWindow: ['2026-06-15'],
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
    });
  });

  it('returns empty state on pointer read failure instead of silently using legacy fallback', async () => {
    const brokenReader: DashboardDataReader = {
      readPointer: async () => { throw new Error('pointer read failed'); },
      readManifest: async () => ({}),
      readJsonBlob: async () => null,
      listPaths: async () => ['dashboard-data.json'],
    };
    const data = await getDashboardData({ coverageWindow: ['2026-06-15'], reader: brokenReader });
    expect(data).toEqual({ coverage: [], deliveryWindows: [], latestOrder: null, mealsCheckSummary: null });
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
    expect(data.deliveryWindows).toEqual([]);
    expect(data.coverage).toHaveLength(2);
    expect(data.mealsCheckSummary).not.toBeNull();
  });
});

describe('getDashboardData — legacy single-blob fallback', () => {
  it('reads dashboard-data.json when no pointer is present (regression guard)', async () => {
    const client = new InMemoryBlobStorageClient();
    const legacyData = {
      coverage: [
        {
          meal: makeMeal('legacy-1', '2026-06-15', 'Legacy Bolognese'),
          status: 'covered' as const,
          coverageScore: 100,
          matchedItems: [],
          missingItems: [],
        },
      ],
      deliveryWindows: [
        { date: '2026-06-15', slot: '20:00-21:00', orderTotal: 50, status: 'pending' as const },
      ],
      latestOrder: {
        orderNumber: 'legacy-1',
        deliveryDate: '2026-06-15',
        deliverySlot: '20:00-21:00',
        orderTotal: 50,
        items: [],
        substitutions: [],
        unavailable: [],
        shortLifeItems: [],
      },
      mealsCheckSummary: {
        coverage_percentage: 100,
        covered: 1,
        missing: 0,
        meals_total: 1,
        meals_covered: 1,
        order_total: 50,
        delivery_date: '2026-06-15',
      },
    };
    client.seed('dashboard-data.json', JSON.stringify(legacyData));

    const data = await getDashboardData({
      coverageWindow: ['2026-06-15'],
      reader: readerOf(client),
    });
    expect(data.coverage[0]?.meal.content).toBe('Legacy Bolognese');
    expect(data.latestOrder?.orderNumber).toBe('legacy-1');
  });
});
