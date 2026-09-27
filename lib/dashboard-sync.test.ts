import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  syncDashboardLayout,
  syncDashboardProducts,
  buildOrderBlobPath,
  buildCoverageBlobPath,
  invalidateCoverageForOrder,
  type SplitLayoutPayload,
  type ProductBlob,
} from './dashboard-sync';
import { InMemoryBlobStorageClient } from './blob-storage';
import { logicalRecordPath } from './immutable-records';
import type { Meal, MatchedItem } from './meals-data';

async function referencedPath(client: InMemoryBlobStorageClient, logical: string): Promise<string> {
  const pointer = (await client.readPointer())!;
  const manifest = await client.readManifest(pointer.manifestPath);
  const path = Object.keys(manifest).find(p => logicalRecordPath(p) === logical);
  expect(path).toBeDefined();
  return path!;
}

function makeMeal(id: string, date: string, content: string): Meal {
  return { id, content, date, labels: ['adult'], section: 'Planned' };
}

function makeMatched(name: string): MatchedItem {
  return { ingredient: name, name, quantity: 1, price: 1.0 };
}

function makeProduct(tpnc: string, title: string): ProductBlob & { productBlobPath: string } {
  return {
    productBlobPath: `products/${tpnc}.json`,
    tpnc,
    gtin: `${tpnc}-gtin`,
    tpnb: `${tpnc}-tpnb`,
    title,
    description: `${title} description`,
    storage: 'Keep refrigerated',
    preparation: 'Ready to use',
    ingredients: `${title} ingredients`,
    allergens: 'None',
    nutrition: 'N/A',
    brand: 'Tesco',
    category: 'Fresh',
    imageUrl: `https://example.com/${tpnc}.jpg`,
    productUrl: `https://example.com/${tpnc}`,
    source: 'test-fixture',
    lastFetched: '2026-06-15T12:00:00Z',
  };
}

const sampleSummary = {
  coverage_percentage: 80,
  covered: 4,
  missing: 1,
  meals_total: 5,
  meals_covered: 4,
  order_total: 57.43,
  delivery_date: '2026-06-15',
  windows: {
    last_delivery: '2026-06-15',
    next_delivery: '2026-06-19',
    next_window_end: '2026-06-23',
  },
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

    expect(client.store.has(await referencedPath(client, 'orders/2026-06-15/5421-8594-00.json'))).toBe(true);
    expect(client.store.has(await referencedPath(client, 'coverage/2026-06-15.json'))).toBe(true);
    expect(client.store.has(result.manifestPath)).toBe(true);
    expect(client.store.has('pointers/latest.json')).toBe(true);

    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(result.manifestPath);
  });

  it('SC-01 — two delivery cycles produce 2 order blobs, neither overwritten', async () => {
    const client = new InMemoryBlobStorageClient();
    const first = await syncDashboardLayout(makePayload(), client);
    const firstOrderPath = await referencedPath(client, 'orders/2026-06-15/5421-8594-00.json');

    const second = makePayload();
    second.orders[0]!.orderNumber = '9999-0000-11';
    second.orders[0]!.deliveryDate = '2026-06-19';
    second.orders[0]!.orderBlobPath = 'orders/2026-06-19/9999-0000-11.json';
    second.coverage[0]!.date = '2026-06-19';
    second.coverage[0]!.coverageBlobPath = 'coverage/2026-06-19.json';
    second.coverage[0]!.sourceOrderBlobPath = 'orders/2026-06-19/9999-0000-11.json';
    second.coverage[0]!.meals[0]!.meal = makeMeal('m2', '2026-06-19', 'Curry');
    await syncDashboardLayout(second, client);

    expect(client.store.has(firstOrderPath)).toBe(true);
    expect((await client.readManifest(first.manifestPath))[firstOrderPath]).toBe(client.store.get(firstOrderPath)!.hash);
    expect(client.store.has(await referencedPath(client, 'orders/2026-06-19/9999-0000-11.json'))).toBe(true);
    const firstOrder = await client.readJsonBlob<{ orderNumber: string }>(
      firstOrderPath
    );
    expect(firstOrder?.orderNumber).toBe('5421-8594-00');
  });
});

describe('syncDashboardLayout — unchanged sync (SC-03)', () => {
  it('suppresses manifest + pointer writes when the sync is a true no-op', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = makePayload();

    const first = await syncDashboardLayout(payload, client);
    expect(first.writtenPaths).toHaveLength(3);

    const writeManifestSpy = vi.spyOn(client, 'writeManifest');
    const writePointerSpy = vi.spyOn(client, 'writePointer');

    const second = await syncDashboardLayout(payload, client);
    expect(second.suppressedNoopWrites).toBe(true);
    expect(second.writtenPaths).toHaveLength(0);
    expect(second.skippedPaths).toHaveLength(3);
    expect(second.totalOps).toBe(0);
    expect(second.isInitialSync).toBe(false);
    expect(writeManifestSpy).not.toHaveBeenCalled();
    expect(writePointerSpy).not.toHaveBeenCalled();
    expect(second.manifestPath).toBe(first.manifestPath);
  });
});

describe('syncDashboardLayout — partial change (SC-03 secondary)', () => {
  it('writes only changed coverage blob + manifest + pointer', async () => {
    const client = new InMemoryBlobStorageClient();
    const first = await syncDashboardLayout(makePayload(), client);

    const second = makePayload();
    second.coverage[0]!.meals[0]!.missingItems = ['Carrots'];

    const result = await syncDashboardLayout(second, client);
    expect(result.writtenPaths).toContain(await referencedPath(client, 'coverage/2026-06-15.json'));
    expect(result.skippedPaths).toContain(await referencedPath(client, 'orders/2026-06-15/5421-8594-00.json'));
    expect(result.totalOps).toBe(result.writtenPaths.length + 2);
    expect(client.store.has(first.manifestPath)).toBe(true);
    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(result.manifestPath);
  });

  it('writes pointer when the products manifest path changes', async () => {
    const client = new InMemoryBlobStorageClient();
    const firstPayload = makePayload();
    firstPayload.products = [makeProduct('111111', 'Apples')];
    const first = await syncDashboardLayout(firstPayload, client);

    const writePointerSpy = vi.spyOn(client, 'writePointer');
    const secondPayload = makePayload();
    secondPayload.products = [makeProduct('111111', 'Apples'), makeProduct('222222', 'Pears')];

    const second = await syncDashboardLayout(secondPayload, client);
    expect(writePointerSpy).toHaveBeenCalledTimes(1);
    expect(second.suppressedNoopWrites).toBe(false);
    expect(second.productsManifestPath).not.toBe(first.productsManifestPath);
    expect(second.writtenPaths).toContain((await client.readManifest(second.productsManifestPath!))['222222']);
    expect(second.writtenPaths.some((path) => path.startsWith('meta/products-manifest-'))).toBe(true);
  });

  // ── Spec 019: Phase 2 schema extensions + Phase 3 invalidation trigger ──────────
  it('Spec 019 / FR-02 — every coverage entry carries stale=false and staleReason=null by default', async () => {
    const client = new InMemoryBlobStorageClient();
    await syncDashboardLayout(makePayload(), client);
    const blob = await client.readJsonBlob<{
      meals: Array<{ stale?: boolean; staleReason?: string | null }>;
    }>(await referencedPath(client, 'coverage/2026-06-15.json'));
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
    }>(await referencedPath(client, 'coverage/2026-06-15.json'));
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

    // Stale bytes are staged unreferenced; the already fresh committed bytes
    // are reused, never overwritten by a transient stale marker.
    expect(result.writtenPaths.filter((p) => logicalRecordPath(p) === 'coverage/2026-06-15.json')).toHaveLength(1);
    const staged = await client.readJsonBlob<{ meals: Array<{ stale: boolean; staleReason: string }> }>(result.writtenPaths[0]!);
    expect(staged!.meals[0]).toMatchObject({ stale: true, staleReason: 'order_updated' });

    // After invalidation, the coverage blob is fresh: stale=false, staleReason=null.
    const finalBlob = await client.readJsonBlob<{
      meals: Array<{ stale: boolean; staleReason: string | null }>;
    }>(await referencedPath(client, 'coverage/2026-06-15.json'));
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
    expect(result.writtenPaths.map(logicalRecordPath)).toContain('coverage/2026-06-15.json');
    expect(result.writtenPaths.map(logicalRecordPath)).not.toContain('coverage/2026-06-19.json');

    const untouched = await client.readJsonBlob<{
      meals: Array<{ stale: boolean; staleReason: string | null }>;
    }>(await referencedPath(client, 'coverage/2026-06-19.json'));
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
      // Staged stale content is immutable and not exposed to readers.
      expect(result.writtenPaths.filter((p) => logicalRecordPath(p) === 'coverage/2026-06-15.json')).toHaveLength(1);
      const staged = await local.readJsonBlob<{ meals: Array<{ stale: boolean; staleReason: string }> }>(result.writtenPaths[0]!);
      expect(staged!.meals[0]).toMatchObject({ stale: true, staleReason: reason });
      // After invalidation, the final blob is fresh: staleReason cleared.
      const final = await local.readJsonBlob<{
        meals: Array<{ stale: boolean; staleReason: string | null }>;
      }>(await referencedPath(local, 'coverage/2026-06-15.json'));
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
    expect(Object.keys(firstManifest).map(logicalRecordPath)).toContain('coverage/2026-06-15.json');

    const second = makePayload();
    second.summary = { ...second.summary, coverage_percentage: 60 };
    second.coverage = [];
    second.orders = [];
    const result = await syncDashboardLayout(second, client);
    const secondManifest = await client.readManifest(result.manifestPath);
    const secondSummaryPath = Object.keys(secondManifest).find((p) => p.startsWith('meta/summary-'));
    expect(secondSummaryPath).toBeDefined();
    expect(secondSummaryPath).not.toBe(firstSummaryPath);
    expect(Object.keys(secondManifest).map(logicalRecordPath)).not.toContain('coverage/2026-06-15.json');
    expect(Object.keys(secondManifest).map(logicalRecordPath)).not.toContain('orders/2026-06-15/5421-8594-00.json');
    expect(Object.keys(secondManifest).filter((p) => p.startsWith('meta/summary-'))).toHaveLength(1);
  });
});

describe('syncDashboardLayout — manifest write failure leaves previous valid (FR-007)', () => {
  it('when writeManifest throws, the previous manifest + pointer remain valid', async () => {
    const client = new InMemoryBlobStorageClient();
    const first = await syncDashboardLayout(makePayload(), client);
    const payload = makePayload();
    payload.summary = { ...payload.summary, coverage_percentage: 81 };

    const orig = client.writeManifest.bind(client);
    client.writeManifest = async () => {
      throw new Error('simulated manifest write failure');
    };

    await expect(syncDashboardLayout(payload, client)).rejects.toThrow(/simulated/);
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
    const payload = makePayload();
    payload.summary = { ...payload.summary, coverage_percentage: 81 };

    const orig = client.writePointer.bind(client);
    client.writePointer = async () => {
      throw new Error('simulated pointer write failure');
    };

    await expect(syncDashboardLayout(payload, client)).rejects.toThrow(/simulated/);
    client.writePointer = orig;

    const blobs = await client.listPaths('meta/manifest-');
    expect(blobs.length).toBeGreaterThan(0);
    expect(client.store.has(first.manifestPath)).toBe(true);
    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(first.manifestPath);
  });

  it('rebuilds the manifest when the pointer references a missing manifest blob', async () => {
    const client = new InMemoryBlobStorageClient();
    client.seed(
      'pointers/latest.json',
      JSON.stringify({ manifestPath: 'meta/manifest-missing.json', productsManifestPath: null })
    );

    const result = await syncDashboardLayout(makePayload(), client);
    expect(result.suppressedNoopWrites).toBe(false);
    expect(result.writtenPaths).toHaveLength(3);
    expect(result.totalOps).toBe(5);
    expect(await client.readPointer()).toEqual({
      manifestPath: result.manifestPath,
      productsManifestPath: null,
    });
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


describe('immutable full-layout products', () => {
  it('dry-run predicts the exact graph and unchanged products cause zero publication writes', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = { ...makePayload(), products: [makeProduct('111111', 'Apples')] };
    const preview = await syncDashboardLayout(payload, client, { dryRun: true });
    expect(client.store.size).toBe(0);
    const actual = await syncDashboardLayout(payload, client);
    expect(preview.manifestPath).toBe(actual.manifestPath);
    expect(preview.writtenPaths).toEqual(actual.writtenPaths);
    expect(preview.totalOps).toBe(actual.totalOps);
    const writes = vi.spyOn(client, 'writeBlobIfChanged');
    const pointer = vi.spyOn(client, 'writePointer');
    const manifest = vi.spyOn(client, 'writeManifest');
    const replay = await syncDashboardLayout(payload, client);
    expect(replay.totalOps).toBe(0); expect(replay.writtenPaths).toEqual([]);
    expect(pointer).not.toHaveBeenCalled(); expect(manifest).not.toHaveBeenCalled();
    for (const result of writes.mock.results) expect((await result.value).written).toBe(false);
  });
  it('never normalizes a logical order identifier ending in a hash-like token', async () => {
    const client = new InMemoryBlobStorageClient();
    const payload = makePayload(); const id = `order-${'a'.repeat(64)}`;
    const logical = `orders/2026-06-15/${id}.json`;
    payload.orders[0]!.orderNumber = id; payload.orders[0]!.orderBlobPath = logical;
    payload.coverage[0]!.sourceOrderBlobPath = logical;
    const result = await syncDashboardLayout(payload, client);
    const manifest = await client.readManifest(result.manifestPath);
    const path = Object.keys(manifest).find(p => p.startsWith('orders/'))!;
    expect(path).toBe(`orders/2026-06-15/${id}-${client.computeHash(client.store.get(path)!.content)}.json`);
    expect(logicalRecordPath(path)).toBe(logical);
    expect(await client.readJsonBlob(path)).toMatchObject({ orderNumber: id, orderBlobPath: logical });
    for (const reference of [logical, path]) {
      const invalidated = await invalidateCoverageForOrder(reference, 'order_updated', client);
      expect(invalidated.writtenPaths.some(p => p.startsWith('coverage/'))).toBe(true);
    }
  });
});

describe('syncDashboardProducts — product-only publication', () => {
  it('writes only product blobs and preserves the existing main manifest pointer', async () => {
    const client = new InMemoryBlobStorageClient();
    const mainPayload = makePayload();
    const initial = await syncDashboardLayout(mainPayload, client);

    const currentProductsManifestPath =
      'meta/products-manifest-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json';
    const currentProductsManifest = JSON.stringify({ '111111': 'products/111111.json' }, null, 2);
    client.store.set(currentProductsManifestPath, {
      content: currentProductsManifest,
      hash: client.computeHash(currentProductsManifest),
    });
    const currentProduct = JSON.stringify(makeProduct('111111', 'Apples'), null, 2);
    client.store.set('products/111111.json', {
      content: currentProduct,
      hash: client.computeHash(currentProduct),
    });
    await client.writePointer(initial.manifestPath, currentProductsManifestPath);

    const result = await syncDashboardProducts(
      { products: [makeProduct('111111', 'Apples'), makeProduct('222222', 'Pears')] },
      client
    );

    expect(result.writtenPaths).toContain((await client.readManifest(result.productsManifestPath!))['222222']);
    expect(result.writtenPaths.some((path) => path.startsWith('orders/'))).toBe(false);
    expect(result.writtenPaths.some((path) => path.startsWith('coverage/'))).toBe(false);
    expect(result.writtenPaths.some((path) => path.startsWith('meta/summary-'))).toBe(false);
    expect(result.productsManifestPath).toMatch(/^meta\/products-manifest-[0-9a-f]{64}\.json$/);

    const pointer = await client.readPointer();
    expect(pointer?.manifestPath).toBe(initial.manifestPath);
    expect(pointer?.productsManifestPath).toBe(result.productsManifestPath);
    expect(client.store.has(initial.manifestPath)).toBe(true);
    expect(client.store.has(await referencedPath(client, 'orders/2026-06-15/5421-8594-00.json'))).toBe(true);
    expect(client.store.has(await referencedPath(client, 'coverage/2026-06-15.json'))).toBe(true);
  });

  it('refuses an explicit mainManifestPath that disagrees with the current pointer', async () => {
    const client = new InMemoryBlobStorageClient();
    const stale = await syncDashboardLayout(makePayload(), client);

    const freshPayload = makePayload();
    freshPayload.coverage = [
      ...freshPayload.coverage,
      {
        date: '2026-07-01',
        sourceOrderBlobPath: null,
        meals: [
          {
            meal: makeMeal('m-future', '2026-07-01', 'Future pasta'),
            status: 'covered',
            coverageScore: 100,
            matchedItems: [],
            missingItems: [],
          },
        ],
        coverageBlobPath: 'coverage/2026-07-01.json',
      },
    ];
    const fresh = await syncDashboardLayout(freshPayload, client);

    // Recreate the production failure mode: product publication observes an
    // older pointer even though the full sync just returned a fresh manifest.
    await client.writePointer(stale.manifestPath, null);

    const before = new Map(client.store);
    await expect(syncDashboardProducts(
      {
        products: [makeProduct('222222', 'Pears')],
        mainManifestPath: fresh.manifestPath,
      },
      client
    )).rejects.toThrow('Product publication main snapshot superseded');
    expect(client.store).toEqual(before);
    expect((await client.readPointer())!.manifestPath).toBe(stale.manifestPath);
  });

  it('fails when the existing pointer is missing', async () => {
    const client = new InMemoryBlobStorageClient();

    await expect(
      syncDashboardProducts({ products: [makeProduct('111111', 'Apples')] }, client)
    ).rejects.toThrow(/no manifest pointer/i);
  });
});
