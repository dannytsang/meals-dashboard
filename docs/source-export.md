# Read-only source export (not activated)

Governing contract: Meal Planner spec001 FR-011–013 / AS-006–008, `source-export-contract.md`; spec-first checkpoint `e9b4082b78fc9772f3fbd4ce7adf308035ffaf44`. Task t_bf8099a8, caller acceptance v1 SHA-256 `845a38f2d489800e542a36b44be8461cd44ed16bdf7dca32592bceb58f893cda`.

## Boundary

`POST /api/internal/source-export` is an opt-in Node server route. POST is read transport, not permission to mutate. It imports only the fresh Blob `get` SDK function through a separate read-only adapter, never the legacy writer/locking adapter, producer, reporting or override route. No list operation: all retained historical references in the active dashboard/product graphs are followed without date filtering. Orphans/old unreachable manifests and publication journals are outside this graph, not silently claimed exported. The existing OIDC/browser, publisher, verification and override boundaries are unchanged.

Disabled/invalid configuration and unsupported methods return generic 404. Only `x-source-export-secret` authorizes the POST. Browser sessions, `x-dashboard-secret`, verification credentials and query tokens do not. Wrong/missing export auth is 401. Body is exactly JSON `{"version":1}`, content type application/json, maximum 256 actual streamed bytes; query strings, unknown fields and encoded bodies fail (400). All responses are JSON with private/no-store and nosniff. Success has a fixed attachment filename. No application logging or provider metadata/URLs in diagnostics.

Configuration names only (none configured by this implementation):
- `MEALS_SOURCE_EXPORT_ENABLED=1`
- `MEALS_SOURCE_EXPORT_SECRET`: 64 lowercase hex characters generated from 32 random bytes through secure configuration; never put the value in chat, Git, logs or argv.
- `MEALS_SOURCE_EXPORT_EXPIRES_AT`: future UTC ISO timestamp; after expiry the route refuses requests.
- Existing runtime `BLOB_READ_WRITE_TOKEN`, server-side only. No local token retrieval or OIDC fallback/bypass. Export secret cannot equal this token, `MEALS_DASHBOARD_DATA_SECRET`, `MEALS_PUBLICATION_VERIFY_SECRET` or `NEXTAUTH_SECRET`.

One in-flight export per process gives bounded local backpressure (429); it is not a cross-instance ingress/rate limit. Activation must assess Vercel deployment protections/ingress restrictions separately.

## Versioned private archive

Envelope `meal-planner-source-export.v1`, scope `active-reachable-with-retained-history`, consistency `observed-records-rechecked-not-atomic`, atomicSnapshot false. Sorted records contain only `path`, `identity` (SHA-256 UTF-8 path), `sha256` (exact original bytes), `bytes`, `base64`. Paths and payloads are sensitive inside this authenticated response; do not log responses.

Requires active pointer and both manifests, one summary, reachable coverage/orders/products/product manifests, and present authoritative `overrides/manual.json`. Empty product manifest and override array succeed only when read and validated, never synthesized from missing objects/errors. Strict JSON and storage schema, content hashes, cross references and identity checks precede success. Every observed object is read twice with cache disabled, pointer last; movement/disappearance on reread returns inconclusive409. This cannot exclude ABA changes or prove a transactionally atomic whole-store snapshot. Missing/corrupt/unsupported/excessive graph or storage error returns closed incomplete422, never a partial archive; deadline returns504.

Strict scalar compatibility follows the stored schemas: override/coverage/order statuses are primitive enum strings; only order status may be absent (legacy active). Order-item `tpnc` is a decimal-digit string (leading zeros preserved), null or absent, never a JSON number/array/object coerced to a string. Coverage order references are strings or null; order and meal IDs remain strings. Invalid values fail closed without an archive; the independent offline validator must reject them too.

Bounds: 1,000 records, 1 MiB/object, 4 MiB source bytes including rereads, 3.5 MiB serialized response, 25-second request deadline, 30-second platform maxDuration. Oversized and stalled streams are cancelled; limits are not caller-configurable.

The later authorized inventory must capture privately outside Git in a 0700 directory/0600 file, with bounded private transport and short-lived retention. Meal Planner's `inventory:offline -- --source-export <private-file> --target <readonly-store>` reads it in memory without extracting/writing records, validates original bytes and independently traverses schemas/hashes/references. Only sanitized reports belong in evidence. An export HTTP200 alone is not history completeness, parity or import readiness.

## Synthetic verification

- `npx vitest run lib/source-export.test.ts`
- `MEAL_PLANNER_REVIEW_ROOT=/path/to/meal-planner npx vitest run scripts/source-export-compatibility.test.ts` exercises actual independent archive and graph readers. Without that explicit checkout, the cross-repo test is skipped, not passed.
- `MEAL_PLANNER_REVIEW_ROOT=/path/to/meal-planner MEALS_SOURCE_HISTORY_ROOT=/path/to/meals-dashboard-git npx vitest run lib/source-export.test.ts scripts/source-export-compatibility.test.ts lib/source-export-writer.test.ts` runs actual historical/current writer fixtures and both independent consumers. Execute from a sanitized isolated copy, not the scheduled producer checkout. History root is Git-object read-only; it never executes installed publisher scripts. Missing roots skip the matrix and are unverified, not passed.
- `MEAL_PLANNER_REVIEW_ROOT=/path/to/meal-planner MEALS_SOURCE_HISTORY_ROOT=/path/to/meals-dashboard-git npm test`
- `npm run prebuild` generates the committed synthetic demo seed before isolated suites/typechecks; do not copy a runtime-generated fixture from the active checkout.
- `npx tsc --noEmit && npm run build && npm run scan:static-private-data`

Inspect `.next/server/app/api/internal/source-export/route.js.nft.json`: no credential files, test files, scripts, producer or legacy storage dependencies. Check `.next/static` for export auth/format/test-sentinel leakage. SDK write/list spies must remain untouched. Test fixtures are synthetic only.

## Closed diagnosis v1 (source only; not activated)

FR-014/AS-009 in the owning source-export-contract.md adds exact body `{"version":1,"mode":"diagnose"}` under identical export config/auth/expiry/bounds. The original `{"version":1}` archive behavior is unchanged. Diagnosis exercises the same strict graph, hashes, references, rereads and archive serialization cap, then discards the archive. Response has ONLY primitive `format`, `outcome`, `stage`, `category` fields; no attachment, IDs/paths/counts/hashes/URLs/timing/private data/provider text or application logging.

Format is `meal-planner-source-diagnostic.v1`; outcomes valid/incomplete/inconclusive/deadline map to200/422/409/504. Success uses complete/none. Stages are complete/provider_read/provider_metadata/source_bound/record_json/record_schema/graph_schema/integrity/references/consistency/serialization/unknown. Categories are none/pointer/dashboardManifest/productsManifest/summary/coverage/orders/products/overrides. Denials and deadlines before a validated diagnostic body remain unchanged closed errors. Actual failure-site attribution is local to each typed failure, never last-read state. Unknown exceptions are not inspected/coerced. No schema/data repair or acceptance relaxation.

Task t_f3fa5dba diagnosis-v1 SHA256250c57dddfe5b7a80aa26ef37144bc79f2b2e1441bc69284c0098051d089a56c authorizes synthetic source work and independent tester review only. Spec-first planner checkpoint d6fa8c117ac2648df3e0225148763969c22fa92a was pushed before runtime edits. Scoped source branch coder/source-diagnosis-20260927 disables Git deployment in vercel.json; pushing is not permission for any deployment.

Historical original source review run456 passed with notes. Run457's sole live archive request returned422/incomplete/no archive; run458 independently verified rollback and NOT_READY. Run459 reproduced a null products pointer in the LOCAL secondary backup only; PRIMARY cause remains unknown. These failures are not waived by diagnostic implementation or review.

Later activation requires explicit approval naming the exact independently accepted new source commit, protected short-lived credential/expiry/SSO, fresh production mapping and backup/rollback checks, denial probes and at most ONE bounded authenticated diagnostic-only request, not another archive attempt. Historical rollback target621dd3c/dpl_E5veKiZjjbXtaYZWb4962pcgTpLh must be freshly verified. Restore exact preactivation aliases/deployment and remove only newly created export env on failure; immutable deployment env may persist until expiry. No new secret, Vercel API call, diagnostic deployment/live request, source-data repair or inventory release is authorized now. t_ab800602 stays scheduled; migration remains Proposed.

## Pointer invariant diagnosis v2 (implemented, independent review pending; not activated)

Offline recovery task t_ddbc1e39 / acceptance SHA2564fa92f819d1278c3c046afa30ac67f255f39d5a4eaef047c1569531106212b29 adds only exact `{"version":2,"mode":"diagnose"}`. Existing archive v1 and diagnostic v1 remain unchanged. V2 envelope has exactly format `meal-planner-source-diagnostic.v2`, outcome, stage, category, and invariant. Closed invariant enum: none/pointer_object/main_absent/main_invalid/products_absent/products_null/products_invalid/pointer_keys. Actual pointer record-schema sites only; precedence object → main presence/type/path → products presence/null/type/path → allowed keys. All other failure sites and success use none. No input-derived names, values, metadata or logging; maximum256B, no attachment. Same auth/expiry/get-only/bounds/cancellation/backpressure and graph validation.

Actual source621dd3c and reviewed569dca7 writer/readers are identical. Main sync without products writes null, historical pre-products writer omitted the field, and tolerant UI rendering is not proof of complete product evidence. Missing/null manifests and missing overrides stay incomplete; no arbitrary metadata allowance or fabricated archive. Run468 primary pointer-stage evidence cannot identify a field. This is diagnostic-only source work; no publisher code change, data repair or activation.

Source branch coder/pointer-contract-20260927 has Git automatic deployment disabled before push. [Writer/reader/exporter/consumer matrix and executed evidence](pointer-contract-matrix.md) distinguish actual supported display formats from complete archive evidence. Independent SAME-card tester review and exact source commit are required before a later explicit v2 activation decision. Preserve failed archive/rollback history and live retry budgets; t_ab800602 remains scheduled. Fresh configuration/expiry/alias-convergence/backup/rollback evidence is a later gate, not authority granted here.

## Separate activation and rollback gate

Source-level independent tester approval is required first. Then the caller must establish exact Vercel project/deployment mapping, secure distinct secret and expiry, allowed ingress, current private backup/restore safety, reviewed-revision deployment and exact-production bad/missing-secret denial plus bounded private readback. No configuration, deployment or live export is performed on the implementation card. Existing inventory t_ab800602 remains scheduled until that gate and caller release; do not duplicate its graph.

Rollback: disable export flag and remove/revoke only the export credential, then remove route in a separately reviewed revision if appropriate. Do not rotate publisher secrets or alter Vercel primary/override authority. No import, cutover, schedule/worker/producer change, retirement, or deferred issue #1/T011 fix is authorized.
