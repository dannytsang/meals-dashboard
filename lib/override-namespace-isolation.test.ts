import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeSnapshot } from './override-snapshot';
import {
  ADMISSION_PATH,
  AUTHORITY_DATA_PATH,
  AUTHORITY_PATH,
  SOURCE_LOCK_PATH,
  SOURCE_EPOCH,
  SOURCE_NAMESPACE,
  SOURCE_REVISION_PATH,
  editFencedSource,
  readAdmissionState,
  readFencedSource,
  type OverrideStore,
} from './override-source-store';

const LEGACY_REVISION = '9ba8e12419a23da204e02ca1918af1695b81c07a';
const release = 'a'.repeat(40);
const entry = {
  meal_date: '2030-01-02', meal_name: 'Synthetic', item_name: 'Ingredient', quantity: 2,
  reason: 'fixture', status: 'partial' as const, created_at: '2030-01-01T00:00:00Z',
  updated_at: '2030-01-02T00:00:00Z', cleared_at: null,
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

class MemoryStore implements OverrideStore {
  files = new Map<string, { bytes: Uint8Array; etag: string }>();
  writes: string[] = [];
  reads: string[] = [];
  next = 0;

  async read(path: string, limit: number) {
    this.reads.push(path);
    const found = this.files.get(path);
    if (!found) return null;
    if (found.bytes.byteLength > limit) throw new Error('bounded');
    return new Uint8Array(found.bytes);
  }
  async write(path: string, bytes: Uint8Array, overwrite: boolean) {
    if (!overwrite && this.files.has(path)) throw new Error('exists');
    const etag = String(++this.next);
    this.files.set(path, { bytes: new Uint8Array(bytes), etag });
    this.writes.push(path);
    return { url: `https://fixture.invalid/${path}`, etag };
  }
  async remove(url: string, etag: string) {
    const path = new URL(url).pathname.slice(1);
    if (this.files.get(path)?.etag !== etag) throw new Error('etag');
    this.files.delete(path);
  }
  seed(path: string, bytes: Uint8Array) {
    this.files.set(path, { bytes: new Uint8Array(bytes), etag: String(++this.next) });
  }
}

const LEGACY_DATA_PATH = 'overrides/manual.json';
const committedAt = '2020-01-01T00:00:00.000Z';

async function admitted(entries: unknown = [entry]) {
  const store = new MemoryStore();
  const raw = encode(entries);
  const rawHash = hash(raw);
  const snapshot = makeSnapshot(SOURCE_EPOCH, 1, entries, committedAt);
  store.seed(AUTHORITY_DATA_PATH, raw);
  store.seed(SOURCE_REVISION_PATH, encode({ version: 2, epoch: SOURCE_EPOCH, revision: 1, rawHash, committedAt }));
  store.seed(ADMISSION_PATH, encode({
    version: 1, namespace: SOURCE_NAMESPACE, release, epoch: SOURCE_EPOCH,
    revision: 1, rawHash, hash: snapshot.hash, count: snapshot.entries.length,
    present: true, committedAt,
  }));
  return { store, snapshot };
}

describe('Stage A namespace isolation', () => {
  it('recognizes only durable admitted bytes in the fixed v3 namespace', async () => {
    const { store, snapshot } = await admitted();
    expect(await readAdmissionState(store)).toMatchObject({ namespace: SOURCE_NAMESPACE, release, epoch: SOURCE_EPOCH, revision: 1 });
    expect((await readFencedSource(store, SOURCE_EPOCH))).toEqual(snapshot);
    expect(store.files.has(AUTHORITY_PATH)).toBe(false);
    expect(store.reads).not.toContain(LEGACY_DATA_PATH);
  });

  it('never falls back after admission and makes later legacy writes irrelevant', async () => {
    const { store, snapshot } = await admitted();
    store.seed(LEGACY_DATA_PATH, encode([]));
    expect((await readFencedSource(store, SOURCE_EPOCH)).hash).toBe(snapshot.hash);
    const edited = await editFencedSource(store, SOURCE_EPOCH, entries => entries);
    expect(edited.revision).toBe(2);
    expect(store.writes.slice(-2)).toEqual([AUTHORITY_DATA_PATH, SOURCE_REVISION_PATH]);
    store.files.delete(AUTHORITY_DATA_PATH);
    await expect(readFencedSource(store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'missing' });
    expect(store.reads).not.toContain(LEGACY_DATA_PATH);
  });

  it('removes the one-time admission capability and fails closed on unknown v3 state', async () => {
    expect(existsSync(join(process.cwd(), 'app/api/internal/override-admission/route.ts'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'app/api/internal/override-capture/route.ts'))).toBe(false);
    const source = readFileSync(join(process.cwd(), 'lib/override-source-store.ts'), 'utf8');
    expect(source).not.toContain('admitLegacySource');
    expect(source).not.toContain(LEGACY_DATA_PATH);

    const unknown = new MemoryStore();
    unknown.seed(SOURCE_REVISION_PATH, encode({ unknown: true }));
    await expect(readFencedSource(unknown, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'admission_unknown' });
    expect(unknown.writes).toEqual([SOURCE_LOCK_PATH]);
    expect(unknown.reads).not.toContain(LEGACY_DATA_PATH);
  });

  it('fails closed on missing, malformed or mismatched admission state without legacy fallback', async () => {
    const { store } = await admitted([]);
    store.files.delete(ADMISSION_PATH);
    store.seed(LEGACY_DATA_PATH, encode([entry]));
    await expect(readFencedSource(store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'admission_unknown' });
    expect(store.reads).not.toContain(LEGACY_DATA_PATH);

    store.seed(ADMISSION_PATH, encode({ unknown: true }));
    await expect(readFencedSource(store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'admission_unknown' });

    const mismatch = await admitted([]);
    mismatch.store.seed(AUTHORITY_DATA_PATH, encode([entry]));
    await expect(readFencedSource(mismatch.store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'admission_unknown' });
    expect(mismatch.store.reads).not.toContain(LEGACY_DATA_PATH);
  });

  it('proves exact legacy bytecode has no primitive or parameter for the v3 namespace', () => {
    const show = (path: string) => execFileSync('git', ['show', `${LEGACY_REVISION}:${path}`], { encoding: 'utf8' });
    const route = show('app/api/overrides/route.ts');
    const subprocess = show('app/api/manual-override/route.ts');
    const action = show('app/actions/manual-override-action.ts');
    expect(createHash('sha256').update(route).digest('hex')).toBe('1106b0f29b285740db4517c944ff2fb41c45e2374cfea0df2cf20013e19396f2');
    expect(createHash('sha256').update(subprocess).digest('hex')).toBe('cb664452155f2fd81943e17144bd473eaa2a462f995ea02af0dd0dc3cb56d6b3');
    expect(createHash('sha256').update(action).digest('hex')).toBe('6e203a3c12fc3589ce665f69ee4364c6b6a1e87bfbca2d590927d9c6e1dc4b2c');
    expect(route).toContain("const OVERRIDES_BLOB_PATH = 'overrides/manual.json'");
    expect(route.match(/put\(([^,]+)/g)).toEqual(['put(OVERRIDES_BLOB_PATH']);
    expect(route + subprocess + action).not.toContain(SOURCE_NAMESPACE);
    expect(subprocess).not.toContain('@vercel/blob');
    expect(action).toContain('`${configuredAppOrigin()}/api/overrides`');
  });
});
