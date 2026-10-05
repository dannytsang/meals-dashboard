# Implementation Plan: Dashboard Order Items Delivery-Filter Empty-State Fallback

Status: Proposed
Feature: 037-dashboard-order-items-delivery-filter-empty-state-fallback
Skill: data-science/meals-check

## Summary

Adds an empty-state fallback to the spec 034 Order Items by Category section-level delivery filter (Previous / Next / All). When the persisted filter would render zero items, the section auto-falls-back to the next non-empty filter in the preference list `[next, all, previous]`, surfaces a one-line inline explanation, and persists the new choice. Pure client-side render-time change; no data layer, no pipeline, no schema changes.

## Technical Context

- **`components/dashboard-client.tsx:152-186`** — spec 034's filter state machine. CHANGED. New `useRef` flags (`hasFallbackRunRef`, `fallbackAppliedRef`) local to the Order Items by Category section. New fallback decision logic inline after the existing hydrate effect (around L177). New fallback notice JSX above the existing item rows (around L820).
- **`components/dashboard-client.tsx:367-377`** — spec 034's `classifiedOrders` derivation. UNCHANGED. The fallback reads from the already-derived `activeGroups` / `nextGroups` / `previousGroups` arrays.
- **`components/dashboard-client.tsx:411-433`** — spec 034's `deliveryFilterState` debug chip payload. CHANGED. New optional `fallbackApplied` field (FR-008).
- **`components/dashboard-client.tsx:940`** — existing `onClick={() => setDeliveryFilter(f)}` handler. CHANGED. Reset `hasFallbackRunRef.current = false` on explicit clicks per FR-004.
- **`lib/runtime-mode.ts`** — UNCHANGED. spec 024's `isDemoMode()` is reused as-is per FR-006.
- **All Python pipeline scripts** — UNCHANGED. The fallback is a pure client-side render guard; no data layer changes.
- **All cron wrappers, the email-action monitor, the meals-hook** — UNCHANGED.

## Constitution Check

- **One user story per feature**: satisfied. Spec has one user story (empty-state fallback for the spec 034 filter).
- **Closure-not-deletion**: N/A. Spec 034 stays Final; spec 037 adds a render-time guard on top of it.
- **FR-NNN required**: satisfied. 10 FRs (FR-001..FR-010), all `FR-\d{3}` format.
- **Skill contract source of truth**: `skill.spec.yaml` will be updated to add the 6 expected_artifacts entries in the same commit as the spec files.
- **Runtime state declared, not committed**: `sessionStorage['meals-dashboard:order-items-delivery-filter']` is browser-managed, not source-controlled. No new committed-to-repo artefacts.
- **Idempotence**: `hasFallbackRunRef` ensures the fallback fires once per component instance lifetime; explicit clicks reset it per FR-004.

## Implementation Phases

### Phase 1 — Fallback decision logic + persistence (FR-001, FR-003, FR-007)

See tasks T010 + T020 + T030. Add the two `useRef` flags immediately after spec 034's `deliveryFilterSource` state (L163). Add the fallback decision logic as a memoised `useMemo` that depends on `classifiedOrders` + `deliveryFilter` + `isDemoMode()`. The memo computes the new filter (or `null` if no fallback applies) and the corresponding explanation text (or `null`).

### Phase 2 — Fallback notice JSX + filter click reset (FR-002, FR-004, FR-006)

See tasks T040. Render the fallback notice as a `<div data-testid="delivery-filter-fallback-notice" role="status" aria-live="polite">` immediately above the existing item row container (around L820, before the category chips). Update the existing `onClick={() => setDeliveryFilter(f)}` handler at L940 to also reset `hasFallbackRunRef.current = false`.

### Phase 3 — Debug chip field (FR-008)

See task T050. Extend the `deliveryFilterState` chip payload at L431-L433 with the optional `fallbackApplied` field. Use `null` when no fallback has fired.

### Phase 4 — Tests (FR-009)

See task T060. Create `components/dashboard-client-delivery-filter-fallback.test.tsx` with 10 test cases (AS-001..AS-006 + 4 edge cases from the spec). Use existing fixture infrastructure; no live Blob reads.

### Phase 5 — End-to-end verification + production deploy

See tasks T070 + T080. Standard 6-command verification block; promote Draft → Proposed → Final after green.

## Phased Rollout

1. Phase 1 + 2 + 3 land on `feat/spec-037-...` in `/home/hermes/workspace/meals-dashboard`. Unit tests green locally.
2. Phase 4 (tests) lands on the same branch.
3. Tester verification (independent) on the branch.
4. Chef profile merges the feat branch → main, then promotes spec 037 to Final after production evidence.

## Files Touched

| File | Action | Why |
|---|---|---|
| `components/dashboard-client.tsx` | EDIT (small) | New `useRef` flags + fallback memo + notice JSX + click reset. |
| `components/dashboard-client-delivery-filter-fallback.test.tsx` | NEW | 10 test cases per FR-009. |

## Files NOT Touched (Constitution Invariants)

| File | Why |
|---|---|
| `lib/dashboard-data.ts` | No loader changes; fallback reads from already-derived `classifiedOrders`. |
| `lib/item-utils.ts` | No new helpers; fallback is inline in `dashboard-client.tsx`. |
| `lib/dashboard-sync.ts` | No schema changes. |
| `lib/meals-data.ts` | No type changes. |
| `lib/blob-storage.ts` | No read-path changes. |
| `lib/runtime-mode.ts` | Reused as-is (spec 024). |
| `app/page.tsx`, `app/api/*`, `middleware.ts`, `next.config.ts` | Server / route handlers untouched. |
| `lib/fixtures/scripts/generate-fixture.mjs` | Reuses existing fixtures; no generator changes (spec 024). |
| All Python pipeline scripts under `/home/hermes/.hermes/scripts/` | Pipeline untouched; the fallback is client-side only. |
| All cron wrappers | Unchanged. |
| `lib/dashboard-data-error-panel.tsx` | The fallback is a render-time hint, not an error; existing panel is not reused. |

## Risks

- **`useRef` instead of `useState` discipline**: A state variable for `hasFallbackRunRef` would cause every re-render triggered by the state change to re-evaluate the fallback and re-show the explanation (banner flicker). FR-007 mandates `useRef` for this flag. Mitigation: explicit check in the implementation + AS-010 regression test.
- **Demo-mode skip surface area**: The `isDemoMode()` check must guard the entire fallback path, not just the persistence write. FR-006 codifies the single-guard requirement. Mitigation: AS-008 regression test + grep for `isDemoMode()` in the fallback block.
- **Existing badge / sub-heading / placeholder regression**: NFR-004 codifies that items shown under the fallback filter still carry their correct badges and sub-headings. Mitigation: full `npx vitest run` baseline (FR-009 test cases + existing 410 cases).
- **Spec 034 NFR-001 budget**: ≤ 16 comparisons per render. The fallback adds ≤ 3 length-checks (FR-005). Total ≤ 19 comparisons per render. Mitigation: AS-001..AS-010 test cases + the existing spec 034 NFR-001 test (must still pass).
- **Debug-chip payload surface area**: Adding `fallbackApplied` to the chip payload is a wire-format change. Mitigation: AS-007 test + the chip field is optional (`fallbackApplied?: { ... } | null`), so consumers that don't read it are unaffected.
- **Reload-and-re-fire bug**: Without FR-003's "persist in the same render cycle that detects the empty filter" requirement, a reload would re-detect the empty filter and re-show the explanation. FR-003's explicit "MUST occur in the same render cycle, NOT in a deferred useEffect" is the guard. Mitigation: AS-005 test + explicit comment in the implementation.

## Follow-Ups (Out of Scope)

- A query-param-based filter override (`?filter=next`) for the rare case where a user wants the empty-state panel to stay empty (e.g. comparing the empty state to a future populated state). Would require spec 034's sessionStorage persistence to be subordinated to a URL param.
- A `meals-dashboard:order-items-delivery-filter-fallback` event emitted to the dashboard's debug telemetry pipeline so operators can see fallback frequency over time.
- A spec 038 for "dashboard filter affordance consolidation" (roll the Previous / Next / All + sub-heading + placeholder + fallback notice into a single `<DeliveryFilter />` component with named sub-elements).
- A spec for "smart-default detection" — if the persisted filter has been empty for 3+ consecutive cron cycles, automatically clear the sessionStorage entry so the default `next` applies on the next render. This is a behavioural learning feature; out of scope for the fallback spec.