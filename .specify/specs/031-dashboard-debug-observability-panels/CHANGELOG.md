# Change Log: Dashboard Debug Observability Panels

Feature ID: `031-dashboard-debug-observability-panels`

This log records material changes to the dashboard debug observability-panels spec.

## Entries

### 2026-06-28 — Rev 4 (Draft): Prominent freshness signals in debug page + SSR console

- Change: Two concrete improvements to make stale-dashboard diagnosis obvious from the running debug UI without log access: (1) FR-003 amendment — surface `dataGeneratedAt` as a top-level field in the Blob-read/freshness panel (not buried in `summaryFreshness`) and add `manifestDateCoverage` / `manifestDateCoverageMiss` so a missing-Friday is distinguished from stale-data. (2) New FR-013 — SSR console dump in `app/page.tsx` fires on every page load (no auth, no debug mode required) showing `dataGeneratedAt`, `coverageWindow`, `coverageCount`, `manifestCoverage`, and `manifestCoverageMiss` in the browser DevTools console. New FR-014 adds `manifestDateCoverage` / `manifestDateCoverageMiss` to `BlobReadFreshnessDebugPayload`.
- Status after change: Draft (pending Danny approval)
- Rationale: On 2026-06-28 Danny reported the dashboard showed meals from `2026-06-26` even after a fresh sync. The freshness panel existed but `dataGeneratedAt` was buried in `summaryFreshness` and `coverageWindow` was absent from the rendered UI. An operator could not diagnose stale without reading server logs.
- Implementation impact: `app/page.tsx` (SSR console dump), `lib/debug-observability.ts` (payload restructure + new fields), `app/debug/page.tsx` (UI render update), `traceability.yaml` (FR-013 + FR-014 entries), `index.yaml` (status Draft), `spec.md` (Rev 4 header + FR-013 + FR-014).
- Evidence: Server logs showed `dataGeneratedAt: '2026-06-26T17:16:00'` on 2026-06-28; `latestOrder` showed `$20.35` instead of `£51.05`; `coverageCount: 2` instead of `8` — confirming the dashboard was reading yesterday's blob. Console dump + prominent freshness fields now make this self-diagnosing.

### 2026-06-22 — Clarification: Footer timestamp is coarse, not diagnostic

- Change: Clarified that the dashboard footer timestamps (`dataGeneratedAt` / `uiUpdatedAt`) are only a coarse freshness indicator and are not sufficient on their own to explain a missing Friday delivery.
- Status after change: Final
- Rationale: Spec 028 / spec 030 improved Blob behaviour, but footer timestamps alone cannot distinguish "Friday never in snapshot" from "Friday stale". The Rev 4 observability improvements (above) address the gap that this clarification flagged.
- Implementation impact: None — documentation clarification only.
- Evidence: Production observation confirmed by Danny on 2026-06-28 that the footer timestamps were not sufficient to diagnose the stale-dashboard incident.
