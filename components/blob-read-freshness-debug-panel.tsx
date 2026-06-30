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
  dataGeneratedAt: string;
  manifestDateCoverage: string[];
  manifestDateCoverageMiss: string[];
  summaryFreshness: { dataGeneratedAt: string; dataGeneratedAgeSeconds: number | null; uiUpdatedAt: string; uiUpdatedAgeSeconds: number | null };
  latestOrderFreshness: { deliveryDate: string | null; ageDays: number | null };
  fetchedAt: string;
};

/** Returns "2d ago" style labels. */
function ageLabel(seconds: number | null): string {
  if (seconds === null) return 'n/a';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function isDataStale(dataGeneratedAt: string): boolean {
  if (!dataGeneratedAt) return false;
  const generated = new Date(dataGeneratedAt).getTime();
  if (isNaN(generated)) return false;
  return Date.now() - generated > 25 * 60 * 60 * 1000;
}

/** FR-015: prominent diagnosis banner — shown above the table, never buried in rows. */
function DiagnosisBanner({ data }: { data: BlobReadFreshnessPayload }) {
  const loaded = data.selectedCoverageBlobPaths.length;
  const windowDates = data.coverageWindow.length;
  const missing = data.manifestDateCoverageMiss;
  const loadError = data.loadError;

  let label: string;
  let color: string;
  let bg: string;
  let message: React.ReactNode;

  if (loadError) {
    label = 'LOAD ERROR';
    color = '#ef4444';
    bg = 'rgba(239,68,68,0.12)';
    message = (
      <span>
        The dashboard failed to load data. Check the <strong>loadError</strong> row below for the
        error detail, and the infrastructure rows (pointer, manifest, credentials) for the root cause.
      </span>
    );
  } else if (loaded === 0) {
    label = 'NO COVERAGE';
    color = '#ef4444';
    bg = 'rgba(239,68,68,0.12)';
    message = (
      <span>
        <strong>0</strong> of <strong>{windowDates}</strong> coverage blob(s) were loaded. The
        calendar will show <strong>no meal days at all</strong>. The missing dates are listed in{' '}
        <strong>manifestDateCoverageMiss</strong> below.
      </span>
    );
  } else if (missing.length > 0) {
    label = 'PARTIAL COVERAGE';
    color = '#eab308';
    bg = 'rgba(234,179,8,0.12)';
    message = (
      <span>
        <strong>{missing.length}</strong> of <strong>{windowDates}</strong> window date(s) are missing
        coverage blobs: <strong>{missing.join(', ')}</strong>. Only those dates will be absent from
        the calendar; the rest of the days are loaded correctly.
      </span>
    );
  } else if (loaded < windowDates) {
    label = 'PARTIAL COVERAGE';
    color = '#eab308';
    bg = 'rgba(234,179,8,0.12)';
    message = (
      <span>
        Only <strong>{loaded}</strong> of <strong>{windowDates}</strong> coverage blob(s) loaded.
        Some calendar days will be missing. Check <strong>selectedCoverageBlobPaths</strong> and{' '}
        <strong>manifestDateCoverageMiss</strong> below.
      </span>
    );
  } else {
    label = 'FULL COVERAGE';
    color = '#22c55e';
    bg = 'rgba(34,197,94,0.10)';
    message = (
      <span>
        All <strong>{loaded}</strong> coverage blob(s) loaded for the {windowDates}-day window.
        The calendar should be complete.
      </span>
    );
  }

  return (
    <div
      data-testid="blob-read-freshness-diagnosis-banner"
      style={{
        background: bg,
        border: `1px solid ${color}`,
        borderRadius: '6px',
        padding: '0.6rem 0.75rem',
        marginBottom: '0.75rem',
        fontSize: '0.78rem',
        fontFamily: 'monospace',
        lineHeight: '1.5',
      }}
    >
      <strong style={{ color, marginRight: '0.5rem' }}>{label}</strong>
      {message}
    </div>
  );
}

export function BlobReadFreshnessDebugPanel() {
  return (
    <DebugDataPanel<BlobReadFreshnessPayload>
      title="Blob Read Freshness"
      description="Diagnoses why the dashboard shows only some days. The coloured banner above gives the answer in plain English; the rows below show the raw data."
      endpoint="/api/debug/blob-read-freshness"
      testId="blob-read-freshness-debug-panel"
      preTable={(data) => <DiagnosisBanner data={data} />}
      rows={(data) => {
        const stale = isDataStale(data.dataGeneratedAt);
        const coverageOk = data.manifestDateCoverage.length;
        const coverageMiss = data.manifestDateCoverageMiss.length;
        const allCovered = coverageMiss === 0 && coverageOk > 0;

        return [
          // ── FR-014: dataGeneratedAt — most important freshness signal ─
          {
            label: 'dataGeneratedAt',
            value: (
              <span style={{
                color: stale ? '#ef4444' : '#22c55e',
                fontWeight: 700,
              }}>
                {data.dataGeneratedAt
                  ? `${new Date(data.dataGeneratedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })} (${ageLabel(data.summaryFreshness.dataGeneratedAgeSeconds)})`
                  : 'not set'}
                {stale && ' ← STALE'}
              </span>
            ),
          },

          // ── What was loaded vs what was expected ──────────────────────
          {
            label: 'coverage blobs loaded',
            value: (
              <span style={{ fontWeight: 700, color: data.selectedCoverageBlobPaths.length === 0 ? '#ef4444' : data.selectedCoverageBlobPaths.length < data.coverageWindow.length ? '#eab308' : '#22c55e' }}>
                {data.selectedCoverageBlobPaths.length === 0
                  ? 'NONE'
                  : `${data.selectedCoverageBlobPaths.length} of ${data.coverageWindow.length} window dates`}
              </span>
            ),
          },
          {
            label: 'selectedCoverageBlobPaths',
            value: data.selectedCoverageBlobPaths.length > 0
              ? data.selectedCoverageBlobPaths.join(', ')
              : <span style={{ color: '#ef4444' }}>none — calendar will be empty</span>,
          },
          {
            label: 'manifestDateCoverage (dates with blobs)',
            value: (
              <span style={{ color: allCovered ? '#22c55e' : coverageOk > 0 ? '#eab308' : '#6b7280', fontWeight: 600 }}>
                {data.manifestDateCoverage.length > 0 ? data.manifestDateCoverage.join(', ') : 'none'}
              </span>
            ),
          },
          {
            label: 'manifestDateCoverageMiss (dates missing blobs)',
            value: (
              <span style={{ color: coverageMiss > 0 ? '#ef4444' : '#22c55e', fontWeight: coverageMiss > 0 ? 700 : 400 }}>
                {coverageMiss > 0 ? data.manifestDateCoverageMiss.join(', ') : 'none'}
              </span>
            ),
          },
          { label: 'coverageWindow', value: data.coverageWindow.join(', ') || 'empty' },

          // ── Individual read status ────────────────────────────────────
          {
            label: 'coverageReads',
            value: data.coverageReads.length > 0
              ? data.coverageReads.map((r) => (
                  <span key={r.path} style={{ color: r.status === 'ok' ? '#22c55e' : '#ef4444', marginRight: '0.5rem' }}>
                    {r.path}:{r.status}
                  </span>
                ))
              : 'none',
          },
          { label: 'orderReads', value: data.orderReads.map((r) => `${r.path}:${r.status}`).join(' | ') || 'none' },

          // ── Infrastructure ────────────────────────────────────────────
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
          { label: 'selectedProductBlobPath', value: data.selectedProductBlobPath ?? 'unset' },
          { label: 'loadError', value: data.loadError ? JSON.stringify(data.loadError) : 'null' },
          {
            label: 'summaryFreshness',
            value: `${data.summaryFreshness.dataGeneratedAt} (${ageLabel(data.summaryFreshness.dataGeneratedAgeSeconds)}) / ${data.summaryFreshness.uiUpdatedAt} (${ageLabel(data.summaryFreshness.uiUpdatedAgeSeconds)})`,
          },
          { label: 'latestOrderFreshness', value: `${data.latestOrderFreshness.deliveryDate ?? 'unset'} (${data.latestOrderFreshness.ageDays ?? 'n/a'} days)` },
          { label: 'fetchedAt', value: data.fetchedAt },
        ];
      }}
    />
  );
}
