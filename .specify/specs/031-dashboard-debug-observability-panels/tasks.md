# Tasks: Dashboard Debug Observability Panels

Feature ID: `031-dashboard-debug-observability-panels`

Status: Proposed

## Phase 1 — Spec review / payload contract

- [x] T001 Confirm the four-panel scope is the right cut: runtime context, Blob read/freshness, product resolution, and enriched items-by-category provenance.
- [x] T002 Confirm the new work extends spec 022 rather than amending its gate semantics.
- [x] T003 Confirm the panel set stays debug-only and does not introduce always-on chrome.
- [x] T004 Freeze the safe enum labels for `runtimeMode`, `blobCredentialsState`, `debugCookieState`, `activeReader`, and product-source provenance.

## Phase 2 — Shared types and shell wiring

- [x] T005 Extend the debug-panel discriminated union/type definitions for the three new panel kinds.
- [x] T006 Add panel registration/order support to the existing debug shell.
- [x] T007 Reuse or extract shared `Copy as JSON`, collapse, and refresh affordances for all panels.

## Phase 3 — Runtime context panel

- [x] T008 Add the gated runtime-context route/helper.
- [x] T009 Derive safe `blobCredentialsState` and `debugCookieState` labels without exposing raw env values or the raw signed cookie.
- [x] T010 Surface `runtimeMode`, `activeReader`, deployment ID, request path, and safe user-display provenance.
- [x] T011 Add the runtime-context debug-panel component.

## Phase 4 — Blob read / freshness panel

- [x] T012 Add the gated Blob read / freshness route/helper.
- [x] T013 Surface `pointerPath`, `manifestPath`, `productsManifestPath`, selected `orderBlobPath`, selected `coverageBlobPaths`, and selected `productBlobPath` where applicable.
- [x] T014 Surface per-stage read status fields (`pointerRead`, `manifestRead`, `summaryRead`, `orderRead`, `coverageRead`, `productRead`) plus sanitised live-mode errors.
- [x] T015 Surface freshness timestamps/ages: `dataGeneratedAt`, `uiUpdatedAt`, `latestOrderDate`, product `lastFetched`, and Firecrawl `lastFetched` when available.
- [x] T016 Add the Blob read / freshness debug-panel component.
- [x] T017 Ensure demo mode reports fixture-path bypass rather than fabricated Blob metadata.

## Phase 5 — Product-resolution panel

- [x] T018 Choose the stable selected-item lookup key shared with existing product-detail behaviour.
- [x] T019 Add the gated product-resolution route/helper.
- [x] T020 Surface winning field sources for at least `description`, `image`, `storage`, and `preparation`.
- [x] T021 Surface `tpnc`, `productBlobPath`, and Firecrawl freshness metadata when available.
- [x] T022 Surface explicit placeholder/missing-upstream reasons when the placeholder wins.
- [x] T023 Add the product-resolution debug-panel component.

## Phase 6 — Items-by-category enrichment

- [x] T024 Extend the existing items-by-category debug payload with candidate-order path/date, coverage-window provenance, chosen filter state, and null-reason provenance.
- [x] T025 Keep the current payload fields backward-compatible.
- [x] T026 Update the existing panel UI so the `latestOrder`-filtered-out case is obvious at a glance.

## Phase 7 — Verification

- [x] T027 Add tests for runtime-context live/demo branching and Blob credential sufficiency.
- [x] T028 Add tests for tampered-cookie reporting.
- [x] T029 Add tests for Blob failure provenance and redaction.
- [x] T030 Add tests for Blob-path provenance, per-stage read status, and freshness/staleness reporting.
- [x] T031 Add tests for Apollo / Firecrawl / placeholder product-resolution outcomes and field-level source outcomes.
- [x] T032 Add regression coverage for the items-by-category coverage-window-filter case.
- [x] T033 Run `npx tsc --noEmit`.
- [x] T034 Run targeted Vitest coverage for the new routes/panels.
- [x] T035 Run `npx next build`.
- [x] T036 Run the meals-check spec validator.

## Phase 8 — Promotion gate

- [x] T037 Review Draft with Danny and capture any panel-scope changes.
- [x] T038 Promote to Proposed only after scope approval and validator-clean artefacts.
- [ ] T039 Promote to Final only after production verification per spec.md Promotion Criteria.
