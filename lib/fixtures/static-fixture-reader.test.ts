import { describe, expect, it } from 'vitest';
import {
  StaticFixtureReader,
  FIXTURE_MANIFEST_PATH,
  FIXTURE_SUMMARY_PATH,
  FIXTURE_PRODUCTS_MANIFEST_PATH,
  FIXTURE_PAYLOAD,
} from './static-fixture-reader';

describe('StaticFixtureReader', () => {
  // The fixture JSON is generated at build time by
  // `lib/fixtures/scripts/generate-fixture.mjs` (a `prebuild` hook in
  // `package.json`). The seed is committed. This test depends on
  // `lib/fixtures/dashboard-fixture.json` existing on disk; if it
  // doesn't, the import at the top of `static-fixture-reader.ts` throws
  // and vitest reports a load failure. The prebuild hook is the canonical
  // way to ensure it exists; the test runner does NOT trigger prebuild
  // automatically, so run `npm run prebuild` (or `npx next build`) once
  // before `vitest run` if the file is missing.
  const reader = new StaticFixtureReader();

  describe('readPointer', () => {
    it('returns a synthetic pointer pointing at the bundled manifest', async () => {
      const pointer = await reader.readPointer();
      expect(pointer).not.toBeNull();
      expect(pointer?.manifestPath).toBe(FIXTURE_MANIFEST_PATH);
      // productsManifestPath is null when there are no products; string when there are
      expect(pointer?.productsManifestPath).toBe(FIXTURE_PRODUCTS_MANIFEST_PATH);
    });

    it('returns the SAME manifestPath on every call (caching)', async () => {
      const a = await reader.readPointer();
      const b = await reader.readPointer();
      expect(a?.manifestPath).toBe(b?.manifestPath);
    });
  });

  describe('readManifest', () => {
    it('returns the synthetic manifest regardless of the path argument', async () => {
      const manifest = await reader.readManifest(FIXTURE_MANIFEST_PATH);
      expect(typeof manifest).toBe('object');
      // Every known blob path in the fixture should be present
      expect(Object.keys(manifest).length).toBeGreaterThan(0);
      for (const order of FIXTURE_PAYLOAD.orders ?? []) {
        expect(manifest[order.orderBlobPath]).toBeDefined();
      }
    });

    it('returns the SAME manifest even when called with a bogus path', async () => {
      // The fixture has only one manifest; the path argument is ignored.
      const m = await reader.readManifest('meta/nonexistent.json');
      expect(typeof m).toBe('object');
      expect(Object.keys(m).length).toBeGreaterThan(0);
    });
  });

  describe('readJsonBlob', () => {
    it('returns the pointer JSON when path is pointers/latest.json', async () => {
      const blob = await reader.readJsonBlob<{ manifestPath: string }>(
        'pointers/latest.json'
      );
      expect(blob).not.toBeNull();
      expect(blob?.manifestPath).toBe(FIXTURE_MANIFEST_PATH);
    });

    it('returns the manifest JSON when path is FIXTURE_MANIFEST_PATH', async () => {
      const blob = await reader.readJsonBlob<Record<string, string>>(
        FIXTURE_MANIFEST_PATH
      );
      expect(blob).toEqual(await reader.readManifest(FIXTURE_MANIFEST_PATH));
    });

    it('returns the summary JSON when path is FIXTURE_SUMMARY_PATH', async () => {
      const blob = await reader.readJsonBlob(FIXTURE_SUMMARY_PATH);
      expect(blob).not.toBeNull();
      expect(typeof blob).toBe('object');
    });

    it('returns the products-manifest JSON when path is FIXTURE_PRODUCTS_MANIFEST_PATH', async () => {
      if (FIXTURE_PRODUCTS_MANIFEST_PATH === null) {
        // No products in the fixture; skip the assertion
        return;
      }
      const blob = await reader.readJsonBlob<Record<string, string>>(
        FIXTURE_PRODUCTS_MANIFEST_PATH
      );
      expect(blob).not.toBeNull();
      expect(typeof blob).toBe('object');
    });

    it('returns an order blob when path matches an orderBlobPath', async () => {
      const firstOrder = FIXTURE_PAYLOAD.orders?.[0];
      expect(firstOrder).toBeDefined();
      const blob = await reader.readJsonBlob(firstOrder!.orderBlobPath);
      expect(blob).not.toBeNull();
    });

    it('returns a coverage blob when path matches a coverageBlobPath', async () => {
      const firstCov = FIXTURE_PAYLOAD.coverage?.[0];
      expect(firstCov).toBeDefined();
      const blob = await reader.readJsonBlob(firstCov!.coverageBlobPath);
      expect(blob).not.toBeNull();
    });

    it('returns a product blob when path matches a productBlobPath', async () => {
      const firstProduct = FIXTURE_PAYLOAD.products?.[0];
      if (!firstProduct) {
        // No products in the fixture; skip
        return;
      }
      const blob = await reader.readJsonBlob(firstProduct.productBlobPath);
      expect(blob).not.toBeNull();
    });

    it('returns null for an unknown path (FR-012)', async () => {
      const blob = await reader.readJsonBlob('meta/totally-unknown.json');
      expect(blob).toBeNull();
    });

    it('returns null for a path that LOOKS like a blob but does not exist', async () => {
      const blob = await reader.readJsonBlob('orders/2099-01-01/99.json');
      expect(blob).toBeNull();
    });
  });

  describe('listPaths', () => {
    it('returns every indexed path when called with the empty prefix', async () => {
      const paths = await reader.listPaths('');
      expect(paths).toContain('pointers/latest.json');
      expect(paths).toContain(FIXTURE_MANIFEST_PATH);
      expect(paths).toContain(FIXTURE_SUMMARY_PATH);
      for (const order of FIXTURE_PAYLOAD.orders ?? []) {
        expect(paths).toContain(order.orderBlobPath);
      }
      for (const cov of FIXTURE_PAYLOAD.coverage ?? []) {
        expect(paths).toContain(cov.coverageBlobPath);
      }
    });

    it('returns only coverage paths for the "coverage/" prefix', async () => {
      const paths = await reader.listPaths('coverage/');
      for (const p of paths) {
        expect(p.startsWith('coverage/')).toBe(true);
      }
      expect(paths.length).toBe((FIXTURE_PAYLOAD.coverage ?? []).length);
    });

    it('returns only order paths for the "orders/" prefix', async () => {
      const paths = await reader.listPaths('orders/');
      for (const p of paths) {
        expect(p.startsWith('orders/')).toBe(true);
      }
      expect(paths.length).toBe((FIXTURE_PAYLOAD.orders ?? []).length);
    });

    it('returns only pointer/manifest/summary paths for the "meta/" prefix', async () => {
      const paths = await reader.listPaths('meta/');
      for (const p of paths) {
        expect(p.startsWith('meta/')).toBe(true);
      }
      // At least the manifest and summary paths must be present
      expect(paths).toContain(FIXTURE_MANIFEST_PATH);
      expect(paths).toContain(FIXTURE_SUMMARY_PATH);
    });

    it('returns an empty array for a prefix that matches nothing', async () => {
      const paths = await reader.listPaths('nothing-here/');
      expect(paths).toEqual([]);
    });
  });

  describe('module init', () => {
    it('exposes the validated SplitLayoutPayload as FIXTURE_PAYLOAD', () => {
      expect(FIXTURE_PAYLOAD).toBeDefined();
      expect(Array.isArray(FIXTURE_PAYLOAD.orders)).toBe(true);
      expect(Array.isArray(FIXTURE_PAYLOAD.coverage)).toBe(true);
      expect(typeof FIXTURE_PAYLOAD.summary).toBe('object');
      expect(Array.isArray(FIXTURE_PAYLOAD.coverageWindow)).toBe(true);
      expect(typeof FIXTURE_PAYLOAD.dataGeneratedAt).toBe('string');
      expect(typeof FIXTURE_PAYLOAD.uiUpdatedAt).toBe('string');
    });

    it('FIXTURE_PAYLOAD includes the gap day (FR-009: 7 meals across 8 days)', () => {
      // The fixture is configured to have 7 meals across 8 days with
      // 1 explicit gap day. The dataGeneratedAt sentinel is
      // '2026-01-01T00:00:00Z' (obvious-fake, per FR-008).
      expect(FIXTURE_PAYLOAD.dataGeneratedAt).toBe('2026-01-01T00:00:00Z');
      expect(FIXTURE_PAYLOAD.coverageWindow.length).toBe(8);
      // The total number of meals in the coverage window is 7 (one day has no meals)
      const totalMeals = (FIXTURE_PAYLOAD.coverage ?? []).reduce(
        (acc, c) => acc + ((c as { meals?: unknown[] }).meals?.length ?? 0),
        0
      );
      expect(totalMeals).toBe(7);
    });
  });
});
