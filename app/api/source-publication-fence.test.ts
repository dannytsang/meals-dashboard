import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as main } from './dashboard-sync/route';
import { POST as products } from './dashboard-products-sync/route';
import { POST as legacy } from './dashboard-data/route';

afterEach(() => vi.unstubAllEnvs());
describe('offline source publication routing candidate', () => {
  it('refuses all three source data writes when explicitly routed local', async () => {
    vi.stubEnv('MEALS_DASHBOARD_PUBLICATION_MODE', 'local');
    for (const write of [main, products, legacy]) {
      const response = await write(new NextRequest('http://localhost/api/dashboard-sync', { method: 'POST', body: '{}' }));
      expect(response.status).toBe(403);
    }
  });
});
