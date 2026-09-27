// @vitest-environment node
// Audit-only primary receiver reproduction, synthetic SDK and transport only.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({head: vi.fn(), put: vi.fn()}));
vi.mock('@vercel/blob', () => sdk);
beforeEach(() => {
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'synthetic-auth');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-blob');
  vi.resetModules(); vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); sdk.head.mockReset(); });
it.each(['storage-exception', 'fetch-denied', 'malformed-json', 'wrong-shape'])('AUDIT-F02 %s cannot become successful empty authority', async (fault) => {
  sdk.head.mockResolvedValue({url:'http://synthetic.invalid/overrides'});
  if (fault === 'storage-exception') sdk.head.mockRejectedValue(new Error('synthetic outage'));
  const response = fault === 'fetch-denied' ? new Response('', {status:503}) : new Response(fault === 'malformed-json' ? '{' : '{}');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  const route = await import('./overrides/route');
  const result = await route.GET(new Request('http://synthetic.invalid/api/overrides', {headers:{'x-dashboard-secret':'synthetic-auth'}}) as never);
  expect(result.status).toBe(500);
});
