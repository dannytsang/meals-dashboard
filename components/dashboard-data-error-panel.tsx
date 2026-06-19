'use client';

import type { DashboardLoadError } from '@/lib/dashboard-data';

interface DashboardDataErrorPanelProps {
  error: DashboardLoadError;
}

export function DashboardDataErrorPanel({ error }: DashboardDataErrorPanelProps) {
  return (
    <section
      role="alert"
      data-testid="dashboard-data-error-panel"
      aria-live="polite"
      className="card mb-6 border border-[var(--accent-amber-border)] bg-[var(--accent-amber-bg)]"
    >
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-[var(--accent-amber)] uppercase tracking-wider">Live data load warning</p>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{error.title}</h2>
        </div>

        <p className="text-sm leading-6 text-[var(--text-secondary)]">{error.message}</p>

        <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--text-primary)]">
          {error.statusCode != null && error.statusText ? (
            <span className="rounded-full border border-[var(--accent-amber-border)] bg-[var(--bg-secondary)] px-2.5 py-1">
              {error.statusCode} {error.statusText}
            </span>
          ) : null}
          {error.resourcePath ? (
            <span className="rounded-full border border-[var(--accent-amber-border)] bg-[var(--bg-secondary)] px-2.5 py-1">
              Resource: {error.resourcePath}
            </span>
          ) : null}
        </div>

        <p className="text-sm text-[var(--text-secondary)]">
          Refresh the dashboard after the blob sync completes; the rest of the page still uses the last successful data load.
        </p>
      </div>
    </section>
  );
}
