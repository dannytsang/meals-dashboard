import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('selectDashboardDataReader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to EmptyDashboardReader when the bundled fixture import fails', async () => {
    vi.doMock('../runtime-mode', () => ({
      isBlobStorageConfigured: () => false,
    }));
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        existsSync: vi.fn(() => true),
      };
    });
    vi.doMock('./static-fixture-reader', () => {
      throw new Error('StaticFixtureReader: fixture JSON is not an object');
    });

    const { selectDashboardDataReader } = await import('./select-dashboard-data-reader');
    const reader = await selectDashboardDataReader();

    await expect(reader.readPointer()).resolves.toBeNull();
    await expect(reader.readJsonBlob('pointers/latest.json')).resolves.toBeNull();
    await expect(reader.listPaths('')).resolves.toEqual([]);
  });
});