import 'server-only';

export const DIAGNOSTIC_STAGES = Object.freeze(['complete', 'provider_read', 'provider_metadata', 'source_bound', 'record_json', 'record_schema', 'graph_schema', 'integrity', 'references', 'consistency', 'serialization', 'unknown'] as const);
export const DIAGNOSTIC_CATEGORIES = Object.freeze(['none', 'pointer', 'dashboardManifest', 'productsManifest', 'summary', 'coverage', 'orders', 'products', 'overrides'] as const);
export type DiagnosticStage = typeof DIAGNOSTIC_STAGES[number];
export type DiagnosticCategory = typeof DIAGNOSTIC_CATEGORIES[number];
type FailureCode = 'incomplete' | 'inconclusive' | 'deadline' | 'invalid_request';
type Details = Readonly<{ code: FailureCode; stage: DiagnosticStage; category: DiagnosticCategory }>;
// Internal identity, not instanceof/duck typing: never inspect hostile provider exceptions.
// Metadata belongs to an individual failure, not mutable last-read/request-global state.
const failures = new WeakMap<object, Details>();
const fallback: Details = Object.freeze({ code: 'incomplete', stage: 'unknown', category: 'none' });
export class ExportFailure extends Error {
  constructor(code: FailureCode, stage: DiagnosticStage = 'unknown', category: DiagnosticCategory = 'none') {
    const safeCode = typeof code === 'string' && ['incomplete', 'inconclusive', 'deadline', 'invalid_request'].includes(code) ? code : 'incomplete';
    super(safeCode);
    const safeStage = typeof stage === 'string' && DIAGNOSTIC_STAGES.includes(stage) && stage !== 'complete' ? stage : 'unknown';
    const safeCategory = typeof category === 'string' && DIAGNOSTIC_CATEGORIES.includes(category) ? category : 'none';
    failures.set(this, Object.freeze({ code: safeCode, stage: safeStage, category: safeCategory }));
  }
}
export function failureDetails(error: unknown): Details {
  return error !== null && (typeof error === 'object' || typeof error === 'function') ? failures.get(error) ?? fallback : fallback;
}
export function attributeFailure(error: unknown, stage: DiagnosticStage, category: DiagnosticCategory): ExportFailure {
  const detail = failureDetails(error);
  return new ExportFailure(detail.code, detail.stage === 'unknown' ? stage : detail.stage, detail.category === 'none' ? category : detail.category);
}
export function atStage<T>(stage: DiagnosticStage, category: DiagnosticCategory, action: () => T): T {
  try { return action(); } catch (error) { throw attributeFailure(error, stage, category); }
}
export async function atStageAsync<T>(stage: DiagnosticStage, category: DiagnosticCategory, action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) { throw attributeFailure(error, stage, category); }
}
export function verifyExport(ok: unknown, stage: DiagnosticStage, category: DiagnosticCategory): asserts ok {
  if (!ok) throw new ExportFailure('incomplete', stage, category);
}
const format = 'meal-planner-source-diagnostic.v1';
export const diagnosticSuccess = () => ({ format, outcome: 'valid', stage: 'complete', category: 'none' });
export function diagnosticFailure(error: unknown, aborted: boolean) {
  const detail = failureDetails(error);
  return { format, outcome: aborted ? 'deadline' : detail.code === 'invalid_request' ? 'incomplete' : detail.code, stage: detail.stage, category: detail.category };
}
