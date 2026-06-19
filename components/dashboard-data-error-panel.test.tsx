import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardDataErrorPanel } from './dashboard-data-error-panel';

describe('DashboardDataErrorPanel', () => {
  it('renders a redacted live-load error with the recovery hint', () => {
    render(
      <DashboardDataErrorPanel
        error={{
          title: 'Meals dashboard unavailable.',
          source: 'pointer',
          message: 'The dashboard could not read the live pointer blob. Error: Vercel Blob rejected the configured credentials (403 Forbidden). Authorization: [redacted]',
          resourcePath: 'pointers/latest.json',
          statusCode: 403,
          statusText: 'Forbidden',
        }}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Meals dashboard unavailable.');
    expect(alert.textContent).toContain('403 Forbidden');
    expect(alert.textContent).toContain('pointers/latest.json');
    expect(alert.textContent).toContain('Refresh the dashboard after the blob sync completes');
    expect(alert.textContent).toContain('last successful data load');
  });
});
