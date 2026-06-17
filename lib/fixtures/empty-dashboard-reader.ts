import 'server-only';
import type { DashboardDataReader } from '../dashboard-data';
import type { Manifest, PointerContents } from '../blob-storage';

/**
 * lib/fixtures/empty-dashboard-reader.ts
 *
 * Spec 024 / US-4 / FR-004 / FR-013 — graceful empty state reader.
 *
 * When neither the live blob store nor the bundled fixture can be
 * loaded (e.g. the fixture build failed and the JSON is missing), the
 * dashboard falls back to this reader. Every method returns the same
 * null/empty shape that spec 017's "missing-blob fallback" returns
 * (FR-03 / SC-03), so the page renders HTTP 200 with empty UI
 * surfaces instead of crashing with a 500.
 *
 * This class is the symmetric counterpart to `StaticFixtureReader`:
 * both implement `DashboardDataReader` but this one always returns
 * null/empty, while `StaticFixtureReader` returns bundled JSON.
 */
export class EmptyDashboardReader implements DashboardDataReader {
  async readPointer(): Promise<PointerContents | null> {
    return null;
  }

  async readManifest(_path: string): Promise<Manifest> {
    // _path is unused — no manifest exists in empty mode.
    void _path;
    return {};
  }

  async readJsonBlob<T = unknown>(_path: string): Promise<T | null> {
    // _path is unused — no blobs exist in empty mode.
    void _path;
    return null;
  }

  async listPaths(_prefix: string): Promise<string[]> {
    void _prefix;
    return [];
  }
}