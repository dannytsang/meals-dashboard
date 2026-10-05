# Implementation Plan: Dashboard Summary Filters

Status: Final
Feature: 006-dashboard-summary-filters
Skill: data-science/meals-check

## Summary

This feature captures the current dashboard behaviour for headline summary metrics and top-level matched/unmatched filters.

## Technical Context

- Runtime profile: `chef`
- Dashboard repository: `/home/hermes/workspace/meals-dashboard`
- Primary implementation evidence: /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 247-300
- Generated data source: `/home/hermes/workspace/meals-dashboard/lib/real-data.ts`, produced from meals-check dashboard cache sync
- Contract artifacts: `SKILL.md`, `skill.spec.yaml`, this feature directory, and `CHANGELOG.md`

## Constitution Check

- Raw report is the product: Pass — this dashboard feature presents generated pipeline data and does not replace raw Telegram reporting.
- Observable pipeline behaviour beats guesswork: Pass — feature behaviour is captured from current implementation paths.
- Runtime state is declared, not committed: Pass — no runtime data is committed by this documentation split.
- Production side effects are bounded: Pass — no build, deploy, or runtime UI change is part of this capture.

## Scope

In scope:
- Current dashboard UI behaviour described by this feature
- Read-only interaction state currently implemented in `DashboardClient`
- Display semantics based on generated dashboard data

Out of scope:
- Pipeline matching, Tesco parsing, calendar windows, or report formatting
- Visual redesign beyond the existing current behaviour
- Build/deploy/sync mechanics, which remain in `004-dashboard-sync`

## Scenario Coverage Matrix

- Positive: Current generated data renders the feature as described → T001, T010, T020
- Negative: Missing optional data uses current fallback/loading/unavailable states rather than fabricated values → T001, T010, T020
- Boundary: UI interaction state changes do not mutate generated pipeline data → T001, T010, T020
- Integration-isolated: Feature behaviour is verified by inspecting current dashboard implementation rather than changing runtime code → T001, T020

## Complexity Tracking

No constitutional complexity exception recorded. This is a brownfield documentation split of existing dashboard UI behaviour.

## Risk & Safety

- Do not introduce canonical dashboard-side matching or receipt parsing in this spec; the existing word-overlap item display heuristic is documented as current behaviour only.
- Do not commit generated dashboard data, receipts, or private grocery details.
- Keep future behaviour changes behind feature-specific spec updates.

## Verification

- Inspect current dashboard implementation paths listed above.
- Run `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.
