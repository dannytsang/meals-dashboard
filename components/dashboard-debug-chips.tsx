/**
 * components/dashboard-debug-chips.tsx
 *
 * Spec 022 / Rev 2 / FR-009 + spec 031 Rev 4 / FR-014 + spec 034 / FR-010:
 * the inline debug chips rendered on the main dashboard when the
 * EFFECTIVE debug mode is on (cookie-gated). The server-side gate
 * is enforced in app/page.tsx — this component is only rendered
 * when the gate is satisfied.
 *
 * Four chips are shown:
 *  1. "fresh" — dataGeneratedAt age (green=fresh, red=stale).
 *     Clicking expands the blob-read-freshness diagnostic panel.
 *  2. "cov" — coverage completeness ratio.
 *     Clicking expands the coverage diagnostic panel.
 *  3. "items" — displayItems count + latestOrder status badge.
 *     Clicking expands the items-by-category diagnostic panel.
 *  4. "delivery" — (spec 034 / FR-010) read-only chip showing the
 *     section-level delivery filter's runtime state: active value,
 *     hydration source, canonical `today`, classified next /
 *     previous delivery dates. The chip is always read-only
 *     (per spec 022's debug-mode-is-read-only rule) and never
 *     opens a panel. Surfaced via data-* attributes and a title
 *     so an operator can inspect every FR-010 field on hover.
 *
 * Only ONE panel can be open at a time — clicking a chip closes
 * any other open panel to prevent overlap. The delivery chip is
 * read-only so it is not part of the open-panel flow.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

import { ItemsByCategoryDebugPanel } from './items-by-category-debug-panel';
import { BlobReadFreshnessDebugPanel } from './blob-read-freshness-debug-panel';

interface ItemsByCategoryDiagnostic {
  displayItemsLength: number;
  latestOrderStatus: string;
}

interface FreshnessDiagnostic {
  dataGeneratedAt: string;
  manifestDateCoverage: string[];
  manifestDateCoverageMiss: string[];
  coverageWindow: string[];
}

/**
 * Spec 034 / FR-010 — the chip payload mirrors the section-level
 * delivery filter's runtime state. Surfaced as a read-only chip in
 * the dashboard's debug-mode panel so an operator can verify the
 * filter is reading the expected values (active filter, hydration
 * source, today anchor, classified next / previous delivery dates).
 *
 * Spec 037 / FR-008 — extended with `fallbackApplied`, the most
 * recent empty-state fallback decision. `null` when no fallback has
 * fired this component instance (the chip payload renders
 * `fallbackApplied: null` to keep the happy path minimal — per spec
 * Clarifications Q2). When non-null, the field is `{ from, to,
 * reason: 'zero_items' }` and surfaces the swap source / target /
 * reason for the audit trail. The chip remains read-only per spec
 * 022 — no operator knob is exposed.
 */
export interface DeliveryFilterDebugState {
  active: 'previous' | 'next' | 'all';
  source: 'sessionStorage' | 'default' | 'fixture-override';
  today: string;
  nextDeliveryDate: string | null;
  previousDeliveryDate: string | null;
  fallbackApplied:
    | { from: 'previous' | 'next' | 'all'; to: 'previous' | 'next' | 'all'; reason: 'zero_items' }
    | null;
}

const ORDER_STATUS_COLOR: Record<string, string> = {
  ok: 'var(--accent-emerald, #10b981)',
  null_window_filtered: 'var(--accent-amber, #f59e0b)',
  null_no_order_blob: 'var(--accent-red, #ef4444)',
  null_pointer_missing: 'var(--accent-red, #ef4444)',
};

/** Human-readable relative age label e.g. "2h ago", "3d ago". */
function ageLabel(isoString: string): string {
  if (!isoString) return 'unknown';
  const ms = Date.now() - new Date(isoString).getTime();
  if (isNaN(ms)) return 'unknown';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** True when dataGeneratedAt is more than 25 hours old. */
function isDataStale(isoString: string): boolean {
  if (!isoString) return false;
  const ms = Date.now() - new Date(isoString).getTime();
  return !isNaN(ms) && ms > 25 * 60 * 60 * 1000;
}

/** Status badge shown next to the items chip. */
function ItemsStatusBadge({ status }: { status: string }) {
  const color = ORDER_STATUS_COLOR[status] ?? 'var(--text-secondary)';
  return (
    <span
      data-testid="debug-chip-status"
      style={{
        padding: '0.2rem 0.6rem',
        borderRadius: '12px',
        fontSize: '0.7rem',
        fontWeight: 600,
        backgroundColor: color,
        color: '#fff',
      }}
      title={status}
    >
      {status ?? 'loading…'}
    </span>
  );
}

/** Chip button with a monospace label. */
function ChipButton({
  label,
  testId,
  onClick,
  accentColor,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  accentColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      style={{
        padding: '0.2rem 0.6rem',
        borderRadius: '12px',
        fontSize: '0.7rem',
        fontWeight: 600,
        border: '1px solid var(--border-color)',
        cursor: 'pointer',
        backgroundColor: accentColor ?? 'var(--bg-tertiary)',
        color: accentColor ? '#fff' : 'var(--text-secondary)',
        fontFamily: 'monospace',
      }}
    >
      {label}
    </button>
  );
}

/** Inline diagnostic panel wrapper. */
function DebugPanelWrapper({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 60,
        marginTop: '0.4rem',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        padding: '0.75rem',
        minWidth: '500px',
        maxWidth: '800px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <strong style={{ fontSize: '0.85rem' }}>{title}</strong>
        <button
          type="button"
          onClick={onClose}
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
      {children}
    </div>
  );
}

export function DashboardDebugChips({
  deliveryFilterState,
}: {
  /**
   * Spec 034 / FR-010 — the delivery filter's runtime state. When
   * omitted (legacy callers / tests that don't need this chip), the
   * delivery filter chip renders an empty placeholder so the rest of
   * the chip set still works. The chip is always read-only.
   */
  deliveryFilterState?: DeliveryFilterDebugState | null;
} = {}) {
  // ── Items diagnostic ────────────────────────────────────────────────
  const [itemsDiag, setItemsDiag] = useState<ItemsByCategoryDiagnostic | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);

  const fetchItemsDiag = useCallback(async () => {
    try {
      const res = await fetch('/api/debug/items-by-category', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as ItemsByCategoryDiagnostic;
      setItemsDiag({
        displayItemsLength: json.displayItemsLength,
        latestOrderStatus: json.latestOrderStatus,
      });
    } catch {
      // Silent — chip shows last-known value or "…" fallback.
    }
  }, []);

  useEffect(() => { void fetchItemsDiag(); }, [fetchItemsDiag]);

  // ── Freshness diagnostic ────────────────────────────────────────────
  const [freshnessDiag, setFreshnessDiag] = useState<FreshnessDiagnostic | null>(null);
  const [freshnessOpen, setFreshnessOpen] = useState(false);

  // ── Coverage diagnostic (reuses freshnessDiag data) ─────────────────
  const [coverageOpen, setCoverageOpen] = useState(false);

  const fetchFreshnessDiag = useCallback(async () => {
    try {
      const res = await fetch('/api/debug/blob-read-freshness', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as FreshnessDiagnostic;
      setFreshnessDiag({
        dataGeneratedAt: json.dataGeneratedAt,
        manifestDateCoverage: json.manifestDateCoverage ?? [],
        manifestDateCoverageMiss: json.manifestDateCoverageMiss ?? [],
        coverageWindow: json.coverageWindow ?? [],
      });
    } catch {
      // Silent.
    }
  }, []);

  useEffect(() => { void fetchFreshnessDiag(); }, [fetchFreshnessDiag]);

  // ── Derived chip labels ──────────────────────────────────────────────
  const stale = freshnessDiag ? isDataStale(freshnessDiag.dataGeneratedAt) : false;
  const coverageOk = freshnessDiag ? freshnessDiag.manifestDateCoverage.length : 0;
  const coverageMiss = freshnessDiag ? freshnessDiag.manifestDateCoverageMiss.length : 0;
  const coverageTotal = freshnessDiag ? freshnessDiag.coverageWindow.length : 0;

  const freshnessLabel = freshnessDiag ? `${ageLabel(freshnessDiag.dataGeneratedAt)}` : '…';

  const coverageLabel = freshnessDiag
    ? coverageMiss > 0
      ? `${coverageOk}/${coverageTotal}`
      : `${coverageOk}`
    : '…';

  const freshnessChipBg = !freshnessDiag
    ? undefined
    : stale
    ? 'var(--accent-red, #ef4444)'
    : 'var(--accent-emerald, #10b981)';

  const coverageChipBg = !freshnessDiag
    ? undefined
    : coverageMiss > 0
    ? 'var(--accent-amber, #f59e0b)'
    : coverageOk > 0
    ? 'var(--accent-emerald, #10b981)'
    : undefined;

  // Close all panels — used to ensure only one is open at a time.
  // Note: the delivery-filter chip (spec 034) is read-only and
  // never opens a panel, so it is intentionally not tracked here.
  const closeAll = () => {
    setItemsOpen(false);
    setFreshnessOpen(false);
  };

  /*
   * Spec 034 / FR-010 — the read-only `deliveryFilterState` chip.
   * The label is "delivery: <active> (<source>)" when the filter
   * state has been provided, or "delivery: …" while the parent is
   * still hydrating. The chip carries all five FR-010 fields as
   * data-* attributes so tests can assert against them without
   * depending on the rendered text, and a `title` attribute for
   * operator inspection on hover.
   */
  const deliveryFilterChipLabel = deliveryFilterState
    ? `delivery: ${deliveryFilterState.active} (${deliveryFilterState.source})`
    : 'delivery: …';

  return (
    <span
      data-testid="dashboard-debug-chips"
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: '0.4rem',
        marginLeft: '0.75rem',
        verticalAlign: 'middle',
      }}
    >
      {/* ── Freshness chip ──────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <ChipButton
          label={`fresh: ${freshnessLabel}`}
          testId="debug-chip-freshness"
          onClick={() => {
            if (freshnessOpen) { setFreshnessOpen(false); }
            else { closeAll(); setFreshnessOpen(true); }
          }}
          accentColor={freshnessChipBg}
        />
        {freshnessOpen && (
          <DebugPanelWrapper
            title="Blob Read Freshness"
            onClose={() => setFreshnessOpen(false)}
          >
            <BlobReadFreshnessDebugPanel />
          </DebugPanelWrapper>
        )}
      </div>

      {/* ── Coverage chip ──────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <ChipButton
          label={`cov: ${coverageLabel}`}
          testId="debug-chip-coverage"
          onClick={() => {
            if (coverageOpen) { setCoverageOpen(false); }
            else { closeAll(); setCoverageOpen(true); }
          }}
          accentColor={coverageChipBg}
        />
        {coverageOpen && (
          <DebugPanelWrapper
            title="Coverage Diagnostic"
            onClose={() => setCoverageOpen(false)}
          >
            <BlobReadFreshnessDebugPanel />
          </DebugPanelWrapper>
        )}
      </div>

      {/* ── Items-by-category chip ───────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <ChipButton
          label={`items: ${itemsDiag ? itemsDiag.displayItemsLength : '…'}`}
          testId="debug-chip-displayItems"
          onClick={() => {
            if (itemsOpen) { setItemsOpen(false); }
            else { closeAll(); setItemsOpen(true); }
          }}
        />
        <ItemsStatusBadge status={itemsDiag?.latestOrderStatus ?? 'loading…'} />
        {itemsOpen && (
          <DebugPanelWrapper
            title="Items by Category Diagnostic"
            onClose={() => setItemsOpen(false)}
          >
            <ItemsByCategoryDebugPanel />
          </DebugPanelWrapper>
        )}
      </div>

      {/*
        ── Delivery-filter chip (spec 034 / FR-010) ─────────────────────
        The chip is a plain `<span>` (not a `<button>`) because the
        spec 022 debug-mode is read-only. It sits to the right of the
        items-by-category chip and never opens a panel / has no
        operator knob. Its `title` attribute surfaces the full FR-010
        payload (active, source, today, nextDeliveryDate,
        previousDeliveryDate) on hover so an operator can inspect
        every field without a panel. Tests assert against its
        data-testid="delivery-filter-state-chip" and data-* attrs.
      */}
      <span
        data-testid="delivery-filter-state-chip"
        data-active={deliveryFilterState?.active ?? 'unknown'}
        data-source={deliveryFilterState?.source ?? 'unknown'}
        data-today={deliveryFilterState?.today ?? ''}
        data-next-delivery-date={deliveryFilterState?.nextDeliveryDate ?? ''}
        data-previous-delivery-date={deliveryFilterState?.previousDeliveryDate ?? ''}
        data-fallback-applied={deliveryFilterState?.fallbackApplied ? 'true' : 'false'}
        data-fallback-from={deliveryFilterState?.fallbackApplied?.from ?? ''}
        data-fallback-to={deliveryFilterState?.fallbackApplied?.to ?? ''}
        data-fallback-reason={deliveryFilterState?.fallbackApplied?.reason ?? ''}
        title={
          deliveryFilterState
            ? `active=${deliveryFilterState.active} source=${deliveryFilterState.source} today=${deliveryFilterState.today} next=${deliveryFilterState.nextDeliveryDate ?? 'null'} previous=${deliveryFilterState.previousDeliveryDate ?? 'null'} fallbackApplied=${deliveryFilterState.fallbackApplied ? `${deliveryFilterState.fallbackApplied.from}->${deliveryFilterState.fallbackApplied.to} (${deliveryFilterState.fallbackApplied.reason})` : 'null'}`
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
    </span>
  );
}