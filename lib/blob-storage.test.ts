import { describe, it, expect, beforeEach } from 'vitest';
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
