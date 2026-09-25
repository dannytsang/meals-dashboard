import 'server-only';
import { randomBytes } from 'node:crypto';
import type { BlobStorageClient } from './blob-storage';

const JOURNAL = 'publication/latest.json';
type Phase = 'main' | 'products';
interface Identity { version: 1; runId: string; generation: number; target: string; phase: Phase }
interface Receipt { hash: string; result?: Record<string, unknown> }
interface Journal { generation: number; runId: string; target: string; phases: Partial<Record<Phase, Receipt>> }

export class PublicationError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function parseIdentity(raw: unknown, phase: Phase): Identity {
  const p = raw as Identity | null;
  if (!p || p.version !== 1 || !/^[a-f0-9]{32}$/.test(p.runId) ||
      !Number.isSafeInteger(p.generation) || p.generation <= 0 ||
      !['primary', 'secondary'].includes(p.target) || p.phase !== phase) {
    throw new PublicationError(400, 'Invalid publication identity');
  }
  return p;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Bounded receipt journal, not a queue. Caller authenticates/validates first. */
export async function publishRecoverably<T extends object>(
  client: BlobStorageClient, body: Record<string, unknown>, phase: Phase, dryRun: boolean,
  operation: (unlocked: BlobStorageClient) => Promise<T>,
): Promise<T & { publicationProtocol?: number }> {
  const enabled = process.env.MEALS_PUBLICATION_PROTOCOL === '1';
  if (!enabled) {
    if (body.publication !== undefined) throw new PublicationError(503, 'Publication protocol not enabled');
    return operation(client);
  }
  const explicit = body.publication === undefined ? null : parseIdentity(body.publication, phase);
  if (!client.withLock) throw new PublicationError(503, 'Publication serialization unavailable');
  return client.withLock(async () => {
    // The outer transaction owns the lock. Do not recursively acquire it in sync.
    const unlocked = Object.create(client) as BlobStorageClient;
    unlocked.withLock = undefined;
    const previous = await client.readJsonBlob<Journal>(JOURNAL);
    if (previous && (!Number.isSafeInteger(previous.generation) || previous.generation <= 0 ||
        !/^[a-f0-9]{32}$/.test(previous.runId) || !['primary', 'secondary'].includes(previous.target) ||
        !previous.phases || typeof previous.phases !== 'object' || Array.isArray(previous.phases) ||
        Object.entries(previous.phases).some(([key, value]) => !['main', 'products'].includes(key) ||
          !value || typeof value !== 'object' || !/^[a-f0-9]{64}$/.test(value.hash) ||
          (value.result !== undefined && (!value.result || typeof value.result !== 'object' || Array.isArray(value.result)))))) {
      throw new PublicationError(503, 'Publication journal unavailable');
    }
    const id = explicit ?? { version: 1, runId: randomBytes(16).toString('hex'),
      generation: Math.max(Date.now() * 1000, (previous?.generation ?? 0) + 1), target: previous?.target ?? 'primary', phase };
    if (previous && (id.generation < previous.generation ||
        (id.generation === previous.generation && (id.runId !== previous.runId || id.target !== previous.target)))) {
      throw new PublicationError(409, 'Publication superseded');
    }
    const hash = client.computeHash(canonical(body));
    const journal: Journal = previous?.generation === id.generation ? previous : {
      generation: id.generation, runId: id.runId, target: id.target, phases: {},
    };
    const receipt = journal.phases[phase];
    if (receipt && receipt.hash !== hash) throw new PublicationError(409, 'Publication identity conflict');
    if (receipt?.result) return receipt.result as T & { publicationProtocol: number };
    if (phase === 'products' && body.mainManifestPath) {
      const pointer = await client.readPointer();
      if (pointer?.manifestPath !== body.mainManifestPath) throw new PublicationError(409, 'Main publication superseded');
    }
    if (dryRun) return { ...await operation(unlocked), publicationProtocol: 1 };
    journal.phases[phase] = { hash };
    // Reserve before mutable writes; failure cannot permit an older generation.
    await client.writeBlobIfChanged(JOURNAL, JSON.stringify(journal), {});
    const result = { ...await operation(unlocked), publicationProtocol: 1 };
    journal.phases[phase] = { hash, result };
    await client.writeBlobIfChanged(JOURNAL, JSON.stringify(journal), {});
    return result;
  });
}
