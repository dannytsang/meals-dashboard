import 'server-only';
import { createHash } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { makeSnapshot, OverrideFailure, OVERRIDE_LIMITS, snapshotBytes, validCommittedAt, validateEntries, type OverrideEntry, type OverrideSnapshot } from './override-snapshot';

const DATA = 'overrides/manual.json';
const REVISION = 'overrides/source-revision.json';
const LOCK = 'overrides/source-lock.json';
const AUTHORITY = 'overrides/authority-routing.json';
type Authority = { version: 1; sourceEpoch: string; activationEpoch: string; state: 'frozen' | 'local'; revision: number; hash: string; committedAt: string };
function authorityIdentity(a: Authority, s: OverrideSnapshot): boolean {
  return a.sourceEpoch === s.epoch && a.revision === s.revision && a.hash === s.hash && a.committedAt === s.committedAt;
}
async function readAuthority(store: OverrideStore): Promise<Authority | null> {
  const bytes = await store.read(AUTHORITY, 1024);
  if (!bytes) return null;
  const a = decode(bytes) as Authority;
  if (!a || Object.keys(a).sort().join(',') !== 'activationEpoch,committedAt,hash,revision,sourceEpoch,state,version' ||
      a.version !== 1 || !['frozen', 'local'].includes(a.state) ||
      ![a.sourceEpoch, a.activationEpoch].every(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x)) ||
      !Number.isSafeInteger(a.revision) || a.revision < 1 || !/^[a-f0-9]{64}$/.test(a.hash) || !validCommittedAt(a.committedAt)) {
    throw new OverrideFailure('authority_unknown');
  }
  return a;
}
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export type SourceRevision = { epoch: string; revision: number; rawHash: string; committedAt: string; version: 2 };

/** The create-if-absent and conditional delete must be enforced by the shared store, not a process mutex. */
export interface OverrideStore {
  read(path: string, limit: number): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array, overwrite: boolean): Promise<{ url: string; etag: string }>;
  remove(url: string, etag: string): Promise<void>;
}
export class BlobOverrideStore implements OverrideStore {
  constructor(private readonly token: string) {}
  async read(path: string, limit: number): Promise<Uint8Array | null> {
    const result = await get(path, { access: 'private', useCache: false, token: this.token });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) throw new OverrideFailure('storage_error');
    if (result.blob.size > limit) throw new OverrideFailure('too_large');
    const reader = result.stream.getReader();
    const parts: Uint8Array[] = []; let count = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        count += value.byteLength;
        if (count > limit) throw new OverrideFailure('too_large');
        parts.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    return Buffer.concat(parts);
  }
  async write(path: string, bytes: Uint8Array, overwrite: boolean) {
    const result = await put(path, Buffer.from(bytes), {
      access: 'private', addRandomSuffix: false, allowOverwrite: overwrite,
      contentType: 'application/json', token: this.token,
    });
    if (!result.url || !result.etag) throw new OverrideFailure('storage_error');
    return result;
  }
  async remove(url: string, etag: string) { await del(url, { token: this.token, ifMatch: etag }); }
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const decode = (bytes: Uint8Array): unknown => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new OverrideFailure('corrupt'); }
};
function parseRevision(bytes: Uint8Array): SourceRevision {
  const value = decode(bytes);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OverrideFailure('corrupt');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'committedAt,epoch,rawHash,revision,version' || v.version !== 2 ||
      !validCommittedAt(v.committedAt) ||
      typeof v.epoch !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v.epoch) ||
      !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 ||
      typeof v.rawHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.rawHash)) throw new OverrideFailure('corrupt');
  return v as SourceRevision;
}
function parseRaw(bytes: Uint8Array): OverrideEntry[] {
  if (bytes.byteLength > OVERRIDE_LIMITS.bytes) throw new OverrideFailure('too_large');
  return validateEntries(decode(bytes));
}

/** No lock theft/lease expiry: an orphaned lock blocks until independently investigated. */
async function locked<T>(store: OverrideStore, work: () => Promise<T>): Promise<T> {
  let lock: { url: string; etag: string };
  try { lock = await store.write(LOCK, encode({ held: true }), false); }
  catch { throw new OverrideFailure('source_busy'); }
  try { return await work(); }
  finally {
    // A failed conditional release is an uncertain lock state, never a success.
    try { await store.remove(lock.url, lock.etag); }
    catch { throw new OverrideFailure('lock_release_failed'); }
  }
}
async function current(store: OverrideStore, epoch: string): Promise<{ bytes: Uint8Array; entries: OverrideEntry[]; meta: SourceRevision }> {
  const metaBytes = await store.read(REVISION, 4096);
  const bytes = await store.read(DATA, OVERRIDE_LIMITS.bytes);
  if (!bytes) throw new OverrideFailure('missing');
  const entries = parseRaw(bytes);
  if (!metaBytes) throw new OverrideFailure('unfenced_source');
  const meta = parseRevision(metaBytes);
  if (meta.epoch !== epoch) throw new OverrideFailure('wrong_epoch');
  if (digest(bytes) !== meta.rawHash) throw new OverrideFailure('inconsistent_source');
  return { bytes, entries, meta };
}
export async function readFencedSource(store: OverrideStore, epoch: string): Promise<OverrideSnapshot> {
  return locked(store, async () => {
    if (await readAuthority(store)) throw new OverrideFailure('authority_fenced');
    const { entries, meta } = await current(store, epoch);
    return makeSnapshot(meta.epoch, meta.revision, entries, meta.committedAt);
  });
}
export async function editFencedSource(store: OverrideStore, epoch: string, edit: (entries: OverrideEntry[]) => OverrideEntry[]): Promise<OverrideSnapshot> {
  return locked(store, async () => {
    if (await readAuthority(store)) throw new OverrideFailure('authority_fenced');
    const { entries, meta } = await current(store, epoch);
    if (meta.revision === Number.MAX_SAFE_INTEGER) throw new OverrideFailure('revision_exhausted');
    const next = validateEntries(edit(structuredClone(entries)));
    const data = Buffer.from(snapshotBytes(next));
    if (data.byteLength > OVERRIDE_LIMITS.bytes) throw new OverrideFailure('too_large');
    const revision = meta.revision + 1;
    const committedAt = new Date().toISOString();
    try {
      await store.write(DATA, data, true);
      await store.write(REVISION, encode({ version: 2, epoch, revision, rawHash: digest(data), committedAt }), true);
      const checked = await current(store, epoch);
      if (checked.meta.revision !== revision || checked.meta.committedAt !== committedAt || digest(checked.bytes) !== digest(data)) throw new OverrideFailure('inconsistent_source');
      return makeSnapshot(epoch, revision, checked.entries, committedAt);
    } catch {
      throw new OverrideFailure('commit_unknown');
    }
  });
}
/** Offline bootstrap only after operators independently fence *all* older deployments/editors.
 * Not exposed via HTTP. A legacy raw [] is present; missing/corrupt is never initialized.
 * Crash after metadata put can be examined from exact rawHash. */
export async function bootstrapFencedSource(store: OverrideStore, epoch: string): Promise<OverrideSnapshot> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(epoch)) throw new OverrideFailure('wrong_epoch');
  return locked(store, async () => {
    if (await readAuthority(store)) throw new OverrideFailure('authority_fenced');
    if (await store.read(REVISION, 4096)) throw new OverrideFailure('already_initialized');
    const bytes = await store.read(DATA, OVERRIDE_LIMITS.bytes);
    if (!bytes) throw new OverrideFailure('missing');
    const entries = parseRaw(bytes);
    const committedAt = new Date().toISOString();
    await store.write(REVISION, encode({ version: 2, epoch, revision: 1, rawHash: digest(bytes), committedAt }), false);
    const checked = await current(store, epoch);
    if (digest(checked.bytes) !== digest(bytes) || checked.meta.committedAt !== committedAt) throw new OverrideFailure('inconsistent_source');
    return makeSnapshot(epoch, 1, entries, committedAt);
  });
}
/** Non-HTTP operator transaction. Operators must drain old deployments and hold
 * the external all-writer/producer fence throughout. A crash leaves the durable
 * source in frozen, never source-writable. Rerun only with fresh local proof. */
export async function promoteFencedSource(
  store: OverrideStore, sourceEpoch: string, activationEpoch: string,
  confirmLocal: (snapshot: OverrideSnapshot, activationEpoch: string) => Promise<void>,
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(activationEpoch) || activationEpoch === sourceEpoch) throw new OverrideFailure('wrong_epoch');
  await locked(store, async () => {
    const { entries, meta } = await current(store, sourceEpoch);
    const snapshot = makeSnapshot(meta.epoch, meta.revision, entries, meta.committedAt);
    const existing = await readAuthority(store);
    if (existing?.state === 'local') throw new OverrideFailure('already_promoted');
    if (existing && (existing.activationEpoch !== activationEpoch || !authorityIdentity(existing, snapshot))) throw new OverrideFailure('authority_unknown');
    const record: Authority = { version: 1, state: 'frozen', sourceEpoch, activationEpoch,
      revision: snapshot.revision, hash: snapshot.hash, committedAt: snapshot.committedAt };
    if (!existing) await store.write(AUTHORITY, encode(record), false);
    const frozen = await readAuthority(store);
    if (!frozen || frozen.state !== 'frozen' || !authorityIdentity(frozen, snapshot)) throw new OverrideFailure('authority_unknown');
    await confirmLocal(snapshot, activationEpoch);
    await store.write(AUTHORITY, encode({ ...record, state: 'local' }), true);
    const final = await readAuthority(store);
    if (!final || final.state !== 'local' || !authorityIdentity(final, snapshot)) throw new OverrideFailure('authority_unknown');
  });
}

export async function sourceAuthorityState(store: OverrideStore): Promise<Authority | null> {
  return readAuthority(store);
}
export function configuredSource(): { store: OverrideStore; epoch: string } {
  const epoch = process.env.MEALS_OVERRIDE_FENCE_EPOCH;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (process.env.MEALS_OVERRIDE_FENCE_ENABLED !== '1' || !epoch || !/^[A-Za-z0-9_-]{1,64}$/.test(epoch) || !token) throw new OverrideFailure('fence_disabled');
  return { store: new BlobOverrideStore(token), epoch };
}
