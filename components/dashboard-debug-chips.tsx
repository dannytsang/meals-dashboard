/**
 * components/dashboard-debug-chips.tsx
 *
 * Spec 022 / FR-009, FR-010: the inline debug chip rendered on the
 * main dashboard when ?debug=inject is set AND MEALS_DEBUG_MODE=1.
 * The server-side gate is enforced in app/page.tsx — this component
 * assumes the prop it receives is true only when both conditions hold.
 *
 * The chip shows `displayItems: <N>` and, when clicked, expands the
 * same items-by-category panel used on /debug. The full diagnostic
 * JSON is fetched from /api/debug/items-by-category.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

import { ItemsByCategoryDebugPanel } from './items-by-category-debug-panel';

interface ItemsByCategoryDiagnostic {
  displayItemsLength: number;
  latestOrderStatus: string;
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--accent-emerald, #10b981)',
  null_window_filtered: 'var(--accent-amber, #f59e0b)',
  null_no_order_blob: 'var(--accent-red, #ef4444)',
  null_pointer_missing: 'var(--accent-red, #ef4444)',
};

export function DashboardDebugChips() {
  const [diag, setDiag] = useState<ItemsByCategoryDiagnostic | null>(null);
  const [open, setOpen] = useState(false);

  const fetchDiag = useCallback(async () => {
    try {
      const res = await fetch('/api/debug/items-by-category', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as ItemsByCategoryDiagnostic;
      setDiag({ displayItemsLength: json.displayItemsLength, latestOrderStatus: json.latestOrderStatus });
    } catch {
      // Silent — the chip just shows the last-known value or the fallback.
    }
  }, []);

  useEffect(() => {
    fetchDiag();
  }, [fetchDiag]);

  const statusColor = diag ? STATUS_COLOR[diag.latestOrderStatus] ?? 'var(--text-secondary)' : 'var(--text-secondary)';
  const label = diag ? `displayItems: ${diag.displayItemsLength}` : 'displayItems: …';

  return (
    <span data-testid="dashboard-debug-chips" style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '0.5rem', marginLeft: '0.75rem', verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="debug-chip-displayItems"
        style={{
          padding: '0.2rem 0.6rem',
          borderRadius: '12px',
          fontSize: '0.7rem',
          fontWeight: 600,
          border: '1px solid var(--border-color)',
          cursor: 'pointer',
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
        }}
      >
        {label}
      </button>
      <span
        data-testid="debug-chip-status"
        style={{
          padding: '0.2rem 0.6rem',
          borderRadius: '12px',
          fontSize: '0.7rem',
          fontWeight: 600,
          backgroundColor: statusColor,
          color: '#fff',
        }}
        title={diag?.latestOrderStatus ?? 'unknown'}
      >
        {diag?.latestOrderStatus ?? 'loading…'}
      </span>
      {open && (
        <div
          role="dialog"
          aria-label="Items by category debug"
          data-testid="debug-chip-panel"
          style={{
            position: 'absolute',
            zIndex: 60,
            marginTop: '2rem',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            padding: '0.75rem',
            minWidth: '500px',
            maxWidth: '800px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Items by category diagnostic</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
              aria-label="Close debug panel"
            >
              ✕
            </button>
          </div>
          <ItemsByCategoryDebugPanel />
        </div>
      )}
    </span>
  );
}
