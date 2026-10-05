# Implementation Plan: Dashboard Blob No-op Sync Suppression

Feature ID: `030-dashboard-blob-noop-sync-suppression`

Status: Final

## Summary

Add a deterministic publication guard to the meals-dashboard split-layout sync. The sync already skips unchanged data blobs via content hashes; this change extends the same principle to the bookkeeping blobs by skipping manifest and pointer writes when the computed manifest path and products-manifest pointer are unchanged.

## Implementation Strategy

1. Compute the new manifest content and hash before calling `writeManifest()`.
2. Compute the products-manifest path before pointer publication, preserving existing products-manifest write/dedup semantics.
3. Compare the computed main manifest path and computed products-manifest path against the existing pointer.
4. If no data/product/products-manifest blob was written and the pointer targets are identical, return a successful no-op result without `writeManifest()` or `writePointer()`.
5. Add explicit result metadata so logs/API callers can distinguish no-op suppression from failure.
6. Keep all non-no-op paths unchanged.

## Files Touched

| Path | Expected change |
|---|---|
| `/home/hermes/workspace/meals-dashboard/lib/dashboard-sync.ts` | Add deterministic manifest-path computation and no-op write suppression metadata. |
| `/home/hermes/workspace/meals-dashboard/lib/dashboard-sync.test.ts` | Add tests for no-op suppression and write-preservation cases. |
| `/home/hermes/workspace/meals-dashboard/app/api/dashboard-sync/route.ts` | Only if needed to expose/result-log the new suppression metadata. |
| `/home/hermes/workspace/Hermes-Skills/data-science/meals-check/.specify/specs/030-dashboard-blob-noop-sync-suppression/*` | Spec contract and traceability. |

## Files Not Touched

| Path | Reason |
|---|---|
| `/home/hermes/.hermes/scripts/tesco_meal_check.py` | Raw report and pipeline orchestration are unchanged. |
| `/home/hermes/workspace/meals-dashboard/lib/dashboard-data.ts` | Read path contract remains unchanged. |
| `/home/hermes/workspace/meals-dashboard/lib/blob-storage.ts` | Existing client write methods can remain as-is unless tests need a spy-friendly interface extension. |
| `/home/hermes/workspace/meals-dashboard/components/*` | No UI change. |
| Cron job configuration | No schedule or delivery behaviour change. |

## Data / API Shape

`SyncResult` may gain one or more fields, for example:

```ts
suppressedNoopWrites: boolean;
manifestWriteSkipped?: boolean;
pointerWriteSkipped?: boolean;
```

The exact names are implementation details, but the result must make the no-op suppression explicit.

## Algorithm Sketch

```ts
const pointer = await client.readPointer();
const currentManifest = pointer ? await client.readManifest(pointer.manifestPath) : {};
const currentManifestLoaded = Boolean(pointer);

// Existing hashing/dedup pass writes changed data/product blobs and builds newManifest.

const sortedManifestContent = serialiseManifest(newManifest);
const computedManifestHash = client.computeHash(sortedManifestContent);
const computedManifestPath = `meta/manifest-${computedManifestHash}.json`;
const computedProductsManifestPath = productsManifestPath ?? null;
const currentProductsManifestPath = pointer?.productsManifestPath ?? null;

const trueNoop =
  currentManifestLoaded &&
  writtenPaths.length === 0 &&
  pointer?.manifestPath === computedManifestPath &&
  currentProductsManifestPath === computedProductsManifestPath;

if (trueNoop) {
  return { manifestPath: computedManifestPath, suppressedNoopWrites: true, ... };
}

await client.writeManifest(newManifest);
await client.writePointer(computedManifestPath, computedProductsManifestPath);
```

The production implementation should avoid duplicating manifest serialisation logic between the pre-compute and `writeManifest()` path where practical.

## Test Plan

| Case | Expected result |
|---|---|
| True no-op with unchanged data + unchanged products manifest | `writeManifest` and `writePointer` not called; result indicates suppression. |
| Changed order/coverage/summary data | Data blob, manifest, and pointer written. |
| Changed product blob or products manifest | Products artefact plus manifest/pointer publication preserved. |
| Existing pointer missing | Manifest and pointer written. |
| Pointer exists but manifest read returns empty/missing | Manifest and pointer written; no suppression. |
| Dry run | No writes; optional no-op intent metadata allowed. |

## Rollout Plan

1. Implement and test locally on the meals-dashboard `preview` branch.
2. Deploy preview and verify `/api/dashboard-sync` still returns a valid manifest path.
3. Run a no-op sync against preview or production-safe data and confirm suppression metadata.
4. After Danny approval, deploy production.
5. Promote spec to Final only after production usage/evidence is captured.
