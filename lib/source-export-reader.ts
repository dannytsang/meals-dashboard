import 'server-only';
import { get } from '@vercel/blob';
import { boundedBytes, category, ExportFailure, type ExportReader } from './source-export';

/** Deliberately separate from BlobStorageClient: that client has writes/locks/logging. */
export function createSourceExportReader(token: string): ExportReader {
  return async (path, maxBytes, signal) => {
    if (!category(path)) throw new ExportFailure('incomplete');
    const result = await get(path, { access: 'private', useCache: false, token, abortSignal: signal });
    if (!result) return null; // absence is not an empty override/product manifest
    if (result.statusCode !== 200 || !result.stream || result.blob.pathname !== path || !Number.isSafeInteger(result.blob.size) || result.blob.size < 0 || result.blob.size > maxBytes || !/^application\/json(?:;|$)/i.test(result.blob.contentType)) {
      if (result.stream) void result.stream.cancel().catch(() => {});
      throw new ExportFailure('incomplete');
    }
    const bytes = await boundedBytes(result.stream, maxBytes, signal);
    if (bytes.byteLength !== result.blob.size) throw new ExportFailure('incomplete');
    return bytes;
  };
}
