import { describe, expect, it } from 'vitest';
import { EmptyDashboardReader } from './empty-dashboard-reader';

describe('EmptyDashboardReader', () => {
  const reader = new EmptyDashboardReader();

  describe('shape', () => {
    it('implements the DashboardDataReader interface methods', () => {
      expect(typeof reader.readPointer).toBe('function');
      expect(typeof reader.readManifest).toBe('function');
      expect(typeof reader.readJsonBlob).toBe('function');
      expect(typeof reader.listPaths).toBe('function');
    });
  });

  describe('readPointer', () => {
    it('returns null', async () => {
      expect(await reader.readPointer()).toBeNull();
    });
  });

  describe('readManifest', () => {
    it('returns an empty object regardless of path', async () => {
      expect(await reader.readManifest('meta/manifest-abc.json')).toEqual({});
      expect(await reader.readManifest('any/path/manifest.json')).toEqual({});
      expect(await reader.readManifest('')).toEqual({});
    });

    it('returns a fresh empty object each call', async () => {
      const a = await reader.readManifest('p1.json');
      const b = await reader.readManifest('p2.json');
      expect(a).not.toBe(b);
    });
  });

  describe('readJsonBlob', () => {
    it('returns null for any path', async () => {
      expect(await reader.readJsonBlob('coverage/2026-06-15.json')).toBeNull();
      expect(await reader.readJsonBlob('orders/2026-06-15/1234.json')).toBeNull();
      expect(await reader.readJsonBlob('pointers/latest.json')).toBeNull();
      expect(await reader.readJsonBlob('')).toBeNull();
    });

    it('honours the generic type parameter', async () => {
      type Foo = { foo: string };
      const result = await reader.readJsonBlob<Foo>('foo.json');
      // Typed check: result should be Foo | null, here it's null.
      expect(result).toBeNull();
    });
  });

  describe('listPaths', () => {
    it('returns an empty array for any prefix', async () => {
      expect(await reader.listPaths('coverage/')).toEqual([]);
      expect(await reader.listPaths('orders/')).toEqual([]);
      expect(await reader.listPaths('pointers/')).toEqual([]);
      expect(await reader.listPaths('')).toEqual([]);
    });
  });

  describe('integration with dashboard-data getDashboardData', () => {
    // Spec 017 / FR-03 / SC-03 — the empty reader must compose to the
    // same empty DashboardData shape as the "no pointer" fallback.
    it('composes to the same empty DashboardData shape as no-pointer fallback', async () => {
      // Import here (not at top) so the empty reader itself stays
      // dependency-free for its own unit tests.
      const { getDashboardData } = await import('../dashboard-data');
      const data = await getDashboardData({
        coverageWindow: ['2026-06-15'],
        reader,
      });
      expect(data).toEqual({
        coverage: [],
        deliveryWindows: [],
        latestOrder: null,
        validOrders: [],
        mealsCheckSummary: null,
        dataGeneratedAt: '',
        uiUpdatedAt: '',
        loadError: null,
        products: {},
      });
    });
  });
});