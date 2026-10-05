# Feature Specification: Dashboard Meal Cards

Feature ID: `007-dashboard-meal-cards`

Feature Name: Dashboard Meal Cards

Target Skill: `data-science/meals-check`

Created: 2026-06-10 (merged 2026-06-11)

Status: Final

Change history: CHANGELOG.md

Input: Brownfield capture from current meals dashboard implementation — `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx` lines 166-428 (grid cards) and lines 407-552 (meal detail overlay), plus `lib/meal-type.ts` and `lib/item-utils.ts`; amended by Danny on 2026-06-13 for meal detail overlay behaviour, completed-meal date filtering, partial-match missing explanations, completed-task same-day eligibility after Todoist due-date mutation was observed, pipeline-owned delivery-marker semantics after the dashboard showed a false marker from hard-coded weekday inference, moving partial-match missing explanations from compact Week Meals cards into the clicked meal detail overlay, prefixing Week Meals labels with a label emoji, replacing individual meal coverage percentages with non-numeric coverage-status text so partial meals do not imply false numeric precision, making the Meal Detail Overlay `Expected Items` section visually match the Matched Items section style, removing RAG wording so individual meal statuses read only `Missing`, `Partial`, or `Complete`, and aligning Meal Detail Overlay matched-item name, quantity, and price as columns with a matched-items total row.

This spec merges the weekly grid card display (originally `007-dashboard-weekly-grid`) and the meal detail overlay (originally `009-dashboard-meal-detail`). Both are the same interactive surface: clicking a meal card opens the detail overlay. They are documented together to prevent the two specs drifting apart.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Weekly Meal Coverage Grid (Priority: P1)

As Danny, I want a week-at-a-glance grid of planned meals and their coverage state, so I can see which days and meal types are sorted and which need attention.

**Why this priority**: The weekly grid is the core planning surface; it turns individual MealCoverage records into a household schedule.

**Independent Test**: Load the dashboard with generated coverage data containing covered, partial, missing, completed, and incomplete Todoist meals across the displayed date/window range, then verify the week table shows seven day columns, breakfast/lunch/dinner rows, today highlighting, delivery markers, coverage colouring, collapsed rows, expanded meal cards, a visible Todoist completion indicator only for completed meals that satisfy the same-day completion eligibility rule, labels prefixed with a label emoji, and no partial-match missing explanation text on the compact Week Meals cards.

**Acceptance Scenarios**:

1. Given a runtime today date, When the dashboard builds the week grid, Then it displays a Monday-first seven-day window and shifts past weekdays to the same weekday in the following week for data lookup.
2. Given generated dashboard data contains a pipeline-resolved Tesco delivery whose actual delivery date matches a grid data key, When the week header renders, Then that day shows a Delivery marker. The dashboard MUST NOT create markers by assuming every regular Tesco weekday is a delivery.
3. Given a day column is today, When the grid renders, Then today is visually highlighted in both header and cells.
4. Given breakfast, lunch, or dinner has no meals in the current coverage data, When rows are initialised, Then that meal type is collapsed and/or visually de-emphasised as implemented.
5. Given a meal type row is collapsed and has meals on a day, When the row renders, Then it shows aggregate meal count when needed and average coverage percentage using colour derived from the aggregate average score rather than the first meal's status.
6. Given a meal type row is expanded, When meals exist for a day, Then each meal card shows truncated meal name, labels when present, and a non-numeric coverage status text of `Missing`, `Partial`, or `Complete` rather than an individual numeric coverage percentage or RAG wording; each visible label MUST be prefixed with a label emoji such as `🏷️`.
7. Given an active/incomplete Planned-section meal has a Todoist due date in the generated dashboard date/window, When the meals-check pipeline generates dashboard coverage data and the week grid renders that meal, Then the meal appears on its due date without requiring any completion metadata.
8. Given a completed Todoist meal is shown in the week grid, When the dashboard renders its coverage state, Then completion status MUST NOT change the meal's coverage status, coverage score, matched items, missing items, or delivery-window assignment.
8a. Given a completed Todoist meal has a Todoist due date in the displayed dashboard date/window but its `completed_at` local date is not the pipeline run date, When the dashboard data is generated, Then that completed-only task MUST NOT be included in Week Meals. `Steak, sliced potatoes (frozen), frozen veg` is the canonical regression example: Todoist returned `due.date = 2026-06-15` after it had originally belonged to 8 June, but `completed_at = 2026-06-11`; it MUST NOT appear in a 13 June generated week merely because the returned due date falls on Monday 15 June.
8d. Given a completed Todoist meal has a Todoist due date outside the displayed dashboard date/window, When the dashboard generates or renders Week Meals, Then that meal MUST NOT be carried forward, shifted, or shown under a different date. `Duck pancakes, prawn toast, spring rolls` due 11 July is the canonical regression example and MUST NOT appear under Tuesday 16 July.
8e. Given a completed Todoist meal has a Todoist due date in the displayed dashboard date/window and its `completed_at` local date equals the pipeline run date, When the dashboard data is generated, Then the completed meal MAY be included and visibly marked as completed.
8b. Given a meal card has `status = partial`, When the expanded Week Meals grid renders that compact card, Then the card MUST NOT show the missing-explanation section; the explanation belongs in the clicked Meal Detail Overlay.
8c. Given any meal card is covered, external, missing/uncovered, partial, or has no reliable missing-explanation data, When the expanded Week Meals grid renders that compact card, Then it MUST NOT show a partial-match missing explanation section on the card itself.
8f. Given today or any visible grid date is a regular Tesco delivery weekday but generated pipeline delivery metadata contains no actual Tesco delivery for that date, When the Week Meals header renders, Then it MUST NOT show a Delivery marker for that date.
8g. Given generated pipeline delivery metadata includes both actual delivery dates and delivery-usable dates for late deliveries, When Week Meals renders delivery markers, Then markers use the actual delivery event date while meal coverage/window assignment continues to use the pipeline's delivery-usable semantics.

### User Story 2 - Click Meal Card to Open Detail Overlay (Priority: P1)

As Danny, I want to click a meal card in the weekly grid and see the useful detail of that meal — its simple coverage status, matched items, notes, and Todoist link — so I can understand what the Tesco order covers without seeing a misleading percentage, RAG wording, or a separate missing-items section.

**Why this priority**: The meal card in the grid is compact; the detail overlay provides the full picture without navigating away from the weekly view.

**Independent Test**: Click a meal card in the expanded weekly grid, verify the overlay opens with the correct meal name, simple coverage status text (`Missing`, `Partial`, or `Complete`), matched items, notes (when present), Todoist link, and Todoist completion badge (when applicable), verify no broad `Missing Items` section is displayed, verify partial meals show a targeted `Expected Items` section in the overlay only, verify the `Expected Items` heading and item rows visually match the Matched Items section treatment, verify matched item name, quantity, and price align as fixed columns with a matched-items total row, and verify clicking a matched item opens the shared Product Info Modal. Close via close button or backdrop click.

**Acceptance Scenarios**:

9. Given a meal card in the expanded weekly grid is clicked, When the dashboard handles the click, Then it opens the meal detail overlay for that meal and populates it from the selected MealCoverage data.
10. Given the meal detail overlay is open, When it renders, Then it shows: meal name, simple coverage status text (`Complete`, `Partial`, or `Missing`), matched items list, notes (when present), and Todoist link; it MUST NOT show RAG wording (`Green`, `Amber`, `Red`), an individual numeric coverage percentage/bar, or the old broad `Missing Items` dump/section.
11. Given the meal in the overlay has been completed in Todoist, When the overlay renders, Then it additionally shows a Todoist completion badge separate from the coverage status, without altering coverage status, coverage score, matched items, or underlying missing-item data.
12. Given the overlay is open, When Danny clicks the close button or the overlay backdrop, Then the overlay closes and clears the selected meal state.
13. Given the overlay renders matched items, When the `deduplicateMatchedItems` utility is available, Then it deduplicates the matched items list before display.
14. Given Danny clicks a matched item in the meal detail overlay, When the item has sufficient product/order metadata, Then the dashboard opens the same Product Info Modal used by the Order Items by Category list for that product/item.
15. Given the selected meal is partial and generated data includes targeted missing-explanation metadata, When the meal detail overlay renders, Then it shows a clearly labelled targeted section titled `Expected Items` explaining what is still needed for covered status.
16. Given the selected meal is covered, external, missing/uncovered, or partial without reliable targeted explanation metadata, When the meal detail overlay renders, Then it MUST NOT show a misleading targeted missing-explanation section.
17. Given the Meal Detail Overlay shows `Expected Items`, When the section renders, Then its section heading uses the same white/title treatment as the Matched Items heading and each expected item/component renders in its own row/box rather than as plain inline text.
18. Given the Meal Detail Overlay shows matched items with receipt details, When the section renders, Then each row aligns matched item name, quantity, and price in consistent columns and shows a total of available matched item receipt prices at the bottom.

### Edge Cases

- Missing generated dashboard data should produce visible empty/fallback UI states from the current implementation, not fabricated meal or grocery data.
- Todoist completion is task state, not food coverage state: a meal can be completed in Todoist while still being covered, partial, missing, or unknown in ingredient coverage.
- Completed Todoist meals may be absent from the active-task endpoint. Because Todoist completed-task payloads can expose the latest/current `due.date` rather than a trustworthy original due date after a meal is moved, completed-only tasks MUST satisfy an additional same-day completion guard before they are reintroduced into generated Week Meals.
- UI interactions in this feature are read-only client state unless explicitly stated otherwise.
- Canonical matching, delivery-window, receipt parsing, calendar classification, and delivery event resolution remain owned by the meals-check pipeline; the dashboard renders delivery markers from generated pipeline delivery metadata and MUST NOT derive operational delivery facts from hard-coded weekdays, recurring schedule assumptions, receipt dates, or client-side date reconstruction.
- The overlay and the grid card share the same MealCoverage data model; the overlay is not a separate data fetch but a read from the same in-memory coverage array.
- Missing-item data may remain in the underlying MealCoverage model for matching/reporting, but the meal detail overlay must not render the old broad `Missing Items` dump. Targeted missing-explanation metadata for partial meals is allowed and should render in the overlay, not on the compact Week Meals card.
- Partial-match missing explanations are narrower than the old Missing Items dump: they should explain the ingredient/component blockers for covered status, not list every unmatched grocery/order item, and they belong in a Meal Detail Overlay section titled `Expected Items` opened from the Meal Card rather than on the compact Week Meals card. The `Expected Items` presentation should visually align with the Matched Items section: white/title-style heading and one box/row per expected item.
- Matched items in the meal detail overlay and order item rows must use the same product detail modal contract rather than two separate modal implementations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST group generated MealCoverage records by local ISO date for weekly display.
- **FR-002**: The dashboard MUST render a Monday-first seven-day table using the current date and the implemented past-day-to-next-week display/data lookup rule.
- **FR-003**: The dashboard MUST classify meals into breakfast, lunch, and dinner rows using the dashboard meal-type helper: explicit `meal_type` of `lunch` or `dinner` wins, content containing `breakfast`/`cereal` becomes breakfast, content containing `lunch`/`sandwich` becomes lunch, and all remaining meals default to dinner.
- **FR-004**: The dashboard MUST allow meal-type rows to collapse and expand when that meal type has meals.
- **FR-024**: Meal labels shown on Week Meals cards MUST be prefixed with a label emoji such as `🏷️` while preserving the underlying label text.
- **FR-025**: Individual Meal Cards and the Meal Detail Overlay MUST display meal coverage as simple non-numeric status text rather than a numeric percentage: `Complete` for generated `covered`/external-covered meals, `Partial` for generated `partial` meals, and `Missing` for generated `missing`, `uncovered`, or unknown/uncovered meals. In the Meal Detail Overlay, this status belongs beside/below the meal title as a compact badge and MUST NOT be repeated as a separate `Coverage status` section. The UI MUST NOT display `coverage_score` as an individual meal percentage or progress bar where it implies proportional ingredient completeness.
- **FR-027**: Individual Meal Cards and the Meal Detail Overlay MUST NOT show RAG wording such as `Green`, `Amber`, or `Red` in the visible coverage-status text; only `Missing`, `Partial`, or `Complete` should be visible to users.
- **FR-005**: The dashboard MUST show delivery markers only from generated pipeline delivery metadata for actual Tesco delivery dates, plus today highlighting, no-meal placeholders, aggregate collapsed coverage coloured by average score thresholds (emerald at 80%+, amber at 50-79%, rose below 50%), and expanded meal cards as specified.
- **FR-022**: The Week Meals grid MUST NOT infer delivery markers from hard-coded weekdays, recurring schedule assumptions, the latest receipt delivery date alone, or client-side reconstruction helpers such as `getUpcomingDeliveries(realLatestOrder.delivery_date)`.
- **FR-023**: Delivery markers MUST represent the actual Tesco delivery event date. They MUST NOT be shifted to the delivery-usable meal-window date, and delivery-marker display MUST NOT change meal coverage/window assignment semantics.
- **FR-006**: The weekly grid MUST render generated coverage data only and MUST NOT recalculate Tesco matching independently.
- **FR-007**: Generated dashboard meal data MUST include active/incomplete Planned-section meals by Todoist `due.date` when that due date belongs in the generated dashboard date/window.
- **FR-008**: The weekly grid MUST visibly mark completed Todoist meals on meal cards without changing or overriding ingredient coverage status, underlying generated score/data, matched items, missing items, or meal-window assignment.
- **FR-009**: The dashboard data model SHOULD expose `is_completed` for each generated completed meal and SHOULD expose `completed_at` when Todoist provides a reliable completion timestamp.
- **FR-016**: Completed Todoist tasks whose returned `due.date` is outside the displayed dashboard date/window MUST NOT be included in Week Meals and MUST NOT be shifted forward into the visible week.
- **FR-017**: Completed Todoist tasks MUST NOT be reintroduced into generated Week Meals solely because Todoist's completed-task payload returns a `due.date` in the visible dashboard date/window; completed-only tasks MUST also have `completed_at`, converted to the pipeline local timezone (`Europe/London`), equal to the pipeline run date.
- **FR-021**: Dashboard generation MUST use Todoist `due.date` as the display/meal-window date for active/incomplete tasks. For completed tasks, `due.date` remains the display/meal-window date only after the same-day completion guard in FR-017 passes; `completed_at` MUST be used only for eligibility and completion metadata, not as the display date.
- **FR-018**: Partial Week Meals cards MUST NOT render the targeted missing-explanation section on the compact card itself; that explanation belongs in the Meal Detail Overlay opened from the card.
- **FR-019**: The targeted missing-explanation section MUST be shown only in the Meal Detail Overlay for `partial` meals with reliable matcher/generator explanation metadata, MUST be titled `Expected Items`, and MUST be derived from matcher/generator data designed for this purpose, not from a dashboard-side recomputation of Tesco matching.
- **FR-020**: The `Expected Items` text MUST be human-meaningful and scoped to the meal; for example, a roast dinner partial match should identify missing blockers such as `broccoli` and/or `roast potatoes` rather than dumping unrelated unmatched grocery items.
- **FR-026**: The Meal Detail Overlay `Expected Items` section MUST use the same visual language as the Matched Items section: the section title should use the same white/title treatment, and each expected ingredient/component MUST render in its own row/box rather than as a plain comma-separated or inline text block. The Expected Items row/box background width MUST line up with the Matched Items row background width, using the same content container width and horizontal padding/alignment so the two sections form a visually consistent stack.
- **FR-010**: The meal card in the expanded weekly grid MUST be clickable; clicking it MUST open the meal detail overlay for that meal.
- **FR-011**: The meal detail overlay MUST display: meal name, simple coverage status (`Complete`/`Partial`/`Missing`), matched items (deduplicated), notes (when present), and Todoist link; it MUST NOT display RAG wording, a numeric coverage percentage/bar, a `Missing Items` section, or missing-item chips. Matched item rows MUST present name, quantity, and price in stable aligned columns, and the matched-items section MUST show a bottom total summing available matched receipt prices without inventing prices for unavailable entries.
- **FR-012**: The meal detail overlay MUST display a Todoist completion badge when the meal has `is_completed = true`, separate from and without altering coverage status, coverage score, matched items, or underlying missing-item data.
- **FR-013**: The meal detail overlay MUST be dismissible via close button or backdrop click and MUST clear selected meal state when dismissed.
- **FR-014**: Matched item rows in the meal detail overlay MUST be clickable when they represent a Tesco/order item with product metadata.
- **FR-015**: Clicking a matched item from the meal detail overlay MUST open the shared Product Info Modal governed by `010-dashboard-product-detail`, with the same product lookup, image/icon, substitution, description, storage/preparation, price, loading, fallback, and close behaviours as clicking an item in the Order Items by Category list.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — `007-dashboard-meal-cards` replaces `007-dashboard-weekly-grid` and `009-dashboard-meal-detail` as an expected artifact. `009-dashboard-meal-detail` is removed.
- `SKILL.md` changes required: Yes — dashboard UI feature spec list updated to reference `007-dashboard-meal-cards` in place of the two merged specs.
- Runtime state changes required: No — this is a current-behaviour documentation merge.
- Secrets/config changes required: No.
- Cron/hook changes required: No.

### Key Entities

- **Week Window**: Current dashboard concept captured from the implementation.
- **Meal Type Row**: Current dashboard concept captured from the implementation.
- **Meal Card**: Weekly grid card showing meal name, truncated, with emoji-prefixed labels and simple coverage-status text (`Complete`, `Partial`, or `Missing`) rather than RAG wording or an individual percentage. Clickable — opens detail overlay. It does not render partial missing-explanation text directly.
- **Meal Detail Overlay**: Modal overlay showing meal details including matched items in aligned name/quantity/price columns with a matched-items total, a single compact simple coverage status badge (`Complete`, `Partial`, or `Missing`) near the meal title, notes, Todoist link, optional completion badge, and for partial meals a targeted `Expected Items` section when reliable missing-explanation metadata exists; it deliberately omits a duplicate `Coverage status` section, RAG wording, the old broad Missing Items dump, and individual numeric percentage/progress bar.
- **Clickable Matched Item**: A matched item displayed in the Meal Detail Overlay that opens the shared Product Info Modal for the underlying Tesco/order item.
- **Expected Items**: A Meal Detail Overlay section shown only for partial matches with reliable explanation metadata, stating the meal-specific components or matcher blockers still needed to make the meal covered. It is not shown on the compact Week Meals card and MUST NOT be labelled `Missing for 100%`. It visually matches the Matched Items section style: white/title-style heading and individual boxed rows for each expected item/component, with row/box background width aligned to the Matched Items row background width.
- **Delivery Marker**: Small label in a Week Meals day header showing that generated pipeline delivery metadata contains an actual Tesco delivery event on that date. It is a rendered pipeline fact, not a recurring weekday inference.
- **Simple Coverage Status**: Individual meal display state derived from generated meal `status`: `Complete`, `Partial`, or `Missing`. It replaces both individual meal percentage display and RAG wording (`Green`/`Amber`/`Red`) for Meal Cards and the Meal Detail Overlay.
- **Coverage Colour**: Current dashboard concept captured from the implementation for aggregate/cell colouring; individual meal status text must remain `Complete`, `Partial`, or `Missing` and must not include RAG colour words.
- **Todoist Completion Badge**: White rounded pill with "✓ Todoist" text rendered on meal cards and in the detail overlay when the meal's Todoist task is completed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The weekly grid displays seven day columns and breakfast/lunch/dinner rows from current generated data.
- **SC-002**: Collapsed rows show aggregate coverage rather than individual meal cards, with colour based on the aggregate average score.
- **SC-003**: Expanded rows show individual meal cards with labels and simple coverage status text (`Complete`, `Partial`, or `Missing`), not RAG wording and not individual numeric coverage percentages; clicking a card opens the detail overlay.
- **SC-004**: Active/incomplete Todoist meals are shown by due date, while completed Todoist meals are visibly distinguishable in the weekly grid only when their due date is in the displayed date/window and their `completed_at` local date equals the pipeline run date.
- **SC-005**: The detail overlay shows all specified fields for the selected meal, including simple coverage status (`Complete`, `Partial`, or `Missing`) and completion badge when applicable, and does not show RAG wording, an individual numeric coverage percentage/bar, or a Missing Items section.
- **SC-006**: Closing the overlay clears selected meal state and returns focus to the weekly grid.
- **SC-007**: Completion state in both the meal card and the detail overlay does not alter coverage status, underlying generated score/data, matched items, or underlying missing-item data.
- **SC-008**: Clicking a matched item in the meal detail overlay opens the same Product Info Modal used by Order Items by Category.
- **SC-009**: A completed meal with returned due date outside the displayed dashboard date/window, such as `Duck pancakes, prawn toast, spring rolls` due 11 July when viewing Tuesday 16 July, is absent from Week Meals.
- **SC-011**: A completed meal whose returned due date is inside the displayed dashboard date/window but whose `completed_at` local date is not the pipeline run date, such as `Steak, sliced potatoes (frozen), frozen veg` returning 15 June after being completed on 11 June, is absent from Week Meals.
- **SC-010**: A partial meal's detail overlay shows a concise targeted section titled `Expected Items` when reliable metadata exists; compact Week Meals cards do not show that partial-only section, the overlay does not use the old `Missing for 100%` label, the title uses the Matched Items-style white heading treatment, and each expected item appears in its own box/row whose background width aligns with the Matched Items row background width.
- **SC-012**: Week Meals shows Delivery markers only on dates present in generated pipeline delivery metadata, so a regular Tesco weekday with no actual delivery event has no marker and an actual delivery date does have one.

## Assumptions

- The 2026-06-14 coverage-status wording refinement is implemented: individual meal status removes RAG wording and reads only `Missing`, `Partial`, or `Complete`. Prior delivery-marker, Expected Items, and overlay behaviour refinements are implemented baseline behaviour.
- The dashboard consumes generated pipeline data from `real-data.ts`; delivery markers must be rendered from pipeline-owned delivery metadata rather than by frontend Tesco weekday inference.
- The meal detail overlay reads from the same in-memory coverage array as the weekly grid; it does not trigger a separate data fetch.
- The 2026-06-13 UI/data-generation refinements are implemented: the broad visible Missing Items section remains removed from the meal detail overlay, matched items open the shared Product Info Modal, completed meals outside the displayed date/window are filtered out, completed-only Todoist meals require the same-day `completed_at` eligibility guard before being reintroduced into Week Meals, targeted partial missing explanations appear in the Meal Detail Overlay, and individual meal coverage displays simple `Missing`/`Partial`/`Complete` status text instead of numeric percentage or RAG wording.

## Out of Scope

- Changing meals-check pipeline matching semantics, except for adding generated explanation metadata needed to display why an existing partial match is not covered. Replacing individual meal percentage/RAG display with simple status text is a dashboard presentation change; it does not require changing matcher status semantics.
- Changing Telegram report formatting.

## Clarifications

### Session 2026-06-11 — Merge of 007 and 009

- Q: Should weekly grid cards and the meal detail overlay be separate specs? → A: No. They are the same interactive surface. A meal card click opens the overlay; the overlay reads the same data model. Documenting them separately creates drift risk. They are now one spec: `007-dashboard-meal-cards`.

### Session 2026-06-13 — Meal detail overlay refinement

- Q: Should the meal card/detail overlay show `Missing Items`? → A: No. Remove the visible `Missing Items` section from the meal detail overlay.
- Q: Should matched items in the meal detail overlay be interactive? → A: Yes. Clicking a matched item should open the same Product Info Modal used by the `Order Items by Category` list.

### Session 2026-06-13 — Completed meal due-date filtering

- Q: Should a completed meal appear in Week Meals if its original due date is outside the displayed dashboard date/window? → A: No. `Duck pancakes, prawn toast, spring rolls` had due date 11 July and must not appear under Tuesday 16 July. Completed meals must be filtered/rendered by original due date, not completion date or carried-forward display logic.

### Session 2026-06-13 — Partial-match missing explanation

- Q: Should partial Meal Cards explain what is missing to reach 100% coverage? → A: Superseded later on 2026-06-13. The targeted explanation still exists, but it belongs in the Meal Detail Overlay opened from the Meal Card, not on the compact Week Meals card.

### Session 2026-06-13 — Completed task same-day eligibility

- Q: If Todoist completed-task due dates can change, what rule should govern completed meals in Week Meals? → A: Use `due.date` normally for incomplete tasks. For completed tasks, include them only if the returned `due.date` is in the displayed dashboard date/window and `completed_at`, converted to the pipeline local timezone (`Europe/London`), has the same local date as the pipeline run date.

### Session 2026-06-13 — Delivery marker source of truth

- Q: Is the false Delivery marker a one-off date problem? → A: No. The fundamental issue is that the dashboard was deriving operational delivery facts from display convenience. Delivery markers must come from pipeline-resolved delivery metadata, not hard-coded Tesco weekdays, receipt-date anchoring, or frontend reconstruction.

### Session 2026-06-13 — Partial explanation placement and label emoji

- Q: Where should partial-match missing explanations appear? → A: Move them off compact Week Meals cards and into the Meal Detail Overlay opened by clicking a meal. Keep them targeted, not a broad Missing Items dump.
- Q: How should labels appear on Week Meals cards? → A: Prefix each visible label with a label emoji such as `🏷️`.

### Session 2026-06-13 — Expected Items label

- Q: What should the targeted partial-match section in the Meal Detail Overlay be called? → A: Rename it from `Missing for 100%` to `Expected Items`.

### Session 2026-06-13 — RAG status instead of individual percentages

- Q: Should an individual partial meal show a percentage such as 50%? → A: No. Replace individual meal percentage/progress-bar display on Meal Cards and in the Meal Detail Overlay with a RAG status: Green/covered, Amber/partial, Red/missing. This avoids implying that `partial = 50%` is a proportional ingredient calculation.

### Session 2026-06-14 — Expected Items visual style

- Q: How should the Meal Detail Overlay `Expected Items` section look? → A: Make it visually match the Matched Items section: the section title should use the same white/title style, and each expected item/component should appear in its own box/row rather than plain inline text.

### Session 2026-06-14 — Remove RAG wording from coverage status

- Q: What should the Meal Card and Meal Detail Overlay coverage status read? → A: Remove RAG wording. Visible individual meal coverage status should read only `Missing`, `Partial`, or `Complete`; do not show `Green`, `Amber`, or `Red`, and do not restore individual percentages/progress bars.

### Session 2026-06-14 — Expected Items row width alignment

- Q: How wide should the Meal Detail Overlay `Expected Items` row backgrounds be? → A: They should line up with the Matched Items row background width, using the same content container width and horizontal padding/alignment.
