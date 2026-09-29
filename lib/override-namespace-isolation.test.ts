import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  ADMISSION_PATH,
  AUTHORITY_DATA_PATH,
  AUTHORITY_PATH,
  LEGACY_DATA_PATH,
  SOURCE_LOCK_PATH,
  SOURCE_EPOCH,
  SOURCE_NAMESPACE,
  SOURCE_REVISION_PATH,
  admitLegacySource,
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
  mutateLegacyAfterFirstRead?: Uint8Array;

  async read(path: string, limit: number) {
    this.reads.push(path);
    const found = this.files.get(path);
    if (!found) return null;
    if (found.bytes.byteLength > limit) throw new Error('bounded');
    const result = new Uint8Array(found.bytes);
    if (path === LEGACY_DATA_PATH && this.mutateLegacyAfterFirstRead && this.reads.filter(p => p === path).length === 1) {
      this.files.set(path, { bytes: this.mutateLegacyAfterFirstRead, etag: String(++this.next) });
    }
    return result;
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

async function admitted(entries: unknown = [entry]) {
  const store = new MemoryStore();
  const legacy = encode(entries);
  store.seed(LEGACY_DATA_PATH, legacy);
  const identity = await admitLegacySource(store, SOURCE_EPOCH, release, hash(legacy));
  return { store, legacy, identity };
}

describe('Stage A namespace isolation', () => {
  it('admits stable strict legacy bytes once into only the fixed v3 namespace', async () => {
    const { store, identity } = await admitted();
    expect(identity).toMatchObject({ admitted: true, namespace: SOURCE_NAMESPACE, release, epoch: SOURCE_EPOCH, revision: 1, count: 1, present: true });
    expect(store.writes).toEqual([SOURCE_LOCK_PATH, AUTHORITY_DATA_PATH, SOURCE_REVISION_PATH, ADMISSION_PATH]);
    expect(store.writes).not.toContain(LEGACY_DATA_PATH);
    expect(store.files.has(AUTHORITY_PATH)).toBe(false);
    expect(await readAdmissionState(store)).toMatchObject({ namespace: SOURCE_NAMESPACE, release, epoch: SOURCE_EPOCH, revision: 1 });
    expect((await readFencedSource(store, SOURCE_EPOCH)).entries).toEqual([entry]);
  });

  it('never falls back after admission and makes later legacy writes irrelevant', async () => {
    const { store, identity } = await admitted();
    store.seed(LEGACY_DATA_PATH, encode([]));
    expect((await readFencedSource(store, SOURCE_EPOCH)).hash).toBe(identity.hash);
    const edited = await editFencedSource(store, SOURCE_EPOCH, entries => entries);
    expect(edited.revision).toBe(2);
    expect(store.writes.slice(-2)).toEqual([AUTHORITY_DATA_PATH, SOURCE_REVISION_PATH]);
    store.files.delete(AUTHORITY_DATA_PATH);
    await expect(readFencedSource(store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'missing' });
    expect(store.reads.at(-1)).not.toBe(LEGACY_DATA_PATH);
  });

  it('rejects replay, unknown v3 state, changed double reads and invalid legacy state without overwrite', async () => {
    const complete = await admitted();
    await expect(admitLegacySource(complete.store, SOURCE_EPOCH, release, hash(complete.legacy))).rejects.toMatchObject({ code: 'admission_replayed' });

    const unknown = new MemoryStore();
    const legacy = encode([]); unknown.seed(LEGACY_DATA_PATH, legacy); unknown.seed(SOURCE_REVISION_PATH, encode({ unknown: true }));
    await expect(admitLegacySource(unknown, SOURCE_EPOCH, release, hash(legacy))).rejects.toMatchObject({ code: 'admission_unknown' });
    expect(unknown.writes).toEqual([SOURCE_LOCK_PATH]);

    const moving = new MemoryStore(); moving.seed(LEGACY_DATA_PATH, legacy); moving.mutateLegacyAfterFirstRead = encode([entry]);
    await expect(admitLegacySource(moving, SOURCE_EPOCH, release, hash(legacy))).rejects.toMatchObject({ code: 'source_changed' });
    expect(moving.files.has(AUTHORITY_DATA_PATH)).toBe(false);

    for (const bytes of [Buffer.from('{'), encode({ entries: [] })]) {
      const invalid = new MemoryStore(); invalid.seed(LEGACY_DATA_PATH, bytes);
      await expect(admitLegacySource(invalid, SOURCE_EPOCH, release, hash(bytes))).rejects.toMatchObject({ code: expect.stringMatching(/corrupt|invalid_snapshot/) });
      expect(invalid.files.has(AUTHORITY_DATA_PATH)).toBe(false);
    }
  });

  it('fails closed on missing, malformed or mismatched admission state without legacy fallback', async () => {
    const { store } = await admitted([]);
    store.files.delete(ADMISSION_PATH);
    store.seed(LEGACY_DATA_PATH, encode([entry]));
    await expect(readFencedSource(store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'admission_unknown' });
    expect(store.reads.at(-1)).not.toBe(LEGACY_DATA_PATH);

    store.seed(ADMISSION_PATH, encode({ unknown: true }));
    await expect(readFencedSource(store, SOURCE_EPOCH)).rejects.toMatchObject({ code: 'admission_unknown' });

    await expect(admitLegacySource(new MemoryStore(), 'caller-selected', release, '0'.repeat(64)))
      .rejects.toMatchObject({ code: 'wrong_epoch' });
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
