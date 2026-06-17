import 'server-only';
import { put, list, del } from '@vercel/blob';
import { createHash } from 'node:crypto';

/**
 * Blob Storage Layout (spec `016-dashboard-blob-storage-layout`):
 *
 *   orders/{delivery_date}/{order_number}.json   ← immutable order blobs (status field in 018)
 *   coverage/{date}.json                         ← mutable per-meal-date coverage
 *   meta/manifest-{hash}.json                    ← content-addressable manifest (append-only)
 *   meta/summary-{hash}.json                     ← content-addressable pre-composed summary
 *   pointers/latest.json                         ← only blob that is delete+rewritten every sync
 *
 * Content-hash dedup: every data blob is SHA-256 hashed; the manifest maps path → hash;
 * unchanged blobs are skipped (not re-uploaded). The manifest is content-addressable by
 * its own SHA-256, eliminating circular write dependencies.
 */

const POINTER_PATH = 'pointers/latest.json';
const MANIFIX_PREFIX = 'meta/manifest-';
const SUMMARY_PREFIX = 'meta/summary-';

export type Manifest = Record<string, string>; // blob path → sha256 hex digest

export interface PointerContents {
  manifestPath: string;
  /** Spec 021 / FR-003 — path to the products manifest blob. */
  productsManifestPath?: string | null;
}

export interface BlobStorageClient {
  readPointer(): Promise<PointerContents | null>;
  readManifest(manifestPath: string): Promise<Manifest>;
  readJsonBlob<T>(path: string): Promise<T | null>;
  /** List paths matching prefix (e.g. 'coverage/'). */
  listPaths(prefix: string): Promise<string[]>;
  computeHash(content: string): string;
  /**
   * Write a data blob with hash dedup.
   * Returns the path actually written, or null if skipped (hash matched manifest).
   */
  writeBlobIfChanged(path: string, content: string, currentManifest: Manifest): Promise<{ written: boolean; path: string; hash: string }>;
  /** Write the content-addressable manifest. Returns the path it was written to. */
  writeManifest(manifest: Manifest): Promise<{ manifestPath: string; manifestHash: string }>;
  /** Write the mutable pointer blob. Pass productsManifestPath to include it (spec 021). */
  writePointer(manifestPath: string, productsManifestPath?: string | null): Promise<void>;
}

/**
 * Production client backed by the @vercel/blob SDK.
 *
 * Important: `BLOB_READ_WRITE_TOKEN` must be configured in the runtime environment
 * (the dashboard server owns the token, not the sync script).
 */
export class VercelBlobStorageClient implements BlobStorageClient {
  private readonly token: string | undefined;

  constructor(token: string | undefined = process.env.BLOB_READ_WRITE_TOKEN) {
    this.token = token;
  }

  async readPointer(): Promise<PointerContents | null> {
    const res = await this.readJsonBlob<PointerContents>(POINTER_PATH);
    if (!res || typeof res.manifestPath !== 'string') return null;
    return res;
  }

  async readManifest(manifestPath: string): Promise<Manifest> {
    const res = await this.readJsonBlob<Manifest>(manifestPath);
    if (!res || typeof res !== 'object') return {};
    // Validate shape: every value must be a string.
    const valid: Manifest = {};
    for (const [k, v] of Object.entries(res)) {
      if (typeof v === 'string') valid[k] = v;
    }
    return valid;
  }

  async readJsonBlob<T>(path: string): Promise<T | null> {
    const blobs = await list({ prefix: path, token: this.token });
    const match = blobs.blobs.find((b) => b.pathname === path);
    if (!match) {
      return null;
    }
    const response = await fetch(match.url, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
    });
    if (!response.ok) {
      throw new Error(`Blob fetch failed for ${path}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    return JSON.parse(text) as T;
  }

  async listPaths(prefix: string): Promise<string[]> {
    try {
      const blobs = await list({ prefix, token: this.token });
      return blobs.blobs.map((b) => b.pathname);
    } catch {
      return [];
    }
  }

  computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  async writeBlobIfChanged(
    path: string,
    content: string,
    currentManifest: Manifest
  ): Promise<{ written: boolean; path: string; hash: string }> {
    const hash = this.computeHash(content);
    if (currentManifest[path] === hash) {
      return { written: false, path, hash };
    }
    await put(path, content, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: this.token,
    });
    return { written: true, path, hash };
  }

  async writeManifest(manifest: Manifest): Promise<{ manifestPath: string; manifestHash: string }> {
    // Sort keys for deterministic content (and therefore deterministic path).
    const sorted = Object.keys(manifest).sort().reduce<Manifest>((acc, k) => {
      acc[k] = manifest[k]!;
      return acc;
    }, {});
    const content = JSON.stringify(sorted, null, 2);
    const hash = this.computeHash(content);
    const manifestPath = `${MANIFIX_PREFIX}${hash}.json`;
    await put(manifestPath, content, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: this.token,
    });
    return { manifestPath, manifestHash: hash };
  }

  async writePointer(manifestPath: string, productsManifestPath?: string | null): Promise<void> {
    const content: PointerContents = { manifestPath, productsManifestPath: productsManifestPath ?? null };
    // Pointer is the only blob that is delete+rewritten every sync (FR-05, FR-11).
    try {
      await del(POINTER_PATH, { token: this.token });
    } catch {
      // Pointer may not exist yet (first sync) — that's fine.
    }
    await put(POINTER_PATH, JSON.stringify(content, null, 2), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: this.token,
    });
  }
}

/**
 * In-memory client for tests. Mirrors the production client API.
 * Pass in a `seed` of pre-existing blobs to simulate the "current manifest" state.
 */
export class InMemoryBlobStorageClient implements BlobStorageClient {
  readonly store: Map<string, { content: string; hash: string }> = new Map();
  private readonly seedManifest: Manifest;

  constructor(seedManifest: Manifest = {}) {
    this.seedManifest = seedManifest;
  }

  async readPointer(): Promise<PointerContents | null> {
    return this.readJsonBlob<PointerContents>(POINTER_PATH);
  }

  async readManifest(manifestPath: string): Promise<Manifest> {
    return (await this.readJsonBlob<Manifest>(manifestPath)) ?? {};
  }

  async readJsonBlob<T>(path: string): Promise<T | null> {
    const entry = this.store.get(path);
    if (!entry) return null;
    try {
      return JSON.parse(entry.content) as T;
    } catch {
      return null;
    }
  }

  async listPaths(prefix: string): Promise<string[]> {
    return [...this.store.keys()].filter((p) => p.startsWith(prefix));
  }

  computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  async writeBlobIfChanged(
    path: string,
    content: string,
    currentManifest: Manifest
  ): Promise<{ written: boolean; path: string; hash: string }> {
    const hash = this.computeHash(content);
    if (currentManifest[path] === hash) {
      return { written: false, path, hash };
    }
    this.store.set(path, { content, hash });
    return { written: true, path, hash };
  }

  async writeManifest(manifest: Manifest): Promise<{ manifestPath: string; manifestHash: string }> {
    const sorted = Object.keys(manifest).sort().reduce<Manifest>((acc, k) => {
      acc[k] = manifest[k]!;
      return acc;
    }, {});
    const content = JSON.stringify(sorted, null, 2);
    const hash = this.computeHash(content);
    const manifestPath = `${MANIFIX_PREFIX}${hash}.json`;
    this.store.set(manifestPath, { content, hash });
    return { manifestPath, manifestHash: hash };
  }

  async writePointer(manifestPath: string, productsManifestPath?: string | null): Promise<void> {
    const content: PointerContents = { manifestPath, productsManifestPath: productsManifestPath ?? null };
    this.store.set(POINTER_PATH, { content: JSON.stringify(content), hash: this.computeHash(JSON.stringify(content)) });
  }

  // Test helper — seed an initial state for "first sync" scenarios.
  seed(path: string, content: string): void {
    this.store.set(path, { content, hash: this.computeHash(content) });
  }
}

export const POINTER_PATH_CONSTANT = POINTER_PATH;
export const MANIFEST_PREFIX_CONSTANT = MANIFIX_PREFIX;
export const SUMMARY_PREFIX_CONSTANT = SUMMARY_PREFIX;
