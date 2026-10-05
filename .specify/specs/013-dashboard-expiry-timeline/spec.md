# Feature Specification: Dashboard Expiry Timeline

Feature ID: `013-dashboard-expiry-timeline`

Feature Name: Dashboard Expiry Timeline

Target Skill: `data-science/meals-check`

Created: 2026-06-11

Status: Final

Change history: CHANGELOG.md

Input: Brownfield capture from current meals dashboard implementation — `/home/hermes/workspace/meals-dashboard/components/expiry-timeline.tsx`. Consumes `receipt.shortLifeItems` produced by `tesco_email_parser.py` in the meals-check pipeline.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Short-Life Items (Priority: P1)

As Danny, I want to see which items in my Tesco order have short shelf lives, so I know what to use first and avoid food waste.

**Why this priority**: The expiry timeline gives immediate, actionable guidance on perishable items without requiring Danny to check each product's packaging.

**Independent Test**: Load the dashboard with a `TescoReceipt` that has `shortLifeItems` populated (items with `daysRemaining` field from the pipeline), and verify the timeline renders items grouped by urgency with correct icons, colours, and labels.

**Acceptance Scenarios**:

1. Given `receipt.shortLifeItems` contains items with varying `daysRemaining` values, When the expiry timeline renders, Then items are grouped into three urgency sections: Critical (≤1 day), Urgent (≤3 days), Notice (>3 days).
2. Given a Critical item (≤1 day remaining), When the timeline renders, Then it appears under a "Critical - Use Today" section with an `AlertTriangle` icon and rose background styling, and shows "Today" or "0d left" as the expiry label.
3. Given an Urgent item (>1 day but ≤3 days remaining), When the timeline renders, Then it appears under an "Urgent - Use Within 3 Days" section with a `Clock` icon and amber background styling, and shows "{N}d left" as the expiry label.
4. Given a Notice item (>3 days remaining), When the timeline renders, Then it appears under a "Keep Refrigerated" section with a `Snowflake` icon and blue background styling, and shows "~{N}d" as the expiry label.
5. Given no short-life items are present (`receipt.shortLifeItems` is empty or null), When the timeline renders, Then it shows "No short-life items in this order" placeholder text.
6. Given a `null` receipt is passed, When the timeline renders, Then it shows "No receipt data available" placeholder text without crashing.
7. Given items with the same urgency level, When they render, Then they are sorted by `daysRemaining` ascending (most urgent first) within their section.

### Edge Cases

- Missing generated dashboard data should produce visible empty/fallback UI states from the current implementation, not fabricated item data.
- Items with `daysRemaining` of exactly 0 must display "Today", not "0d left".
- Category classification (fresh/dairy/frozen/other) is derived from keyword matching on the item name; items that do not match any keyword default to "other".
- UI interactions in this feature are read-only client state unless explicitly stated otherwise.
- The expiry timeline renders from generated pipeline data; it does not perform Tesco email parsing or canonical delivery-window matching.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The expiry timeline MUST accept `receipt: TescoReceipt | null` as input and read `receipt.shortLifeItems` as the data source.
- **FR-002**: The expiry timeline MUST categorise each item by urgency using the thresholds: Critical ≤1 day, Urgent ≤3 days, Notice >3 days.
- **FR-003**: The expiry timeline MUST categorise each item by product category using keyword matching: dairy (milk/yoghurt/cheese/cream), frozen (frozen/freezer), fresh (berry/lettuce/salad/spinach/fresh), other (default).
- **FR-004**: The expiry timeline MUST display each item with its name, urgency label, and days-remaining label formatted as: "Today" (0 days), "{N}d left" (1-3 days), "~{N}d" (>3 days).
- **FR-005**: The expiry timeline MUST render urgency section headers with the appropriate icon (`AlertTriangle` for Critical, `Clock` for Urgent, `Snowflake` for Notice) and the urgency-specific label.
- **FR-006**: The expiry timeline MUST show a footer legend with category colour coding: fresh (emerald), dairy (amber), frozen (blue), other (grey).
- **FR-007**: The expiry timeline MUST handle null receipt and empty `shortLifeItems` gracefully with appropriate placeholder text and no crash.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — this feature directory is listed as an expected artifact.
- `SKILL.md` changes required: Yes — dashboard UI feature specs are listed in the meals-check spec contract.
- Runtime state changes required: No — this is a current-behaviour documentation split.
- Secrets/config changes required: No.
- Cron/hook changes required: No.

### Key Entities

- **ExpiryItem**: Internal interface with `name`, `daysRemaining`, `urgency` (critical/urgent/notice), and `category` (fresh/dairy/frozen/other).
- **UrgencyConfig**: Static configuration for each urgency level defining background colour, border colour, icon component, label text, and text colour.
- **Short-Life Items**: Items in the Tesco receipt that carry a `daysRemaining` field, populated by the pipeline's email parser.
- **Category Legend**: Footer section mapping colour to category (fresh/dairy/frozen/other).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The expiry timeline renders three urgency sections when short-life items are present, with items sorted by urgency within each section.
- **SC-002**: Each urgency section shows the correct icon, label, and background colour as defined in the urgency config.
- **SC-003**: The category legend is visible in the footer with all four category colours.
- **SC-004**: Null receipt and empty `shortLifeItems` produce appropriate placeholder text without crashing.

## Assumptions

- The current dashboard implementation under `/home/hermes/workspace/meals-dashboard` is the source of truth for this brownfield capture.
- The dashboard consumes generated pipeline data from `real-data.ts`; `shortLifeItems` is populated by `tesco_email_parser.py` when it extracts expiry/days-remaining data from the Tesco delivery email.
- This spec captures current behaviour; future UI changes should update this feature or create a new feature spec when conceptually separate.

## Out of Scope

- Changing the threshold values for urgency classification (1 day / 3 days) — these are implementation details owned by the spec.
- Changing meals-check pipeline matching semantics or email parsing logic.
- Changing Telegram report formatting.
- Deploying, building, or modifying runtime dashboard code as part of this documentation split.