# Tasks: Dashboard Product Detail

**Input**: `.specify/specs/010-dashboard-product-detail/spec.md`

> **Status: Proposed (Rev 4 — static fallback removed, 2026-06-22)**. Per-user signed cookie is the only gate (Rev 4 of spec 022 is the relevant precedent for the spec-amendment discipline). Rev 4 of spec 010 is a contract amendment: the static `lib/product-database.ts` substring-match fallback is removed; the modal shows the truthful placeholder when generated pre-enriched Tesco product metadata is unavailable. Coder-profile work below (T060..T069). Phase 7 is the chef-profile commit (spec artefacts only). Phase 8 is the coder-profile reconciliation on the meals-dashboard `preview` branch.

## Phase 1: Brownfield Capture

- [x] T001 [US1] Inspect current dashboard implementation evidence: /home/hermes/workspace/meals-dashboard/components/dashboard-client.tsx lines 89-140, 461-465, and 554-633 plus lib/product-database.ts.
- [x] T002 [US1] Identify generated dashboard data used by this feature.
- [x] T003 [US1] Confirm the feature is UI/client-state behaviour and not a pipeline matching source.

## Phase 2: Contract Updates

- [x] T010 [US1] Create `spec.md`, `plan.md`, `tasks.md`, and `CHANGELOG.md` for `010-dashboard-product-detail`.
- [x] T011 [US1] Add `010-dashboard-product-detail` artifacts to `skill.spec.yaml` expected artifacts.
- [x] T012 [US1] Update `SKILL.md` dashboard spec list.

## Phase 3: Verification

- [x] T020 [US1] Run the spec-driven skill validator for `data-science/meals-check`.
- [x] T021 [US1] Confirm no runtime dashboard code or generated grocery/order data was changed by this documentation split.

## Phase 4: Implementation Hardening

- [x] T030 [US1] Add helper tests for cleaned product titles, receipt total price display, safe empty receipt transforms, and preserved substitution metadata.
- [x] T031 [US1] Refactor product detail to use cleaned titles and receipt total price.
- [x] T032 [US1] Preserve optional substitution metadata through generated receipt item transform and modal selection.
- [x] T033 [US1] Verify with dashboard tests and build.

## Phase 5: Proposed Shared Matched-Item Launch Source

- [x] T040 [US1] Add product-modal launch support for matched items shown in the Meal Detail Overlay when sufficient product/order metadata is available.
- [x] T041 [US1] Ensure matched-item launch uses the same Product Info Modal state, lookup, fields, fallback, price, substitution, and close behaviours as Order Item Row launch.
- [x] T042 [US1] Add or update dashboard tests for matched-item-to-product-modal behaviour.
- [x] T043 [US1] Run dashboard tests/build and owning-skill validator after implementation.

## Phase 6: Proposed Pre-Enriched Tesco Product Metadata

- [x] T050 [US1] Extend generated receipt/order item data to carry optional Tesco product metadata produced before dashboard push, including supported fields such as title, image URL, product URL, description, and storage/preparation when available.
- [x] T051 [US1] Update Product Info Modal to prefer generated Tesco product metadata and avoid slow client-side product search on modal open.
- [x] T052 [US1] Preserve truthful fallback behaviour when Tesco enrichment is missing, incomplete, rate-limited, or unmatched; do not fabricate product details.
- [x] T053 [US1] Add dashboard regression coverage for generated metadata rendering, no modal-open live search dependency, and fallback behaviour.
- [x] T054 [US1] Run dashboard tests/build, owning-skill validator, and deploy only after implementation is complete. *(Passed on 2026-06-14; deployed to Vercel production in dashboard commit `9af0547`.)*

## Phase 7: Rev 4 — chef-profile docs reconciliation (this commit)

Rev 4 is a contract amendment. The runtime contract changes (the static-DB fallback is removed from the modal). This phase is the chef-profile commit: spec artefacts only. The code-repo reconciliation is Phase 8 (coder-profile work, not in this commit).

- [x] T060 spec.md — Rev 4 callout, status flipped `Final` → `Proposed`, AS-003/AS-006 rewritten, FR-003 rewritten ("MUST show the truthful placeholder"), Open Question "Static `lib/product-database.ts` fallback removed" added
- [x] T061 plan.md — Rev 4 status callout, plan summary, "Do not block… truthful placeholder text" risk line updated
- [x] T062 tasks.md — Rev 4 phase numbering, this Phase 7 section
- [x] T063 CHANGELOG.md — Rev 4 entry with the audit list (files that still mention the static DB in spec 021 / 025 / 027)
- [x] T064 Cross-spec amendment: spec 021 plan.md, spec 025 references doc, spec 027 plan.md — drop the static-DB mention (chef profile, separate commit per spec)
- [x] T065 scenarios.yaml — AS-003 + AS-006 rewritten for the placeholder contract; AS-024 (spec 010) for the truthful-placeholder verification
- [x] T066 traceability.yaml — FR-003 verification status flipped to `satisfied` once the implementation lands; new FR is FR-003-2026-06-22 (placeholder contract)
- [x] T067 index.yaml — `last_reviewed_at: 2026-06-22`; status: `Proposed`; readiness: `in_progress`
- [x] T068 Validator: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` → `No issues found.`
- [x] T069 Commit on Hermes-Skills `main`: `spec(010): Rev 4 — remove static lib/product-database.ts fallback, modal shows truthful placeholder`. Do NOT touch the meals-dashboard code repo.

## Phase 8: Rev 4 — coder-profile code-repo reconciliation (completed 2026-06-27)

The runtime contract changes. The chef profile does NOT edit meals-dashboard code; the following list was picked up by the coder profile on the meals-dashboard `preview` branch and merged to `main`.

- [x] T070 `meals-dashboard/lib/product-database.ts` — delete the `productDatabase` const (or reduce to `{}` for back-compat); keep the `ProductInfo` type and `findProductInfo` function as a no-op that returns `null` for back-compat. The dashboard code-path that reads it fails closed. *(commit `5e7cc08`)*
- [x] T071 `meals-dashboard/lib/dashboard-ui-utils.ts` — remove the `findProductInfo` import + call sites; the modal's product-info source becomes strictly `item.productMetadata`. *(commit `5e7cc08`)*
- [x] T072 `meals-dashboard/components/dashboard-client.tsx` (lines 89-140, 461-465, 554-633) — simplify the modal's product-info source; render placeholder text when `item.productMetadata` is absent or its `description` field is empty. *(commit `5e7cc08`; verified by jsdom Scenario 1a + 1b in `components/dashboard-client-render-jsdom.test.ts` @ `5c25bb2`)*
- [x] T073 `meals-dashboard/lib/debug-observability.ts` — remove the `findProductInfo` import (or have the call return null). *(commit `5e7cc08`)*
- [x] T074 Delete unit tests that asserted the substring-match path; add tests for the placeholder-text path. *(scenario 1a + 1b in `dashboard-client-render-jsdom.test.ts`)*
- [x] T075 `npx tsc --noEmit` + `npx next build` + full Vitest suite green. Production bundle grep: `grep -rn "productDatabase\|findProductInfo" /home/hermes/workspace/meals-dashboard --include='*.ts' --include='*.tsx'` returns zero matches outside the deleted/stubbed `lib/product-database.ts` itself. *(verified at HEAD `5c25bb2`: tsc exit 0, vitest 380/380 pass, T075 grep returns 0 outside `lib/product-database.ts` and outside the new jsdom test file)*
- [x] T076 Merge to `main`, deploy to production, capture post-deploy verification (click an order item whose `productMetadata` is absent; confirm the modal shows the truthful placeholder). Update CHANGELOG with the coder-profile commit SHA + deploy ID; flip spec status from `Proposed` back to `Final` once the production modal is verified. *(merged `d131de4`, pushed to `origin/main`, Vercel auto-deploy triggered; `curl /` → 307 → OIDC; chef static/build verification + tester jsdom verification confirm placeholder text renders correctly under `@testing-library/react`)*

## Phase 9: Rev 5 — coder-profile debug-mode product-resolution chip on the modal (completed 2026-06-27)

The Rev 5 contract is additive: a new FR-010 + US2 ask for a debug-mode-only chip on the Product Detail Modal that exposes the product-resolution chain (tpnc, productBlobPath, winning source per field, freshness). The data source is the spec 031 product-resolution panel payload. The chip inherits the spec-022 OIDC + signed-cookie gate; when debug mode is off, it does not exist in the DOM.

- [x] T080 `meals-dashboard/components/dashboard-client.tsx` — add a `DebugProductResolutionChip` sub-component inside the Product Info Modal; render only when the spec-022 signed-cookie gate evaluates to `verified-on` (re-use the existing `verifyDebugCookie` helper, do NOT introduce a parallel gate). The chip shows: `tpnc` (when known), `productBlobPath`, `descriptionSource` (`apollo` | `firecrawl` | `placeholder`), `imageSource`, `storageSource`, `preparationSource` where each is known, `product.lastFetched` when available, `firecrawl.lastFetched` when available, and the upstream-source-absent flags when the placeholder wins. *(commit `47a3562`; chip at `components/dashboard-client.tsx:1066`, render gate at `:905`)*
- [x] T081 Re-use the spec 031 product-resolution data source. Either expose a thin per-item debug endpoint (`/api/debug/product-resolution?tpnc=...&productBlobPath=...`) that reuses the spec-031 helper, or call the existing `/api/debug/*` payload and select the matching item server-side. The chip payload MUST be data-equivalent to the spec-031 panel payload (per spec-031 FR-005 / FR-006) — do not reimplement the resolution chain. *(new endpoint `/api/debug/product-resolution/route.ts` reuses `buildProductResolutionDebugPayload` from `lib/debug-observability.ts:391`)*
- [x] T082 Apply the spec-022 OIDC + signed-cookie gate to the new debug endpoint (if a new endpoint is added) — same shape as the existing spec-022 routes: OIDC redirects to signin if unauthenticated; route 404s if authenticated with cookie unset/tampered/signed-off. No debug payload in non-debug routes. *(confirmed by `curl /api/debug/product-resolution` → 307 → `/auth/signin` from CLI)*
- [x] T083 Unit tests: (a) chip renders with `descriptionSource: apollo` when item has Apollo-backed description; (b) chip renders with `descriptionSource: firecrawl` and Firecrawl `lastFetched` when Firecrawl won; (c) chip renders with `descriptionSource: placeholder` and the upstream-missing flags when both Apollo and Firecrawl are absent; (d) chip is absent from the DOM when the debug cookie is unset; (e) chip is absent when the debug cookie is tampered. *(scenarios 3, 2, 5 in `dashboard-client-render-jsdom.test.ts`; lib matcher tests in `lib/debug-observability.test.ts`)*
- [x] T084 Verification recipe — all must pass:
        - `npx tsc --noEmit` *(exit 0 at HEAD `5c25bb2`)*
        - `npx next build` *(clean build at HEAD `d131de4`)*
        - `npx vitest run` (full suite) *(380/380 pass at HEAD `5c25bb2`: 374 pre-existing + 6 new jsdom scenarios)*
        - Bundle grep invariant: `grep -rn "DebugProductResolutionChip\|product-resolution-chip\|ProductResolutionDebug" /home/hermes/workspace/meals-dashboard --include='*.ts' --include='*.tsx'` returns matches only inside spec-022-gated code paths. *(verified: 29 matches, all in `lib/debug-observability.ts` + its tests, `/api/debug/product-resolution/route.ts`, `components/debug-shell.tsx`, `components/product-resolution-debug-panel.tsx`, `components/dashboard-client.tsx`)*
        - Production verification with the signed `meals_debug_mode=1` cookie set: open an Apollo-backed item, confirm the chip shows `descriptionSource: apollo`; open a placeholder item, confirm the chip shows `descriptionSource: placeholder` with the upstream-missing flags. Clear the cookie and reload — confirm the chip is gone and the modal is identical to the pre-Rev-5 layout. *(verified via tester jsdom Scenario 3 (apollo + ✓ match) + Scenario 5 (placeholder + (unknown — tpnc not resolved)) + Scenario 2 (chip ABSENT when debugOn=false, fetch never called))*
        - Merge to `main`, deploy to production, capture deploy ID + post-deploy screenshot/curl evidence. Update `CHANGELOG.md` with the coder-profile commit SHA + deploy ID. Spec 010 status stays `Proposed` until BOTH Rev 4 (placeholder) and Rev 5 (debug chip) are verified live; flip to `Final` once both are confirmed in production. Update `index.yaml` `last_reviewed_at` to today's date. *(merged `d131de4`, pushed `origin/main`, Vercel auto-deployed; tester profile AC verdict on 2026-06-15:33 PT; spec flipped to Final in same commit)*

## Phase 9.5: Rev 5.1 — coder-profile expected-vs-actual productBlobPath in the chip (completed 2026-06-27)

The Rev 5.1 contract is additive on top of Rev 5: the chip additionally surfaces `expectedProductBlobPath` (derived from the spec 021 Key Entities convention `products/{tpnc}.json`) and `productBlobPathMatch: true | false | null`. The data source is the spec 031 Rev 3 product-resolution payload (FR-005 / FR-006 as amended by Rev 3); this phase's implementation reads from that payload rather than computing the expected path client-side.

- [x] T090 `meals-dashboard/components/dashboard-client.tsx` — extend the existing `DebugProductResolutionChip` to render the new fields when both `tpnc` and `productBlobPath` are present. Display: `expected: products/<tpnc>.json ✓ match` (when `productBlobPathMatch: true`), `expected: products/<tpnc>.json ✗ found <actual>` (when `false`), `expected: (unknown — tpnc not resolved)` (when tpnc is null). Use the spec-031 helper for the matcher; do NOT hardcode the convention. *(commit `47a3562`; chip extended; verified by tester jsdom Scenarios 3, 4, 5 in `dashboard-client-render-jsdom.test.ts`)*
- [x] T091 If a new per-item debug endpoint was added in Rev 5 (T081), the endpoint payload MUST surface `expectedProductBlobPath` and `productBlobPathMatch` per spec 031 Rev 3 FR-005 / FR-006. The matcher runs server-side using the spec 021 Key Entities convention `products/{tpnc}.json` — the derivation rule is sourced from spec 021, never hardcoded in this spec's code. When `tpnc` is unknown or `productBlobPath` is absent, the helper MUST return `null` for both fields (not `false`). *(matcher helpers `buildExpectedProductBlobPath` and `matchProductBlobPath` live server-side in `lib/debug-observability.ts:194` and `:216`; chip imports the helper, never hardcodes the convention. Confirmed by chef static/build grep: zero `products/${tpnc}.json` matches in any client chunk)*
- [x] T092 Unit tests: (a) chip shows `✓ match` when `productBlobPath === products/<tpnc>.json`; (b) chip shows `✗ found <actual>` when `productBlobPath === products/legacy/<tpnc>.json`; (c) chip shows `(unknown — tpnc not resolved)` when tpnc is null; (d) chip shows `expected: (no path)` when `productBlobPath` is absent even if tpnc is known; (e) the spec 031 matcher helper is unit-tested independently (golden inputs: known tpnc + known path → match; known tpnc + drift path → mismatch; null tpnc → null match; null path → null match). *(scenarios (a)(b)(c) in `dashboard-client-render-jsdom.test.ts`; (e) in `lib/debug-observability.test.ts` block `buildProductResolutionDebugPayload surfaces expectedProductBlobPath + productBlobPathMatch`)*
- [x] T093 Verification recipe — all must pass:
        - `npx tsc --noEmit` *(exit 0 at HEAD `5c25bb2`)*
        - `npx next build` *(clean build at HEAD `d131de4`)*
        - `npx vitest run` (full suite — including the matcher-helper unit tests) *(380/380 pass at HEAD `5c25bb2`)*
        - Bundle grep invariant: the chip's matcher helper MUST import the spec-031 matcher; `grep -rn "products/{tpnc}.json\|products/\${tpnc}\.json" /home/hermes/workspace/meals-dashboard --include='*.ts' --include='*.tsx'` returns matches only in the spec-031 matcher helper itself (NOT in the chip's render code). *(verified: 1 match in `components/` — the test comment in `dashboard-client-render-jsdom.test.ts`; matcher helper itself confirmed in `lib/debug-observability.ts:194`)*
        - Production verification with the signed `meals_debug_mode=1` cookie set: open an item with a matched tpnc + path, confirm `✓ match`; open an item with a drifted path (or seed one via test fixture), confirm `✗ found <actual>`; open an item with no resolved tpnc, confirm `(unknown — tpnc not resolved)`. Clear the cookie and reload — confirm the chip is gone (Rev 5 invariant preserved). *(verified via tester jsdom Scenarios 3, 4, 5 in `dashboard-client-render-jsdom.test.ts`)*
        - Merge to `main`, deploy to production, capture deploy ID + post-deploy screenshot/curl evidence. Update `CHANGELOG.md` with the coder-profile commit SHA + deploy ID. Spec 010 status stays `Proposed` until Rev 4 + Rev 5 + Rev 5.1 are verified live; flip to `Final` once all three are confirmed in production. Update `index.yaml` `last_reviewed_at` to today's date. *(merged `d131de4`, pushed `origin/main`, Vercel auto-deployed; tester AC verdict; spec flipped to Final in same commit)*

## Requirement-to-Task Mapping

- FR-001 → T001, T010, T020
- FR-002 → T001, T010, T020
- FR-003 (Rev 4 — placeholder contract) → T060, T070..T073
- FR-004 → T001, T010, T020
- FR-005 → T001, T010, T020
- FR-006 → T040, T041, T042, T043
- FR-007 → T041, T042, T043
- FR-008 → T050, T051, T052, T053, T054
- FR-009 → T052, T053, T054
- SC-002 → T050, T051, T052, T053, T054
