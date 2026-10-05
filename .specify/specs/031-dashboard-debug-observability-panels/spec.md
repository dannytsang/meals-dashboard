---
name: dashboard-debug-observability-panels
description: "Extend the meals dashboard's existing debug mode with operator-facing observability panels for runtime mode/gating, Blob read path and freshness, product-resolution provenance, and richer items-by-category provenance so recent dashboard incidents can be diagnosed from the running UI instead of source/log spelunking."
---

# Feature Specification: Dashboard Debug Observability Panels

Feature ID: `031-dashboard-debug-observability-panels`

Feature Name: Dashboard Debug Observability Panels

Target Skill: `data-science/meals-check`

Created: 2026-06-19

> **Rev 2 (2026-06-19)**: Promoted to Proposed after Danny approved the expanded four-panel scope, including explicit Blob path/provenance visibility.
>
> **Rev 1 (2026-06-19)**: Expanded the Draft to explicitly require the concrete debug fields Danny asked for: full Blob storage provenance (`pointerPath`, `manifestPath`, `productsManifestPath`, `orderBlobPath`, `coverageBlobPaths`, `productBlobPath`), per-stage read status (`pointerRead`, `manifestRead`, `summaryRead`, `orderRead`, `coverageRead`, `productRead`), freshness/age fields, explicit runtime-mode and cookie-gate state, and a field-level product-resolution chain.

> **Rev 6 (2026-06-28, Draft)**: FR-016: "Copy as JSON" button in every debug panel shows a brief "Copied!" confirmation after a successful copy, replacing the label for 1.5 seconds, so Danny knows the action succeeded without checking the clipboard.
>
> **Rev 3 (2026-06-23, expected-vs-actual productBlobPath)**: The Blob-read payload (FR-003) and product-resolution payload (FR-005 / FR-006) MUST additionally surface `expectedProductBlobPath` (derived from the item's tpnc per the spec 021 FR-001 / Key Entities convention `products/{tpnc}.json`) and `productBlobPathMatch: true | false` (a boolean comparing `expectedProductBlobPath` to `productBlobPath`). This closes a real blind spot: today the panels report only the path that was chosen, leaving convention drift invisible unless the operator knows the expected-path rule. With Rev 3, a mismatch (e.g. `expectedProductBlobPath: products/12345.json` vs `productBlobPath: products/legacy/12345.json`) is shown explicitly so the operator can tell convention drift from a legitimate path choice. The derivation rule is sourced from spec 021 Key Entities (`ProductBlob: products/{tpnc}.json`); if spec 021 ever changes the convention, this spec's matcher is updated in lockstep. When `tpnc` is unknown the field is reported as `expectedProductBlobPath: null` and `productBlobPathMatch: null` (not `false`) — a missing tpnc is a different problem from a wrong path. Cross-spec: spec 010 Rev 5.1 consumes the same two fields in the modal-side debug chip. Danny's 2026-06-23 question: "does the debug contain information such as expected blob storage path for product meta data?". Rev 3 answer: yes, with a match flag.

Status: Draft

Change history: CHANGELOG.md

## Background

Spec 022 established the debug-mode architecture and shipped the first panel: items-by-category provenance. That solved the immediate 2026-06-17 regression where `latestOrder` disappeared behind the coverage window and the dashboard rendered an empty category list.

Since then, three more classes of dashboard issue have surfaced that the current `/debug` page does not make legible enough from the running UI:

1. **Runtime-mode confusion** — preview/demo vs live-mode Blob reads, plus whether the signed `meals_debug_mode` cookie is missing, verified off, verified on, or tampered. This sat behind both the demo-mode work in spec 024 and the first-time Debug-row regression in spec 026.
2. **Blob-read failures and freshness ambiguity** — when the dashboard is in live mode, operators need to see which Blob resource failed, which resource paths were actually chosen, and how stale the currently rendered data is. This is the operator-facing complement to spec 029's visible Blob error panel and spec 028/030's storage-cost work.
3. **Product-resolution uncertainty** — when product detail content is missing or looks thin, Danny currently has to infer whether the description came from Apollo, curated static data, Firecrawl fallback, or the placeholder chain. Specs 021 and 027 define this behaviour, but the running UI does not expose it.

The pattern is the same in each case: the dashboard is doing something internally that is correct or incorrect for a very specific reason, but that reason is invisible in the browser. This feature extends debug mode with a small set of high-value observability panels tied directly to the incidents we have already had.

This spec is intentionally narrow. It extends the existing spec-022 debug architecture; it does not add a second debug switch, change OIDC, change Blob layout, change sync semantics, change the product-enrichment pipeline, or alter demo-mode fallback behaviour.

## Promotion Criteria for Final

This spec is at `Status: Final, readiness: already_satisfied` now that the implementation is deployed to the production meals-dashboard Vercel environment. Preview-only deployment is no longer the limit. The following are the production verification criteria that were satisfied:

- The `/debug` page renders the four new observability panels only when the spec-022 signed cookie gate is effectively on.
- The runtime-context panel distinguishes `demo` vs `live`, `debug cookie verified on/off` vs `tampered/missing`, shows whether Blob credentials were sufficient for live mode, and names the chosen data-reader path without leaking secrets.
- The Blob-read panel shows the active `pointerPath`, `manifestPath`, `productsManifestPath`, selected `orderBlobPath`, selected `coverageBlobPaths`, selected `productBlobPath` when applicable, plus per-stage read status (`pointerRead`, `manifestRead`, `summaryRead`, `orderRead`, `coverageRead`, `productRead`) and a sanitised load-error object when live-mode Blob reads fail; in demo mode it clearly says the fixture reader path is active instead.
- The freshness panel makes stale-data diagnosis possible from the UI by showing `dataGeneratedAt`, `uiUpdatedAt` when available, `latestOrderDate`, product `lastFetched`, Firecrawl `lastFetched`, and computed ages / stale indicators.
- The footer timestamps alone are *not* sufficient for incident triage; the freshness/debug surface MUST also expose the rendered delivery-window dates (or `deliveryMetadata`/`deliveryWindows` equivalent), the active `coverageWindow`, and the blob/snapshot identifiers that produced the visible payload so a missing Friday can be distinguished from a stale cache, a stale deployment, or a snapshot that simply never contained Friday in the first place.
- For Friday-missing investigations, the panel MUST make the delivery list explicit enough to answer "did the payload contain Friday?" without reading logs: each rendered delivery window should show its `date`, `slot`, `status`, `orderTotal`, and the path/identifier that produced it.
- The product-resolution panel shows which source won (`apollo`, `curated_static`, `firecrawl`, or `placeholder`) for the selected product-detail item and why, including the underlying `tpnc`, `productBlobPath`, and field-level winning source for `description`, `image`, `storage`, and `preparation`.
- The enriched items-by-category panel surfaces enough provenance to reproduce the original `latestOrder`/coverage-window regression without a temporary inline overlay.
- The production bundle and served HTML remain grep-clean for access tokens, signed Blob URLs, raw cookie signatures, auth headers, and other secret material.

This rule aligns with Danny's standing lifecycle rule that `Final` means verified in production, not merely drafted or previewed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Runtime context and gating are legible (Priority: P1)

As Danny, when I open debug mode I want the dashboard to tell me which runtime path it is on — live vs demo, debug cookie verified on/off/tampered/missing, current deployment/request context, and which data reader was selected — so I can immediately rule out "wrong mode" before chasing deeper bugs.

**Why this priority**: Several recent incidents were really mode/gating misunderstandings in disguise. If the runtime contract is hidden, every downstream symptom is harder to interpret.

**Independent Test**: With the signed debug cookie set to `1`, open `/debug` in live mode and confirm the runtime panel reports live-mode Blob reads, verified-on cookie state, and the chosen data reader. Repeat in demo mode (credentials absent/incomplete) and with a tampered cookie. Confirm the panel changes meaningfully without exposing secret values.

**Acceptance Scenarios**:
1. Given debug mode is effectively on and Blob credentials are present, When `/debug` loads, Then the runtime-context panel reports `runtimeMode: live`, `blobCredentialsState: complete`, `debugCookieState: verified_on`, `activeReader: vercel_blob`, and safe deployment/request context.
2. Given debug mode is effectively on and Blob credentials are absent or incomplete, When `/debug` loads, Then the runtime-context panel reports `runtimeMode: demo`, `blobCredentialsState: incomplete`, `activeReader: fixture`, and explains that live Blob reads are intentionally bypassed.
3. Given the incoming debug cookie is malformed or tampered, When the server evaluates it, Then the runtime-context panel reports `debugCookieState: tampered` (or equivalent safe label) rather than pretending the cookie was cleanly off.

### User Story 2 — Blob read provenance and freshness are visible (Priority: P1)

As Danny, when the dashboard is blank, stale, or partially wrong, I want a debug panel showing which Blob resources were chosen, whether any live-mode read failed, and how old the currently rendered data is, so I can tell the difference between a read-path error, a demo-mode fallback, and simply stale data.

**Why this priority**: Specs 028, 029, and 030 all improved Blob behaviour, but none of that helps if the running UI cannot say which storage path it actually used.

**Independent Test**: Open `/debug` in live mode with a healthy Blob read and confirm the panel shows pointer/manifest/product-manifest paths plus freshness timestamps/ages. Then simulate a live-mode Blob failure and confirm the panel shows a sanitised failure object. In demo mode, confirm it clearly reports that no Blob read path is active.

**Acceptance Scenarios**:
4. Given live mode and a successful dashboard load, When `/debug` loads, Then the Blob-read panel shows `pointerPath`, `manifestPath`, `productsManifestPath` when present, selected `orderBlobPath`, selected `coverageBlobPaths`, selected `productBlobPath` when an item is inspected, plus per-stage read status fields without leaking signed URLs or tokens.
5. Given live mode and a captured Blob read failure, When `/debug` loads, Then the Blob-read panel includes a sanitised error object naming the failing stage/resource and preserving useful status text such as `403 Forbidden`.
6. Given dashboard data is older than the freshness expectation implied by the current summary/order timestamps, When `/debug` loads, Then the freshness panel shows `dataGeneratedAt`, `uiUpdatedAt` when available, `latestOrderDate`, product `lastFetched`, Firecrawl `lastFetched`, and their age relative to now so staleness is obvious.

### User Story 3 — Product-resolution provenance is visible for the selected item (Priority: P1)

As Danny, when a product detail modal shows sparse or surprising information, I want debug mode to show exactly how the dashboard resolved that product — tpnc/blob path, which source won for each key field, and whether Firecrawl fallback or placeholder text was used — so I can tell whether the problem is missing enrichment, stale product blobs, or normal fallback behaviour.

**Why this priority**: Product metadata has become a layered system across specs 021 and 027. The UI needs a way to explain that layering from inside the running app.

**Independent Test**: Select an item whose description comes from Apollo, one whose description comes from Firecrawl fallback, and one that still falls through to the placeholder. Confirm the product-resolution panel shows the winning source and the fallback chain for each case.

**Acceptance Scenarios**:
7. Given a selected item has an Apollo-backed description, When the product-resolution panel renders, Then it labels `descriptionSource: apollo`, shows the selected item's `tpnc` and `productBlobPath` when known, and shows that Firecrawl/placeholder were not chosen.
8. Given a selected item has empty Apollo description but a populated `firecrawl.snippet`, When the panel renders, Then it labels `descriptionSource: firecrawl`, shows the product blob path/tpnc, and shows Firecrawl freshness metadata.
9. Given a selected item still falls through to the placeholder, When the panel renders, Then it labels `descriptionSource: placeholder` and identifies the missing upstream sources that led there, including the field-level source outcome for `image`, `storage`, and `preparation` where available.

### User Story 4 — Items-by-category provenance is rich enough to explain empty or filtered results (Priority: P1)

As Danny, when the category list is empty, unexpectedly short, or obviously filtered wrong, I want the existing items-by-category panel to explain candidate orders, coverage-window decisions, chosen filter state, and final display counts, so that the original 2026-06-17 regression and similar variants can be diagnosed from `/debug` alone.

**Why this priority**: This is the original debug surface, and it is still the most frequently useful one. It should be upgraded based on what we learned from the incident.

**Independent Test**: Seed a case where `latestOrder` is filtered out by the coverage window and confirm the panel shows the candidate-order date, the active coverage window, the null reason, and the final display counts. Repeat with a normal case where an order is chosen successfully.

**Acceptance Scenarios**:
10. Given a candidate latest order exists but falls outside the active coverage window, When the items-by-category panel renders, Then it reports the candidate order date/path, the active coverage-window inputs, the chosen filter state, and an explicit window-filter reason rather than only `latestOrder: null`.
11. Given the category list is non-empty, When the items-by-category panel renders, Then it reports the chosen order, receipt-item count, unmatched-item count, display-item count, current filter, selected categories, and coverage-window inputs in a way that can be copied as JSON.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The existing spec-022 `/debug` route MUST gain four first-class observability panels, rendered in this default order: `runtime-context`, `blob-read-and-freshness`, `product-resolution`, and `items-by-category-provenance`.

- **FR-002**: The implementation MUST add a typed debug API route (or equivalent server-side data source) for **runtime context** that reports only safe diagnostic state: effective runtime mode (`live` or `demo`), Blob credential sufficiency (`complete`, `incomplete`, or equivalent safe label), effective debug-cookie state (`verified_on`, `verified_off`, `missing`, or `tampered`), authenticated-user display derivation source (`name`, `email`, or fallback), active data-reader path (`vercel_blob` or `fixture`), request path, and deployment identifier when available. It MUST NOT expose the raw cookie signature, auth tokens, or session secrets.

- **FR-003**: The implementation MUST add a typed debug API route (or equivalent server-side data source) for **Blob read and freshness provenance** that reports the selected Blob storage paths when applicable: `pointerPath`, `manifestPath`, `productsManifestPath`, selected `orderBlobPath`, selected `coverageBlobPaths`, and selected `productBlobPath` for the inspected item when available. The same payload MUST report per-stage read status fields (`pointerRead`, `manifestRead`, `summaryRead`, `orderRead`, `coverageRead`, `productRead`), the reader method family used for exact-path lookups (`head`/equivalent) where useful, the most relevant freshness timestamps (`dataGeneratedAt`, `uiUpdatedAt` when available, `latestOrderDate`, product `lastFetched`, Firecrawl `lastFetched`), computed age/staleness indicators, and a sanitised load-error object when live-mode reads fail. It MUST ALSO include the rendered `deliveryWindows` list (each window's date, slot, status, order total, and source path/identifier) so operators can confirm whether a missing Friday was absent from the snapshot or merely hidden by later logic. The payload MUST ALSO surface `expectedProductBlobPath` (derived from the item's tpnc per the spec 021 Key Entities convention `products/{tpnc}.json` — `null` when tpnc is unknown) and `productBlobPathMatch: true | false | null` (boolean comparing `expectedProductBlobPath` to `productBlobPath`; `null` when either side is absent). *(Rev 3, 2026-06-23: closes the convention-drift blind spot. The derivation rule is sourced from spec 021 Key Entities; if spec 021 changes the convention, this spec's matcher updates in lockstep.)*

- **FR-004**: In demo mode, the Blob-read/freshness panel MUST explicitly report that fixture/demo mode is active and that live Blob reads were intentionally bypassed. It MUST NOT fabricate live Blob paths or errors when the dashboard is on the fixture path.

- **FR-005**: The implementation MUST add a typed debug API route (or equivalent server-side data source) for **product-resolution provenance** keyed to the currently inspected grocery item (for example by tpnc or stable item identifier). The payload MUST surface the item name, tpnc when known, the derived `products/{tpnc}.json` path when tpnc is known, the winning source for each relevant field — at minimum `description`, `image`, `storage`, and `preparation` where available — and `expectedProductBlobPath` plus `productBlobPathMatch` per the spec 021 Key Entities derivation rule (Rev 3, 2026-06-23).

- **FR-006**: The product-resolution panel MUST distinguish at least these description outcomes: `apollo`, `curated_static`, `firecrawl`, and `placeholder`. When `firecrawl` wins, the panel MUST surface its freshness metadata. When `placeholder` wins, the panel MUST surface which upstream sources were absent or empty. The payload SHOULD also surface field-level source provenance for `image`, `storage`, and `preparation` when those fields are available.

- **FR-007**: The existing items-by-category debug payload from spec 022 MUST be extended to include enough provenance to explain the original empty-list regression: candidate latest-order date/path, active coverage-window inputs, chosen filter state, chosen-null reason, and final display-count derivation. This is additive; existing fields remain available.

- **FR-008**: All new debug routes/panels MUST inherit the existing spec-022 security contract: server-side OIDC gate, server-side signed-cookie verification, no debug payload in non-debug main-page HTML/`__NEXT_DATA__`, no localStorage/sessionStorage/IndexedDB persistence of debug payloads, and no client-side bypass path.

- **FR-009**: Every observability panel MUST support the same operator ergonomics as the existing debug shell pattern: collapsible card layout, refresh affordance, explicit type/value rendering, and `Copy as JSON` for the raw panel payload.

- **FR-010**: The implementation MUST redact or exclude sensitive material across all new panels. Forbidden output includes access tokens, bearer headers, raw cookie signatures, signed Blob URLs, request headers, env-var values, and any credential material. Safe env-var names, status codes, non-secret blob pathnames, and deployment IDs are allowed.

- **FR-011**: The feature MUST remain read-only. It MUST NOT change Blob contents, sync behaviour, demo-mode fallback rules, product-enrichment writes, or user-facing dashboard state outside the gated debug surfaces.

- **FR-012**: Tests MUST cover at least: live-vs-demo runtime-context branching, Blob credential sufficiency reporting, tampered-cookie reporting, live-mode Blob failure provenance, stale/fresh timestamp reporting, Firecrawl/Apollo/placeholder product-resolution outcomes, field-level product-source provenance where implemented, and the enriched items-by-category window-filter regression case.

- **FR-013 (Rev 4, 2026-06-28)**: The SSR render path in `app/page.tsx` MUST emit a `console.log` dump on every page load (server-side, reflected in the browser DevTools console) without requiring auth or debug mode. The dump MUST include: `dataGeneratedAt` (ISO string or `null`, top-level field), `coverageWindow` (array of ISO date strings), `coverageCount` (integer), `manifestCoverage` (array of dates found in the manifest), `manifestCoverageMiss` (array of dates in the window but absent from the manifest). The dump MUST NOT include any PII, tokens, signed URLs, or credential material. This enables Danny to diagnose stale-dashboard incidents without access to server logs or the debug page — just open DevTools and look at the console.

- **FR-014 (Rev 4, 2026-06-28)**: `BlobReadFreshnessDebugPayload` MUST surface `dataGeneratedAt` as a top-level field (not nested inside `summaryFreshness`) so it is prominently visible when the panel is expanded. MUST also include `manifestDateCoverage: string[]` (the subset of `coverageWindow` dates present in the manifest) and `manifestDateCoverageMiss: string[]` (the subset of `coverageWindow` dates absent from the manifest) so a missing-Friday can be immediately distinguished from a stale-data problem.

- **FR-015 (Rev 5, 2026-06-28)**: `BlobReadFreshnessDebugPanel` MUST render a prominent colour-coded DIAGNOSIS BANNER as the very first element in the panel body — above all table rows. The banner shows ONE of:
  - `FULL COVERAGE` (green) — all window dates have blobs
  - `PARTIAL COVERAGE` (amber) — N of M dates missing, listed explicitly
  - `NO COVERAGE` (red) — zero blobs loaded despite N window dates
  - `LOAD ERROR` (red) — a load error is present
  The banner includes a plain-English explanation and the specific missing dates. This makes the root cause of "dashboard shows only some days" immediately legible from the running UI without scanning raw field rows.

- **FR-016 (Rev 6, 2026-06-28)**: Every debug panel's "Copy as JSON" button (in `DebugDataPanel`) MUST show a brief "Copied!" confirmation after a successful `navigator.clipboard.writeText` call, restoring to "Copy as JSON" after 1500 ms. The feedback replaces the button label entirely for the duration — no separate toast or icon required. If the copy fails, the button label changes to "Copy failed" for 1500 ms before restoring.

### Non-Functional Requirements

- **NFR-001**: The added debug panels SHOULD reuse the existing spec-022 panel architecture and avoid introducing new npm dependencies or a second debug framework.
- **NFR-002**: The payloads SHOULD be concise enough to read on a laptop viewport without horizontal scrolling, while still being copyable as JSON for Telegram/log discussion.
- **NFR-003**: The implementation SHOULD prefer additive debug data derived from existing runtime state over recomputing business logic in parallel; the panels explain the dashboard's real path, not a second simulation of it.

### Key Entities

- **RuntimeContextDebugPayload**: Safe diagnostic payload for runtime mode/gating. Includes `runtimeMode`, `blobCredentialsState`, `debugCookieState`, `activeReader`, request/deployment context, and safe user-display provenance.
- **BlobReadFreshnessDebugPayload**: Safe diagnostic payload for `pointerPath`, `manifestPath`, `productsManifestPath`, selected `orderBlobPath`, selected `coverageBlobPaths`, selected `productBlobPath`, `expectedProductBlobPath` (Rev 3), `productBlobPathMatch` (Rev 3), per-stage read status fields, freshness timestamps/ages, and sanitised load-error state.
- **ProductResolutionDebugPayload**: Safe diagnostic payload for a selected grocery item's product-resolution chain, including `tpnc`, `productBlobPath`, `expectedProductBlobPath` (Rev 3), `productBlobPathMatch` (Rev 3), winning source per field, and optional Firecrawl freshness metadata.
- **ItemsByCategoryProvenancePayload**: Existing spec-022 payload extended with candidate-order path/date, chosen filter state, and coverage-window provenance sufficient to explain empty or filtered output.

## Contract Impact

- `skill.spec.yaml` changes required: Yes — this spec directory is added to expected artifacts.
- Runtime secrets/config changes required: No new secrets. Existing debug/Blob/auth env remains authoritative.
- Dashboard runtime impact: Yes — debug mode gains additional server-gated observability routes/panels.
- Dashboard UI impact: Yes — the `/debug` shell becomes richer; no non-debug UI changes are required.
- Pipeline/report impact: None.
- Blob layout impact: None.

## Relationship to Other Specs

- **Spec 022 (`022-dashboard-debug-mode`)** is the foundation. This spec extends its panel architecture and security boundary; it does not replace its gate.
- **Spec 024 (`024-dashboard-static-fixture-mode-for-preview`)** defines demo mode. This spec makes demo-vs-live explicit in debug mode rather than changing demo-mode behaviour.
- **Spec 026 (`026-dashboard-user-menu`)** preserves the always-visible Debug row as the enablement affordance. This spec reports the resulting effective cookie/mode state; it does not redesign the menu.
- **Spec 027 (`027-dashboard-firecrawl-search-fallback`)** defines one of the product-description sources this spec needs to surface in the product-resolution panel.
- **Spec 029 (`029-dashboard-blob-error-surface`)** defines the operator-facing live-mode Blob failure surface on the main page. This spec adds the debug-side provenance that explains such failures in more detail.
- **Spec 010 (`010-dashboard-product-detail`)** consumes the spec 031 product-resolution panel payload (FR-005 / FR-006) inside the Product Detail Modal as a debug-mode-only chip (spec 010 Rev 5 FR-010 / US2 / AS-025, 2026-06-23). The chip's data MUST be data-equivalent to this spec's product-resolution panel payload; the spec-031 panel is the source of truth. Spec 031 does not need to change — the panel payload is already gated by spec 022 and ready to be consumed by the modal-side chip.

## Open Questions *(resolved during drafting)*

1. **Should this be a new spec or an amendment to spec 022?** — Resolved: **new spec**. Spec 022 explicitly treated future surfaces as follow-up work. This feature is the first substantial expansion of those deferred surfaces.
2. **Should the new information appear as always-on chrome or only inside debug mode?** — Resolved: **only inside debug mode**. These are operator diagnostics, not ordinary dashboard content.
3. **Should the product-resolution panel be tied to a selected item instead of a global summary?** — Resolved: **yes**. Item-level provenance is what explains real modal-level surprises.
4. **Should demo mode fabricate Blob-path information for parity?** — Resolved: **no**. The panel should clearly say the fixture path is active; invented live-path metadata would be misleading.
5. **Should the panel surface an *expected* productBlobPath alongside the actual one?** — Resolved: **yes** (Rev 3, 2026-06-23). Danny asked on 2026-06-23: "does the debug contain information such as expected blob storage path for product meta data?". The convention from spec 021 Key Entities is `products/{tpnc}.json`; surfacing `expectedProductBlobPath` plus a `productBlobPathMatch` boolean closes the convention-drift blind spot. When `tpnc` is unknown, both fields report `null` (a missing tpnc is a different problem from a wrong path). The derivation rule lives in spec 021; this spec consumes the rule and never hardcodes the convention.

## Verification Plan

- **Unit**: payload-format and redaction tests for runtime-context, Blob-read/freshness, and product-resolution helpers.
- **Integration**: gated `/api/debug/*` route tests covering live mode, demo mode, Blob credential sufficiency, tampered cookie, and representative healthy/failing Blob states.
- **Manual**: exercise `/debug` against (a) live healthy dashboard, (b) demo-mode dashboard, (c) safe simulated Blob failure, and (d) product items representing Apollo / Firecrawl / placeholder description outcomes.
- **Regression**: confirm the enriched items-by-category panel reproduces the original `latestOrder` coverage-window failure diagnosis without a temporary inline overlay, and that the Blob panel shows the expected path/stage fields.
- **Spec validation**: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` in `/home/hermes/workspace/Hermes-Skills`.

## Reference Material

- 2026-06-17 items-by-category regression that motivated spec 022's first panel.
- Spec `024-dashboard-static-fixture-mode-for-preview` for demo/live runtime branching.
- Spec `026-dashboard-user-menu` Rev 2 for the always-visible Debug-row enablement path.
- Spec `027-dashboard-firecrawl-search-fallback` for the `descriptionSource: firecrawl` branch.
- Spec `029-dashboard-blob-error-surface` for live-mode Blob failure semantics.
- Spec `010-dashboard-product-detail` Rev 5 (2026-06-23) for the modal-side debug chip that consumes this spec's product-resolution payload (FR-005 / FR-006) inline within the Product Detail Modal. Spec 010 Rev 5.1 (2026-06-23) extends the chip to consume `expectedProductBlobPath` + `productBlobPathMatch` from this spec's Rev 3 payload.
