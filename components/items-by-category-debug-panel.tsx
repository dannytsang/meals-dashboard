/**
 * components/items-by-category-debug-panel.tsx
 *
 * Spec 022 / FR-005, FR-008: client component for the items-by-category
 * debug panel. Fetches /api/debug/items-by-category on mount and after
 * a refresh, renders each diagnostic variable as a labelled chip with
 * its type and value, and includes a "Copy as JSON" affordance.
 *
 * Imported by components/debug-shell.tsx (panel list) and
 * components/dashboard-debug-chips.tsx (the inline chip on the main
 * dashboard when the per-user debug cookie is set).
 */
'use client';

import { useEffect, useState, useCallback } from 'react';

interface ItemsByCategoryDiagnostic {
  latestOrder: unknown;
  latestOrderStatus: 'ok' | 'null_window_filtered' | 'null_no_order_blob' | 'null_pointer_missing';
  latestOrderBlobPath: string | null;
  candidateLatestOrderPath: string | null;
  candidateLatestOrderDate: string | null;
  receiptItemsLength: number;
  unmatchedItemsLength: number;
  displayItemsLength: number;
  chosenFilterState: 'all' | 'matched' | 'unmatched';
  chosenFilterReason: 'server_default';
  showCount: number;
  filter: 'all' | 'matched' | 'unmatched';
  cats: string[];
  dataGen: string;
  coverageWindow: string[];
  pointerPath: string;
  manifestPath: string;
  fetchedAt: string;
}

const TYPE_OF = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === 'object') return 'object';
  return typeof v;
};

const FORMAT_VALUE = (v: unknown): string => {
  if (v === null) return 'NULL';
  if (v === undefined) return 'UNDEFINED';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every((x) => typeof x === 'string' || typeof x === 'number')) {
      return v.length > 6 ? `[${v.slice(0, 6).join(', ')}, +${v.length - 6} more]` : `[${v.join(', ')}]`;
    }
    return `[${v.length} items]`;
  }
  if (typeof v === 'object') return `{...}`;
  if (typeof v === 'string') return v === '' ? '""' : v;
  return String(v);
};

const STATUS_COLORS: Record<ItemsByCategoryDiagnostic['latestOrderStatus'], string> = {
  ok: 'var(--accent-emerald, #10b981)',
  null_window_filtered: 'var(--accent-amber, #f59e0b)',
  null_no_order_blob: 'var(--accent-red, #ef4444)',
  null_pointer_missing: 'var(--accent-red, #ef4444)',
};

interface ItemsByCategoryDebugPanelProps {
  /** Optional callback to receive the latest diagnostic for the parent shell. */
  onLoaded?: (diagnostic: ItemsByCategoryDiagnostic) => void;
}

export function ItemsByCategoryDebugPanel({ onLoaded }: ItemsByCategoryDebugPanelProps) {
  const [data, setData] = useState<ItemsByCategoryDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const fetchDiagnostic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/debug/items-by-category', { cache: 'no-store' });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setData(null);
        return;
      }
      const json = (await res.json()) as ItemsByCategoryDiagnostic;
      setData(json);
      onLoaded?.(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  useEffect(() => {
    fetchDiagnostic();
  }, [fetchDiagnostic, refreshNonce]);

  const copyJson = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [data]);

  if (error) {
    return (
      <div data-testid="items-by-category-debug-panel" data-state="error" style={{ color: 'var(--accent-red, #ef4444)', fontSize: '0.85rem' }}>
        Failed to load diagnostic: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="items-by-category-debug-panel" data-state="loading" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        {loading ? 'Loading…' : 'Awaiting fetch…'}
      </div>
    );
  }

  const rows: Array<{ label: string; value: unknown }> = [
    { label: 'latestOrder', value: data.latestOrder },
    { label: 'latestOrderStatus', value: data.latestOrderStatus },
    { label: 'latestOrderBlobPath', value: data.latestOrderBlobPath },
    { label: 'candidateLatestOrderPath', value: data.candidateLatestOrderPath ?? 'unset' },
    { label: 'candidateLatestOrderDate', value: data.candidateLatestOrderDate ?? 'unset' },
    { label: 'receiptItemsLength', value: data.receiptItemsLength },
    { label: 'unmatchedItemsLength', value: data.unmatchedItemsLength },
    { label: 'displayItemsLength', value: data.displayItemsLength },
    { label: 'chosenFilterState', value: data.chosenFilterState },
    { label: 'chosenFilterReason', value: data.chosenFilterReason },
    { label: 'showCount', value: data.showCount },
    { label: 'filter', value: data.filter },
    { label: 'cats', value: data.cats.length === 0 ? 'NONE' : data.cats },
    { label: 'dataGen', value: data.dataGen },
    { label: 'coverageWindow', value: data.coverageWindow },
    { label: 'pointerPath', value: data.pointerPath },
    { label: 'manifestPath', value: data.manifestPath },
    { label: 'fetchedAt', value: data.fetchedAt },
  ];

  return (
    <div data-testid="items-by-category-debug-panel" data-state="loaded" data-latest-order-status={data.latestOrderStatus}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            data-testid="latest-order-status-chip"
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: STATUS_COLORS[data.latestOrderStatus],
              color: '#fff',
            }}
          >
            {data.latestOrderStatus}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>fetched {new Date(data.fetchedAt).toLocaleTimeString()}</span>
        </div>
        <button
          type="button"
          onClick={() => setRefreshNonce((n) => n + 1)}
          data-testid="refresh-panel"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '0.25rem 0.5rem',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={copyJson}
          data-testid="copy-as-json"
          style={{
            padding: '0.3rem 0.7rem',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
            backgroundColor: copied ? 'var(--accent-emerald, #10b981)' : 'var(--bg-tertiary)',
            color: copied ? '#fff' : 'var(--text-secondary)',
          }}
        >
          {copied ? 'Copied' : 'Copy as JSON'}
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-secondary)', fontFamily: 'monospace', width: '30%' }}>{row.label}</td>
              <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-tertiary, var(--text-secondary))' }}>
                <span
                  data-testid={`var-${row.label}`}
                  data-type={TYPE_OF(row.value)}
                  style={{
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-secondary)',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: row.value === null || (Array.isArray(row.value) && row.value.length === 0) ? 'var(--accent-amber, #f59e0b)' : 'var(--text-primary)',
                  }}
                >
                  {FORMAT_VALUE(row.value)}
                </span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{TYPE_OF(row.value)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
