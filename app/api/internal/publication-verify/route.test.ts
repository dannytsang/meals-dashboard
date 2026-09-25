// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ locked: false, calls: 0 }));
vi.mock('@/lib/blob-storage', () => ({ VercelBlobStorageClient: class {
  async withLock(fn: () => Promise<unknown>) { state.calls++; if (state.locked) throw new Error('PRIVATE SENTINEL'); return fn(); }
} }));
vi.mock('@/lib/publication-verification', async importOriginal => ({ ...await importOriginal<object>(), createVerificationReader: () => async () => '{}', verifyPublication: async () => ({ ok: true }) }));
import { POST } from './route';
const key = 'synthetic-verification-key-not-live';
const valid = { version: 1, runId: 'a'.repeat(32), generation: 1, target: 'primary', mainHash: 'a'.repeat(64), productsHash: 'b'.repeat(64), mainManifestPath: `meta/manifest-${'a'.repeat(64)}.json`, productsManifestPath: `meta/products-manifest-${'b'.repeat(64)}.json`, expectedRecords: { 'products/1.json': 'c'.repeat(64) } };
function request(body: unknown = valid, auth: string | null = key, suffix = '') {
  return new Request(`http://localhost/api/internal/publication-verify${suffix}`, { method: 'POST', headers: { ...(auth ? { 'x-publication-verify-secret': auth } : {}), 'x-dashboard-secret': 'synthetic-writer' }, body: JSON.stringify(body) }) as never;
}
beforeEach(() => { state.locked = false; state.calls = 0; vi.stubEnv('MEALS_PUBLICATION_VERIFY', '1'); vi.stubEnv('MEALS_PUBLICATION_PROTOCOL', '1'); vi.stubEnv('MEALS_PUBLICATION_VERIFY_SECRET', key); vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', 'synthetic-writer'); });
afterEach(() => vi.unstubAllEnvs());
it.each([null, 'wrong', 'synthetic-writer'])('refuses %s independently of dashboard auth without storage calls', async auth => {
  const r = await POST(request(valid, auth)); expect(r.status).toBe(401); expect(state.calls).toBe(0); expect(r.headers.get('cache-control')).toBe('no-store');
});
it.each(['MEALS_PUBLICATION_VERIFY', 'MEALS_PUBLICATION_PROTOCOL', 'MEALS_PUBLICATION_VERIFY_SECRET'])('fails closed without %s', async variable => {
  vi.stubEnv(variable, ''); const r = await POST(request()); expect([404, 503]).toContain(r.status); expect(state.calls).toBe(0);
});
it('rejects shared write/read credentials', async () => { vi.stubEnv('MEALS_DASHBOARD_DATA_SECRET', key); expect((await POST(request())).status).toBe(503); expect(state.calls).toBe(0); });
it('compares only after independent authentication and input validation', async () => { const r = await POST(request()); expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true }); expect(state.calls).toBe(1); });
it.each([{ ...valid, operation: 'delete' }, { ...valid, path: 'publication/lock.json' }, { ...valid, expectedRecords: { '../secret': 'a'.repeat(64) } }, { ...valid, extra: 'x'.repeat(256 * 1024) }])('rejects invalid/arbitrary-path/oversized input before storage', async body => { expect((await POST(request(body))).status).toBe(400); expect(state.calls).toBe(0); });
it('does not accept query-based privilege or path', async () => { expect((await POST(request(valid, key, '?path=publication/lock.json'))).status).toBe(400); expect(state.calls).toBe(0); });
it('never steals a held lock and redacts storage exceptions', async () => { state.locked = true; const r = await POST(request()); expect(r.status).toBe(409); expect(await r.text()).not.toContain('PRIVATE'); expect(state.locked).toBe(true); });
