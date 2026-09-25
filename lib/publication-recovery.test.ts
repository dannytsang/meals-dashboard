import { afterEach, expect, it, vi } from 'vitest';
import { VercelBlobStorageClient } from './blob-storage';
import { publishRecoverably } from './publication-recovery';

const blobs = vi.hoisted(() => new Map<string, {body: string; etag: string}>());
const wire = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock('@vercel/blob', () => ({ ...wire, head: vi.fn(), list: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); blobs.clear(); });

it('uses store-enforced exclusive creation, fresh private reads, conditional unlock and persistent receipts', async () => {
  vi.stubEnv('MEALS_PUBLICATION_PROTOCOL', '1');
  vi.stubEnv('DASHBOARD_STORE_DIR', '');
  wire.put.mockImplementation(async (path, body, options) => {
    if (options.allowOverwrite === false && blobs.has(path)) throw new Error('store lock busy');
    const etag = String(Math.random()); blobs.set(path, {body, etag});
    return { url: path, etag };
  });
  wire.get.mockImplementation(async (path, options) => {
    expect(options).toMatchObject({ useCache: false, access: 'private' });
    const blob = blobs.get(path);
    return blob ? { statusCode: 200, stream: new Response(blob.body).body } : null;
  });
  wire.del.mockImplementation(async (path, options) => {
    expect(options.ifMatch).toBe(blobs.get(path)?.etag); blobs.delete(path);
  });
  const body = { publication: { version: 1, runId: 'a'.repeat(32), generation: 100, target: 'primary', phase: 'main' } };
  const work = vi.fn(async () => { await new Promise(r => setTimeout(r, 20)); return {manifestPath: 'synthetic'}; });
  const concurrent = await Promise.allSettled([1, 2].map(() => publishRecoverably(new VercelBlobStorageClient('synthetic'), body, 'main', false, work)));
  expect(concurrent.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(work).toHaveBeenCalledTimes(1);
  await publishRecoverably(new VercelBlobStorageClient('synthetic'), body, 'main', false, work);
  expect(work).toHaveBeenCalledTimes(1);
  expect(wire.put).toHaveBeenCalledWith('publication/lock.json', '{}', expect.objectContaining({ allowOverwrite: false, addRandomSuffix: false, access: 'private' }));
  expect(blobs.has('publication/lock.json')).toBe(false);
  // A killed server's lock is intentionally not stolen, even on a new client.
  blobs.set('publication/lock.json', { body: '{}', etag: 'abandoned' });
  await expect(publishRecoverably(new VercelBlobStorageClient('synthetic'), body, 'main', false, work)).rejects.toThrow('store lock busy');
  expect(work).toHaveBeenCalledTimes(1);
});
