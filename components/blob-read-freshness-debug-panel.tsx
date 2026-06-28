'use client';

import { DebugDataPanel } from './debug-data-panel';

type BlobReadFreshnessPayload = {
  runtimeMode: string;
  blobCredentialsState: string;
  pointerPath: string;
  pointerRead: string;
  manifestPath: string | null;
  manifestRead: string;
  summaryPath: string | null;
  summaryRead: string;
  productsManifestPath: string | null;
  productsManifestRead: string;
  selectedOrderBlobPath: string | null;
  selectedCoverageBlobPaths: string[];
  selectedProductBlobPath: string | null;
  loadError: unknown;
  coverageWindow: string[];
  coverageReads: Array<{ path: string; status: string }>;
  orderReads: Array<{ path: string; status: string }>;
  productReads: Array<{ path: string; status: string; lastFetched?: string }>;
  /** Spec 031 Rev 4 / FR-014: top-level dataGeneratedAt for immediate visibility. */
  dataGeneratedAt: string;
  /** Spec 031 Rev 4 / FR-014: dates in the coverage window that have a blob. */
  manifestDateCoverage: string[];
  /** Spec 031 Rev 4 / FR-014: dates in the coverage window that do NOT have a blob. */
  manifestDateCoverageMiss: string[];
  summaryFreshness: { dataGeneratedAt: string; dataGeneratedAgeSeconds: number | null; uiUpdatedAt: string; uiUpdatedAgeSeconds: number | null };
  latestOrderFreshness: { deliveryDate: string | null; ageDays: number | null };
  fetchedAt: string;
};

/** Returns a human-readable age string like "2h ago" or "3d ago". */
function ageLabel(seconds: number | null): string {
  if (seconds === null) return 'n/a';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/** Returns true if dataGeneratedAt is more than 25 hours old. */
function isDataStale(dataGeneratedAt: string): boolean {
  if (!dataGeneratedAt) return false;
  const generated = new Date(dataGeneratedAt).getTime();
  if (isNaN(generated)) return false;
  return Date.now() - generated > 25 * 60 * 60 * 1000;
}

export function BlobReadFreshnessDebugPanel() {
  return (
    <DebugDataPanel<BlobReadFreshnessPayload>
      title="Blob Read Freshness"
      description="Shows which blobs were read, which paths were selected, and the freshness timestamps/ages that the dashboard derived from the live payload."
      endpoint="/api/debug/blob-read-freshness"
      testId="blob-read-freshness-debug-panel"
      rows={(data) => {
        const stale = isDataStale(data.dataGeneratedAt);
        const coverageOk = data.manifestDateCoverage.length;
        const coverageMiss = data.manifestDateCoverageMiss.length;
        const allCovered = coverageMiss === 0 && coverageOk > 0;

        return [
          // ── FR-014 prominent summary ──────────────────────────────────
          {
            label: 'dataGeneratedAt',
            value: (
              <span style={{
                color: stale ? '#ef4444' : '#22c55e',
                fontWeight: 700,
                fontSize: '0.95rem',
              }}>
                {data.dataGeneratedAt
                  ? `${new Date(data.dataGeneratedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })} (${ageLabel(data.summaryFreshness.dataGeneratedAgeSeconds)})`
                  : 'not set'}
                {stale && ' ← STALE'}
              </span>
            ),
          },
          {
            label: 'manifestDateCoverage',
            value: (
              <span style={{ color: allCovered ? '#22c55e' : coverageOk > 0 ? '#eab308' : '#6b7280', fontWeight: 600 }}>
                {data.manifestDateCoverage.length > 0
                  ? data.manifestDateCoverage.join(', ')
                  : 'none'}
                {coverageMiss > 0 && (
                  <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>
                    ({coverageOk}/{data.coverageWindow.length} window dates)
                  </span>
                )}
              </span>
            ),
          },
          {
            label: 'manifestDateCoverageMiss',
            value: (
              <span style={{ color: coverageMiss > 0 ? '#ef4444' : '#22c55e', fontWeight: coverageMiss > 0 ? 700 : 400 }}>
                {data.manifestDateCoverageMiss.length > 0
                  ? data.manifestDateCoverageMiss.join(', ')
                  : 'none'}
              </span>
            ),
          },
          // ── Standard rows ───────────────────────────────────────────
          { label: 'runtimeMode', value: data.runtimeMode },
          { label: 'blobCredentialsState', value: data.blobCredentialsState },
          { label: 'pointerPath', value: data.pointerPath },
          { label: 'pointerRead', value: data.pointerRead },
          { label: 'manifestPath', value: data.manifestPath ?? 'unset' },
          { label: 'manifestRead', value: data.manifestRead },
          { label: 'summaryPath', value: data.summaryPath ?? 'unset' },
          { label: 'summaryRead', value: data.summaryRead },
          { label: 'productsManifestPath', value: data.productsManifestPath ?? 'unset' },
          { label: 'productsManifestRead', value: data.productsManifestRead },
          { label: 'selectedOrderBlobPath', value: data.selectedOrderBlobPath ?? 'unset' },
          { label: 'selectedCoverageBlobPaths', value: data.selectedCoverageBlobPaths.join(', ') || 'empty' },
          { label: 'selectedProductBlobPath', value: data.selectedProductBlobPath ?? 'unset' },
          { label: 'loadError', value: data.loadError ? JSON.stringify(data.loadError) : 'null' },
          { label: 'coverageWindow', value: data.coverageWindow.join(', ') || 'empty' },
          { label: 'coverageReads', value: data.coverageReads.map((entry) => `${entry.path}:${entry.status}`).join(' | ') || 'empty' },
          { label: 'orderReads', value: data.orderReads.map((entry) => `${entry.path}:${entry.status}`).join(' | ') || 'empty' },
          { label: 'productReads', value: data.productReads.map((entry) => `${entry.path}:${entry.status}`).join(' | ') || 'empty' },
          {
            label: 'summaryFreshness (legacy)',
            value: `${data.summaryFreshness.dataGeneratedAt} (${data.summaryFreshness.dataGeneratedAgeSeconds ?? 'n/a'}s) / ${data.summaryFreshness.uiUpdatedAt} (${data.summaryFreshness.uiUpdatedAgeSeconds ?? 'n/a'}s)`,
          },
          { label: 'latestOrderFreshness', value: `${data.latestOrderFreshness.deliveryDate ?? 'unset'} (${data.latestOrderFreshness.ageDays ?? 'n/a'} days)` },
          { label: 'fetchedAt', value: data.fetchedAt },
        ];
      }}
    />
  );
}
