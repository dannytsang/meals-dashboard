// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const wire = vi.hoisted(() => ({ store: new Map<string, { text: string; etag: string }>(), calls: 0, dispatched: 0, agent: null as any }));
vi.mock('undici', () => ({ Agent: class { dispatch() { wire.dispatched++; return true; } }, setGlobalDispatcher: (agent: unknown) => { wire.agent = agent; } }));
vi.mock('@vercel/blob', () => {
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobPreconditionFailedError,
    put: async (p: string, text: string, opts: any) => { wire.agent.dispatch({}, {}); wire.calls++; if (opts.allowOverwrite === false && wire.store.has(p)) throw new Error('Blob already exists'); const etag = `etag-${wire.calls}`; wire.store.set(p, { text, etag }); return { url: p, etag }; },
    get: async (p: string, opts: any) => { wire.agent.dispatch({}, {}); wire.calls++; expect(opts.useCache).toBe(false); const v = wire.store.get(p); return v ? { statusCode: 200, stream: new Response(v.text).body } : null; },
    del: async (p: string, opts: any) => { wire.agent.dispatch({}, {}); wire.calls++; if (opts.ifMatch !== wire.store.get(p)?.etag) throw new BlobPreconditionFailedError(); wire.store.delete(p); },
    list: vi.fn(), head: vi.fn(),
  };
});
afterEach(() => vi.unstubAllEnvs());
it('runs the entire bounded harness through real route/core code; refuses re-entry', async () => {
  for (const [k, v] of Object.entries({ STAGE2_SECRET: 'synthetic-only', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'synthetic-project', STAGE2_PROJECT_ID: 'synthetic-project', BLOB_STORE_ID: 'synthetic-store', STAGE2_STORE_ID: 'synthetic-store', VERCEL_BLOB_RETRIES: '0', DASHBOARD_STORE_DIR: '', MEALS_PUBLICATION_VERIFY: '1', MEALS_PUBLICATION_PROTOCOL: '1', MEALS_PUBLICATION_VERIFY_SECRET: 'synthetic-verification-key-not-live', MEALS_DASHBOARD_DATA_SECRET: 'synthetic-writer', STAGE2_SOURCE_SHA: 'synthetic-source' })) vi.stubEnv(k, v);
  vi.resetModules(); const { default: handler } = await import('./stage2-remote-suite');
  let output = ''; const res = { statusCode: 0, setHeader: vi.fn(), end: (s: string) => { output = s; } };
  const req = { method: 'POST', headers: { 'x-stage2-secret': 'synthetic-only' } };
  await handler(req as never, res as never);
  expect(res.statusCode, output).toBe(200); const result = JSON.parse(output); expect(result.checks).toHaveLength(14); expect(result.uploadBytes).toBeLessThan(90 * 1024); expect(wire.calls).toBeLessThanOrEqual(130); expect(result.operations).toBe(wire.calls); expect(wire.store.has('publication/lock.json')).toBe(false);
  // Exercise the actual dispatcher, not a source-string check or SDK call count alone.
  for (let n = result.operations; n < 130; n++) wire.agent.dispatch({}, {});
  expect(wire.dispatched).toBe(130);
  expect(() => wire.agent.dispatch({}, {})).toThrow('Synthetic operation cap');
  expect(wire.dispatched).toBe(130);
  const previous = wire.calls; await handler(req as never, res as never); expect(res.statusCode).toBe(409); expect(wire.calls).toBe(previous);
});
