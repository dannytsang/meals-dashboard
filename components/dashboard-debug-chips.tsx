/**
 * components/dashboard-debug-chips.tsx
 *
 * Spec 022 / Rev 2 / FR-009 + spec 031 Rev 4 / FR-014:
 * the inline debug chips rendered on the main dashboard when the
 * EFFECTIVE debug mode is on (cookie-gated). The server-side gate
 * is enforced in app/page.tsx — this component is only rendered
 * when the gate is satisfied.
 *
 * Three chips are shown:
 *  1. "fresh" — dataGeneratedAt age (green=fresh, red=stale).
 *     Clicking expands the blob-read-freshness diagnostic panel.
 *  2. "cov" — coverage completeness ratio.
 *     Clicking expands the coverage diagnostic panel.
 *  3. "items" — displayItems count + latestOrder status badge.
 *     Clicking expands the items-by-category diagnostic panel.
 *
 * Only ONE panel can be open at a time — clicking a chip closes
 * any other open panel to prevent overlap.
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

export function DashboardDebugChips() {
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
  const closeAll = () => {
    setItemsOpen(false);
    setFreshnessOpen(false);
  };

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
    </span>
  );
}
