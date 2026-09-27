# As-working compatibility capture v2 (offline, not activated)

Task t_4fbca9e5 implements Meal Planner spec001 FR-016/017 and compatibility-capture-v2.md. Spec-only checkpoint209f285 was pushed before runtime changes. The working production baseline is621dd3cb2850ae807617e8f9f02231cc10df5830; writer/reader/producer/override code is unchanged. The scoped branch is deployment-disabled. No safety-B or operator-proposal runtime is included.

POST /api/internal/source-export additionally accepts exactly {"version":2,"mode":"compatibility"} using the existing export-only secret and expiry. Auth, HTTP denials, request caps, private/no-store headers, fresh SDK GET-only adapter and request-local deadline/backpressure are unchanged. Strict archive v1 and diagnosis v1/v2 are unchanged; old422/NOT_READY and review478 BLOCKED remain historical failures, not v2 successes.

The separate meal-planner-source-capture.v2 format preserves exact raw JSON bytes, category, safe path and SHA256 identities/content. It follows every dashboard/product-manifest reference, coverage order reference, item productBlobPath, and item.tpnc-derived products/{id}.json, even when the pointer products field is absent/null. Present empty overrides are positively read, not synthesized. Rereads cover all observations, pointer last; source movement fails409. Missing data/errors/integrity failures/invalid graph references fail422; deadline504. No partial capture, provider-text leakage, application logs, storage writes or listing.

Raw preservation does NOT certify application schema or repair legacy orderId/qty/other values. Assessment always reports raw-json-not-application-schema, references-only-history-unknown, not-inventoried history, not-certified behaviorParity and importReady:false. Product-pointer absent/null/reference and override empty/nonempty are derived and independently revalidated. Products can exist without a product-manifest pointer. Unknown fields stay raw; arbitrary unknown-field references and unreferenced history are not claimed discovered. This mode cannot establish a whole-store archive or migration completeness; a future bounded paginated inventory needs separate authority/design.

Limits remain1000 objects,1MiB/object,4MiB total including rereads,3.5MiB response and25 seconds. Source capture owns copied read buffers to prevent later provider mutation. No source reader is reused that would turn exceptions into empty results.

Review480 R1 found repeated cached-product hashing could starve the deadline timer. The first correction caches the digest of owned immutable bytes while preserving every expected-hash check and fresh reread hash. A monotonic request budget spans body reading, traversal and final response serialization; bounded cooperative yields service cancellation even for reference-free items. Expiration produces only504/deadline without an attachment. Checks surround bounded synchronous work; this is not OS-level preemption of an individual operation or a paused process. The original reviewer fixture and deterministic expiration/cancellation regressions are retained; independent same-card retest remains required.

Verification commands (synthetic only):

    MEALS_SOURCE_HISTORY_ROOT=/path/to/meals-dashboard-git MEAL_PLANNER_REVIEW_ROOT=/path/to/meal-planner-as-working npm test
    npx tsc --noEmit --incremental false
    npm run build
    npm run scan:static-private-data

Actual source621dd3c serializers/reader run inside a VM with in-memory SDK mocks. The new capture and independent Planner consumer preserve modern and legacy output byte-for-byte; actual reader results before/after preservation agree for tested fixtures. This is NOT live household parity. Include lib/source-capture.test.ts, lib/source-export-writer.test.ts and all existing strict-v1 regressions. New test/tool files are excluded from server tracing; no client capture/secret/sentinel marker is allowed.

No new concrete source-data defect distinct from deferred issue#1 was established: optional product pointers and legacy records are compatibility inputs, not repairs. R1 is a defect in this new compatibility implementation, corrected here rather than deferred as a production issue. Missing/integrity failures remain capture blockers, not ignored source bugs. Existing issue#1 and T011 are untouched/deferred.

Next gate: SAME-card independent tester with adversarial fixtures and exact pushed source readback. Only a later explicit activation contract may authorize secret configuration, exact deployment/alias/SSO/backup/rollback and a bounded private source read. t_ab800602 stays SCHEDULED; t_46e30b5f remains BLOCKED, no retry. No import/cutover or override authority transfer follows.
