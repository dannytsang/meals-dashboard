---
name: dashboard-order-items-delivery-filter-empty-state-fallback
description: "Spec 034's Order Items by Category Previous/Next/All filter persists its choice in sessionStorage indefinitely. If the persisted filter would render an empty panel (e.g. user pinned 'previous' but the only prior order has 0 items, or is a refunded stub), the dashboard currently shows nothing — looking broken. Spec 037 closes that gap by detecting the empty filter result and auto-falling-back to a filter that has data, with a one-line explanation of the swap."
---

# Feature Specification: Dashboard Order Items Delivery-Filter Empty-State Fallback

Feature ID: `037-dashboard-order-items-delivery-filter-empty-state-fallback`

Feature Name: Dashboard Order Items Delivery-Filter Empty-State Fallback

Target Skill: `data-science/meals-check`

Created: 2026-07-05

Status: Proposed

Change history: CHANGELOG.md

> **Rev 0 (Draft, 2026-07-05)**: Authored from Danny's 2026-07-05 17:5x BST observation that the dashboard's Order Items by Category section appeared empty when loaded fresh. Root cause: the section-level delivery filter (spec 034) persists its choice in `sessionStorage`, and a stale `previous` filter with a sparse source order renders as an empty panel.

## Background

Spec 034 (`034-dashboard-order-items-previous-next-delivery`) shipped on 2026-07-02 and added the section-level **Previous / Next / All** filter to the Order Items by Category panel. The filter persists its choice in `sessionStorage` under key `meals-dashboard:order-items-delivery-filter` (FR-003 of spec 034). The default on first render is `next`; once a user clicks `previous` or `all`, that choice persists for the rest of the browser session (and across reloads, but not across browser restarts).

On 2026-07-05 Danny reported the dashboard appeared "empty". Investigation:

1. Production Vercel Blob diagnostic (`/api/internal/blob-diagnostic` with `x-dashboard-secret` header) returned a fully populated dataset: 10 meals across 6 dates (2026-07-04..2026-07-10), 5 OrderBlobs (2026-05-30, 2026-06-06, 2026-06-13, 2026-07-04, 2026-07-07), 3 delivery windows, `loadError: null`. Server-side data is healthy.
2. The Saturday 4 July order (`6521-8108-142`, `status: active`, `itemCount: 2`) is the "previous" order relative to today (Sunday 5 July). It contains only 2 items because the rest of the receipt was refunded via spec 019's reconciliation. The next order (Tue 7 July, `5721-8931-562`, 15 items, £66.80) is the full upcoming grocery drop.
3. The dashboard-client's `deliveryFilter` state, on a returning browser session, is hydrated from `sessionStorage`. If the user previously clicked `previous` (or the next render after the cron publishes a new "active" order reclassifies yesterday's "next" as "previous"), the panel renders the 2-item Sat 4 Jul order — which to a casual glance looks "empty".
4. The current implementation has **no empty-state guard**: if the chosen filter yields zero items, the panel renders zero rows with no explanation. Danny reported "data is empty" — but the data is there, behind a filter that has nothing to show.

The symptom is also reachable via a different path: the very first render of a brand-new session where the user *happened* to have `previous` in their sessionStorage from an earlier tab. Or a future edge case where the previous order was cancelled/refunded and has 0 items, and the next order hasn't been published yet (spec 034 FR-006 already handles the all-empty-of-next case via the `Pending next delivery` placeholder, but it does not handle the "previous filter is empty" case).

### Root cause (the design gap)

Spec 034 made `sessionStorage` the only source of filter-state truth and gave the section a clear default (`next`) for the *first* render of a session. But:

- The auto-flip from `next` → `previous` (spec 034 FR-009) happens at every render based on `today`. After a delivery day, the order that was `next` becomes `previous`. The sessionStorage-persisted filter (`previous`) then hides the new `next` order — even though Danny's intent ("see what's next") is no longer the active filter.
- A sparse or refunded "previous" order renders as 0 visible items with no signal that this is a filter problem, not a data problem.
- The existing `Pending next delivery` placeholder (spec 034 FR-006) only fires when `next` has 0 orders AND `today` is on/before the next expected delivery. It does not cover the "filter chose `previous` and there is no previous, or the previous has 0 items" case.

### What this spec is *not*

- **Not** a removal of `sessionStorage` persistence. Danny explicitly designed it as session-scoped on 2026-06-30 (spec 034 Clarifications Q3 was about the `next_delivery` parenthetical, not the persistence; the persistence was confirmed via spec 034's Three-Open-Questions-resolved entry). The fix is a *fallback*, not a *replacement*.
- **Not** a redesign of the delivery-filter classification (spec 034 FR-001) or the badge / sub-heading / placeholder UI. Those are unchanged.
- **Not** a data-layer change. The server-side data is correct; this is a client-render guard.
- **Not** a new "All" / "Previous" / "Next" affordance. The same three buttons remain.
- **Not** a migration to `localStorage` for "convenience". Spec 034 NFR-002 explicitly forbids that.

## Goal

When the user's persisted `deliveryFilter` choice would render an empty Order Items by Category panel (zero items from orders matching the filter), the dashboard MUST automatically fall back to a filter that has data, surface a one-line inline explanation of the swap, and persist the new choice for the rest of the session. The fallback decision is per-render — not a one-time session-reset — so a future empty-filter state is caught the next time it occurs.

## Non-Goals

- **Not** a debug-only chip that exposes the swap to operators only. The fallback + explanation is user-visible; debug chips augment it per spec 034 FR-010.
- **Not** a server-side resolution. The fallback runs at render time on the client, exactly like the classification (spec 034 FR-009).
- **Not** a removal of the previous-delivery badge. Items shown under fallback still carry their correct badge (Prev or Next per spec 034 FR-004).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Stale `previous` filter no longer hides the upcoming order (Priority: P1)

As Danny, when I open the dashboard on a day when the persisted `previous` filter has no items to show (or only refunded stub items), I expect the Order Items by Category panel to automatically show the next-delivery items and a small one-line explanation of the swap — so I never see a panel that looks broken just because my last-chosen filter has gone sparse.

**Why this priority**: This is the exact symptom Danny reported on 2026-07-05. The spec 034 filter was the right design but lacked the empty-state guard. Without this fix, every future session that persists a `previous` filter through a sparse window will see the same panic-and-investigate cycle Danny just went through.

**Independent Test**: Set `sessionStorage['meals-dashboard:order-items-delivery-filter'] = 'previous'` and load the dashboard on a Sunday with a refunded Saturday order having 0 items. Verify the panel auto-falls-back to `next` (or `all` if `next` is also empty), shows a one-line "Previous filter had no items — showing Next delivery (Tue 7 Jul)" explanation above the first row, persists the new choice to `sessionStorage`, and continues to work correctly on reload.

**Acceptance Scenarios**:

1. Given `sessionStorage['meals-dashboard:order-items-delivery-filter'] = 'previous'` AND the persisted filter yields zero items, When the Order Items by Category section renders, Then the panel MUST render with `next` (or `all` if `next` also yields zero) and MUST show a one-line explanation above the first item row reading "Previous filter had no items — showing Next delivery ({DD MMM})" (or "All deliveries" when `next` is also empty).
2. Given `sessionStorage['meals-dashboard:order-items-delivery-filter'] = 'next'` AND the persisted filter yields zero items (no future order blob exists yet), When the section renders, Then the panel MUST render with `all` (so previously-delivered items still appear) and MUST show the corresponding explanation "Next filter had no items — showing All deliveries". The existing spec 034 FR-006 `Pending next delivery` placeholder MAY render underneath if `next` has zero orders; the fallback decision does not suppress it.
3. Given `sessionStorage['meals-dashboard:order-items-delivery-filter'] = 'all'` AND the persisted filter yields zero items (no order blobs in the visible window at all), When the section renders, Then the panel MUST render the existing spec 008 FR-005 empty state (no fallback exists above `all`); no explanation is shown because there is nothing to fall back to.
4. Given the persisted filter yields one or more items, When the section renders, Then the panel MUST render the chosen filter unchanged and MUST NOT show the swap explanation. The fallback is silent on the happy path.
5. Given the panel auto-fell-back from `previous` to `next` in this render, When the user reloads the page within the same browser session, Then the section MUST render with `next` (the new choice was persisted to `sessionStorage` per FR-004) without showing the swap explanation a second time. The explanation is a one-shot signal for the swap event.
6. Given the panel auto-fell-back from `previous` to `next`, When the user later clicks the `previous` filter chip explicitly, Then the panel MUST re-render with `previous` (the explicit click overrides the fallback's persisted choice), persist `previous` to `sessionStorage`, and MUST NOT show the swap explanation on that render. The swap explanation only fires on auto-fallback, not on explicit user choice.
7. Given the panel auto-fell-back and the swap explanation is visible, When the dashboard's debug-mode `deliveryFilterState` chip (spec 034 FR-010) is rendered, Then it MUST include the new field `fallbackApplied: { from: 'previous', to: 'next', reason: 'zero_items' }` so an operator can verify the fallback fired and why.
8. Given the panel has items but they are all `status: 'refunded'` (per spec 018 / spec 019), When the persisted `previous` filter is applied, Then the panel MUST NOT treat refunded-with-zero-items as "empty" — refunded items still render under the badge (spec 034 FR-005 / spec 018 status parenthetical). The fallback only fires when the post-filter item count is exactly zero, not when all items happen to be refunded.

### Edge Cases

- **All three filters empty**: No fallback exists; the existing spec 008 FR-005 empty state renders. No swap explanation.
- **`sessionStorage` key absent on first render**: Spec 034 default `next` applies; no fallback runs because no persisted choice is being honoured. Existing behaviour preserved.
- **`sessionStorage` value malformed** (e.g. user manually edited DevTools): Spec 034's hydration effect already rejects non-`previous`/`next`/`all` values and falls back to the default `next`. This spec adds no new validation; the malformed case remains at `next` with no fallback.
- **Filter changes mid-session via click**: The fallback MUST NOT fire on subsequent re-renders triggered by the user's own click; it only fires at the initial hydration. Per AS-006 above, an explicit click overrides any persisted state and skips the explanation.
- **Time-machine offset active** (spec 034 verification plan's `?delivery_date_offset=`): The fallback MUST run against the offset-adjusted `today`. If the offset pushes today past the next-delivery date, the next-delivery items become previous-delivery items; the filter is the user's, not the data's, and the fallback still applies on the persisted filter.
- **Debug-mode fixture override** (spec 022 + spec 024): If the active dashboard mode is fixture mode (per spec 024's `isDemoMode()`), the fallback MUST NOT fire. Fixture data is intentional; an empty filter result is a test scenario, not a real-world emptiness signal.
- **Empty `deliveryWindows` array**: If the loader returns no delivery windows at all (no calendar events, no order blobs), all three filters are empty; the spec 008 FR-005 empty state renders. No fallback.

## Functional Requirements

- **FR-001**: When the Order Items by Category section first renders after a `sessionStorage` hydration (spec 034 L168-L177), the dashboard MUST compute the post-filter item count for the persisted `deliveryFilter` value, and if that count is zero AND the persisted filter is `previous` or `next`, MUST replace the active filter with the next non-empty option in the ordered preference `[next, all, previous]` (so `previous` falls back to `next` first, `next` falls back to `all`, `all` falls back to the spec 008 empty state). The fallback preference list is part of the FR contract; runtime code MUST NOT re-order it.
- **FR-002**: When the fallback fires (per FR-001), the section MUST render the one-line explanation above the first item row as a `<div data-testid="delivery-filter-fallback-notice" role="status" aria-live="polite">` with text chosen from the four canonical templates:
  - `Previous filter had no items — showing Next delivery ({DD MMM})` when `from: previous, to: next`
  - `Previous filter had no items — showing All deliveries` when `from: previous, to: all`
  - `Next filter had no items — showing All deliveries` when `from: next, to: all`
  - The explanation MUST be visually subtle (use `--text-tertiary` colour per the existing design tokens; do not introduce a yellow/red warning banner that would look alarming) and MUST NOT include any icon or close button (per spec 034's "explanation is not dismissible" precedent — the fallback is a render-time decision, not a user-state flag).
- **FR-003**: The fallback's new filter value MUST be persisted to `sessionStorage['meals-dashboard:order-items-delivery-filter']` so subsequent reloads in the same browser session render with the fallback filter and do NOT show the swap explanation a second time (per AS-005). The persistence write MUST occur in the same render cycle that detects the empty filter, NOT in a deferred `useEffect` (so the swap explanation is one-shot and never re-fires after a reload).
- **FR-004**: When the user explicitly clicks a filter chip (Previous / Next / All) via the existing `onClick={() => setDeliveryFilter(f)}` handler (spec 034 L940), the panel MUST render with the clicked filter and MUST NOT show the swap explanation on that render or any subsequent re-render in the same browser session. The fallback's `from` field is reset to `null` (or its equivalent unset state) on any explicit click.
- **FR-005**: The fallback decision MUST use the same `classifiedOrders` derived data the section already computes (spec 034 L367-L377 — the activeGroups / nextGroups / previousGroups arrays). The fallback MUST NOT introduce a new classification pass; it MUST run an O(1) `length === 0` check on the post-filter group and a fixed iteration over the 3-element preference list. Total added render-time work: ≤ 3 length-checks per render. NFR-001 of spec 034 (≤ 16 comparisons per render) is preserved.
- **FR-006**: The fallback MUST be skipped entirely when `isDemoMode()` returns true (spec 024 + `lib/runtime-mode.ts`). Fixture data is intentional; an empty filter result in fixture mode is a test scenario, not a real-world emptiness signal. The skip is a single guard at the top of the fallback logic; it MUST NOT affect non-demo runs.
- **FR-007**: The fallback MUST NOT fire on subsequent re-renders triggered by changes to `coverage`, `deliveryWindows`, `today`, `classifiedOrders`, or any other state that already triggers a re-classification. The fallback is gated on a `useRef` flag (`hasFallbackRunRef`) that flips to `true` on the first fallback application and stays `true` for the lifetime of the component instance (until the user clicks a filter chip, which resets it per FR-004). The implementation MUST NOT use a state variable for this flag because re-renders triggered by the state change would cause the fallback to re-evaluate and re-fire.
- **FR-008**: The dashboard's debug-mode `deliveryFilterState` chip (spec 034 FR-010) MUST be extended with a new optional field `fallbackApplied: { from: 'previous'|'next'|'all'|null, to: 'previous'|'next'|'all'|null, reason: 'zero_items'|null }`. The field is `null` (rendered as `fallbackApplied: null` in the chip payload) when no fallback has fired. When the chip is rendered with `fallbackApplied.from !== null`, it MUST include the human-readable reason for the audit trail. The chip remains read-only per spec 022's debug-mode-is-read-only rule.
- **FR-009**: A new regression test module (`components/dashboard-client-delivery-filter-fallback.test.tsx` or a sibling block in the existing `components/dashboard-client.test.tsx`) MUST cover all six core acceptance scenarios (AS-001 through AS-006 above) plus the four edge cases (all-empty, sessionStorage absent, fixture-mode skip, ref-reset on explicit click). Total: 10 new test cases. Tests MUST use the existing fixture infrastructure (`lib/fixtures/dashboard-fixture.json` + spec 024's `generate-fixture.mjs`) and MUST NOT require a live Vercel Blob read.
- **FR-010**: The meals-check skill's `skill.spec.yaml` MUST be updated to add spec 037 to the `expected_artifacts` list under the dashboard-UI features group, alongside spec 008, 010, 026, 031, 034. The `index.yaml` entry for spec 037 MUST be added in the same chef-profile commit as the spec body (per the spec-driven-skills `index.yaml` discipline).

## Non-Functional Requirements

- **NFR-001**: The fallback MUST add no measurable render-time overhead. Per spec 034 NFR-001 (≤ 16 comparisons per render), the fallback adds ≤ 3 length-checks against already-derived `classifiedOrders` data; total added work: ≤ 3 comparisons per render. No new fetches, no new blob reads, no new hooks.
- **NFR-002**: The fallback MUST NOT introduce any new sessionStorage keys. The existing `meals-dashboard:order-items-delivery-filter` key is updated in place per FR-003; the fallback MUST NOT write to `localStorage` (spec 034 NFR-002) or to URL query parameters (would conflict with the existing fixture-mode URL params per spec 024).
- **NFR-003**: The swap explanation (FR-002) MUST be screen-reader-announced on appearance via `role="status"` + `aria-live="polite"` so users with assistive tech hear the swap without focus-jumping. The explanation MUST NOT use `aria-live="assertive"` (which would interrupt other screen-reader output mid-sentence).
- **NFR-004**: The fallback MUST NOT regress the spec 034 badge / sub-heading / placeholder rendering. Items shown under the fallback filter still carry their correct badge (`Prev · {DD MMM}` or `Next · {DD MMM}` per spec 034 FR-004), the All-filter sub-heading per FR-005 still renders when `all` is the post-fallback filter, and the `Pending next delivery` placeholder per FR-006 still renders when the post-fallback `next` group is empty.
- **NFR-005**: The fallback MUST be visible to the user (one-line explanation) and to the operator (debug chip field). It MUST NOT be a silent auto-rewrite. The user-visible explanation is the primary affordance; the debug chip is the operator-facing verification surface.
- **NFR-006**: The fallback MUST NOT alter any other section of the dashboard. Only the Order Items by Category section is affected. The Week Meals grid, the headline metrics, the manual override path, and all other panels are untouched.

## Key Entities

- **Fallback Decision** (new): a runtime value `{ from: DeliveryFilter, to: DeliveryFilter, reason: 'zero_items' }` computed at render time when the persisted filter yields zero items. Lives in component state only (via the `hasFallbackRunRef` and `fallbackApplied` refs per FR-007); not persisted.
- **Fallback Notice** (new): the one-line `<div data-testid="delivery-filter-fallback-notice" role="status" aria-live="polite">` element rendered above the first item row when a fallback fires. Shape per FR-002. Lives in component render only.
- **`deliveryFilter` state** (existing, reused): spec 034 L153. The fallback updates this state when it fires; subsequent renders honour the new value.
- **`sessionStorage['meals-dashboard:order-items-delivery-filter']`** (existing, reused): spec 034 L168-L186. The fallback writes to this key per FR-003; the existing hydrate / persist effects are unchanged.
- **`hasFallbackRunRef`** (new): a `useRef<boolean>(false)` flag local to the Order Items by Category section. Flips to `true` on the first fallback and stays `true` for the component instance lifetime. Reset to `false` when the user explicitly clicks a filter chip (FR-004). NOT a state variable (per FR-007).
- **`fallbackApplied`** (new): a local ref tracking the most recent fallback decision, shape per FR-008. Surfaced via the existing `deliveryFilterState` debug chip (spec 034 L431-L433) as an additional field.
- **`classifiedOrders`** (existing, reused): spec 034 L367-L377. The fallback reads from this already-derived data; no new classification pass.
- **`isDemoMode()`** (existing, reused): spec 024 / `lib/runtime-mode.ts`. The fallback calls this to skip the auto-rewrite in fixture mode per FR-006.

## Contract Impact

- **Module surface**:
  - `components/dashboard-client.tsx` — new `useRef` flags + new fallback decision logic + new fallback notice JSX. Estimated diff: 30-50 lines added, 0 lines removed. The existing spec 034 filter code at L152-L186 is augmented (not replaced).
  - `components/dashboard-client-delivery-filter-fallback.test.tsx` (or sibling block in `components/dashboard-client.test.tsx`) — new regression tests per FR-009.
- **Untouched files** (so reviewers can grep-confirm):
  - `lib/dashboard-data.ts` — no loader changes. The fallback runs on the already-derived `classifiedOrders` data.
  - `lib/item-utils.ts` — no new helpers. The fallback is inline in `dashboard-client.tsx`; no new pipeline.
  - `lib/dashboard-sync.ts` — no schema changes.
  - `lib/meals-data.ts` — no type changes.
  - `lib/blob-storage.ts` — no read-path changes.
  - `lib/runtime-mode.ts` — no changes (spec 024's `isDemoMode()` is reused as-is).
  - `app/page.tsx`, `app/api/*`, `middleware.ts`, `next.config.ts` — untouched.
  - All Python pipeline scripts under `/home/hermes/.hermes/scripts/` — untouched.
  - All cron wrappers, the email-action monitor, the meals-hook — untouched.
- **New env vars**: None.
- **No new secrets at runtime**: confirmed.
- **No new Vercel Blob namespaces**: confirmed.
- **New sessionStorage keys**: None (writes to existing key per FR-003).

## Open Questions

_None at Draft time. All defaults proposed by the chef profile based on the canonical-path pattern from spec 034 and the existing fixture / debug-chip conventions._

If Danny wants the swap explanation to be dismissible (close button), that is a future spec; per spec 034's "explanation is not dismissible" precedent and the closed-banner-shape pitfall in the meals-dashboard-spec-authoring skill, dismissibility is intentionally out of scope.

## Verification Plan

- **Unit tests** (FR-009): add the 10 test cases to a new sibling module `components/dashboard-client-delivery-filter-fallback.test.tsx` (or extend `components/dashboard-client.test.tsx`). Cover AS-001..AS-006 + 4 edge cases. Tests MUST use the existing fixture infrastructure; no live Blob reads.
- **Integration smoke test**: spin up the dashboard on `npm run dev` against the live `dashboard_cache.json`, set `sessionStorage['meals-dashboard:order-items-delivery-filter'] = 'previous'` via DevTools before reload, verify (a) the panel auto-falls-back to `next`, (b) the swap explanation appears above the first item row, (c) reloading preserves the fallback choice without showing the swap explanation again, (d) clicking the `previous` chip explicitly reverts and persists `previous` without the swap explanation.
- **Time-machine smoke test**: use spec 034's debug-only `?delivery_date_offset=N` query param to shift `today` past the next-delivery date; verify the fallback still fires correctly on the offset-adjusted classification. Per spec 034 verification plan: the query param is debug-only and stripped from the URL when debug mode is off; it MUST NOT be exposed in production.
- **Demo-mode regression test**: load the dashboard with `MEALS_FIXTURE_MODE=1` (or the equivalent per spec 024's auto-detect rule), set the persisted filter to `previous`, verify the fallback does NOT fire (the fixture's intentional emptiness is preserved).
- **Spec validator**: `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — must end with `No issues found.`.
- **Bundle invariant**: `grep -rn "delivery-filter-fallback-notice\|hasFallbackRunRef\|fallbackApplied" components/ lib/ app/` — must return only `components/dashboard-client.tsx` and the new test module. If the grep returns a Python file or a cron wrapper, that is a scope leak and MUST be reverted.
- **Pipeline regression test**: `python3 -m unittest test_tesco_matcher -v` from `/home/hermes/.hermes/scripts` — confirm no matcher regressions (the spec touches the dashboard UI, not the pipeline, but a green run is the cheapest assurance that nothing leaked).

## Reference Material

- **Spec 034** (`034-dashboard-order-items-previous-next-delivery/spec.md`) — the parent spec. Spec 037 is purely additive: it adds an empty-state guard on top of spec 034's filter, badge, sub-heading, and placeholder UI. Spec 034's filter state machine (L153 `useState<DeliveryFilter>('next')`, L168-L177 hydration effect, L179-L186 persist effect) is reused as-is.
- **Spec 008** (`008-dashboard-order-items/spec.md`) — the canonical Order Items by Category section. Spec 037's `all` empty-state fallback path lands on spec 008 FR-005's empty-state component.
- **Spec 018** (`018-dashboard-order-status-tracking/spec.md`) — defines the `OrderBlob.status` field. Spec 037's edge case (refunded items still render) reuses spec 018's status semantics; no change to spec 018.
- **Spec 019** (`019-dashboard-coverage-invalidation-refunds-perishables/spec.md`) — the refund + perishable invalidation path. Spec 037's refunded-stub-items edge case is reachable when spec 019 has reduced an order's items to zero or near-zero.
- **Spec 022** (`022-dashboard-debug-mode/spec.md`) — the debug-mode-only chip field `fallbackApplied` (FR-008) follows spec 022's debug-only-read-only rule. No operator-facing knob is exposed.
- **Spec 024** (`024-dashboard-static-fixture-mode-for-preview/spec.md`) — defines the static fixture mode. Spec 037's `isDemoMode()` skip (FR-006) reuses spec 024's runtime-mode detection; no change to spec 024.
- **`components/dashboard-client.tsx:152-186`** — spec 034's filter state machine. Spec 037 augments this with the fallback ref + notice JSX.
- **`components/dashboard-client.tsx:367-377`** — spec 034's `classifiedOrders` derivation. Spec 037 reads from the post-filter group length; no new classification.
- **`components/dashboard-client.tsx:411-433`** — spec 034's `deliveryFilterState` debug chip. Spec 037 adds the `fallbackApplied` field (FR-008) to this existing payload.

## Promotion Criteria for Final

This spec remains at `Status: Draft, readiness: spec_only` until the implementation is **deployed to the production meals-dashboard Vercel environment** with the regression tests passing in CI and the time-machine smoke test verified by Danny on the preview URL.

The status flips to `Final` and `readiness` to `already_satisfied` only when **all** of the following are verified against the production deployment:

- [ ] `npm run test` (Vitest) passes with the 10 fallback assertions from FR-009 added.
- [ ] `python3 -m unittest test_tesco_matcher -v` still passes (no matcher regression).
- [ ] `python3 software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` ends with `No issues found.`.
- [ ] The bundle-invariant grep returns only the files listed under "Module surface" above (no scope leak).
- [ ] Vercel dashboard `https://meals-dashboard.vercel.app` shows the swap explanation on a fresh session where `sessionStorage['meals-dashboard:order-items-delivery-filter']` is pre-set to `previous` via DevTools.
- [ ] Danny exercises the production URL on (a) the day after a delivery (auto-flip + sparse-previous path), (b) a day with no upcoming order blob (`next` falls back to `all`), and (c) a session where `sessionStorage` has `previous` set explicitly, and confirms the swap explanation matches the spec.
- [ ] The `deliveryFilterState` debug chip shows the new `fallbackApplied` field per FR-008.
- [ ] Demo-mode (`isDemoMode() === true`) runs do NOT trigger the fallback (FR-006) — verified by setting `MEALS_FIXTURE_MODE` and reloading.

This rule aligns with the spec-driven-skills convention that `Final` status reflects verified runtime evidence in the live consumer deployment, not a closed task checklist. Danny confirmed on 2026-06-17: "the code should end up in production so its not finalised until its in production".

## Clarifications

### Session 2026-07-05 — Fallback preference order, debug-field name, demo-mode skip

- Q: What is the fallback order when multiple filters have data? → A: **`[next, all, previous]`.** `previous` falls back to `next` first; `next` falls back to `all`; `all` has no fallback (renders the spec 008 empty state). The preference list is codified in FR-001 and MUST NOT be re-ordered at runtime.
- Q: What does the debug chip's `fallbackApplied` field look like when no fallback has fired? → A: **`fallbackApplied: null`** at the chip payload level (not `fallbackApplied: { from: null, to: null, reason: null }`). This keeps the chip payload minimal on the happy path and makes the audit-trail-obvious distinction: `null` means "never fired", a non-null object means "fired with this reason".
- Q: Should the fallback fire in demo / fixture mode? → A: **No.** Fixture data is intentional; an empty filter result is a test scenario, not a real-world emptiness signal. Codified in FR-006 as a single `isDemoMode()` guard.