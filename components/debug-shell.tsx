/**
 * components/debug-shell.tsx
 *
 * Spec 022 / FR-005, FR-006, FR-007, FR-008, FR-011: the client
 * component for the /debug page. Lists available debug panels
 * (initially: items-by-category), refreshes them, and shows a footer
 * with the current MEALS_DEBUG_MODE value, VERCEL_DEPLOYMENT_ID, and
 * a one-line curl example.
 *
 * New debug panels are added by appending to the PANELS list and
 * matching the discriminated union shape per FR-011.
 */
'use client';

import { useState, useCallback } from 'react';

import { ItemsByCategoryDebugPanel } from './items-by-category-debug-panel';

interface DebugPanelMeta {
  kind: 'items-by-category';
  title: string;
  description: string;
}

const PANELS: readonly DebugPanelMeta[] = [
  {
    kind: 'items-by-category',
    title: 'Items by Category',
    description: 'Diagnostic for the Order Items by Category surface: latestOrder, receipt.items, unmatchedItems, displayItems, filter, cats, dataGen.',
  },
];

interface DebugShellProps {
  status: {
    enabled: boolean;
    raw: string;
    deploymentId: string | null;
  };
  origin: string;
}

export function DebugShell({ status, origin }: DebugShellProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [panelsOpen, setPanelsOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of PANELS) init[p.kind] = true;
    return init;
  });

  const handleRefreshAll = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const togglePanel = useCallback((kind: string) => {
    setPanelsOpen((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  return (
    <div
      data-testid="debug-shell"
      data-debug-mode={status.enabled ? 'on' : 'off'}
      style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Debug Shell</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Server-gated diagnostic surface. With MEALS_DEBUG_MODE off, this route does not exist.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshAll}
          data-testid="refresh-all"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 600,
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
          }}
        >
          Refresh all
        </button>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {PANELS.map((panel) => {
          const isOpen = panelsOpen[panel.kind] ?? true;
          return (
            <section
              key={panel.kind}
              data-testid={`debug-panel-${panel.kind}`}
              data-panel-open={isOpen ? 'true' : 'false'}
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-secondary)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => togglePanel(panel.kind)}
                aria-expanded={isOpen}
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  textAlign: 'left',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{panel.title}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 1rem 1rem' }}>
                  <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{panel.description}</p>
                  {/*
                    The refresh key remounts each panel on global refresh,
                    forcing a fresh fetch. Per-panel state is otherwise
                    preserved across toggles.
                  */}
                  <div key={`${panel.kind}-${refreshKey}`}>
                    {panel.kind === 'items-by-category' && <ItemsByCategoryDebugPanel />}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer
        data-testid="debug-footer"
        style={{
          marginTop: '2rem',
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          backgroundColor: 'var(--bg-tertiary)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        <div data-testid="debug-footer-env">
          <strong>MEALS_DEBUG_MODE</strong>: {JSON.stringify(status.raw)} (effective: {status.enabled ? 'on' : 'off'})
        </div>
        <div data-testid="debug-footer-deployment">
          <strong>VERCEL_DEPLOYMENT_ID</strong>: {status.deploymentId ?? 'unset'}
        </div>
        <div data-testid="debug-footer-curl">
          <strong>curl</strong>: <code style={{ background: 'var(--bg-secondary)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>curl -i {origin}/api/debug/items-by-category</code>
        </div>
        <div>
          <a href="/" style={{ color: 'var(--accent-blue, #3b82f6)' }}>← back to dashboard</a>
        </div>
      </footer>
    </div>
  );
}
