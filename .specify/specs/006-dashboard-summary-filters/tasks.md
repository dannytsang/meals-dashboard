# Tasks: Dashboard Summary Filters

**Input**: `.specify/specs/006-dashboard-summary-filters/spec.md`

## Phase 1: Brownfield Capture

- [x] T001 [US1] Inspect current dashboard implementation evidence: /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 247-300.
- [x] T002 [US1] Identify generated dashboard data used by this feature.
- [x] T003 [US1] Confirm the feature is UI/client-state behaviour and not a pipeline matching source.

## Phase 2: Contract Updates

- [x] T010 [US1] Create `spec.md`, `plan.md`, `tasks.md`, and `CHANGELOG.md` for `006-dashboard-summary-filters`.
- [x] T011 [US1] Add `006-dashboard-summary-filters` artifacts to `skill.spec.yaml` expected artifacts.
- [x] T012 [US1] Update `SKILL.md` dashboard spec list.

## Phase 3: Verification

- [x] T020 [US1] Run the spec-driven skill validator for `data-science/meals-check`.
- [x] T021 [US1] Confirm no runtime dashboard code or generated grocery/order data was changed by this documentation split.

## Phase 4: Implementation Hardening

- [x] T030 [US1] Add dashboard helper tests for headline fallback metrics and empty generated data.
- [x] T031 [US1] Refactor the dashboard header cards to consume `buildHeadlineMetrics`.
- [x] T032 [US1] Verify with dashboard tests and build.

## Requirement-to-Task Mapping

- FR-001 → T001, T010, T020, T030, T031, T032
- FR-002 → T001, T010, T020, T031, T032
- FR-003 → T001, T010, T020, T031, T032
- FR-004 → T001, T010, T020
- FR-005 → T001, T010, T020
