# Tasks: Dashboard Order Items Delivery-Filter Empty-State Fallback

Status: Proposed
Feature: 037-dashboard-order-items-delivery-filter-empty-state-fallback
Skill: data-science/meals-check

Tasks are sequenced by phase. A task is "done" when its acceptance criteria pass and the diff matches the listed file paths.

## Phase 1 — Fallback decision logic + persistence (FR-001, FR-003, FR-007)

- [ ] **T010** [FR-001, FR-007] In `components/dashboard-client.tsx` immediately after the `deliveryFilterSource` state declaration at L163, add two `useRef` flags local to the Order Items by Category section:
  - `const hasFallbackRunRef = useRef(false)` — flipped to `true` on the first fallback, reset on explicit filter click.
  - `const fallbackAppliedRef = useRef<{ from: 'previous'|'next'|'all', to: 'previous'|'next'|'all', reason: 'zero_items' } | null>(null)` — tracks the most recent fallback decision; surfaced to the debug chip via FR-008.
  - **Acceptance criterion**: `grep -n "hasFallbackRunRef\|fallbackAppliedRef" components/dashboard-client.tsx` returns both declarations.
  - **Acceptance criterion**: TypeScript compiles cleanly (`cd /home/hermes/workspace/meals-dashboard && npx tsc --noEmit`).

- [ ] **T020** [FR-001, FR-005, FR-006, FR-007] Add the fallback decision logic as a `useMemo` immediately after the existing spec 034 hydrate effect (around L177). The memo MUST:
  - Skip when `isDemoMode()` returns true (FR-006).
  - Skip when `hasFallbackRunRef.current === true` (FR-007, prevents re-fire on re-render).
  - Skip when the persisted filter is `all` and the all-filter group is empty (per AS-003, no fallback exists above all).
  - Otherwise, compute the post-filter item count for the persisted filter; if zero AND the filter is `previous` or `next`, look up the fallback target from the preference list `[next, all, previous]` and return `{ from, to, reason: 'zero_items', explanationText }`.
  - Persist the new filter to `sessionStorage['meals-dashboard:order-items-delivery-filter']` in the same render cycle (NOT in a deferred `useEffect`) per FR-003.
  - Set `hasFallbackRunRef.current = true` and `fallbackAppliedRef.current = { from, to, reason }`.
  - **Acceptance criterion**: AS-001..AS-010 test cases (added in T060) pass.

- [ ] **T030** [FR-007, FR-005] Verify the fallback decision uses the same `classifiedOrders` derived data the section already computes (spec 034 L367-L377). The fallback MUST NOT introduce a new classification pass.
  - **Acceptance criterion**: `grep -n "activeGroups.length === 0\|nextGroups.length === 0\|previousGroups.length === 0" components/dashboard-client.tsx` returns the post-filter length checks (no new derivation).
  - **Acceptance criterion**: NFR-001 budget preserved (≤ 3 length-checks added; total ≤ 19 comparisons per render vs spec 034's ≤ 16 budget).

## Phase 2 — Fallback notice JSX + filter click reset (FR-002, FR-004)

- [ ] **T040** [FR-002, FR-004] Render the fallback notice as a `<div data-testid="delivery-filter-fallback-notice" role="status" aria-live="polite">` immediately above the existing item row container (around L820, before the category chips).
  - The text MUST be one of the four canonical templates from FR-002:
    - `Previous filter had no items — showing Next delivery ({DD MMM})`
    - `Previous filter had no items — showing All deliveries`
    - `Next filter had no items — showing All deliveries`
    - (the all-empty case from AS-003 does NOT render the notice; the existing spec 008 empty state renders instead)
  - The notice MUST be visually subtle (use `--text-tertiary` colour per the existing design tokens; do not introduce a yellow/red warning banner).
  - The notice MUST NOT include any icon or close button.
  - Update the existing `onClick={() => setDeliveryFilter(f)}` handler at L940 to also reset `hasFallbackRunRef.current = false` and `fallbackAppliedRef.current = null` per FR-004.
  - **Acceptance criterion**: AS-001 (renders swap explanation), AS-005 (no second explanation on reload), AS-006 (no explanation on explicit click) all pass.
  - **Acceptance criterion**: `grep -n 'data-testid="delivery-filter-fallback-notice"' components/dashboard-client.tsx` returns the JSX.
  - **Acceptance criterion**: `grep -n 'role="status" aria-live="polite"' components/dashboard-client.tsx` returns the JSX.

## Phase 3 — Debug chip field (FR-008)

- [ ] **T050** [FR-008] Extend the `deliveryFilterState` chip payload at `components/dashboard-client.tsx:431-433` with the optional `fallbackApplied` field.
  - The field MUST be `null` when no fallback has fired (renders as `fallbackApplied: null` in the chip payload).
  - When `fallbackAppliedRef.current` is non-null, the field MUST be `{ from, to, reason }` matching the spec 034 `DeliveryFilterDebugState` type extension.
  - The chip remains read-only per spec 022's debug-mode-is-read-only rule.
  - **Acceptance criterion**: AS-007 test case passes.
  - **Acceptance criterion**: `grep -n "fallbackApplied:" components/dashboard-client.tsx` returns the chip field.
  - **Acceptance criterion**: TypeScript compiles cleanly (`cd /home/hermes/workspace/meals-dashboard && npx tsc --noEmit`).

## Phase 4 — Tests (FR-009)

- [ ] **T060** [FR-009] Create `components/dashboard-client-delivery-filter-fallback.test.tsx` with 10 test cases:
  - `test_previous_with_zero_items_falls_back_to_next` — AS-001.
  - `test_next_with_zero_items_falls_back_to_all` — AS-002.
  - `test_all_with_zero_items_renders_spec_008_empty_state` — AS-003.
  - `test_previous_with_items_renders_unchanged_no_explanation` — AS-004.
  - `test_fallback_persists_across_reload_without_reswowing_explanation` — AS-005.
  - `test_explicit_click_overrides_fallback_without_reswowing_explanation` — AS-006.
  - `test_fallback_applied_field_present_in_debug_chip_after_fallback` — AS-007.
  - `test_fallback_skipped_in_demo_mode` — AS-008.
  - `test_refunded_items_count_as_items_not_zero` — AS-009.
  - `test_fallback_does_not_refire_on_state_change_rerender` — AS-010.
  - All 10 tests MUST use the existing fixture infrastructure (`lib/fixtures/dashboard-fixture.json` + spec 024's `generate-fixture.mjs`) and MUST NOT require a live Vercel Blob read.
  - **Acceptance criterion**: `cd /home/hermes/workspace/meals-dashboard && npx vitest run components/dashboard-client-delivery-filter-fallback.test.tsx` shows 10/10 tests green.
  - **Acceptance criterion**: `cd /home/hermes/workspace/meals-dashboard && npx vitest run` preserves the existing 410-test baseline.

## Phase 5 — End-to-end verification

- [ ] **T070** [NFR-001, NFR-004, NFR-006] Run the full verification block:
  - `cd /home/hermes/workspace/meals-dashboard && npx tsc --noEmit` — 0 errors expected.
  - `cd /home/hermes/workspace/meals-dashboard && npx vitest run` — 410 + 10 = 420 tests green.
  - `python3 -m unittest test_tesco_matcher -v` from `/home/hermes/.hermes/scripts` — no matcher regressions.
  - `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — ends with `No issues found.`.
  - `grep -rn "fallback\|fallbackApplied" components/ lib/ app/ --include="*.tsx" --include="*.ts"` — returns only `components/dashboard-client.tsx` and `components/dashboard-client-delivery-filter-fallback.test.tsx`. If the grep returns a Python file or a cron wrapper, that is a scope leak and MUST be reverted.

## Phase 6 — Skill contract + index (FR-010)

- [ ] **T080** [FR-010] Update `data-science/meals-check/skill.spec.yaml` to add spec 037 to the `expected_artifacts` list under the dashboard-UI features group, alongside spec 008, 010, 026, 031, 034. Append one bullet per spec file:
  - `.specify/specs/037-dashboard-order-items-delivery-filter-empty-state-fallback/spec.md`
  - `.specify/specs/037-dashboard-order-items-delivery-filter-empty-state-fallback/plan.md`
  - `.specify/specs/037-dashboard-order-items-delivery-filter-empty-state-fallback/tasks.md`
  - `.specify/specs/037-dashboard-order-items-delivery-filter-empty-state-fallback/CHANGELOG.md`
  - `.specify/specs/037-dashboard-order-items-delivery-filter-empty-state-fallback/scenarios.yaml`
  - `.specify/specs/037-dashboard-order-items-delivery-filter-empty-state-fallback/traceability.yaml`
  - **Acceptance criterion**: `grep -n "037-dashboard-order-items-delivery-filter-empty-state-fallback" data-science/meals-check/skill.spec.yaml` returns the 6 new lines.

- [ ] **T090** [FR-010] Update `.specify/specs/index.yaml` to add the new spec entry:
  ```yaml
  - id: 037-dashboard-order-items-delivery-filter-empty-state-fallback
    name: Dashboard Order Items Delivery-Filter Empty-State Fallback
    status: Draft
    path: 037-dashboard-order-items-delivery-filter-empty-state-fallback/spec.md
    target_skill: data-science/meals-check
    readiness: spec_only
    depends_on:
    - 034-dashboard-order-items-previous-next-delivery
    conflicts_with: []
    supersedes: []
    related_specs:
    - 008-dashboard-order-items
    - 018-dashboard-order-status-tracking
    - 022-dashboard-debug-mode
    - 024-dashboard-static-fixture-mode-for-preview
    last_reviewed_at: 2026-07-05
  ```
  - **Acceptance criterion**: `grep -n "037-dashboard-order-items-delivery-filter-empty-state-fallback" data-science/meals-check/.specify/specs/index.yaml` returns the new entry block.

## Phase 7 — Deployment (Proposed → Final gate)

- [ ] **T100** Deploy to preview. Open the preview URL with `sessionStorage['meals-dashboard:order-items-delivery-filter'] = 'previous'` pre-set via DevTools. Verify:
  - The Order Items by Category panel auto-falls-back to `next`.
  - The swap explanation appears above the first item row with the exact text from FR-002.
  - Reload once — no swap explanation appears (FR-003 persistence).
  - Reload twice — no swap explanation (sticky persistence).
  - Click the `previous` chip explicitly — panel renders `previous` (empty), no swap explanation (FR-004 reset).

- [ ] **T110** Open PR for review. After merge to `main`, confirm Vercel production deploy succeeds (Last-Modified on `/_next/static/chunks/main-app-*.js` advances by > 1 hour).

- [ ] **T120** Danny exercises the production URL on (a) the day after a delivery (auto-flip + sparse-previous path), (b) a day with no upcoming order blob (`next` falls back to `all`), and (c) a session where `sessionStorage` has `previous` set explicitly. If quality is acceptable, the implementation is verified for production.

- [ ] **T130** Once production evidence is captured, update spec 037 status to `Final` in `index.yaml` AND `spec.md`. Verify both files moved atomically (per the spec-driven-skills `index.yaml` discipline). The chef profile commits the spec-status flip in the same commit as the production evidence capture.