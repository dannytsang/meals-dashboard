import 'server-only';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DashboardDataReader } from '../dashboard-data';
import { isBlobStorageConfigured } from '../runtime-mode';
import { EmptyDashboardReader } from './empty-dashboard-reader';
import { VercelBlobStorageClient } from '../blob-storage';

const fixturePath = join(process.cwd(), 'lib', 'fixtures', 'dashboard-fixture.json');

/**
 * Choose the dashboard reader for the current request.
 *
 * Live mode wins when Blob credentials are configured. Otherwise we try the
 * bundled fixture, and if that fixture import fails we fall back to the empty
 * reader so the dashboard can render a clear "No data configured" state.
 */
export async function selectDashboardDataReader(): Promise<DashboardDataReader> {
  if (isBlobStorageConfigured()) {
    return new VercelBlobStorageClient();
  }

  if (!existsSync(fixturePath)) {
    return new EmptyDashboardReader();
  }

  try {
    const { StaticFixtureReader } = await import('./static-fixture-reader');
    return new StaticFixtureReader();
  } catch (error) {
    console.warn('[dashboard] bundled fixture unavailable; falling back to empty state:', error);
    return new EmptyDashboardReader();
  }
}