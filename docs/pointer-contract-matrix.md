# Offline pointer compatibility matrix — 2026-09-27

Task t_ddbc1e39 / coder run469. Artifact classification: **diagnostic-only design/implementation**, not a compatibility relaxation, primary root-cause finding or activation. Full acceptance SHA256 `4fa92f819d1278c3c046afa30ac67f255f39d5a4eaef047c1569531106212b29`; runtime-provenance addendum SHA256 `7933725ec33f481a64fee3ddcb92df4af3b0308352b1a6e6e995c0d43ad0e577`. Same-card independent tester review is pending.

## Exact source and producer provenance

- Production source contract: `621dd3cb2850ae807617e8f9f02231cc10df5830`. This names the historical restored production source, not a fresh production observation.
- Reviewed v1 exporter candidate: `569dca7fab3fa8b3136c89d4d1733e7230cf3d7c`. Current recovery descends from it. `lib/blob-storage.ts`, `lib/dashboard-sync.ts`, `lib/dashboard-data.ts`, `scripts/sync-dashboard-data.py`, and `scripts/publication_recovery.py` are byte-identical at production, reviewed candidate and current source. Executable test checks all five against Git objects.
- Historical pre-products writer: `31ee07601b0a2b678e259fbf4d139824e1e36713:lib/blob-storage.ts` writes only manifestPath. Commit8c5aae0 added optional/null productsManifestPath. Current pointer constant is `POINTER_PATH = 'pointers/latest.json'` (`lib/blob-storage.ts:19`, exported at283), equal to exporter POINTER (`lib/source-export.ts:8`).
- Installed wrapper source `tesco_meal_check.py:77,106,1349,1380–1387` resolves configured dashboard.repo then invokes scripts/sync-dashboard-data.py. The caller's digest-verified addendum establishes that configuration resolves to `/home/hermes/workspace/meals-dashboard`, NOT the planner copy. No configuration/credential or protected backup was loaded in this run.
- Actual source publisher `scripts/sync-dashboard-data.py:1765–1800` and `scripts/publication_recovery.py:162–170,202–238` remove products from the main payload and send a separate products phase only for nonempty products. Thus a null products pointer can be an ordinary main-phase/interphase state or remain when no products are available; this is not proof about the primary request.
- `lib/dashboard-sync.ts:250–287,307–309,366–367` emits a product manifest only for nonempty products in main sync; otherwise pointer productsManifestPath is null. `syncDashboardProducts:405–489` writes an explicit empty manifest even for an empty products array when explicitly called. `invalidateCoverageForOrder:628–630` calls writePointer without products reference, resetting it to null even if a manifest remains reachable. None of these paths is modified here.
- `VercelBlobStorageClient.writePointer:193–205` serializes exactly manifestPath/productsManifestPath; no publication metadata is emitted. Protocol receipts live separately. `readPointer:73–89` and display reader `dashboard-data.ts:138–159,203–249` are tolerant; display can skip enrichment and derive product paths from item tpnc. Display fallback is not completeness validation.

## Compatibility matrix

All rows describe source semantics, not live household observations. The first three revisions above run through actual TypeScript writer and reader bodies transpiled from exact Git/current source with a synthetic in-memory SDK. No Python collector/publisher entrypoint runs to generate these fixtures. Separate explicit synthetic overrides are seeded as authoritative fixture input, never synthesized by export. Both actual planner readers are loaded from the supplied isolated checkout: `lib/source-export-archive.ts:15–49` and `lib/read-only-inventory.ts:109–150` at baseline2de12c2 (unchanged by this work).

| Stored shape / provenance | Writer/application display | Reviewed/current export | Independent consumer | Disposition |
| --- | --- | --- | --- | --- |
| Main products absent or [] | Actual main writer emits null; display loads successfully | 422 record_schema/pointer; v2 products_null | Raw-store inventory can be complete with no product refs; archive decoder rejects null | Supported display state, incomplete export evidence. Do not equate missing with empty. |
| Historical pre-products pointer | Actual historical writer emits only manifestPath | 422; v2 products_absent | Archive decoder rejects absent reference | Legacy display compatibility is not complete export authority. |
| Main sync with actual products | Actual writer produces both content-addressed manifests | Success, exact bytes preserved | Archive decoder and graph inventory complete; two retained orders checked | Complete synthetic active graph only. |
| Main then nonempty products phase | Independent products manifest added by actual writer | Success | Actual consumer complete | Same exact byte/hash/reference checks. |
| Main then explicit empty products phase | Actual writer creates {} manifest | Success only with positively present overrides | Actual consumer complete, products count0 | Positively verified empty manifest, NOT null-as-empty. No such live publication is authorized. |
| Coverage invalidation retains old manifest but resets pointer products field | Actual writer produces null | 422; products_null | Permissive store traversal cannot substitute for stricter archive evidence | No inferred/repaired reference. |
| Referenced products manifest missing | Display may skip missing enrichment | 422 provider_read/productsManifest | Missing reference blocks complete graph | Never synthesize {}. |
| Overrides absent | Outside the pointer writer's responsibility | 422 provider_read/overrides | Archive/graph validation require presence | Never synthesize []. |
| Legacy orderId/qty without required orderNumber/quantity | Main writer preserves malformed/legacy fields | 422 record_schema/orders after valid pointer | Graph inventory invalid_schema/complete:false | No unrelated legacy data repair. |
| Added pointer publicationProtocol metadata | Not emitted by inspected writer; tolerant readers ignore it | 422; pointer_keys | Existing archive decoder/raw inventory permit extras if other fields valid | Consumer asymmetry recorded, NOT a supported producer extension or export relaxation. |
| Pointer malformed object/main reference/product reference | Corrupt/unsupported, not a supported writer shape | 422 with fixed v2 invariant; v1 remains coarse | No type coercion or guessed paths | Closed fixed diagnosis only. |

The exporter still traverses every retained reference in the active manifests; it never lists or claims all orphaned historical objects. A main writer's rebuilt manifest is not evidence that historical source objects are complete. This scope is unchanged.

## What the evidence establishes

1. Observed source disagreement: the actual writer permits null/legacy absent products reference; display tolerates it; the archive contract requires positive product evidence. No defensible complete-archive correction follows without changing completeness policy.
2. Executed synthetic result: `lib/source-export-writer.test.ts` passes32 cases, including production/candidate/current writer runs, explicit empty/nonempty products, retained orders, missing manifests/overrides, invalidation and legacy records. Null/absent pointers reproduce closed rejection; valid writer-produced graphs pass the actual independent archive and inventory readers without reserialization of original records.
3. PRIMARY evidence remains only historical run468 HTTP422/incomplete/record_schema/pointer. It does not distinguish absent/null/type/path/extra-key conditions. No primary data or protected backup was accessed. No primary root cause is claimed.

## Diagnostic-only implementation and verification

Exact new request `{"version":2,"mode":"diagnose"}` returns format `meal-planner-source-diagnostic.v2`, outcome, stage, category, invariant. Fixed invariant vocabulary and precedence are in [source-export.md](source-export.md). Original v1 archive and four-field diagnosis remain unchanged. WeakMap identity retains immutable actual-site metadata, not duck-typed/provider fields. All unknown/non-pointer failures use none; no arbitrary keys, field-name reflection, logging, payload, URL, count, hash or attachment is added.

Specs were pushed/read back BEFORE runtime edits: planner `8e8787e296b275f2c8a1735b8d0d290d319c95e8`, source docs/deploy guard `1a08a9871f0878015a1b21b832e4f2aa205be865`. Branch coder/pointer-contract-20260927 disables Git automatic deployment. Final implementation SHA is recorded in the same-card review handoff and planner evidence.

Tests execute in credential-free tracked-source copies under coder scratch t_ddbc1e39, excluding .env*, .vercel, .verification-evidence and active .next. Installed node_modules are copied; prebuild generates only committed synthetic seed data. Environment is allowlisted, with no inherited credentials. Planner integration explicitly points PUBLICATION_PRODUCER_SCRIPTS at the isolated source scripts and uses synthetic HOME/checkpoints plus loopback test HTTP; never installed producer execution.

Executed final checks: focused438/3 files (405 route/core +32 writers +1 independent compatibility); full source903/49 files; full planner640/56 files; both `npx tsc --noEmit --incremental false`, `npm run build`, `npm run scan:static-private-data`; four governing spec tests. All final commands exit0, zero skipped tests in these scoped copies. Source trace has100 dependencies, zero forbidden paths; static client assets contain no export/diagnostic/auth/test-sentinel markers. Tests exercise both diagnostic versions' all-stage safety, hostile exceptions/enums, absent/null/malformed/extra-key pointers, deadlines/cancellation, mixed archive/diagnostic calls, strict input contracts and SDK get-only/no-log/nonmutation assertions.

Initial evidence retained: RED v2 produced103 expected failures before implementation; isolated full runs initially lacked the generated demo fixture (module/type failure; resolved with existing prebuild) and planner's sibling producer test path (timeout/child spawn failure; resolved with the existing explicit isolated-path override). Neither setup failure is relabelled a pass. Builds were successful even in the first full run. These are fixture-wiring corrections, not runtime/product changes.

## Residual gates

This work is diagnostic-only, not a complete export compatibility repair. SAME-card tester must independently execute the tests and map P1–P8. Original archive NOT_READY/T015 remains; t_ab800602 stays SCHEDULED; no historical failure or retry allowance is reset. Any later v2 activation requires new explicit exact-revision approval, correct v2 request/closed envelope, fresh protected configuration/expiry, alias-convergence and backup/rollback evidence. No live API, credential, source publication, deployment, import, authority handover, schedule change, protected household-backup read or deferred issue#1/T011 fix occurred. Migration-safety work belongs to serial t_d007ecc9, not this slice.
