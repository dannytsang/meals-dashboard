// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => mocks);
const payload = { meal_date: '2026-01-01', meal_name: 'Synthetic meal', item_name: 'Synthetic item' };
function request(body: unknown = payload, secret = 'synthetic-machine-auth') {
  return new NextRequest('http://localhost/api/manual-override', {
    method: 'POST', headers: { 'x-dashboard-secret': secret }, body: JSON.stringify(body),
  });
}
function child(code = 0, error = false) {
  const result = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
  queueMicrotask(() => {
    result.stderr.end('synthetic-private-diagnostic');
    if (error) result.emit('error', new Error('synthetic-private-diagnostic'));
    else result.emit('close', code);
  });
  return result;
}
beforeEach(() => {
  vi.resetModules();
  mocks.spawn.mockReset();
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'synthetic-machine-auth');
  vi.stubEnv('PYTHON_BIN', '/synthetic/python');
  vi.stubEnv('MEALS_OVERRIDES_SCRIPT_PATH', '/synthetic/apply_manual_override.py');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('preserves the configured subprocess, arguments and successful response', async () => {
  mocks.spawn.mockImplementation(() => child());
  const { POST } = await import('./route');
  const response = await POST(request({ ...payload, quantity: 2, reason: 'synthetic reason', status: 'partial' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, ...payload, quantity: 2 });
  expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith('/synthetic/python', [
    '/synthetic/apply_manual_override.py', '--meal-date', payload.meal_date,
    '--meal-name', payload.meal_name, '--item-name', payload.item_name,
    '--quantity', '2', '--reason', 'synthetic reason', '--status', 'partial',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
});
it('rejects invalid auth and payload without spawning', async () => {
  const { POST } = await import('./route');
  expect((await POST(request(payload, 'wrong'))).status).toBe(401);
  expect((await POST(request({}))).status).toBe(400);
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it('fails closed when machine auth is unconfigured', async () => {
  vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', '');
  const { POST } = await import('./route');
  expect((await POST(request())).status).toBe(500);
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it.each([false, true])('sanitizes subprocess exit/spawn errors (spawn=%s)', async (error) => {
  mocks.spawn.mockImplementation(() => child(1, error));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { POST } = await import('./route');
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('synthetic-private-diagnostic');
  expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private-diagnostic');
});
