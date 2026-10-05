# Implementation Plan: Dashboard Sync

Status: Final
Feature: 004-dashboard-sync
Skill: data-science/meals-check

## Summary

The Vercel meals dashboard updates from the pipeline cache produced by the same data path as the Telegram report. The dashboard is a presentation surface, not a separate source of truth. This feature owns the cache-to-dashboard repository sync, build, commit, push, deploy boundary, and generated data contract for pipeline-resolved delivery metadata and generated Tesco product metadata; dashboard UI capabilities are split into dedicated feature specs.

## Technical Context

- Runtime profile: `chef`
- Data producer: `/home/hermes/.hermes/scripts/tesco_meal_check.py`
- Sync command: `sync-dashboard-data.py --skip-fetch`
- Generated frontend data target: `/home/hermes/workspace/meals-dashboard/lib/real-data.ts`
- Delivery data contract: pipeline-resolved actual Tesco delivery dates/usable dates must be emitted so the dashboard does not infer delivery markers from hard-coded weekdays or receipt-date heuristics
- Product enrichment contract: receipt/order items may be enriched with Tesco product metadata after data creation and before dashboard push so the frontend product modal can render quickly
- Build gate: `npm run build` before commit/push/deploy
- Deployment boundary: production deploy only when data changes are committed or `--force-deploy` is passed manually
- Contract artifacts: `SKILL.md`, `skill.spec.yaml`, this feature directory, and `CHANGELOG.md`

## Constitution Check

- Raw report is the product: Pass — dashboard uses the same pipeline data and does not replace raw Telegram reporting.
- Observable pipeline behaviour beats guesswork: Pass — missing/stale cache and build failures are diagnosable states.
- Runtime state is declared, not committed: Pass — dashboard cache is generated runtime state for this skill.
- Production side effects are bounded: Pass — commit/push/deploy occurs only through the documented sync path.

## Scope

In scope:
- `dashboard_cache.json` writing in `tesco_meal_check.py`
- `sync-dashboard-data.py --skip-fetch` behaviour
- Build, commit, push, and deploy-on-change logic
- `--force-deploy` flag
- `--dry-run` side-effect suppression
- generated delivery metadata for actual Tesco delivery events in the visible planning window
- best-effort Tesco product metadata enrichment before `real-data.ts` is generated/pushed

Out of scope:
- Dashboard UI interactions and visual layout
- Separate dashboard cron job
- Telegram report formatting changes

## Scenario Coverage Matrix

- Positive: Pipeline writes dashboard cache and sync updates `real-data.ts` → T001, T002, T020
- Positive: Pipeline emits explicit delivery metadata that the dashboard can use for Week Meals delivery markers → T040, T041, T042
- Positive: Sync/enrichment emits optional Tesco product metadata for product detail modal rendering → T050, T051, T052
- Negative: failed/missing Tesco enrichment preserves fallback data and does not block deploy indefinitely → T050, T052, T053
- Negative: No data changes produce no deployment without `--force-deploy` → T004, T020
- Boundary: `--dry-run` validates without commit, push, or deploy → T005, T020
- Integration-isolated: Build failure blocks commit/push/deploy → T003, T020
- Regression: A regular Tesco weekday without a pipeline-resolved delivery event is not emitted as a delivery marker source → T041, T042

## Complexity Tracking

No constitutional complexity exception recorded. Deployment side effects are documented and bounded by the existing sync script.

## Risk & Safety

- Generated dashboard cache must not be committed to this external skill repo.
- Build failures must block deployment.
- Manual `--force-deploy` is the only documented route for deployment without data changes.
- UI specs must not introduce a second matching/calculation source; generated pipeline data remains canonical.
- Delivery metadata must come from calendar/pipeline resolution, not dashboard convenience functions that assume recurring Tesco weekdays.
- Product enrichment should search normal Tesco website search/product pages where available, must be cached/rate-limited/bounded, and must not fabricate data or attempt credential theft/CAPTCHA evasion/security-control circumvention. HTTP 403/rate limits/no confident match are handled fallback outcomes, not permanent blockers.

## Verification

- Bounded dashboard dry-run from an existing pipeline cache
- Build behaviour inspection or equivalent command output
- `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`
- Future implementation verification: dashboard cache/`real-data.ts` contains explicit delivery metadata for actual delivery events and omits non-delivery regular Tesco weekdays.
- Future implementation verification: dashboard cache/`real-data.ts` contains optional Tesco product metadata for enriched items and remains valid when enrichment is missing or skipped.
