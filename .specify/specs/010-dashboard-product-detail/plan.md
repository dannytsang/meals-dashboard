# Implementation Plan: Dashboard Product Detail

Status: Proposed (Rev 4 — static fallback removed; Rev 5 — debug-mode product-resolution chip on the modal; Rev 5.1 — expected-vs-actual productBlobPath in the chip)
Feature: 010-dashboard-product-detail
Skill: data-science/meals-check

## Summary

This feature captures the dashboard product detail overlay with product lookup, substitutions, images/icons, and price. The shared Product Info Modal opens from both Order Item Row clicks and matched-item clicks in the Meal Detail Overlay. It is Proposed for pre-enriched Tesco product metadata so product detail opens quickly from generated dashboard data rather than performing slow client-side searches. **Rev 4 (2026-06-22)**: the static `lib/product-database.ts` substring-match fallback is removed. When generated pre-enriched Tesco product metadata is unavailable, the modal shows the truthful placeholder ("Product information not available in generated data") rather than silently inventing details from a hand-curated 38-entry map. The category-icon 16-key emoji mapping and the loading/unavailable states are preserved because they are honest UI affordances, not invented product content. **Rev 5 (2026-06-23)**: when spec 022's signed `meals_debug_mode` cookie is effectively verified-on, the Product Detail Modal surfaces a small debug chip / inline panel that shows the product-resolution chain (`tpnc`, `productBlobPath`, winning source per field, freshness timestamps). The chip inherits the spec-022 OIDC + signed-cookie gate, reads from the spec 031 product-resolution data source, and renders nothing when debug mode is off. **Rev 5.1 (2026-06-23)**: the chip additionally surfaces `expectedProductBlobPath` (derived from the spec 021 Key Entities convention `products/{tpnc}.json`) and `productBlobPathMatch: true | false | null` so convention drift between actual and expected productBlobPath is visible inline. The convention is sourced from spec 021 Key Entities; this spec never hardcodes it.

## Technical Context

- Runtime profile: `chef`
- Dashboard repository: `/home/hermes/workspace/meals-dashboard`
- Primary implementation evidence: /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 89-140, 461-465, and 554-633
- Generated data source: `/home/hermes/workspace/meals-dashboard/lib/real-data.ts`, produced from meals-check dashboard cache sync
- Contract artifacts: `SKILL.md`, `skill.spec.yaml`, this feature directory, and `CHANGELOG.md`

## Constitution Check

- Raw report is the product: Pass — this dashboard feature presents generated pipeline data and does not replace raw Telegram reporting.
- Observable pipeline behaviour beats guesswork: Pass — feature behaviour is captured from current implementation paths.
- Runtime state is declared, not committed: Pass — no runtime data is committed by this documentation split.
- Production side effects are bounded: Pass — current runtime dashboard implementation is bounded; proposed product enrichment is tracked as future pipeline/sync plus dashboard work with tests/build verification.

## Scope

In scope:
- Product Info Modal behaviour described by this feature
- Read-only interaction state in `DashboardClient`
- Display semantics based on generated dashboard data
- Generated Tesco product metadata consumed by the Product Info Modal when available
- Shared launch sources: Order Item Row and Meal Detail Overlay matched item

Out of scope:
- Pipeline matching, meal-window logic, calendar windows, or report formatting
- Visual redesign beyond using generated metadata in the existing Product Info Modal
- Product enrichment generation/build/deploy mechanics, which are governed by `004-dashboard-sync`

## Scenario Coverage Matrix

- Positive: Current generated data renders the feature as described → T001, T010, T020
- Negative: Missing optional data uses current fallback/loading/unavailable states rather than fabricated values → T001, T010, T020
- Boundary: UI interaction state changes do not mutate generated pipeline data → T001, T010, T020
- Integration-isolated: Feature behaviour is verified by inspecting current dashboard implementation rather than changing runtime code → T001, T020
- Positive: matched-item click from Meal Detail Overlay opens the same Product Info Modal as Order Item Row click → T040, T041, T042
- Positive: product modal renders from generated Tesco metadata without slow modal-open web search → T050, T051, T052, T053
- Negative: missing/failed Tesco enrichment falls back truthfully without fabricated details → T050, T052, T053
- Positive: debug-mode product-resolution chip on the modal renders only when spec-022 gate is effectively on, data-equivalent to spec 031 panel → T080, T081, T082
- Negative: debug chip is absent from DOM/HTML/JS bundle when debug cookie is unset, tampered, or signed-off → T080, T083, T084

## Complexity Tracking

No constitutional complexity exception recorded. The shared-modal launch source is implemented and verified; Tesco product enrichment is a bounded Proposed refinement.

## Risk & Safety

- Do not introduce dashboard-side matching or receipt parsing in this spec.
- Do not commit generated dashboard data, receipts, or private grocery details.
- Keep future behaviour changes behind feature-specific spec updates.
- Coordinate with `007-dashboard-meal-cards` so matched item clicks reuse this modal contract rather than duplicating product detail UI.
- Do not block user modal opening on slow live product search; prefer generated metadata and truthful placeholder text. *(Rev 4: the truthful placeholder is the contract; the static `lib/product-database.ts` substring-match fallback is removed.)*
- Do not bypass Tesco access controls; enrichment should be cached, rate-limited, and best-effort.
- *(Rev 5)* The debug-mode product-resolution chip on the modal MUST inherit the spec-022 OIDC + signed-cookie gate. The chip MUST NOT render in the DOM, the rendered HTML, or any reachable client-side payload when the debug cookie is unset, tampered, or signed-off. The chip's data source is the spec 031 product-resolution panel payload (spec 031 FR-005 / FR-006); the modal's chip MUST be data-equivalent to that panel. No new npm dependencies; no second debug framework.
- *(Rev 5.1)* The debug chip MUST additionally surface `expectedProductBlobPath` (derived from the item's tpnc per the spec 021 Key Entities convention `products/{tpnc}.json`) and `productBlobPathMatch: true | false | null`. The convention MUST be sourced from spec 021 Key Entities and MUST NOT be hardcoded in this spec; if spec 021 changes the convention, this spec's matcher updates in lockstep. When tpnc is unknown or `productBlobPath` is absent, the chip shows `null` (not `false`) — a missing tpnc is a different problem from a wrong path. The data source for both fields is the spec 031 Rev 3 product-resolution payload (FR-005 / FR-006 as amended by Rev 3).

## Verification

- Inspect current dashboard implementation paths listed above.
- Both launch sources are covered by dashboard tests/build: Order Item Row and Meal Detail Overlay matched item.
- Future implementation verification: generated Tesco metadata renders in the modal, modal-open does not trigger slow client product search, and missing metadata falls back truthfully.
- Run dashboard tests/build and `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.
