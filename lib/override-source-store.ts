import 'server-only';
import { createHash } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { makeSnapshot, OverrideFailure, OVERRIDE_LIMITS, snapshotBytes, validCommittedAt, validateEntries, type OverrideEntry, type OverrideSnapshot } from './override-snapshot';

export const SOURCE_NAMESPACE = 'override-authority/v3';
export const SOURCE_EPOCH = 'source-v3';
export const LEGACY_DATA_PATH = 'overrides/manual.json';
export const AUTHORITY_DATA_PATH = `${SOURCE_NAMESPACE}/manual.json`;
export const SOURCE_REVISION_PATH = `${SOURCE_NAMESPACE}/source-revision.json`;
export const SOURCE_LOCK_PATH = `${SOURCE_NAMESPACE}/source-lock.json`;
export const AUTHORITY_PATH = `${SOURCE_NAMESPACE}/authority-routing.json`;
export const ADMISSION_PATH = `${SOURCE_NAMESPACE}/admission.json`;
type Authority = { version: 1; sourceEpoch: string; activationEpoch: string; state: 'frozen' | 'local'; revision: number; hash: string; committedAt: string };
function authorityIdentity(a: Authority, s: OverrideSnapshot): boolean {
  return a.sourceEpoch === s.epoch && a.revision === s.revision && a.hash === s.hash && a.committedAt === s.committedAt;
}
async function readAuthority(store: OverrideStore): Promise<Authority | null> {
  const bytes = await store.read(AUTHORITY_PATH, 1024);
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
  try { lock = await store.write(SOURCE_LOCK_PATH, encode({ held: true }), false); }
  catch { throw new OverrideFailure('source_busy'); }
  try { return await work(); }
  finally {
    // A failed conditional release is an uncertain lock state, never a success.
    try { await store.remove(lock.url, lock.etag); }
    catch { throw new OverrideFailure('lock_release_failed'); }
  }
}
async function current(store: OverrideStore, epoch: string): Promise<{ bytes: Uint8Array; entries: OverrideEntry[]; meta: SourceRevision }> {
  const metaBytes = await store.read(SOURCE_REVISION_PATH, 4096);
  const bytes = await store.read(AUTHORITY_DATA_PATH, OVERRIDE_LIMITS.bytes);
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
    return admittedCurrent(store, epoch);
  });
}
export async function editFencedSource(store: OverrideStore, epoch: string, edit: (entries: OverrideEntry[]) => OverrideEntry[]): Promise<OverrideSnapshot> {
  return locked(store, async () => {
    if (await readAuthority(store)) throw new OverrideFailure('authority_fenced');
    const admitted = await admittedCurrent(store, epoch);
    const entries = admitted.entries;
    const meta = { epoch: admitted.epoch, revision: admitted.revision, committedAt: admitted.committedAt };
    if (meta.revision === Number.MAX_SAFE_INTEGER) throw new OverrideFailure('revision_exhausted');
    const next = validateEntries(edit(structuredClone(entries)));
    const data = Buffer.from(snapshotBytes(next));
    if (data.byteLength > OVERRIDE_LIMITS.bytes) throw new OverrideFailure('too_large');
    const revision = meta.revision + 1;
    const committedAt = new Date().toISOString();
    try {
      await store.write(AUTHORITY_DATA_PATH, data, true);
      await store.write(SOURCE_REVISION_PATH, encode({ version: 2, epoch, revision, rawHash: digest(data), committedAt }), true);
      const checked = await current(store, epoch);
      if (checked.meta.revision !== revision || checked.meta.committedAt !== committedAt || digest(checked.bytes) !== digest(data)) throw new OverrideFailure('inconsistent_source');
      return makeSnapshot(epoch, revision, checked.entries, committedAt);
    } catch {
      throw new OverrideFailure('commit_unknown');
    }
  });
}
/** Commit-bound, replay-safe one-time admission record. */
export type AdmissionRecord = {
  version: 1; namespace: typeof SOURCE_NAMESPACE; release: string; epoch: string;
  revision: 1; rawHash: string; hash: string; count: number; present: true; committedAt: string;
};
function parseAdmission(bytes: Uint8Array): AdmissionRecord {
  const value = decode(bytes);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OverrideFailure('admission_unknown');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'committedAt,count,epoch,hash,namespace,present,rawHash,release,revision,version' ||
      v.version !== 1 || v.namespace !== SOURCE_NAMESPACE || v.revision !== 1 || v.present !== true ||
      typeof v.release !== 'string' || !/^[a-f0-9]{40}$/.test(v.release) ||
      v.epoch !== SOURCE_EPOCH ||
      typeof v.rawHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.rawHash) ||
      typeof v.hash !== 'string' || !/^[a-f0-9]{64}$/.test(v.hash) ||
      !Number.isSafeInteger(v.count) || (v.count as number) < 0 || (v.count as number) > OVERRIDE_LIMITS.records ||
      !validCommittedAt(v.committedAt)) throw new OverrideFailure('admission_unknown');
  return v as AdmissionRecord;
}
export async function readAdmissionState(store: OverrideStore): Promise<AdmissionRecord | null> {
  const bytes = await store.read(ADMISSION_PATH, 4096);
  return bytes ? parseAdmission(bytes) : null;
}

/** Strictly bind a completed admission marker to current v3 bytes and revision. */
export function validateAdmittedSnapshot(
  admissionBytes: Uint8Array | null,
  revisionBytes: Uint8Array | null,
  dataBytes: Uint8Array | null,
  epoch = SOURCE_EPOCH,
): OverrideSnapshot {
  if (epoch !== SOURCE_EPOCH) throw new OverrideFailure('wrong_epoch');
  if (!admissionBytes || !revisionBytes) throw new OverrideFailure('admission_unknown');
  if (!dataBytes) throw new OverrideFailure('missing');
  const admission = parseAdmission(admissionBytes);
  const meta = parseRevision(revisionBytes);
  if (meta.epoch !== epoch || digest(dataBytes) !== meta.rawHash || meta.revision < admission.revision) {
    throw new OverrideFailure('admission_unknown');
  }
  const entries = parseRaw(dataBytes);
  const snapshot = makeSnapshot(meta.epoch, meta.revision, entries, meta.committedAt);
  if (meta.revision === admission.revision && (
    admission.rawHash !== meta.rawHash || admission.hash !== snapshot.hash ||
    admission.count !== entries.length || admission.committedAt !== meta.committedAt
  )) throw new OverrideFailure('admission_unknown');
  if (Date.parse(meta.committedAt) < Date.parse(admission.committedAt)) throw new OverrideFailure('admission_unknown');
  return snapshot;
}

async function admittedCurrent(store: OverrideStore, epoch: string): Promise<OverrideSnapshot> {
  const [admissionBytes, revisionBytes, dataBytes] = await Promise.all([
    store.read(ADMISSION_PATH, 4096),
    store.read(SOURCE_REVISION_PATH, 4096),
    store.read(AUTHORITY_DATA_PATH, OVERRIDE_LIMITS.bytes),
  ]);
  return validateAdmittedSnapshot(admissionBytes, revisionBytes, dataBytes, epoch);
}

/**
 * One-time Stage A capability transfer. The only legacy read in accepted code is
 * this temporary admission function; ordinary source operations are v3-only.
 */
export async function admitLegacySource(
  store: OverrideStore, epoch: string, release: string, expectedLegacyHash: string,
): Promise<AdmissionRecord & { admitted: true }> {
  if (epoch !== SOURCE_EPOCH) throw new OverrideFailure('wrong_epoch');
  if (!/^[a-f0-9]{40}$/.test(release)) throw new OverrideFailure('release_mismatch');
  if (!/^[a-f0-9]{64}$/.test(expectedLegacyHash)) throw new OverrideFailure('source_identity_mismatch');
  return locked(store, async () => {
    const marker = await readAdmissionState(store);
    if (marker) throw new OverrideFailure('admission_replayed');
    const occupied = await Promise.all([
      store.read(AUTHORITY_DATA_PATH, OVERRIDE_LIMITS.bytes),
      store.read(SOURCE_REVISION_PATH, 4096),
      store.read(AUTHORITY_PATH, 1024),
    ]);
    if (occupied.some(Boolean)) throw new OverrideFailure('admission_unknown');

    const first = await store.read(LEGACY_DATA_PATH, OVERRIDE_LIMITS.bytes);
    if (!first) throw new OverrideFailure('missing');
    const entries = parseRaw(first);
    if (digest(first) !== expectedLegacyHash) throw new OverrideFailure('source_identity_mismatch');
    const second = await store.read(LEGACY_DATA_PATH, OVERRIDE_LIMITS.bytes);
    if (!second) throw new OverrideFailure('source_changed');
    parseRaw(second);
    if (digest(second) !== expectedLegacyHash || !Buffer.from(first).equals(Buffer.from(second))) throw new OverrideFailure('source_changed');

    const committedAt = new Date().toISOString();
    await store.write(AUTHORITY_DATA_PATH, first, false);
    await store.write(SOURCE_REVISION_PATH, encode({ version: 2, epoch, revision: 1, rawHash: expectedLegacyHash, committedAt }), false);
    const checked = await current(store, epoch);
    if (digest(checked.bytes) !== expectedLegacyHash || checked.meta.committedAt !== committedAt) throw new OverrideFailure('inconsistent_source');
    const snapshot = makeSnapshot(epoch, 1, checked.entries, committedAt);
    const record: AdmissionRecord = {
      version: 1, namespace: SOURCE_NAMESPACE, release, epoch, revision: 1,
      rawHash: expectedLegacyHash, hash: snapshot.hash, count: entries.length, present: true, committedAt,
    };
    await store.write(ADMISSION_PATH, encode(record), false);
    const durable = await readAdmissionState(store);
    if (!durable || JSON.stringify(durable) !== JSON.stringify(record)) throw new OverrideFailure('admission_unknown');
    return { ...durable, admitted: true as const };
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
    const snapshot = await admittedCurrent(store, sourceEpoch);
    const existing = await readAuthority(store);
    if (existing?.state === 'local') throw new OverrideFailure('already_promoted');
    if (existing && (existing.activationEpoch !== activationEpoch || !authorityIdentity(existing, snapshot))) throw new OverrideFailure('authority_unknown');
    const record: Authority = { version: 1, state: 'frozen', sourceEpoch, activationEpoch,
      revision: snapshot.revision, hash: snapshot.hash, committedAt: snapshot.committedAt };
    if (!existing) await store.write(AUTHORITY_PATH, encode(record), false);
    const frozen = await readAuthority(store);
    if (!frozen || frozen.state !== 'frozen' || !authorityIdentity(frozen, snapshot)) throw new OverrideFailure('authority_unknown');
    await confirmLocal(snapshot, activationEpoch);
    await store.write(AUTHORITY_PATH, encode({ ...record, state: 'local' }), true);
    const final = await readAuthority(store);
    if (!final || final.state !== 'local' || !authorityIdentity(final, snapshot)) throw new OverrideFailure('authority_unknown');
  });
}

export async function sourceAuthorityState(store: OverrideStore): Promise<Authority | null> {
  return readAuthority(store);
}
export function configuredSource(): { store: OverrideStore; epoch: string } {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new OverrideFailure('fence_disabled');
  return { store: new BlobOverrideStore(token), epoch: SOURCE_EPOCH };
}
