# Implementation Plan: Dashboard Meal Cards

Status: Final
Feature: 007-dashboard-meal-cards
Skill: data-science/meals-check

## Summary

This feature captures the dashboard meal card behaviour and the meal detail overlay. It merges the original `007-dashboard-weekly-grid` and `009-dashboard-meal-detail` specs, which together cover the weekly grid card display and the click-to-overlay detail interaction. The implemented refinements are complete: the broad visible `Missing Items` section is removed from the meal detail overlay, matched items open the shared Product Info Modal, completed meals outside the displayed dashboard date/window are excluded, targeted missing-explanation text for partial meals renders in the clicked Meal Detail Overlay as `Expected Items`, visible Week Meals labels use a label emoji, delivery markers render from pipeline-owned delivery metadata, `Expected Items` visually matches Matched Items including row/background width alignment, matched item rows align name, quantity, and price as columns with a matched-items total row, and individual Meal Cards plus the Meal Detail Overlay read only `Missing`, `Partial`, or `Complete` rather than `Green`, `Amber`, `Red`, or numeric percentages.

## Technical Context

- Runtime profile: `chef`
- Dashboard repository: `/home/hermes/workspace/meals-dashboard`
- Primary implementation evidence: `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx` lines 166-428 (grid cards) and lines 407-552 (meal detail overlay), plus `lib/meal-type.ts` and `lib/item-utils.ts`
- Generated data source: `/home/hermes/workspace/meals-dashboard/lib/real-data.ts`, produced from meals-check dashboard cache sync
- Delivery marker source: generated pipeline delivery metadata owned by `004-dashboard-sync`/pipeline cache, not dashboard weekday inference
- Contract artifacts: `SKILL.md`, `skill.spec.yaml`, this feature directory, and `CHANGELOG.md`

## Constitution Check

- Raw report is the product: Pass — this dashboard feature presents generated pipeline data and does not replace raw Telegram reporting.
- Observable pipeline behaviour beats guesswork: Pass — feature behaviour is captured from current implementation paths.
- Runtime state is declared, not committed: Pass — no runtime data is committed by this specification update.
- Production side effects are bounded: Pass — runtime implementation is limited to dashboard UI helpers/components and meals-check generator metadata, with tests/build verification.

## Scope

In scope:
- Weekly grid card display: seven-day table, meal-type rows, collapsed/expanded state, coverage colours, pipeline-owned delivery markers, today highlighting, emoji-prefixed labels, and individual Meal Cards using simple `Missing`/`Partial`/`Complete` status text instead of numeric coverage percentages or RAG wording; compact cards do not show partial missing explanations
- Meal card click interaction: opens the detail overlay
- Meal detail overlay: meal name, simple `Missing`/`Partial`/`Complete` coverage status, matched items aligned as name/quantity/price columns with a matched-items total row, notes, Todoist link, completion badge, and targeted `Expected Items` explanations for partial meals; individual numeric coverage bars/percentages and broad visible Missing Items dump remain removed
- Proposed `Expected Items` visual refinement: white/title-style heading matching Matched Items and one boxed row per expected item/component
- Todoist completion display on both card and overlay
- Read-only client state interactions
- Matched item click interaction from meal detail overlay to the shared Product Info Modal

Out of scope:
- Pipeline matching, Tesco parsing, calendar windows, or report formatting, except consuming explicit delivery metadata produced by the pipeline/dashboard sync contract
- Visual redesign beyond the requested missing-items removal, targeted partial-match explanation placement/style, label emoji prefix, and matched-item product drill-down
- Build/deploy/sync mechanics (remain in `004-dashboard-sync`)
- Changing matching, receipt parsing, or matcher status semantics; replacing individual meal percentages with RAG is a dashboard display change

## Scenario Coverage Matrix

- Positive: Current generated data renders the weekly grid as described → SC-001, SC-002, SC-003
- Positive: generated pipeline delivery metadata renders Delivery markers on actual delivery dates → FR-005, FR-023, SC-012
- Positive: Clicking a meal card opens the detail overlay → FR-010, SC-005
- Positive: Overlay shows all specified fields with simple `Missing`/`Partial`/`Complete` status and without RAG wording, an individual percentage/progress bar, or Missing Items section → FR-011, FR-012, FR-025, FR-027, SC-005
- Positive: Completed Todoist meals whose original due date belongs in the displayed date/window show completion marker on card → FR-007, FR-008, SC-004
- Positive: Completed meals show completion badge in overlay → FR-012, SC-007
- Positive: Closing overlay clears selected meal state → FR-013, SC-006
- Positive: clicking a matched item opens the shared Product Info Modal → FR-014, FR-015, SC-008
- Positive: matched item rows align name, quantity, and price in columns and show a matched-items total → FR-011, SC-013
- Positive: partial Meal Detail Overlays show targeted missing explanations under the `Expected Items` heading → FR-019, FR-020, SC-010
- Positive: `Expected Items` visually matches Matched Items heading/row-box treatment and row/background width alignment → FR-026, SC-010
- Negative: completed-only `Steak, sliced potatoes (frozen), frozen veg` with returned `due.date = 2026-06-15` and `completed_at = 2026-06-11` is excluded from a 2026-06-13 generated Week Meals window → FR-017, FR-021, SC-011
- Negative: Missing optional data uses current fallback/loading/unavailable states → SC-005
- Negative: a regular Tesco weekday with no generated delivery metadata does not show a Delivery marker → FR-022, SC-012
- Negative: compact Week Meals cards do not show partial-only missing explanations, and covered/external/missing overlays do not show misleading explanations → FR-018, FR-019, SC-010
- Negative: Completion state does not alter coverage fields → FR-008, FR-012, FR-025, SC-007
- Boundary: UI interaction state changes do not mutate generated pipeline data → FR-010
- Regression: completed meal due outside the displayed date/window is not shifted/carried forward into Week Meals → FR-016, FR-017, SC-009

## Complexity Tracking

No constitutional complexity exception recorded. The completed-task same-day eligibility rule and prior UI/data refinements are implemented and verified; coverage-status wording is a bounded Proposed refinement.

## Risk & Safety

- Do not introduce dashboard-side matching, receipt parsing, or delivery-event reconstruction in this spec.
- Do not commit generated dashboard data, receipts, or private grocery details.
- Keep future behaviour changes behind feature-specific spec updates.
- Coordinate matched-item product drill-down with `010-dashboard-product-detail` so the dashboard does not grow two product modal contracts.
- Partial-match explanations should come from generated matcher/generator metadata, not new dashboard-side matching, and should render in the clicked Meal Detail Overlay rather than the compact Week Meals card. The visual refinement must not alter matching semantics or resurrect the old broad Missing Items dump.
- Week Meals labels should preserve their text while adding a label emoji prefix such as `🏷️`.
- Delivery markers should come from generated delivery metadata, not `getUpcomingDeliveries(realLatestOrder.delivery_date)` or any equivalent recurring-weekday helper.
- Completed-meal fetching must retain original due dates and filter by the dashboard date/window; completion date must not become the display date.

## Verification

- Inspect current dashboard implementation paths listed in Technical Context.
- Dashboard tests/build have been run after implementation of the UI/data-generation changes.
- Add regression coverage for `Duck pancakes, prawn toast, spring rolls` due 11 July not appearing under Tuesday 16 July.
- Add dashboard/generator coverage for a partial roast dinner showing missing blockers such as broccoli/roast potatoes in the Meal Detail Overlay without dumping unrelated groceries or showing the explanation on the compact Week Meals card.
- Add dashboard coverage for emoji-prefixed labels on Week Meals cards.
- Add dashboard coverage proving individual Meal Cards and Meal Detail Overlay show simple `Missing`/`Partial`/`Complete` status rather than RAG wording or numeric percentages/progress bars.
- Future implementation verification: add dashboard coverage proving `Expected Items` uses the Matched Items-style heading and renders each expected item/component in its own box/row.
- Run `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.
- Verification passed for the spec update with the owning-skill validator; runtime tests/build are required after implementing the `Expected Items` visual refinement.
