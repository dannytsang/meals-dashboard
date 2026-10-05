# Implementation Plan: Dashboard Grocy Pantry Coverage

Status: Final
Feature: 020-dashboard-grocy-pantry-coverage
Skill: data-science/meals-check

## Summary

Plan for integrating Grocy pantry inventory as an automatic coverage source in the meals-check pipeline. Order items are matched first (freshness preference); Grocy items fill remaining gaps. Each `matched_items[]` entry gains a `source` field (`"order" | "grocy" | "manual_override"`), and the dashboard renders a `🏠 In pantry` badge for Grocy-matched items. Grocy matching is best-effort: fail-soft on network errors; the sync continues. The Grocy client itself is an existing dependency (per `references/grocy-integration.md`).

## Technical Context

- `tesco_matcher.py` — coverage matching, location: `/home/hermes/.hermes/scripts/tesco_matcher.py`. Owns `match_meal()`.
- `tesco_meal_check.py` — main pipeline, location: `/home/hermes/.hermes/scripts/tesco_meal_check.py`. Owns the coverage blob write logic.
- `grocy_client.py` — Grocy API client, location: `/home/hermes/.hermes/scripts/grocy_client.py` (existing).
- `grocy-integration.md` — integration notes, location: `references/grocy-integration.md`.
- Dashboard meal detail card: `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx`.
- Grocy env vars: `GROCY_API_KEY`, `GROCY_BASE_URL` (already declared in `skill.spec.yaml`).

## Constitution Check

- Raw report is the product: Pass — Telegram raw report content gains a `🏠 In pantry` indicator for Grocy-matched items; report shape extended.
- Observable pipeline behaviour beats guesswork: Pass — SC-01 through SC-05 are observable.
- Runtime state is declared, not committed: Pass — Grocy env vars are runtime config, not committed.
- Production side effects are bounded: Pass — Grocy is read-only; the pipeline only GETs from Grocy. Failures are non-blocking.

## Scope

In scope:
- `tesco_matcher.py` calls `grocy_client.get_products_in_stock()` after order allocation
- Match remaining meal requirements to Grocy pantry items
- Each `matched_items[]` entry gains `source: "grocy"` for Grocy matches
- Dashboard meal detail card: `🏠 In pantry` badge for Grocy-matched items
- Fail-soft on Grocy errors: log warning, continue sync

Out of scope:
- Storage layout primitives → `016-dashboard-blob-storage-layout`
- Dashboard read path → `017-dashboard-blob-read-path`
- Order status tracking → `018-dashboard-order-status-tracking`
- Coverage invalidation / refund / perishable / manual override → `019-dashboard-coverage-invalidation-refunds-perishables`
- The Grocy client itself → existing dependency
- Pantry expiry tracking → future feature

## Scenario Coverage Matrix

- Positive: meal item in Grocy but not order → matched with `source: "grocy"` → SC-01
- Positive: item in both order and Grocy → matched with `source: "order"` (order takes priority) → SC-02
- Boundary: Grocy down → fail soft, sync continues → SC-04
- Integration-isolated: Grocy items don't get `use_by_warning` → SC-03
- UI: `🏠 In pantry` badge rendered for Grocy-matched items → SC-01

## Implementation Approach

1. Add Grocy call to `tesco_matcher.py`:
   - After order allocation, call `grocy_client.get_products_in_stock()`
   - For each meal with remaining unmatched items, attempt to match by name (case-insensitive substring) or exact product ID
   - Mark matched items with `source: "grocy"`

2. Update `tesco_meal_check.py`:
   - Wrap Grocy call in try/except
   - On error, log warning and continue with order-only coverage
   - Each `matched_items[]` entry's `source` field is set to `"order"` for order items and `"grocy"` for pantry items (default `"order"`)

3. Update dashboard:
   - `dashboard-client.tsx` meal detail card: render `🏠 In pantry` badge for any `matched_items[]` entry with `source: "grocy"`
   - Add focused test asserting the badge appears only for Grocy-matched items

4. Tests:
   - Unit test: Grocy item matched when order does not cover
   - Unit test: order item matched with `source: "order"` even when Grocy also has it
   - Unit test: Grocy down → fail soft, sync continues
   - Unit test: Grocy-matched items don't get `use_by_warning`
   - Dashboard test: `🏠 In pantry` badge rendered for Grocy-matched items
   - Dashboard test: no badge for order-matched items

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Grocy API rate limit hit | Fail soft: log warning, continue with order-only coverage. Do not block the sync. |
| Grocy product name doesn't match any meal item | The matcher is opportunistic; unmatched pantry items are ignored. |
| Grocy schema change breaks the client | The Grocy client is owned by a separate concern. The matcher is fail-soft on schema mismatch. |
| Grocy items mistakenly matched to wrong meals (false positive) | Name-based match is case-insensitive substring; use exact product ID where available to reduce false positives. Add a focused test for a known false-positive case (e.g. "salad" matching "salad dressing"). |
| Grocy is the source of truth for "what's in the pantry" but the user has multiple pantries | Out of scope; one Grocy instance. Multi-pantry support is a future feature. |
| Performance: Grocy call on every sync | The Grocy call is a single GET; sub-second response time. Cache the response for the duration of a single sync if needed. |

## Verification

Required before promoting to Final:
- `python3 -m unittest test_tesco_matcher -v` passes with new Grocy tests
- `python3 -m unittest test_tesco_meal_check -v` passes
- `python3 tesco_meal_check.py --days 30 --output both` runs end-to-end with Grocy configured
- `python3 tesco_meal_check.py --days 30 --output both` runs end-to-end with Grocy unconfigured (fail-soft path)
- `npm test -- --run` passes in meals-dashboard, including new pantry-badge tests
- `npx tsc --noEmit` clean in meals-dashboard
- `npm run build` clean in meals-dashboard
- `npm run scan:static-private-data` clean
- Manual smoke: trigger a meal plan with a Grocy-only item → verify `🏠 In pantry` badge
- Commit + push to meals-check and meals-dashboard
- Trigger production meals check + Vercel deployment
- Smoke-test production dashboard

## Reference Documents

- `references/grocy-integration.md` — Grocy API client details
- `references/dashboard-matching-lessons-2026-06-08.md` — matcher accuracy patterns
- `references/dashboard-no-match-triage.md` — no-match triage workflow
- `019-dashboard-coverage-invalidation-refunds-perishables` — `matched_items[]` schema owner

## Sibling Features

- `016-dashboard-blob-storage-layout` — produces the storage layout
- `017-dashboard-blob-read-path` — consumer; surfaces the `🏠 In pantry` badge
- `018-dashboard-order-status-tracking` — independent
- `019-dashboard-coverage-invalidation-refunds-perishables` — owns the `matched_items[]` schema and `source` field
