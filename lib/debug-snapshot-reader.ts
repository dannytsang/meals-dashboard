import 'server-only';
import type { DashboardDataReader } from './dashboard-data';

/** Keep a diagnostic request on one committed graph, even if latest advances. */
export function pinDashboardReader(reader: DashboardDataReader): DashboardDataReader {
  let pointer: ReturnType<DashboardDataReader['readPointer']> | undefined;
  return {
    readPointer: () => pointer ??= reader.readPointer(),
    readManifest: (path) => reader.readManifest(path),
    readJsonBlob: <T>(path: string) => reader.readJsonBlob<T>(path),
    listPaths: (prefix) => reader.listPaths(prefix),
  };
}
