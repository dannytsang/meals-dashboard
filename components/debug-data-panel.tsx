'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface DebugDataRow {
  label: string;
  value: ReactNode;
}

export interface DebugDataPanelProps<T extends Record<string, unknown>> {
  title: string;
  description: string;
  endpoint: string;
  testId: string;
  rows: (data: T) => DebugDataRow[];
  /** Content rendered above the table rows — ideal for prominent diagnosis banners (FR-015). */
  preTable?: ReactNode | ((data: T) => ReactNode);
}

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_LABELS: Record<CopyState, string> = {
  idle: 'Copy as JSON',
  copied: 'Copied!',
  failed: 'Copy failed',
};

const COPY_RESET_MS = 1500;

export function DebugDataPanel<T extends Record<string, unknown>>({
  title,
  description,
  endpoint,
  testId,
  rows,
  preTable,
}: DebugDataPanelProps<T>) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>('');
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as T;
      setData(json);
      setStatus('loaded');
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshNonce]);

  // FR-016: reset copy confirmation label after timeout.
  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), COPY_RESET_MS);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copyJson = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }, [data]);

  const rowsToRender = useMemo(() => (data ? rows(data) : []), [data, rows]);

  return (
    <div data-testid={testId} data-state={status} style={{ fontSize: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.92rem' }}>{title}</strong>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setRefreshNonce((n) => n + 1)}
            data-testid={`${testId}-refresh`}
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
            disabled={copyState !== 'idle'}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '0.25rem 0.5rem',
              cursor: copyState === 'idle' ? 'pointer' : 'default',
              color: copyState === 'copied'
                ? '#22c55e'
                : copyState === 'failed'
                ? '#ef4444'
                : 'var(--text-secondary)',
              fontWeight: copyState !== 'idle' ? 600 : 400,
            }}
          >
            {COPY_LABELS[copyState]}
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{description}</p>
      {status === 'loading' && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      {status === 'error' && <div style={{ color: 'var(--accent-red, #ef4444)' }}>Failed to load diagnostic: {error}</div>}
      {status === 'loaded' && data && (
        <>
          {preTable ? (
            <div style={{ marginBottom: '0.75rem' }}>
              {typeof preTable === 'function' ? preTable(data) : preTable}
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {rowsToRender.map((row) => (
              <div key={row.label} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'baseline' }}>
                <strong style={{ minWidth: '12rem' }}>{row.label}</strong>
                <span>{row.value ?? '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
