# Implementation Plan: Dashboard Expiry Timeline

Status: Final
Feature: 013-dashboard-expiry-timeline
Skill: data-science/meals-check

## Summary

This feature documents the dashboard's short-life items timeline panel. It consumes `receipt.shortLifeItems` from the pipeline's Tesco email parser and renders items grouped by expiry urgency. Implementation is complete — this is a brownfield capture.

## Technical Context

- Component: `/home/hermes/workspace/meals-dashboard/components/expiry-timeline.tsx`
- Data source: `receipt.shortLifeItems` — populated by `tesco_email_parser.py` in the pipeline
- Dashboard repository: `/home/hermes/workspace/meals-dashboard`
- Contract artifacts: `SKILL.md`, `skill.spec.yaml`, this feature directory, and `CHANGELOG.md`

## Constitution Check

- Raw report is the product: Pass — this is a display component consuming generated pipeline data.
- Observable pipeline behaviour beats guesswork: Pass — captured from actual implementation with real data shape.
- Runtime state is declared, not committed: Pass — display-only, no pipeline state mutation.
- Production side effects are bounded: Pass — purely client-side read from generated data.

## Scope

In scope:
- Expiry timeline panel rendering from `receipt.shortLifeItems`
- Urgency classification (Critical ≤1d, Urgent ≤3d, Notice >3d)
- Category classification (fresh/dairy/frozen/other) via keyword matching
- Urgency section headers with icons and colours
- Category legend footer
- Empty/null state handling

Out of scope:
- Changing urgency threshold values
- Changes to `tesco_email_parser.py` shortLifeItems extraction logic
- Changes to pipeline matching semantics
- Dashboard layout or other UI components

## Scenario Coverage Matrix

- Positive: Items render in urgency groups → FR-001, FR-002
- Positive: Critical/Urgent/Notice sections with correct icons → FR-005
- Positive: Category legend visible → FR-006
- Positive: Null receipt and empty shortLifeItems handled → FR-007
- Positive: Items sorted by daysRemaining ascending → FR-002
- Positive: Category classification via keyword matching → FR-003

## Complexity Tracking

No complexity. This is a read-only display component with a well-defined data shape and no branching logic beyond urgency grouping.

## Risk & Safety

- No pipeline or network calls involved.
- Null receipt and empty shortLifeItems are handled gracefully.
- Keyword-based category classification is simple and predictable.

## Verification

- Load dashboard with a receipt that has shortLifeItems, verify all three urgency sections render.
- Test with null receipt and empty shortLifeItems to verify placeholder text.
- Validate meals-check skill with `validate_spec_skill.py`.