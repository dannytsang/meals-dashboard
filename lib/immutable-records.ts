import { createHash } from 'node:crypto';

/** Physical reference for exact stored bytes; logical IDs remain inside data. */
export function immutableRecordPath(logicalPath: string, content: string): string {
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');
  return logicalPath.replace(/\.json$/, `-${hash}.json`);
}

export function logicalRecordPath(path: string): string {
  return path.replace(/-[a-f0-9]{64}\.json$/, '.json');
}
