import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { boundedBytes, EXPORT_LIMITS, ExportFailure, exportSource, object } from '@/lib/source-export';
import { parseExportJson } from '@/lib/source-export-json';
import { createSourceExportReader } from '@/lib/source-export-reader';
import { diagnosticSuccess, diagnosticFailure, failureDetails } from '@/lib/source-export-diagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
let active = false; // per-instance backpressure, not a distributed rate limiter
const digest = (s: string) => createHash('sha256').update(s).digest();
const response = (value: unknown, status: number, attachment = false) => new Response(JSON.stringify(value), {
  status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    ...(attachment ? { 'Content-Disposition': 'attachment; filename="source-export.json"' } : {}),
  },
});
const unavailable = () => response({ error: 'unavailable' }, 404);
export const GET = unavailable;
export const HEAD = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;
export const OPTIONS = unavailable;

/** POST is bounded read transport; there is intentionally no storage mutation path. */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MEALS_SOURCE_EXPORT_SECRET, token = process.env.BLOB_READ_WRITE_TOKEN;
  const expires = process.env.MEALS_SOURCE_EXPORT_EXPIRES_AT;
  if (process.env.MEALS_SOURCE_EXPORT_ENABLED !== '1' || !secret || !/^[a-f0-9]{64}$/.test(secret) || secret.length !== 64 || !token || !expires || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expires) || !(Date.parse(expires) > Date.now()) || [process.env.MEALS_DASHBOARD_DATA_SECRET, process.env.MEALS_PUBLICATION_VERIFY_SECRET, process.env.NEXTAUTH_SECRET, token].includes(secret)) return unavailable();
  const supplied = request.headers.get('x-source-export-secret');
  if (!supplied || supplied.length > 1024 || !timingSafeEqual(digest(supplied), digest(secret))) return response({ error: 'unauthorized' }, 401);
  if (new URL(request.url).search || request.headers.has('content-encoding') || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return response({ error: 'invalid_request' }, 400);
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > EXPORT_LIMITS.requestBytes)) return response({ error: 'invalid_request' }, 400);
  if (active) return response({ error: 'busy' }, 429);
  active = true;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(abort, EXPORT_LIMITS.milliseconds);
  let diagnose = false; // only set after full bounded request validation
  let diagnosticVersion: 1 | 2 = 1;
  try {
    let input: unknown;
    try {
      if (!request.body) throw new ExportFailure('invalid_request');
      input = parseExportJson(await boundedBytes(request.body, EXPORT_LIMITS.requestBytes, controller.signal));
      if (!object(input)) throw new ExportFailure('invalid_request');
      const archiveRequest = input.version === 1 && Object.keys(input).length === 1;
      const diagnosticRequest = (input.version === 1 || input.version === 2) && input.mode === 'diagnose' && Object.keys(input).length === 2;
      if (!archiveRequest && !diagnosticRequest) throw new ExportFailure('invalid_request');
      diagnose = diagnosticRequest;
      diagnosticVersion = input.version === 2 ? 2 : 1;
    } catch {
      if (controller.signal.aborted) throw new ExportFailure('deadline');
      throw new ExportFailure('invalid_request');
    }
    const archive = await exportSource(createSourceExportReader(token), controller.signal);
    return diagnose ? response(diagnosticSuccess(diagnosticVersion), 200) : response(archive, 200, true);
  } catch (e) {
    const code = controller.signal.aborted ? 'deadline' : failureDetails(e).code;
    const value = diagnose ? diagnosticFailure(e, controller.signal.aborted, diagnosticVersion) : { error: code };
    return response(value, code === 'invalid_request' ? 400 : code === 'inconclusive' ? 409 : code === 'deadline' ? 504 : 422);
  } finally {
    controller.abort(); clearTimeout(timer);
    request.signal.removeEventListener('abort', abort); active = false;
  }
}
