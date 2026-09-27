import 'server-only';
import { get } from '@vercel/blob';
import { boundedBytes, category, ExportFailure, type ExportReader } from './source-export';
import { atStageAsync, verifyExport } from './source-export-diagnostic';

/** Deliberately separate from BlobStorageClient: that client has writes/locks/logging. */
export function createSourceExportReader(token: string): ExportReader {
  return async (path, maxBytes, signal) => {
    const cat = category(path); verifyExport(cat, 'graph_schema', 'none');
    const result = await atStageAsync('provider_read', cat, () => get(path, { access: 'private', useCache: false, token, abortSignal: signal }));
    if (!result) return null; // absence is not an empty override/product manifest
    await atStageAsync('provider_metadata', cat, async () => {
      if (result.statusCode !== 200 || !result.stream || result.blob.pathname !== path || !Number.isSafeInteger(result.blob.size) || result.blob.size < 0 || !/^application\/json(?:;|$)/i.test(result.blob.contentType)) {
        if (result.stream) void result.stream.cancel().catch(() => {});
        throw new ExportFailure('incomplete');
      }
      if (result.blob.size > maxBytes) {
        void result.stream.cancel().catch(() => {});
        throw new ExportFailure('incomplete', 'source_bound', cat);
      }
    });
    const bytes = await atStageAsync('provider_read', cat, () => boundedBytes(result.stream!, maxBytes, signal));
    verifyExport(bytes.byteLength === result.blob.size, 'provider_metadata', cat);
    return bytes;
  };
}
