# Implementation Plan: Dashboard Debug Observability Panels

Feature ID: `031-dashboard-debug-observability-panels`

Status: Proposed

## Goal

Extend the existing spec-022 debug surface with four operator-facing observability panels that explicitly expose all of the high-value diagnostics Danny asked for: runtime mode/gating, full Blob storage provenance, per-stage Blob read status, freshness/age fields, product-resolution provenance, and richer items-by-category provenance.

## Architecture Summary

This feature is an additive extension of the existing spec-022 debug architecture. It should reuse the existing `/debug` shell and server-gated `/api/debug/*` route pattern rather than inventing a second debug system. Each new panel should be backed by one typed server payload derived from the same runtime state the dashboard already uses.

The design principle is explanation, not simulation: the debug payloads should expose the dashboard's actual chosen path (`demo` vs `live`, Blob credential sufficiency, cookie verification state, which blob paths loaded, which read stage failed, how old the rendered data is, and which product source won) rather than recomputing alternative business logic in parallel.

## Files Touched (expected implementation scope)

| Path | Purpose |
|---|---|
| `/home/hermes/workspace/meals-dashboard/app/debug/page.tsx` | Extend the existing debug shell entry point to include the new panels. |
| `/home/hermes/workspace/meals-dashboard/components/debug-shell.tsx` | Add panel registration, ordering, refresh, and copy affordances for the new payloads. |
| `/home/hermes/workspace/meals-dashboard/app/api/debug/runtime-context/route.ts` | New gated route returning safe runtime-mode/gating context. |
| `/home/hermes/workspace/meals-dashboard/app/api/debug/blob-read-freshness/route.ts` | New gated route returning Blob-path, load-state, and freshness provenance. |
| `/home/hermes/workspace/meals-dashboard/app/api/debug/product-resolution/route.ts` | New gated route returning selected-item product-resolution provenance. |
| `/home/hermes/workspace/meals-dashboard/app/api/debug/items-by-category/route.ts` | Extend existing payload with candidate-order / coverage-window provenance. |
| `/home/hermes/workspace/meals-dashboard/components/runtime-context-debug-panel.tsx` | New panel component for runtime mode/gating. |
| `/home/hermes/workspace/meals-dashboard/components/blob-read-freshness-debug-panel.tsx` | New panel component for Blob-path/load/freshness provenance. |
| `/home/hermes/workspace/meals-dashboard/components/product-resolution-debug-panel.tsx` | New panel component for selected-item provenance. |
| `/home/hermes/workspace/meals-dashboard/components/items-by-category-debug-panel.tsx` | Extend existing panel to surface the new provenance fields. |
| `/home/hermes/workspace/meals-dashboard/lib/debug-types.ts` or equivalent | Shared payload types / discriminated union extensions for the new panels. |
| `/home/hermes/workspace/meals-dashboard/lib/dashboard-data.ts` | Source of truth for read-path/freshness state if helper extraction is required. |
| `/home/hermes/workspace/meals-dashboard/lib/dashboard-ui-utils.ts` | Source of truth for product-resolution provenance if helper extraction is required. |
| `/home/hermes/workspace/meals-dashboard/lib/debug-mode.ts` / `lib/debug-cookie.ts` | Existing gate helpers remain authoritative if payloads need safe cookie-state derivation. |
| `/home/hermes/workspace/meals-dashboard/**/*.test.ts(x)` | Targeted unit/integration tests for the new routes/panels. |

## Files Explicitly Not Touched

| Path | Reason |
|---|---|
| `scripts/sync-dashboard-data.py` | This feature is read-only debug observability, not pipeline logic. |
| `lib/blob-storage.ts` | Blob SDK/storage mechanics are owned by specs 028/030, not this feature. |
| `app/api/debug/toggle/route.ts` | The existing enable/disable route from spec 022 remains the single debug switch. |
| `components/user-menu.tsx` | Spec 026 already owns the Debug-row affordance; this feature only reports effective state. |
| `lib/product-database.ts` | This feature reports product-resolution outcomes but does not alter the curated data source. |

## Implementation Phases

### Phase 1 — Shared payload design

1. Extend the spec-022 debug-panel type union with `runtime-context`, `blob-read-freshness`, and `product-resolution` members.
2. Define safe payload shapes up front, including the exact enum/string labels for cookie state and source provenance.
3. Add redaction helpers so secret-bearing values cannot accidentally cross the route boundary.

### Phase 2 — Runtime context panel

1. Add the new gated route for runtime context.
2. Derive `runtimeMode`, `blobCredentialsState`, `debugCookieState`, `activeReader`, request path, deployment ID, and safe user-display provenance from existing server state.
3. Render the runtime-context panel in the debug shell.

### Phase 3 — Blob read / freshness panel

1. Add a helper that exposes the chosen `pointerPath`, `manifestPath`, `productsManifestPath`, selected `orderBlobPath`, selected `coverageBlobPaths`, and selected `productBlobPath` from the existing dashboard read path.
2. Surface per-stage read status fields (`pointerRead`, `manifestRead`, `summaryRead`, `orderRead`, `coverageRead`, `productRead`) and any sanitised stage-specific error state.
3. Thread through the most useful freshness timestamps/ages: `dataGeneratedAt`, `uiUpdatedAt` when available, `latestOrderDate`, product `lastFetched`, and Firecrawl `lastFetched`.
4. In demo mode, explicitly report that Blob reads were bypassed and the fixture path is active.
5. Render the Blob read / freshness panel in the debug shell.

### Phase 4 — Product-resolution panel

1. Decide the stable lookup key for the currently inspected grocery item (tpnc preferred when known, otherwise an existing stable item identifier).
2. Add a new gated route that resolves the selected item's provenance from the same helpers the modal/read path already uses.
3. Surface winning source and fallback chain for at least description/image/storage/preparation, plus `tpnc` and `productBlobPath` when known.
4. Render the product-resolution panel in the debug shell.

### Phase 5 — Items-by-category provenance enrichment

1. Extend the existing items-by-category route payload to include candidate-order path/date, coverage-window provenance, chosen filter state, and null-reason provenance.
2. Keep the existing fields intact for backward compatibility with the current panel.
3. Update the panel rendering so the new fields make the `latestOrder`-is-null case legible at a glance.

### Phase 6 — Verification and hardening

1. Add tests for live-mode vs demo-mode runtime context and Blob credential sufficiency.
2. Add tampered-cookie reporting tests.
3. Add Blob failure, path-provenance, and per-stage read-status tests.
4. Add freshness/staleness tests covering `dataGeneratedAt`, `uiUpdatedAt`, and product / Firecrawl ages where available.
5. Add product-resolution tests covering Apollo, Firecrawl, placeholder, and field-level source outcomes.
6. Add the items-by-category regression test for the coverage-window-filtered order case.
7. Run `tsc`, targeted tests, and `next build`.

## Risks and Mitigations

- **Risk: duplicating business logic in debug helpers** — Mitigation: derive payloads from existing read-path helpers/types wherever possible; avoid separate recomputation trees.
- **Risk: accidental secret leakage** — Mitigation: redaction helper + explicit forbidden-fields tests for tokens, raw cookie signatures, signed Blob URLs, and headers.
- **Risk: panel sprawl** — Mitigation: fixed default panel order, collapsible cards, concise top-level summaries, raw JSON only behind copy/expand affordances, and keep the always-visible summary fields to high-value items like paths, stage status, freshness ages, and winning source labels.
- **Risk: product-selection ambiguity** — Mitigation: use the same stable item identity the product-detail modal already uses, rather than inventing a debug-only selector model.

## Verification Commands

```bash
cd /home/hermes/workspace/meals-dashboard
npx tsc --noEmit
npx vitest run
npx next build

cd /home/hermes/workspace/Hermes-Skills
python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check
```
