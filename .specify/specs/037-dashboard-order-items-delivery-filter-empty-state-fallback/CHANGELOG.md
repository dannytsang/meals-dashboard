# Change Log: Dashboard Order Items Delivery-Filter Empty-State Fallback

Feature ID: `037-dashboard-order-items-delivery-filter-empty-state-fallback`

This changelog records material changes to the feature specification. It is not a log of every status transition, typo fix, formatting change, validator-only normalisation, or routine task checkbox update.

Use this file only when historical context matters. Normal implementation runs should read `spec.md`, `plan.md`, and `tasks.md`; load this changelog for audits/status-history questions.

## Entries

### 2026-07-05 — Proposed (caller hands off to coder profile)

- Change: Flipped `Status: Draft` → `Status: Proposed` and left `readiness: spec_only` unchanged. The Draft is now ready for the `coder` profile to begin implementation on a feature branch.
- Status after change: Proposed.
- Rationale: Danny confirmed with a brief `go ahead`, which in this workflow is the signal to hand the spec to coder for implementation. The feature is scoped, validator-clean, and has no remaining open questions.
- Implementation impact: `spec.md`, `plan.md`, `tasks.md`, and `index.yaml` are updated from Draft to Proposed. No runtime or code artefacts touched (this is a governance-only change).
- Evidence: Spec validator passed with only pre-existing 031 warnings; spec artefacts committed in `d078fc6`.

### 2026-07-05 — Draft (created)

- Change: Authored the Draft from Danny's 2026-07-05 17:5x BST observation that the dashboard's Order Items by Category section appeared "empty" when loaded fresh on a returning browser session. Root cause isolated: spec 034's section-level delivery filter persists its choice in `sessionStorage` under `meals-dashboard:order-items-delivery-filter`; once a user clicks `previous` (or after the auto-flip from `next` → `previous` on the day after a delivery), the panel can render with zero items if the previous order has been refunded to a stub or has no items matching the spec 034 classification. Spec 037 closes the gap by detecting the empty filter result at render time and auto-falling-back to the next non-empty filter in the preference list `[next, all, previous]`, surfacing a one-line inline explanation of the swap, and persisting the new choice so the fallback is sticky for the session. Spec scope: 10 FRs (FR-001..FR-010), 6 NFRs (NFR-001..NFR-006), 1 user story (US1), 10 acceptance scenarios (AS-001..AS-010), 4 edge cases. Hard constraints codified: no new env vars, no new sessionStorage keys, no data-layer changes, no schema changes, no migration to `localStorage`. Reference Material established: spec 034 (parent filter), spec 008 (parent section), spec 018 (status semantics), spec 019 (refund reconciliation), spec 022 (debug-mode read-only), spec 024 (demo-mode skip).
- Status after change: Draft.
- Rationale: Danny's verbatim trigger phrase on 2026-07-05: "the data is empty" — investigation showed the data is correct (production Vercel Blob diagnostic returned 10 meals / 5 OrderBlobs / 3 windows / `loadError: null`); the emptiness is the spec 034 filter rendering a sparse previous order. A proper SDD spec governs the fix rather than a one-shot DevTools clear, because the symptom will recur for every session that persists `previous` through a sparse window.
- Implementation impact: None yet (Draft). When implemented, spec 037 touches:
  - `/home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx` — adds two `useRef` flags (`hasFallbackRunRef`, `fallbackAppliedRef`), a fallback decision `useMemo` (reads existing `classifiedOrders` data), a fallback notice JSX (`<div data-testid="delivery-filter-fallback-notice" role="status" aria-live="polite">`), and an explicit-click reset on the existing filter chip handler. Estimated diff: 30-50 lines added, 0 lines removed.
  - `/home/hermes/workspace/meals-dashboard/components/dashboard-client-delivery-filter-fallback.test.tsx` — NEW file. 10 test cases covering AS-001..AS-006 + 4 edge cases.
  - `Hermes-Skills` (spec artefacts only) — `spec.md`, `plan.md`, `tasks.md`, `traceability.yaml`, `index.yaml`, `skill.spec.yaml` updated to add the spec.
  - All Python pipeline scripts under `/home/hermes/.hermes/scripts/` — UNCHANGED. The fallback is client-side only.
  - `lib/dashboard-data.ts`, `lib/item-utils.ts`, `lib/dashboard-sync.ts`, `lib/blob-storage.ts`, `lib/runtime-mode.ts`, `app/page.tsx`, `app/api/*`, `middleware.ts`, `next.config.ts` — UNCHANGED. Spec 034's loader output and helper modules are reused as-is.
  - All cron wrappers, the email-action monitor, the meals-hook — UNCHANGED.
- Evidence: Danny's verbatim observation ("the data is empty" on 2026-07-05); the Vercel Blob diagnostic output via `/api/internal/blob-diagnostic` with `x-dashboard-secret` header (10 meals across 6 dates, 5 OrderBlobs, 3 delivery windows, `loadError: null`); the spec 034 filter logic in `components/dashboard-client.tsx:152-186` (state machine + hydrate / persist effects); the spec 034 NFR-001 budget (≤ 16 comparisons per render) which spec 037 preserves via the ≤ 3 length-check fallback.