import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  InMemoryBlobStorageClient,
  type Manifest,
} from './blob-storage';

describe('InMemoryBlobStorageClient — computeHash', () => {
  const client = new InMemoryBlobStorageClient();

  it('produces a 64-char hex SHA-256 digest', () => {
    const h = client.computeHash('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(client.computeHash('abc')).toBe(client.computeHash('abc'));
  });

  it('changes when input changes', () => {
    expect(client.computeHash('abc')).not.toBe(client.computeHash('abcd'));
  });
});

describe('InMemoryBlobStorageClient — writeBlobIfChanged (hash dedup)', () => {
  let client: InMemoryBlobStorageClient;
  beforeEach(() => {
    client = new InMemoryBlobStorageClient();
  });

  it('writes when the path is not in the current manifest', async () => {
    const result = await client.writeBlobIfChanged('coverage/2026-06-15.json', '{"a":1}', {});
    expect(result.written).toBe(true);
    expect(result.path).toBe('coverage/2026-06-15.json');
    expect(client.store.has('coverage/2026-06-15.json')).toBe(true);
  });

  it('skips write when hash matches current manifest', async () => {
    const content = '{"a":1}';
    const hash = client.computeHash(content);
    const result = await client.writeBlobIfChanged('coverage/2026-06-15.json', content, {
      'coverage/2026-06-15.json': hash,
    });
    expect(result.written).toBe(false);
    // Blob should still be considered current (skip) — the store does not need to retain it.
  });

  it('writes when content changed even if path is in manifest with a different hash', async () => {
    const oldHash = client.computeHash('{"a":1}');
    const result = await client.writeBlobIfChanged(
      'coverage/2026-06-15.json',
      '{"a":2}',
      { 'coverage/2026-06-15.json': oldHash }
    );
    expect(result.written).toBe(true);
    const read = await client.readJsonBlob<{ a: number }>('coverage/2026-06-15.json');
    expect(read?.a).toBe(2);
  });
});

describe('InMemoryBlobStorageClient — writeManifest (content-addressable)', () => {
  it('produces a deterministic path from manifest content', async () => {
    const client = new InMemoryBlobStorageClient();
    const manifest: Manifest = {
      'orders/2026-06-16/5421-8594-00.json': 'aaa',
      'coverage/2026-06-15.json': 'bbb',
    };
    const first = await client.writeManifest(manifest);
    const second = await client.writeManifest(manifest);
    expect(first.manifestPath).toBe(second.manifestPath);
    expect(first.manifestPath).toMatch(/^meta\/manifest-[0-9a-f]{64}\.json$/);
  });

  it('produces different paths for different manifest content', async () => {
    const client = new InMemoryBlobStorageClient();
    const a = await client.writeManifest({ 'coverage/a.json': 'x' });
    const b = await client.writeManifest({ 'coverage/b.json': 'y' });
    expect(a.manifestPath).not.toBe(b.manifestPath);
  });

  it('sorts keys deterministically so equivalent manifests hash equally', async () => {
    const client = new InMemoryBlobStorageClient();
    const a = await client.writeManifest({ 'a.json': '1', 'b.json': '2' });
    const b = await client.writeManifest({ 'b.json': '2', 'a.json': '1' });
    expect(a.manifestPath).toBe(b.manifestPath);
  });

  it('readManifest round-trips through the store', async () => {
    const client = new InMemoryBlobStorageClient();
    const { manifestPath } = await client.writeManifest({
      'coverage/2026-06-15.json': 'abc',
    });
    const read = await client.readManifest(manifestPath);
    expect(read).toEqual({ 'coverage/2026-06-15.json': 'abc' });
  });
});

describe('InMemoryBlobStorageClient — writePointer', () => {
  it('writes a pointer blob with manifest path', async () => {
    const client = new InMemoryBlobStorageClient();
    await client.writePointer('meta/manifest-abc.json');
    const read = await client.readPointer();
    expect(read).toEqual({ manifestPath: 'meta/manifest-abc.json', productsManifestPath: null });
  });

  it('writes a pointer blob with manifest path and products manifest', async () => {
    const client = new InMemoryBlobStorageClient();
    await client.writePointer('meta/manifest-abc.json', 'meta/products-manifest-xyz.json');
    const read = await client.readPointer();
    expect(read).toEqual({ manifestPath: 'meta/manifest-abc.json', productsManifestPath: 'meta/products-manifest-xyz.json' });
  });

  it('overwrites the previous pointer (delete+rewrite)', async () => {
    const client = new InMemoryBlobStorageClient();
    await client.writePointer('meta/manifest-first.json');
    await client.writePointer('meta/manifest-second.json');
    expect(await client.readPointer()).toEqual({ manifestPath: 'meta/manifest-second.json', productsManifestPath: null });
  });
});

describe('InMemoryBlobStorageClient — readJsonBlob fallback', () => {
  it('returns null when the path is missing', async () => {
    const client = new InMemoryBlobStorageClient();
    expect(await client.readJsonBlob('does/not/exist.json')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spec 028: VercelBlobStorageClient — head() swap for readPointer/readManifest.
// These tests mock @vercel/blob's head() and list() and assert that:
//   - readPointer calls head() once and list() zero times
//   - readManifest calls head() once and list() zero times
//   - readJsonBlob still calls list() (FR-006 regression guard)
//   - null on 404 from head() returns null/{} without calling list()
// ---------------------------------------------------------------------------
vi.mock('@vercel/blob', () => ({
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

// Import AFTER vi.mock so the module-under-test sees the mocked @vercel/blob.
import { head as mockedHead, list as mockedList } from '@vercel/blob';
import { VercelBlobStorageClient } from './blob-storage';

const mockedHeadFn = mockedHead as unknown as Mock;
const mockedListFn = mockedList as unknown as Mock;

describe('VercelBlobStorageClient — head() swap (spec 028)', () => {
  let fetchSpy: Mock;
  const TEST_TOKEN = 'vercel_blob_rw_test_token_abc123';

  beforeEach(() => {
    mockedHeadFn.mockReset();
    mockedListFn.mockReset();
    // Default fetch mock — returns a 200 OK with a JSON body.
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('readPointer calls head() once with the pointer path and list() zero times', async () => {
    mockedHeadFn.mockResolvedValue({
      url: 'https://example.blob.vercel-storage.com/pointers-latest',
      pathname: 'pointers/latest.json',
      size: 50,
      uploadedAt: new Date('2026-06-18T00:00:00Z'),
      contentType: 'application/json',
      contentDisposition: '',
      downloadUrl: 'https://example.blob.vercel-storage.com/pointers-latest?download=1',
      cacheControl: '',
      etag: 'abc',
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ manifestPath: 'meta/manifest-abc.json', productsManifestPath: null }),
    });

    const client = new VercelBlobStorageClient(TEST_TOKEN);
    const result = await client.readPointer();

    expect(result).toEqual({ manifestPath: 'meta/manifest-abc.json', productsManifestPath: null });
    expect(mockedHeadFn).toHaveBeenCalledTimes(1);
    expect(mockedHeadFn).toHaveBeenCalledWith('pointers/latest.json', { token: TEST_TOKEN });
    expect(mockedListFn).toHaveBeenCalledTimes(0);
  });

  it('readManifest calls head() once with the given path and list() zero times', async () => {
    const manifestPath = 'meta/manifest-8acaeb57b3f2cec64f7d010e51666d6dab1d63408b5d155f8b6f0a9b0fe00a60.json';
    mockedHeadFn.mockResolvedValue({
      url: `https://example.blob.vercel-storage.com/${manifestPath}`,
      pathname: manifestPath,
      size: 100,
      uploadedAt: new Date('2026-06-18T00:00:00Z'),
      contentType: 'application/json',
      contentDisposition: '',
      downloadUrl: `https://example.blob.vercel-storage.com/${manifestPath}?download=1`,
      cacheControl: '',
      etag: 'def',
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        'orders/2026-06-16/5421-8594-00.json': 'aaa',
        'coverage/2026-06-15.json': 'bbb',
      }),
    });

    const client = new VercelBlobStorageClient(TEST_TOKEN);
    const result = await client.readManifest(manifestPath);

    expect(result).toEqual({
      'orders/2026-06-16/5421-8594-00.json': 'aaa',
      'coverage/2026-06-15.json': 'bbb',
    });
    expect(mockedHeadFn).toHaveBeenCalledTimes(1);
    expect(mockedHeadFn).toHaveBeenCalledWith(manifestPath, { token: TEST_TOKEN });
    expect(mockedListFn).toHaveBeenCalledTimes(0);
  });

  it('readPointer returns null when head() returns null (404); list() is NOT called as a fallback', async () => {
    mockedHeadFn.mockResolvedValue(null);

    const client = new VercelBlobStorageClient(TEST_TOKEN);
    const result = await client.readPointer();

    expect(result).toBeNull();
    expect(mockedHeadFn).toHaveBeenCalledTimes(1);
    expect(mockedListFn).toHaveBeenCalledTimes(0);
  });

  it('readManifest returns {} when head() returns null (404); list() is NOT called as a fallback', async () => {
    mockedHeadFn.mockResolvedValue(null);

    const client = new VercelBlobStorageClient(TEST_TOKEN);
    const result = await client.readManifest('meta/manifest-anything.json');

    expect(result).toEqual({});
    expect(mockedHeadFn).toHaveBeenCalledTimes(1);
    expect(mockedListFn).toHaveBeenCalledTimes(0);
  });

  it('readJsonBlob still calls list() (FR-006 regression guard: head() swap does NOT touch this path)', async () => {
    // Mock list() to return a single matching blob (the prefix-scanned result).
    mockedListFn.mockResolvedValue({
      blobs: [{
        url: 'https://example.blob.vercel-storage.com/coverage-2026-06-18',
        pathname: 'coverage/2026-06-18.json',
        size: 200,
        uploadedAt: new Date('2026-06-18T00:00:00Z'),
        contentType: 'application/json',
        contentDisposition: '',
        downloadUrl: 'https://example.blob.vercel-storage.com/coverage-2026-06-18?download=1',
        cacheControl: '',
        etag: 'ghi',
      }],
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ date: '2026-06-18', meals: [] }),
    });

    const client = new VercelBlobStorageClient(TEST_TOKEN);
    const result = await client.readJsonBlob<{ date: string }>('coverage/2026-06-18.json');

    expect(result?.date).toBe('2026-06-18');
    expect(mockedListFn).toHaveBeenCalledTimes(1);
    expect(mockedHeadFn).toHaveBeenCalledTimes(0); // head() must NOT be called from readJsonBlob
  });
});
