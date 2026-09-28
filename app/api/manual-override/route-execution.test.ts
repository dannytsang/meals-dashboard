// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => mocks);
function request(auth = 'synthetic-machine-auth') {
  return new NextRequest('http://localhost/api/manual-override', {
    method: 'POST', headers: { 'x-dashboard-secret': auth }, body: JSON.stringify({ meal_date: 'fixture', meal_name: 'fixture', item_name: 'fixture' }),
  });
}
beforeEach(() => { vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'synthetic-machine-auth'); mocks.spawn.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); });
it('rejects legacy subprocess bypass for every authenticated payload without spawning', async () => {
  const { POST } = await import('./route');
  const response = await POST(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'Legacy override writer disabled' });
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect((await POST(request('wrong'))).status).toBe(401);
});
it('rejects unconfigured machine auth without spawning', async () => {
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', '');
  const { POST } = await import('./route');
  expect((await POST(request())).status).toBe(500);
  expect(mocks.spawn).not.toHaveBeenCalled();
});
