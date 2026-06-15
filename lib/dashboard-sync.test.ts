import { describe, it, expect, beforeEach } from 'vitest';
import {
  syncDashboardLayout,
  buildOrderBlobPath,
  buildCoverageBlobPath,
  type SplitLayoutPayload,
} from './dashboard-sync';
import { InMemoryBlobStorageClient } from './blob-storage';
import type { Meal, MatchedItem } from './meals-data';

function makeMeal(id: string, date: string, content: string): Meal {
  return { id, content, date, labels: ['adult'], section: 'Planned' };
}

function makeMatched(name: string): MatchedItem {
  return { ingredient: name, name, quantity: 1, price: 1.0 };
}

const sampleSummary = {
  coverage_percentage: 80,
  covered: 4,
  missing: 1,
  meals_total: 5,
  meals_covered: 4,
  order_total: 57.43,
  delivery_date: '2026-06-15',
};

function makePayload(): SplitLayoutPayload {
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
            matchedItems: [makeMatched('Beef mince 500g'), makeMatched('Pasta 500g')],
            missingItems: [],
          },
        ],
        coverageBlobPath: 'coverage/2026-06-15.json',
      },
    ],
    summary: sampleSummary,
    deliveryWindows: [
      { date: '2026-06-15', slot: '20:00-21:00', orderTotal: 57.43, status: 'pending' },
    ],
    coverageWindow: ['2026-06-15'],
  };
}

describe('buildOrderBlobPath / buildCoverageBlobPath', () => {
  it('order path uses delivery date and order number', () => {
    expect(buildOrderBlobPath('2026-06-15', '5421-8594-00')).toBe(
      'orders/2026-06-15/5421-8594-00.json'
    );
  });

  it('coverage path uses date only', () => {
    expect(buildCoverageBlobPath('2026-06-15')).toBe('coverage/2026-06-15.json');
  });
});

describe('syncDashboardLayout — first sync (no manifest exists)', () => {
  it('writes all data blobs, manifest, and pointer', async () => {
    const client = new InMemoryBlobStorageClient();
    const result = await syncDashboardLayout(makePayload(), client);

    expect(result.writtenPaths).toHaveLength(3);
    expect(result.skippedPaths).toHaveLength(0);
    expect(result.isInitialSync).toBe(true);
    expect(result.totalOps).toBe(5);
    expect(result.manifestPath).toMatch(/^meta\/manifest-[0-9a-f]{64}\.json$/);

    expect(client.store.has('orders/2026-06-15/5421-8594-00.json')).toBe(true);
    expect(client.store.has('coverage/2026-06-15.json')).toBe(true);
    expect(client.store.has(result.manifestPath)).toBe(true);
    expect(client.store.has('pointers/latest.json')).toBe(true);

    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(result.manifestPath);
  });

  it('SC-01 — two delivery cycles produce 2 order blobs, neither overwritten', async () => {
    const client = new InMemoryBlobStorageClient();
    await syncDashboardLayout(makePayload(), client);

    const second = makePayload();
    second.orders[0]!.orderNumber = '9999-0000-11';
    second.orders[0]!.deliveryDate = '2026-06-19';
    second.orders[0]!.orderBlobPath = 'orders/2026-06-19/9999-0000-11.json';
    second.coverage[0]!.date = '2026-06-19';
    second.coverage[0]!.coverageBlobPath = 'coverage/2026-06-19.json';
    second.coverage[0]!.sourceOrderBlobPath = 'orders/2026-06-19/9999-0000-11.json';
    second.coverage[0]!.meals[0]!.meal = makeMeal('m2', '2026-06-19', 'Curry');
    await syncDashboardLayout(second, client);

    expect(client.store.has('orders/2026-06-15/5421-8594-00.json')).toBe(true);
    expect(client.store.has('orders/2026-06-19/9999-0000-11.json')).toBe(true);
    const firstOrder = await client.readJsonBlob<{ orderNumber: string }>(
      'orders/2026-06-15/5421-8594-00.json'
    );
    expect(firstOrder?.orderNumber).toBe('5421-8594-00');
  });
});

describe('syncDashboardLayout — unchanged sync (SC-03)', () => {
  it('writes only manifest + pointer; all data blobs skipped', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = makePayload();

    const first = await syncDashboardLayout(payload, client);
    expect(first.writtenPaths).toHaveLength(3);

    const second = await syncDashboardLayout(payload, client);
    expect(second.writtenPaths).toHaveLength(0);
    expect(second.skippedPaths).toHaveLength(3);
    expect(second.totalOps).toBe(2);
    expect(second.isInitialSync).toBe(false);
  });
});

describe('syncDashboardLayout — partial change (SC-03 secondary)', () => {
  it('writes only changed coverage blob + manifest + pointer', async () => {
    const client = new InMemoryBlobStorageClient();
    const first = await syncDashboardLayout(makePayload(), client);

    const second = makePayload();
    second.coverage[0]!.meals[0]!.missingItems = ['Carrots'];

    const result = await syncDashboardLayout(second, client);
    expect(result.writtenPaths).toContain('coverage/2026-06-15.json');
    expect(result.skippedPaths).toContain('orders/2026-06-15/5421-8594-00.json');
    expect(result.totalOps).toBe(result.writtenPaths.length + 2);
    expect(client.store.has(first.manifestPath)).toBe(true);
    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(result.manifestPath);
  });

  it('prunes stale summary entries and removed coverage/order paths from the new manifest', async () => {
    const client = new InMemoryBlobStorageClient();
    const first = await syncDashboardLayout(makePayload(), client);
    const firstManifest = await client.readManifest(first.manifestPath);
    const firstSummaryPath = Object.keys(firstManifest).find((p) => p.startsWith('meta/summary-'));
    expect(firstSummaryPath).toBeDefined();
    expect(Object.keys(firstManifest)).toContain('coverage/2026-06-15.json');

    const second = makePayload();
    second.summary = { ...second.summary, coverage_percentage: 60 };
    second.coverage = [];
    second.orders = [];
    const result = await syncDashboardLayout(second, client);
    const secondManifest = await client.readManifest(result.manifestPath);
    const secondSummaryPath = Object.keys(secondManifest).find((p) => p.startsWith('meta/summary-'));
    expect(secondSummaryPath).toBeDefined();
    expect(secondSummaryPath).not.toBe(firstSummaryPath);
    expect(Object.keys(secondManifest)).not.toContain('coverage/2026-06-15.json');
    expect(Object.keys(secondManifest)).not.toContain('orders/2026-06-15/5421-8594-00.json');
    expect(Object.keys(secondManifest).filter((p) => p.startsWith('meta/summary-'))).toHaveLength(1);
  });
});

describe('syncDashboardLayout — manifest write failure leaves previous valid (FR-007)', () => {
  it('when writeManifest throws, the previous manifest + pointer remain valid', async () => {
    const client = new InMemoryBlobStorageClient();
    const first = await syncDashboardLayout(makePayload(), client);

    const orig = client.writeManifest.bind(client);
    client.writeManifest = async () => {
      throw new Error('simulated manifest write failure');
    };

    await expect(syncDashboardLayout(makePayload(), client)).rejects.toThrow(/simulated/);
    client.writeManifest = orig;

    expect(client.store.has(first.manifestPath)).toBe(true);
    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(first.manifestPath);
  });
});

describe('syncDashboardLayout — pointer write failure leaves manifest valid (FR-008)', () => {
  it('when writePointer throws after manifest, the manifest is still current', async () => {
    const client = new InMemoryBlobStorageClient();
    const first = await syncDashboardLayout(makePayload(), client);

    const orig = client.writePointer.bind(client);
    client.writePointer = async () => {
      throw new Error('simulated pointer write failure');
    };

    await expect(syncDashboardLayout(makePayload(), client)).rejects.toThrow(/simulated/);
    client.writePointer = orig;

    const blobs = await client.listPaths('meta/manifest-');
    expect(blobs.length).toBeGreaterThan(0);
    expect(client.store.has(first.manifestPath)).toBe(true);
    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(first.manifestPath);
  });
});

describe('syncDashboardLayout — dry-run mode', () => {
  it('reports what would change but performs zero blob writes', async () => {
    const client = new InMemoryBlobStorageClient();
    const dryResult = await syncDashboardLayout(makePayload(), client, { dryRun: true });
    expect(dryResult.writtenPaths).toHaveLength(3);
    expect(client.store.size).toBe(0);
    expect(dryResult.manifestHash).toBe('dry-run');

    await syncDashboardLayout(makePayload(), client);
    const dryAgain = await syncDashboardLayout(makePayload(), client, { dryRun: true });
    expect(dryAgain.writtenPaths).toHaveLength(0);
    expect(dryAgain.skippedPaths).toHaveLength(3);
    expect(client.store.size).toBeGreaterThan(0);
  });
});

describe('syncDashboardLayout — audit-log-friendly written paths', () => {
  it('summary blob is content-addressable: same summary content → same path', async () => {
    const client = new InMemoryBlobStorageClient();
    const r1 = await syncDashboardLayout(makePayload(), client);
    const summaryPath = r1.writtenPaths.find((p) => p.startsWith('meta/summary-'));
    expect(summaryPath).toBeDefined();
    expect(summaryPath).toMatch(/^meta\/summary-[0-9a-f]{64}\.json$/);

    const r2 = await syncDashboardLayout(makePayload(), client);
    expect(r2.skippedPaths).toContain(summaryPath!);
  });
});
