/**
 * components/dashboard-debug-chips.tsx
 *
 * Spec 022 / Rev 2 / FR-009: the inline debug chip rendered on the
 * main dashboard when the EFFECTIVE debug mode is on (env-var on
 * AND per-user signed cookie set). The server-side gate is enforced
 * in app/page.tsx — this component is only rendered when the gate
 * is satisfied. The prior `?debug=inject` URL flag is removed in
 * Rev 2; the per-user cookie is the only per-user switch.
 *
 * The chip set carries:
 *   - `displayItems: <N>` (existing, with /items-by-category panel)
 *   - `<latestOrderStatus>` (existing)
 *   - `deliveryFilterState: {...}` (NEW, spec 034 / FR-010) — a
 *     read-only surface showing the section-level delivery filter's
 *     active value, where the value was hydrated from, the canonical
 *     `today`, and the classified next / previous delivery dates.
 *     No operator-facing knob (per spec 022's debug-mode-is-read-only
 *     rule and the AS-014 / AS-015 constraints locked 2026-06-30).
 *
 * The displayItems chip, when clicked, expands the same
 * items-by-category panel used on /debug. The full diagnostic JSON is
 * fetched from /api/debug/items-by-category. The deliveryFilterState
 * chip is read-only and never opens a panel.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

import { ItemsByCategoryDebugPanel } from './items-by-category-debug-panel';

interface ItemsByCategoryDiagnostic {
  displayItemsLength: number;
  latestOrderStatus: string;
}

/**
 * Spec 034 / FR-010 — the chip payload mirrors the section-level
 * delivery filter's runtime state. Surfaced as a read-only chip in
 * the dashboard's debug-mode panel so an operator can verify the
 * filter is reading the expected values (active filter, hydration
 * source, today anchor, classified next / previous delivery dates).
 */
export interface DeliveryFilterDebugState {
  active: 'previous' | 'next' | 'all';
  source: 'sessionStorage' | 'default' | 'fixture-override';
  today: string;
  nextDeliveryDate: string | null;
  previousDeliveryDate: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--accent-emerald, #10b981)',
  null_window_filtered: 'var(--accent-amber, #f59e0b)',
  null_no_order_blob: 'var(--accent-red, #ef4444)',
  null_pointer_missing: 'var(--accent-red, #ef4444)',
};

interface DashboardDebugChipsProps {
  /**
   * Spec 034 / FR-010 — the delivery filter's runtime state. When
   * omitted (legacy callers / tests that don't need this chip), the
   * delivery filter chip renders an empty placeholder so the rest of
   * the chip set still works. The chip is always read-only.
   */
  deliveryFilterState?: DeliveryFilterDebugState | null;
}

export function DashboardDebugChips({ deliveryFilterState }: DashboardDebugChipsProps = {}) {
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

  /*
   * Spec 034 / FR-010 — the read-only `deliveryFilterState` chip.
   * Sits to the right of the existing `latestOrderStatus` chip and
   * never opens a panel / has no operator knob (per spec 022's
   * debug-mode-is-read-only rule). The chip carries all five FR-010
   * fields: active filter, hydration source, today's anchor, plus
   * the classified next / previous delivery dates (NULL when no
   * matching order exists). Tests assert against its
   * data-testid="delivery-filter-state-chip".
   */
  const deliveryFilterChipLabel = deliveryFilterState
    ? `delivery: ${deliveryFilterState.active} (${deliveryFilterState.source})`
    : 'delivery: …';

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
      {/*
        Spec 034 / FR-010 — the read-only `deliveryFilterState` chip.
        The chip is a plain `<span>` (not a `<button>`) because the
        spec 022 debug-mode is read-only. Its `title` attribute
        surfaces the full FR-010 payload (active, source, today,
        nextDeliveryDate, previousDeliveryDate) on hover so an
        operator can inspect every field without a panel.
      */}
      <span
        data-testid="delivery-filter-state-chip"
        data-active={deliveryFilterState?.active ?? 'unknown'}
        data-source={deliveryFilterState?.source ?? 'unknown'}
        data-today={deliveryFilterState?.today ?? ''}
        data-next-delivery-date={deliveryFilterState?.nextDeliveryDate ?? ''}
        data-previous-delivery-date={deliveryFilterState?.previousDeliveryDate ?? ''}
        title={
          deliveryFilterState
            ? `active=${deliveryFilterState.active} source=${deliveryFilterState.source} today=${deliveryFilterState.today} next=${deliveryFilterState.nextDeliveryDate ?? 'null'} previous=${deliveryFilterState.previousDeliveryDate ?? 'null'}`
            : 'deliveryFilterState not yet known'
        }
        style={{
          padding: '0.2rem 0.6rem',
          borderRadius: '12px',
          fontSize: '0.7rem',
          fontWeight: 600,
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
        }}
      >
        {deliveryFilterChipLabel}
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
