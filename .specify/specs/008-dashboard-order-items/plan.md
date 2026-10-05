# Implementation Plan: Dashboard Order Items

Status: Final
Feature: 008-dashboard-order-items
Skill: data-science/meals-check

## Summary

This feature captures dashboard behaviour for order item category chips, matched/unmatched filters, cleaned names, price display, show-all behaviour, responsive control layout, item sorting, and the 2026-06-19 immediate client-side search refinement. The implemented search work composes with existing category/matched filters, sort direction, and Show all/Collapse while leaving dynamic loading or virtualisation as a rendering optimisation over the same derived result set.

## Technical Context

- Runtime profile: `chef`
- Dashboard repository: `/home/hermes/workspace/meals-dashboard`
- Primary implementation evidence: /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 68-77, 152-164, and 430-484 plus lib/item-utils.ts
- Generated data source: `/home/hermes/workspace/meals-dashboard/lib/real-data.ts`, produced from meals-check dashboard cache sync
- Contract artifacts: `SKILL.md`, `skill.spec.yaml`, this feature directory, and `CHANGELOG.md`

## Constitution Check

- Raw report is the product: Pass — this dashboard feature presents generated pipeline data and does not replace raw Telegram reporting.
- Observable pipeline behaviour beats guesswork: Pass — feature behaviour is captured from current implementation paths.
- Runtime state is declared, not committed: Pass — no runtime data is committed by this documentation split; the proposed search query is transient client-side UI state.
- Production side effects are bounded: Pass — this is a spec update only; runtime UI implementation, tests/build, and deploy are tracked as future tasks.

## Scope

In scope:
- Current dashboard UI behaviour described by this feature
- Proposed Order Items by Category control layout improvement so filters use available width and wrap cleanly
- Implemented order item sorting direction controls: item-name ascending/descending and price low-to-high/high-to-low, with item name ascending as the default
- Proposed immediate client-side search over Order Items by Category that composes with category chips, matched-state filters, sort controls, and Show all/Collapse
- Proposed clear button for non-empty search text that clears only search state and preserves all other controls
- Architecture constraint for future dynamic loading/virtualisation: derive the full filtered/searched/sorted result first, then window/render it
- Read-only interaction state currently implemented in `DashboardClient`
- Display semantics based on generated dashboard data

Out of scope:
- Pipeline matching, Tesco parsing, calendar windows, or report formatting
- Visual redesign beyond adding a search input into the existing Order Items by Category control area
- Build/deploy/sync mechanics, which remain in `004-dashboard-sync`

## Scenario Coverage Matrix

- Positive: Current generated data renders the feature as described → T001, T010, T020
- Positive: Order Items by Category controls use available width and wrap cleanly → T040, T043, T044
- Positive: default sort is item name ascending by cleaned display name → T041, T043, T044
- Positive: item-name sort can be changed between ascending and descending → T050, T052, T053
- Positive: price sort reorders currently filtered items low-to-high and high-to-low while preserving filter/show-count behaviour → T042, T050, T051, T052, T053
- Positive: search narrows the item list immediately as text changes, without submit/server round-trip → T060, T063, T064
- Positive: clear button empties search immediately while preserving category/matched/sort/visible-count state → T065, T063, T064
- Positive: active search, category, matched-state, sort, and visible-count controls compose in the defined pipeline order → T061, T063, T064
- Boundary: dynamic loading or virtualisation, if introduced, windows the derived result and does not filter only rendered rows → T062, T063, T064
- Negative: Missing optional data uses current fallback/loading/unavailable states rather than fabricated values → T001, T010, T020
- Boundary: UI interaction state changes do not mutate generated pipeline data → T001, T010, T020
- Integration-isolated: Feature behaviour is verified by inspecting current dashboard implementation rather than changing runtime code → T001, T020

## Complexity Tracking

No constitutional complexity exception recorded. This began as a brownfield documentation split; the search request is a bounded dashboard UI refinement on the existing Order Items by Category surface.

## Risk & Safety

- Do not introduce canonical dashboard-side matching or receipt parsing in this spec; the existing word-overlap item display heuristic is documented as current behaviour only.
- Do not commit generated dashboard data, receipts, or private grocery details.
- Keep future behaviour changes behind feature-specific spec updates.
- Sorting must remain a dashboard display concern over generated receipt items and must not mutate pipeline data or canonical matching results.
- Sort direction must apply after category/matched filters and search, and must preserve Show all/Collapse behaviour.
- Layout changes should improve spacing/readability without changing filter semantics.
- Search must be client-side and immediate, but future performance work must not let a rendered-window optimisation become the filter source of truth.
- The clear affordance must clear only the search query; it must not behave like the existing All chip or reset other controls.

## Verification

- Inspect current dashboard implementation paths listed above.
- Existing dashboard tests cover separated control groups, alphabetical default sorting, price sorting, and source-level interaction contracts.
- Future implementation verification: dashboard tests cover immediate search updates, search + category + matched-state + sort composition, clear button state preservation, visible-count preservation, and any dynamic-window helper proving virtualisation happens after deriving the combined result.
- Verification passed for the spec update with `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`; runtime tests/build are required after implementation.
