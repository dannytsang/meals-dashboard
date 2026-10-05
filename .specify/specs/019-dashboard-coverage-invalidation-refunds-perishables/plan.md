# Implementation Plan: Dashboard Coverage Invalidation, Refunds, Perishables, and Manual Override

Status: Proposed
Feature: 019-dashboard-coverage-invalidation-refunds-perishables
Skill: data-science/meals-check

## Summary

Plan for the consumer side of order status changes (cancellation, moved, refund, amendment): coverage invalidation on any order content change, refund item display in the meal detail card, shelf-life-aware coverage matching, the perishable "Use today" panel, and manual override for missing items from pantry/fridge. This feature extends the coverage blob schema with `stale`, `staleReason`, `source`, `shelf_life_days`, `use_by_warning`, and `use_by_date` fields. The producer side is `018-dashboard-order-status-tracking`.

## Technical Context

- `tesco_matcher.py` — coverage matching, location: `/home/hermes/.hermes/scripts/tesco_matcher.py`. Owns the `match_meal()` function.
- `tesco_meal_check.py` — main pipeline, location: `/home/hermes/.hermes/scripts/tesco_meal_check.py`. Owns the coverage blob write logic.
- Dashboard meal detail card: `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx` (the existing meal detail overlay).
- Manual override local state: new file at `~/.hermes/scripts/data/manual_overrides.json` (declared in `skill.spec.yaml`).
- Audit log: existing `~/.hermes/scripts/data/audit.jsonl` from `016-dashboard-blob-storage-layout`.

## Constitution Check

- Raw report is the product: Pass — Telegram raw report content gains shelf-life and refund indicators; report shape extended.
- Observable pipeline behaviour beats guesswork: Pass — SC-01 through SC-05 are observable.
- Runtime state is declared, not committed: Pass — `manual_overrides.json` is local state, declared in `skill.spec.yaml`.
- Production side effects are bounded: Pass with caution — manual overrides persist indefinitely until removed; mitigate by adding a `cleared_at` field for future "expiry" support.

## Scope

In scope:
- Coverage invalidation triggered by any order content change
- `stale` / `staleReason` fields on coverage blobs
- Refund processing: meal status `covered` → `partial`, meal detail "refunded" section
- Shelf-life-aware coverage matching
- Perishable items: "Use today" panel + meal summary ⚠️ badge
- Manual override: dashboard UI, local state persistence, audit log
- Four item states: not found, manual override, refunded, order-matched

Out of scope:
- Storage layout primitives → `016-dashboard-blob-storage-layout`
- Dashboard read path → `017-dashboard-blob-read-path`
- Order status tracking (the producer) → `018-dashboard-order-status-tracking`
- Grocy pantry coverage → `020-dashboard-grocy-pantry-coverage`
- Tesco product enrichment process → `004-dashboard-sync`

## Scenario Coverage Matrix

- Positive: amendment adds 1 item → coverage recalculated → new item appears → SC-01
- Positive: refund reduces 3 items → coverage recalculated → affected meals → SC-02
- Positive: perishable item → "Use today" section + meal badge → SC-03
- Positive: manual override → persisted → badge shown → SC-04
- Boundary: manual override does not auto-upgrade meal status → SC-04 (Acceptance 5)
- Boundary: stale coverage state is transient → race-condition safety → FR-002
- Integration-isolated: order status change from `018` triggers this feature's invalidation → separate integration test

## Implementation Approach

1. Extend coverage blob schema in `tesco_meal_check.py`:
   - Add `stale: false`, `staleReason: null` to every coverage blob
   - Add `source: "order"`, `shelf_life_days: undefined`, `use_by_warning: false`, `use_by_date: undefined` to each `matched_items[]` entry (default values; populated by shelf-life matching)

2. Add coverage invalidation logic:
   - When an order blob is written (or its `status` changes), find all coverage blobs whose `sourceOrderBlobPath` matches
   - Set `stale: true` + `staleReason` to one of `order_updated` / `order_cancelled` / `order_superseded` / `order_refunded`
   - Recalculate coverage for affected dates
   - Write fresh coverage blobs with `stale: false`
   - Append audit log entry

3. Add refund processing:
   - When a refund email is processed, the affected order's `matched_items` that were sole coverage for a meal are flagged
   - Affected meals transition `covered` → `partial`
   - Meal detail card shows refunded items in distinct "refunded" section
   - Audit log entry for refund processing

4. Add shelf-life-aware matching to `tesco_matcher.py`:
   - Sort meal dates ascending
   - For each meal, allocate items with `shelf_life_days <= 1` first (same-day or next-day)
   - Items with `shelf_life_days == 2` matched to meals within 2 days
   - Mark `use_by_warning: true` when `shelf_life_days <= days_until_meal_date`
   - Compute `use_by_date = delivery_date + shelf_life_days`

5. Add manual override persistence:
   - `~/.hermes/scripts/data/manual_overrides.json` keyed by `(meal_date, meal_name, item_name)`
   - On sync, read the file and merge overrides into coverage calculation
   - When the dashboard triggers an override, the meals skill appends to this file and the next sync persists the override in the coverage blob

6. Dashboard UI changes:
   - Meal detail card: four item states with distinct visual treatment
   - "Use today" section at the top of the meal detail card
   - ⚠️ perishable badge on meal summary card
   - "✓ We have it" button on each unmatched item, triggering an override write
   - "I have this" affordance should be discoverable but not in the way of the matched items

7. Tests:
   - Unit tests for each matcher rule (shelf-life, refund processing, override merging)
   - Unit tests for coverage invalidation logic
   - Dashboard tests for the four item states
   - Dashboard tests for the "Use today" section + perishable badge
   - Dashboard tests for manual override button + persistence

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Coverage invalidation race: a coverage blob is `stale: true` when the dashboard reads it | Transient state — the pipeline writes the fresh blob in the same sync; the dashboard shows the "⚠️ stale coverage" indicator and does not use the data |
| Stale coverage data could be served if a sync is interrupted mid-write | The pipeline overwrites coverage blobs in-place, so a partial write is unlikely; if it happens, the next sync re-writes the blob from the live order state |
| Shelf-life matching is greedy and may starve later meals of items they need | The matcher is allocation-aware: items are allocated to meals in date-ascending order; short-shelf-life items are allocated first, but only to meals they can reach. Later meals still get the general items. Add a regression test for starvation. |
| Manual override file grows unbounded | Out of scope here. Future feature: add a `cleared_at` field and rotate old entries. |
| Refund items without a list of refunded items in the email | Tesco refund emails typically list refunded items; the parser extracts `refunded_items` if present; if absent, the entire order is marked refunded and the item list cleared. Add a focused test for the absent-list case. |
| Four item states confusion in the dashboard | Add focused tests asserting the four states render distinctly; add a "Meal detail item state" glossary entry to the dashboard UI element glossary reference. |

## Verification

Required before promoting to Final:
- `python3 -m unittest test_tesco_matcher -v` passes with new shelf-life tests
- `python3 -m unittest test_tesco_meal_check -v` passes with new invalidation and refund tests
- `python3 -m unittest test_tesco_report_display -v` passes
- `python3 tesco_meal_check.py --days 30 --output both` runs end-to-end
- `npm test -- --run` passes in meals-dashboard, including new item-state, "Use today", perishable badge, and manual override tests
- `npx tsc --noEmit` clean in meals-dashboard
- `npm run build` clean in meals-dashboard
- `npm run scan:static-private-data` clean
- Manual smoke: simulate amendment adding 1 item → verify new item in coverage
- Manual smoke: simulate refund reducing 3 items → verify meals transition to `partial` correctly
- Manual smoke: process a delivery with a perishable item → verify "Use today" section
- Manual smoke: trigger manual override via dashboard → verify override persists across re-sync
- Commit + push to meals-check and meals-dashboard
- Trigger production meals check + Vercel deployment
- Smoke-test production dashboard

## Reference Documents

- `references/dashboard-matching-lessons-2026-06-08.md` — matcher accuracy patterns
- `references/dashboard-meal-detail-matched-item-layout.md` — meal detail matched-item layout
- `references/dashboard-expected-items-debugging.md` — expected items source-of-truth chain
- `references/dashboard-coverage-score-semantics.md` — coverage score semantics
- `references/roast-dinner-matcher-flexibility.md` — partial meal handling patterns
- `references/dashboard-no-match-triage.md` — no-match triage workflow

## Sibling Features

- `016-dashboard-blob-storage-layout` — produces the storage layout
- `017-dashboard-blob-read-path` — consumer; surfaces the four item states + perishable badge
- `018-dashboard-order-status-tracking` — producer of order status changes that this feature consumes
- `020-dashboard-grocy-pantry-coverage` — independent; adds `source: "grocy"` to `matched_items[]`
