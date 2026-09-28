import { createHash, timingSafeEqual } from 'node:crypto';

/** Private whole-store wire contract. Do not log entries or credentials. */
export const OVERRIDE_LIMITS = { bytes: 262144, records: 500, milliseconds: 8000 } as const;
export type OverrideEntry = {
  meal_date: string; meal_name: string; item_name: string; quantity: number;
  reason: string; status: 'covered' | 'partial'; created_at: string;
  updated_at: string; cleared_at?: string | null;
};
export type OverrideSnapshot = {
  epoch: string; revision: number; hash: string; entries: OverrideEntry[];
};
export class OverrideFailure extends Error {
  constructor(readonly code: string) { super(code); }
}
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
export function equalSecret(supplied: string | null, expected: string | undefined): boolean {
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || !supplied || supplied.length !== 64) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
export function validateEntries(value: unknown): OverrideEntry[] {
  if (!Array.isArray(value) || value.length > OVERRIDE_LIMITS.records) throw new OverrideFailure('invalid_snapshot');
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new OverrideFailure('invalid_snapshot');
    const e = item as Record<string, unknown>;
    const required = ['meal_date', 'meal_name', 'item_name', 'quantity', 'reason', 'status', 'created_at', 'updated_at'];
    if (required.some((key) => !(key in e)) || Object.keys(e).some((key) => ![...required, 'cleared_at'].includes(key))) throw new OverrideFailure('invalid_snapshot');
    if (['meal_date', 'meal_name', 'item_name', 'reason', 'created_at', 'updated_at'].some((key) => typeof e[key] !== 'string' || !(e[key] as string).trim() || (e[key] as string).length > 2048) ||
        !Number.isSafeInteger(e.quantity) || (e.quantity as number) < 1 ||
        (e.status !== 'covered' && e.status !== 'partial') ||
        ('cleared_at' in e && e.cleared_at !== null && (typeof e.cleared_at !== 'string' || !e.cleared_at.trim()))) throw new OverrideFailure('invalid_snapshot');
    const identity = JSON.stringify([e.meal_date, e.meal_name, e.item_name]);
    if (seen.has(identity)) throw new OverrideFailure('duplicate_identity');
    seen.add(identity);
  }
  return value as OverrideEntry[];
}
export function snapshotBytes(entries: OverrideEntry[]): string {
  return `${JSON.stringify(entries)}\n`;
}
export function validateSnapshot(value: unknown): OverrideSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OverrideFailure('invalid_snapshot');
  const s = value as Record<string, unknown>;
  if (Object.keys(s).sort().join(',') !== 'entries,epoch,hash,revision' ||
      typeof s.epoch !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.epoch) ||
      !Number.isSafeInteger(s.revision) || (s.revision as number) < 1 ||
      typeof s.hash !== 'string' || !/^[a-f0-9]{64}$/.test(s.hash)) throw new OverrideFailure('invalid_snapshot');
  const entries = validateEntries(s.entries);
  const bytes = snapshotBytes(entries);
  if (Buffer.byteLength(bytes) > OVERRIDE_LIMITS.bytes || sha256(bytes) !== s.hash) throw new OverrideFailure('invalid_snapshot');
  return s as OverrideSnapshot;
}
export function makeSnapshot(epoch: string, revision: number, value: unknown): OverrideSnapshot {
  const entries = validateEntries(value);
  const bytes = snapshotBytes(entries);
  if (Buffer.byteLength(bytes) > OVERRIDE_LIMITS.bytes) throw new OverrideFailure('too_large');
  return validateSnapshot({ epoch, revision, entries, hash: sha256(bytes) });
}
export async function boundedBody(request: Request): Promise<unknown> {
  if (request.headers.has('content-encoding') || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw new OverrideFailure('invalid_request');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > OVERRIDE_LIMITS.bytes + 4096)) throw new OverrideFailure('invalid_request');
  const reader = request.body?.getReader();
  if (!reader) throw new OverrideFailure('invalid_request');
  const parts: Uint8Array[] = []; let size = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERRIDE_LIMITS.milliseconds);
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => {
    void reader.cancel().catch(() => undefined);
    reject(new OverrideFailure('deadline'));
  }, { once: true }));
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > OVERRIDE_LIMITS.bytes + 4096) throw new OverrideFailure('too_large');
      parts.push(value);
    }
  } finally { clearTimeout(timer); void reader.cancel().catch(() => undefined); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))); }
  catch { throw new OverrideFailure('invalid_request'); }
}
