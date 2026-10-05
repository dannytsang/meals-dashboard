# Feature Specification: Dashboard Summary Filters

Feature ID: `006-dashboard-summary-filters`

Feature Name: Dashboard Summary Filters

Target Skill: `data-science/meals-check`

Created: 2026-06-10

Status: Final

Change history: CHANGELOG.md

Input: Brownfield capture from current meals dashboard implementation, especially /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 247-300.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Headline Metrics and Filter Cards (Priority: P1)

As Danny, I want the dashboard header cards to summarise the current Tesco delivery and let me filter matched or unmatched items quickly, so I can see whether the shop broadly covers the plan before drilling into details.

**Why this priority**: The first screen should answer whether the shop looks sane without requiring a line-by-line receipt review.

**Independent Test**: Load the current dashboard data, inspect the five header cards, click Meals Covered and Unmatched, and verify the item list filter state toggles using the dashboard's current receipt-item word-overlap heuristic while order total, delivery date, and coverage percentage remain derived from generated data. Unit coverage for `buildHeadlineMetrics` verifies absent generated data returns safe empty metrics rather than `NaN` or a crash.

**Acceptance Scenarios**:

1. Given current generated dashboard data exists, When the dashboard loads, Then it shows order total, delivery date, meals covered, unmatched grocery count, and coverage percentage from generated data with the implemented fallbacks: order total falls back to receipt order total, delivery falls back to the first generated upcoming delivery, and unmatched count falls back to raw receipt item count.
2. Given Danny clicks the Meals Covered card, When the matched filter was not active, Then the dashboard filters order items to matched items using the shared display heuristic.
3. Given Danny clicks the Unmatched card, When the unmatched filter was not active, Then the dashboard filters order items to unmatched items using the shared display heuristic.
4. Given either top-level filter card is clicked again, When that filter is already active, Then the dashboard returns to the all-items filter state for that dimension.
5. Given coverage percentage changes, When the dashboard renders the coverage card, Then it colours the card using emerald at 80%+, amber at 50-79%, and rose below 50%.

### Edge Cases

- Missing generated dashboard data should produce visible empty/fallback UI states with zero/null metrics from the dashboard helper, not `NaN`, a crash, or fabricated meal/grocery data.
- UI interactions in this feature are read-only client state unless explicitly stated otherwise.
- Canonical meal coverage, delivery-window, and receipt parsing logic remain owned by the meals-check pipeline; matched/unmatched order-item filtering in this feature uses the current dashboard display heuristic only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST show headline order total, delivery date, meals covered count, unmatched grocery count, and coverage percentage from generated dashboard data with the current fallbacks: receipt order total for order total, first generated upcoming delivery for delivery date, raw receipt item count for unmatched grocery count, and zero/null safe values when generated summary and receipt data are absent.
- **FR-002**: The Meals Covered headline card MUST toggle the matched-items filter; matched order items are determined by the dashboard's current shared word-overlap display heuristic, not by canonical pipeline coverage.
- **FR-003**: The Unmatched headline card MUST toggle the unmatched-items filter; unmatched order items are the complement of the dashboard's current shared word-overlap display heuristic.
- **FR-004**: The coverage metric MUST use the current threshold colours implemented in the dashboard: emerald for 80%+, amber for 50-79%, rose below 50%.
- **FR-005**: Headline filters MUST be UI-only state changes and MUST NOT mutate generated dashboard or pipeline data.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — this feature directory is listed as an expected artifact.
- `SKILL.md` changes required: Yes — dashboard UI feature specs are listed in the meals-check spec contract.
- Runtime state changes required: No — this is a current-behaviour documentation split.
- Secrets/config changes required: No.
- Cron/hook changes required: No.

### Key Entities

- **Headline Summary**: Current dashboard concept captured from the implementation.
- **Matched Filter**: Current dashboard concept captured from the implementation.
- **Unmatched Filter**: Current dashboard concept captured from the implementation.
- **Coverage Percentage**: Current dashboard concept captured from the implementation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The five headline cards render from current generated dashboard data and the metrics helper returns safe empty values when generated data is absent.
- **SC-002**: Clicking matched/unmatched headline cards toggles the corresponding order-item filter.
- **SC-003**: Filtering from headline cards leaves generated data unchanged.

## Assumptions

- The current dashboard implementation under `/home/hermes/workspace/meals-dashboard` is the source of truth for this brownfield capture.
- The dashboard consumes generated pipeline data from `real-data.ts`; it does not perform Tesco email parsing or canonical meal matching, but it does perform a local word-overlap heuristic for order-item matched/unmatched display.
- This spec captures current behaviour; future UI changes should update this feature or create a new feature spec when conceptually separate.

## Out of Scope

- Changing meals-check pipeline matching semantics.
- Changing Telegram report formatting.
- Deploying, building, or modifying runtime dashboard code as part of this documentation split.
