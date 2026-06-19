'use client';

import { DebugDataPanel } from './debug-data-panel';

type BlobReadFreshnessPayload = {
  pointerPath: string;
  pointerRead: string;
  manifestPath: string | null;
  manifestRead: string;
  summaryPath: string | null;
  summaryRead: string;
  productsManifestPath: string | null;
  productsManifestRead: string;
  coverageWindow: string[];
  coverageReads: Array<{ path: string; status: string }>;
  orderReads: Array<{ path: string; status: string }>;
  productReads: Array<{ path: string; status: string; lastFetched?: string }>;
  summaryFreshness: { dataGeneratedAt: string; dataGeneratedAgeSeconds: number | null; uiUpdatedAt: string; uiUpdatedAgeSeconds: number | null };
  latestOrderFreshness: { deliveryDate: string | null; ageDays: number | null };
  fetchedAt: string;
};

export function BlobReadFreshnessDebugPanel() {
  return (
    <DebugDataPanel<BlobReadFreshnessPayload>
      title="Blob Read Freshness"
      description="Shows which blobs were read, which paths were selected, and the freshness timestamps/ages that the dashboard derived from the live payload."
      endpoint="/api/debug/blob-read-freshness"
      testId="blob-read-freshness-debug-panel"
      rows={(data) => [
        { label: 'pointerPath', value: data.pointerPath },
        { label: 'pointerRead', value: data.pointerRead },
        { label: 'manifestPath', value: data.manifestPath ?? 'unset' },
        { label: 'manifestRead', value: data.manifestRead },
        { label: 'summaryPath', value: data.summaryPath ?? 'unset' },
        { label: 'summaryRead', value: data.summaryRead },
        { label: 'productsManifestPath', value: data.productsManifestPath ?? 'unset' },
        { label: 'productsManifestRead', value: data.productsManifestRead },
        { label: 'coverageWindow', value: data.coverageWindow.join(', ') || 'empty' },
        { label: 'coverageReads', value: data.coverageReads.map((entry) => `${entry.path}:${entry.status}`).join(' | ') || 'empty' },
        { label: 'orderReads', value: data.orderReads.map((entry) => `${entry.path}:${entry.status}`).join(' | ') || 'empty' },
        { label: 'productReads', value: data.productReads.map((entry) => `${entry.path}:${entry.status}`).join(' | ') || 'empty' },
        { label: 'summaryFreshness', value: `${data.summaryFreshness.dataGeneratedAt} (${data.summaryFreshness.dataGeneratedAgeSeconds ?? 'n/a'}s) / ${data.summaryFreshness.uiUpdatedAt} (${data.summaryFreshness.uiUpdatedAgeSeconds ?? 'n/a'}s)` },
        { label: 'latestOrderFreshness', value: `${data.latestOrderFreshness.deliveryDate ?? 'unset'} (${data.latestOrderFreshness.ageDays ?? 'n/a'} days)` },
        { label: 'fetchedAt', value: data.fetchedAt },
      ]}
    />
  );
}
