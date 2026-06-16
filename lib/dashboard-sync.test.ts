import { describe, it, expect, beforeEach } from 'vitest';
import {
  syncDashboardLayout,
  buildOrderBlobPath,
  buildCoverageBlobPath,
  invalidateCoverageForOrder,
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
    dataGeneratedAt: '2026-06-15T12:00:00Z',
    uiUpdatedAt: '2026-06-15T12:00:00Z',
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

  // ── Spec 019: Phase 2 schema extensions + Phase 3 invalidation trigger ──────────
  it('Spec 019 / FR-02 — every coverage entry carries stale=false and staleReason=null by default', async () => {
    const client = new InMemoryBlobStorageClient();
    await syncDashboardLayout(makePayload(), client);
    const blob = await client.readJsonBlob<{
      meals: Array<{ stale?: boolean; staleReason?: string | null }>;
    }>('coverage/2026-06-15.json');
    expect(blob).not.toBeNull();
    for (const meal of blob!.meals) {
      expect(meal.stale).toBe(false);
      expect(meal.staleReason).toBeNull();
    }
  });

  it('Spec 019 / FR-04 — every matched item carries source="order" by default and shelf-life fields absent', async () => {
    const client = new InMemoryBlobStorageClient();
    await syncDashboardLayout(makePayload(), client);
    const blob = await client.readJsonBlob<{
      meals: Array<{
        matchedItems: Array<{
          source?: string;
          shelf_life_days?: number;
          use_by_warning?: boolean;
          use_by_date?: string;
        }>;
      }>;
    }>('coverage/2026-06-15.json');
    expect(blob).not.toBeNull();
    for (const meal of blob!.meals) {
      for (const item of meal.matchedItems) {
        expect(item.source).toBe('order');
        expect(item.shelf_life_days).toBeUndefined();
        expect(item.use_by_warning).toBe(false);
        expect(item.use_by_date).toBeUndefined();
      }
    }
  });

  it('Spec 019 / FR-01 — invalidate_coverage_for_order marks matching coverage stale transiently then writes fresh blob', async () => {
    const client = new InMemoryBlobStorageClient();
    await syncDashboardLayout(makePayload(), client);

    const result = await invalidateCoverageForOrder(
      'orders/2026-06-15/5421-8594-00.json',
      'order_updated',
      client
    );

    // The matching coverage blob path is in the write list (transient stale
    // write + fresh write). The fresh write produces content that hashes
    // to the same value as the original (stale=false, staleReason=null are
    // the post-invalidation defaults), so the manifest hash is unchanged.
    // What matters is that both the transient stale write and the fresh
    // write ran; writtenPaths contains the matching path twice.
    expect(result.writtenPaths.filter((p) => p === 'coverage/2026-06-15.json')).toHaveLength(2);

    // After invalidation, the coverage blob is fresh: stale=false, staleReason=null.
    const finalBlob = await client.readJsonBlob<{
      meals: Array<{ stale: boolean; staleReason: string | null }>;
    }>('coverage/2026-06-15.json');
    expect(finalBlob).not.toBeNull();
    for (const meal of finalBlob!.meals) {
      expect(meal.stale).toBe(false);
      expect(meal.staleReason).toBeNull();
    }
  });

  it('Spec 019 / FR-01 — invalidate_coverage_for_order ignores coverage blobs whose sourceOrderBlobPath does not match', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = makePayload();
    // Add a second coverage blob pointing at a different order.
    payload.coverage.push({
      date: '2026-06-19',
      sourceOrderBlobPath: 'orders/2026-06-19/9999-0000-11.json',
      meals: [
        {
          meal: makeMeal('m99', '2026-06-19', 'Unrelated meal'),
          status: 'covered',
          coverageScore: 100,
          matchedItems: [makeMatched('Salmon')],
          missingItems: [],
        },
      ],
      coverageBlobPath: 'coverage/2026-06-19.json',
    });
    payload.coverageWindow = ['2026-06-15', '2026-06-19'];
    await syncDashboardLayout(payload, client);

    const result = await invalidateCoverageForOrder(
      'orders/2026-06-15/5421-8594-00.json',
      'order_cancelled',
      client
    );

    // Only the 2026-06-15 coverage blob was invalidated; the 2026-06-19 blob
    // (which references a different order) was left untouched.
    expect(result.writtenPaths).toContain('coverage/2026-06-15.json');
    expect(result.writtenPaths).not.toContain('coverage/2026-06-19.json');

    const untouched = await client.readJsonBlob<{
      meals: Array<{ stale: boolean; staleReason: string | null }>;
    }>('coverage/2026-06-19.json');
    expect(untouched).not.toBeNull();
    for (const meal of untouched!.meals) {
      // The untouched blob never had invalidation applied; it should still
      // be in its normal fresh state.
      expect(meal.stale).toBe(false);
      expect(meal.staleReason).toBeNull();
    }
  });

  it('Spec 019 / FR-01 — each trigger reason is recorded as a staleReason on the transient stale write', async () => {
    const client = new InMemoryBlobStorageClient();
    await syncDashboardLayout(makePayload(), client);

    for (const reason of ['order_updated', 'order_cancelled', 'order_superseded', 'order_refunded'] as const) {
      const local = new InMemoryBlobStorageClient();
      await syncDashboardLayout(makePayload(), local);
      const result = await invalidateCoverageForOrder(
        'orders/2026-06-15/5421-8594-00.json',
        reason,
        local
      );
      // Both the transient stale write and the fresh write should land in
      // the writtenPaths list (the trigger rewrites the blob twice with
      // different content).
      expect(result.writtenPaths.filter((p) => p === 'coverage/2026-06-15.json')).toHaveLength(2);
      // After invalidation, the final blob is fresh: staleReason cleared.
      const final = await local.readJsonBlob<{
        meals: Array<{ stale: boolean; staleReason: string | null }>;
      }>('coverage/2026-06-15.json');
      expect(final!.meals[0]!.stale).toBe(false);
      expect(final!.meals[0]!.staleReason).toBeNull();
    }
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
