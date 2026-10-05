---
name: dashboard-blob-noop-sync-suppression
description: "Suppress Vercel Blob manifest and pointer writes when a split-layout dashboard sync is a true no-op, reducing Advanced Operation usage without changing blob layout, dashboard data shape, or visible UI."
---

# Feature Specification: Dashboard Blob No-op Sync Suppression

Feature ID: `030-dashboard-blob-noop-sync-suppression`

Feature Name: Dashboard Blob No-op Sync Suppression

Target Skill: `data-science/meals-check`

Created: 2026-06-19

Status: Final

Change history: CHANGELOG.md

## Background

The meals-dashboard split Blob layout currently uses content-hash deduplication for order, coverage, summary, and product data blobs. If a data blob's computed hash matches the current manifest entry, the sync skips that data blob `put()`.

However, the sync still writes a new content-addressable manifest and rewrites `pointers/latest.json` on every non-dry-run sync. That means a true no-op sync can still consume Advanced Blob Operations for manifest `put()` and pointer `put()`, even when no order, coverage, summary, product, or products-manifest content changed.

Danny asked on 2026-06-19 for further ways to reduce Vercel Blob Advanced Operation usage after the prior `head()`/legacy-write reductions. The lowest-risk remaining write-side reduction is to detect when the computed manifest path and products-manifest pointer are unchanged, and skip the manifest + pointer writes entirely.

This spec is intentionally narrow. It does not change the split Blob layout, path scheme, product enrichment architecture, dashboard read path, demo mode, overrides flow, cron schedules, or Vercel deployment behaviour. It only changes the write decision for true no-op syncs.

## Promotion Criteria for Final

This spec is now `Status: Final, readiness: already_satisfied` after the implementation was deployed to the production meals-dashboard Vercel environment and verified with the local test/build suite. Preview-only deployment is necessary but not sufficient.

The status flips to `Final` and `readiness` to `already_satisfied` only when all of the following are verified against the production pipeline/dashboard path:

- A no-op sync where every data/product blob hash matches the current manifest returns successfully and does not call the Blob client's manifest or pointer write methods.
- A changed sync still writes the manifest and pointer, and the production dashboard renders the newly synced data normally.
- A first sync, missing pointer, or missing manifest still writes the manifest and pointer.
- The sync response/log output distinguishes no-op write suppression from a failed or skipped sync.
- Production evidence from a real or safely simulated no-op run shows Advanced Operation usage reduced by the two manifest/pointer writes compared with the previous behaviour.

This rule aligns with Danny's standing lifecycle rule that `Final` means verified in production, not merely committed or previewed.

## User Scenarios & Testing

### User Story 1 — Suppress writes for true no-op syncs (Priority: P1)

As Danny, when the meals-check pipeline runs but the computed dashboard Blob content is identical to the current split-layout state, I want the sync to avoid rewriting the manifest and pointer, so repeated scheduled checks do not burn Advanced Blob Operations unnecessarily.

**Why this priority**: The household runs multiple scheduled meals checks around delivery windows. When data has not changed, spending Advanced Operations on bookkeeping writes risks exhausting the Vercel Hobby allowance without improving dashboard freshness.

**Independent Test**: Seed an in-memory Blob client with an existing pointer, manifest, data blobs, and products manifest. Run `syncDashboardLayout()` with an identical payload and assert that no data blobs, manifest, or pointer are written, while the result reports no-op suppression and returns the current manifest path.

**Acceptance Scenarios**:
1. Given an existing pointer points to the same manifest path that the new payload would produce, and no data/product blobs changed, When the sync runs, Then it returns success without calling `writeManifest()` or `writePointer()`.
2. Given products are present and the computed products-manifest path is unchanged, When the no-op sync runs, Then `pointers/latest.json` is not rewritten solely to repeat the same `productsManifestPath` value.
3. Given the sync suppresses manifest/pointer writes, When the result is logged or returned by `/api/dashboard-sync`, Then the operator can tell the run was a deliberate no-op suppression rather than a failure.

### User Story 2 — Preserve writes when content or pointer state changes (Priority: P1)

As Danny, when the meals-check pipeline produces changed data, a changed products manifest, or an initial/missing Blob state, I want the sync to keep writing the manifest and pointer exactly as before, so cost optimisation never prevents new dashboard data from becoming visible.

**Why this priority**: The optimisation is only safe if it is impossible to hide new data behind an old pointer. Fresh receipts, refunds, override changes, product enrichment updates, and first-sync bootstrap must still publish reliably.

**Independent Test**: Run targeted tests for changed data, changed products manifest, missing pointer, and missing manifest states. Assert that all of those paths still call `writeManifest()` and `writePointer()` and return the new manifest path.

**Acceptance Scenarios**:
4. Given at least one order, coverage, summary, product, or products-manifest hash changes, When the sync runs, Then the manifest and pointer are written.
5. Given no pointer exists, When the sync runs, Then it writes the manifest and pointer even if the payload itself is internally stable.
6. Given the pointer exists but its referenced manifest is missing or unreadable, When the sync runs, Then it treats the run as needing publication and writes the manifest and pointer.
7. Given the computed main manifest path is unchanged but the computed products-manifest path differs from the pointer's products-manifest path, When the sync runs, Then the pointer is rewritten to publish the new products manifest reference.

## Requirements

### Functional Requirements

- **FR-001**: The sync MUST compute the would-be new manifest content and deterministic manifest path before deciding whether to write the manifest blob.

- **FR-002**: A sync MUST be considered a true no-op only when all of the following are true: an existing pointer was read, an existing manifest was read successfully, no data/product/products-manifest blob was written, the computed main manifest path equals the existing pointer's `manifestPath`, and the computed products-manifest path equals the existing pointer's `productsManifestPath` after normalising `undefined` and `null` consistently.

- **FR-003**: For a true no-op sync, the implementation MUST NOT call the Blob client's manifest-write method and MUST NOT call the pointer-write method. This suppresses the manifest `put()` and pointer `put()` Advanced Operations.

- **FR-004**: For any non-no-op sync, including changed data, changed products manifest, missing pointer, missing manifest, initial sync, or dry-run false publication, the implementation MUST preserve the existing publication behaviour: write the manifest and then write the pointer.

- **FR-005**: The returned `SyncResult` MUST include enough information for logs/API responses to distinguish a deliberate no-op suppression from a failed sync. This may be a new boolean such as `suppressedNoopWrites`, an operation-count field split, or equivalent explicit metadata.

- **FR-006**: The existing `writtenPaths` and `skippedPaths` semantics MUST remain understandable. A no-op sync should report the matched data/product blobs as skipped and should not fabricate manifest/pointer paths as written data blobs.

- **FR-007**: Dry-run behaviour MUST remain side-effect free. Dry-run may compute and report whether a no-op would be suppressed, but it MUST NOT write manifest or pointer blobs.

- **FR-008**: The optimisation MUST NOT change the split-layout path scheme, manifest content format, pointer content format, product blob layout, products-manifest format, or dashboard read path contract.

- **FR-009**: Tests MUST cover true no-op suppression, changed data publication, changed products-manifest publication, missing pointer bootstrap, missing manifest recovery, and dry-run behaviour.

### Non-Functional Requirements

- **NFR-001**: The change MUST reduce Advanced Blob Operation usage on repeated no-op syncs without adding new external services, secrets, or cron jobs.
- **NFR-002**: The implementation should keep the sync algorithm easy to audit: compute hashes, derive deterministic paths, compare to pointer, then publish only when required.
- **NFR-003**: The change should preserve existing dashboard deployment timing and report delivery behaviour. It must not delay raw report delivery or require Danny to manually inspect Vercel usage before a sync can complete.

### Key Entities

- **No-op sync**: A split-layout sync run whose computed data and pointer targets are identical to the currently published pointer/manifest state.
- **Computed manifest path**: The deterministic `meta/manifest-{hash}.json` path produced by hashing the new manifest content before writing it.
- **Computed products-manifest path**: The deterministic `meta/products-manifest-{hash}.json` path produced from the products manifest content, or `null` when no products manifest should be present.
- **Suppression metadata**: Explicit result/API/log field indicating that manifest/pointer writes were deliberately skipped because the run was a true no-op.

## Contract Impact

- `skill.spec.yaml` changes required: Yes — this spec directory is added to expected artifacts.
- Runtime secrets/config changes required: No.
- Dashboard runtime impact: Yes — repeated identical syncs consume fewer Advanced Blob Operations.
- Dashboard UI impact: None.
- Pipeline/report impact: None — raw meals-check report generation and Telegram delivery remain unchanged.
- Blob layout impact: None — this changes whether unchanged bookkeeping blobs are rewritten, not the paths or payload shape.

## Relationship to Other Specs

- **Spec 016 (`016-dashboard-blob-storage-layout`)** defines the split Blob layout, content-hash manifest, and mutable pointer. This spec preserves that architecture and adds a no-op publication guard.
- **Spec 017 (`017-dashboard-blob-read-path`)** consumes the pointer and manifest. This spec must keep the read path contract unchanged.
- **Spec 021 (`021-dashboard-product-enrichment-tesco-apollo`)** adds products and products-manifest references. This spec explicitly includes products-manifest equality in the no-op decision.
- **Spec 028 (`028-dashboard-blob-head-read-savings`)** reduced read-side Advanced Operations by replacing exact-path `list()` calls with `head()`. This spec is the write-side counterpart for no-op syncs.
- **Spec 029 (`029-dashboard-blob-error-surface`)** surfaces live-mode Blob read failures. This spec must not hide real write failures behind a no-op result; suppression only applies when the state is provably unchanged.

## Open Questions

- None for Proposed. Danny approved proceeding with this scope on 2026-06-19 after reviewing the remaining Advanced Operation reduction menu.

## Verification Plan

### Local verification

1. Add or extend `lib/dashboard-sync.test.ts` with targeted no-op and changed-publication tests.
2. Run targeted tests for `lib/dashboard-sync.test.ts` and `lib/blob-storage.test.ts`.
3. Run `npx tsc --noEmit` in `/home/hermes/workspace/meals-dashboard`.
4. Run `npx next build` if the sync result/API response type changes touch Next.js route code.
5. Run `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` in `/home/hermes/workspace/Hermes-Skills`.

### Production verification

1. Deploy implementation to preview for Danny review, then production after approval.
2. Run or observe a sync where dashboard payload hashes match the current production manifest.
3. Confirm the sync response/log indicates deliberate no-op write suppression.
4. Confirm the dashboard still renders normally from the existing pointer/manifest.
5. Compare Vercel Blob Advanced Operation usage against the previous no-op baseline and capture evidence before promoting to Final.
