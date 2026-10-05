# Implementation Plan: Dashboard Static Fixture Mode for Preview

Status: Proposed
Feature: 024-dashboard-static-fixture-mode-for-preview
Skill: data-science/meals-check

## Summary

Auto-detect runtime mode at request time and route the dashboard's blob-storage read path accordingly. When `BLOB_READ_WRITE_TOKEN` is set, use Vercel Blob (live mode). When unset, use a build-time-generated JSON fixture (demo mode) so the preview environment renders meaningful sample data instead of 500-ing. Demo mode renders a permanent site-wide banner + secondary header chip. The fixture is generated at build time from a committed seed file (real trip structure with randomised names/dates/locations) and the generated JSON is gitignored.

This plan is **detailed at Proposed time**. The nine open questions in `spec.md` are already resolved; implementation work is gated on Danny's approval of this Proposed spec.

## Technical Context

- **`DashboardDataReader` interface** — `lib/dashboard-data.ts:54`. The seam for swapping read paths. Already used by tests via `InMemoryBlobStorageClient`. This spec adds two more implementations: `StaticFixtureReader` and `EmptyDashboardReader`.
- **`getDashboardData({ coverageWindow, reader })`** — `lib/dashboard-data.ts:56-62`. The reader is injected; default is `new VercelBlobStorageClient()`. No signature changes needed.
- **`app/page.tsx`** — the call site. Single line: `const data = await getDashboardData({ coverageWindow });`. This becomes `const data = await getDashboardData({ coverageWindow, reader });` after the injection.
- **`app/layout.tsx`** — the root layout. The mount point for `<DemoModeBanner />`.
- **`SplitLayoutPayload` shape** — `lib/dashboard-sync.ts:92`. The fixture JSON conforms to this shape.
- **`VercelBlobStorageClient`** — `lib/blob-storage.ts:55`. UNCHANGED. Reads `BLOB_READ_WRITE_TOKEN` from env at line 58.
- **`InMemoryBlobStorageClient`** — `lib/blob-storage.ts`. UNCHANGED. Already used by tests.
- **`lib/auth.ts` `assertAuthConfigured`** — UNCHANGED. Auth still required regardless of demo mode (spec 015 contract).
- **No `MEALS_FIXTURE_MODE` env var** — this spec does NOT add a new env var. Mode is detected from credential presence.

## Constitution Check

- The runtime-mode helper follows the spec 022 pattern (`lib/debug-mode.ts`): single source of truth for env-var reading, no other module reads the env var directly. This avoids the "env var read scattered across N modules" anti-pattern.
- The fixture reader implements the existing `DashboardDataReader` interface. No changes to `lib/dashboard-data.ts`, `lib/blob-storage.ts`, or `getDashboardData()`. The seam is preserved.
- The bundled fixture JSON is generated from a committed seed. No real Tesco data, no real product metadata, no real coverage. Privacy boundary intact.
- Production behaviour is unchanged. With `BLOB_READ_WRITE_TOKEN` set, the dashboard reads from Vercel Blob exactly as today.
- The build-time generator is deterministic (seeded RNG) so consecutive builds produce byte-identical fixtures.
- No new dependencies. Reuse existing project dependencies (no new npm packages).
- Demo mode wins over debug mode when both are active (per US-007). Different env vars, different concerns, different code paths.

## Implementation Phases

### Phase 1 — Runtime-mode helper

- New file `lib/runtime-mode.ts`:
  - `export const BLOB_TOKEN_ENV = 'BLOB_READ_WRITE_TOKEN'`
  - `export const BLOB_STORE_ID_ENV = 'BLOB_STORE_ID'`
  - `export function isBlobStorageConfigured(): boolean` — returns true iff BOTH `BLOB_READ_WRITE_TOKEN` AND `BLOB_STORE_ID` are set and non-empty (fails closed per FR-023).
  - `export function isDemoMode(): boolean` — returns `!isBlobStorageConfigured()`.
  - `export function runtimeModeStatus(): { demoMode: boolean, blobConfigured: boolean }` — observability shape.
  - Internal: once-per-process warning log if `isDemoMode()` AND `VERCEL_ENV=production` (NFR-005).
- New file `lib/runtime-mode.test.ts`:
  - Vitest cases: both creds set → demo mode false; only `BLOB_READ_WRITE_TOKEN` set → demo mode true (fails closed); only `BLOB_STORE_ID` set → demo mode true; neither set → demo mode true; empty string treated as unset; `runtimeModeStatus` shape.

### Phase 2 — Empty dashboard reader

- New file `lib/fixtures/empty-dashboard-reader.ts`:
  - `export class EmptyDashboardReader implements DashboardDataReader`:
    - `readPointer(): Promise<PointerContents | null>` → null
    - `readManifest(_path: string): Promise<Manifest>` → `{}`
    - `readJsonBlob<T>(_path: string): Promise<T | null>` → null
    - `listPaths(_prefix: string): Promise<string[]>` → `[]`
- New file `lib/fixtures/empty-dashboard-reader.test.ts`:
  - Vitest cases: every method returns null/empty regardless of input.

### Phase 3 — Build-time generator: seed file

- New file `lib/fixtures/seed/dashboard-fixture-seed.yaml`:
  - Captures the structure of a real trip: 7 meals across 8 days, 1 explicit gap day, ~6 products per meal
  - Includes the curated name pool: 8 first names (no "Demo" prefix) × 6 last names
  - Includes obvious-fake sentinels: `dataGeneratedAt: '2026-01-01T00:00:00Z'`, `orderTotal: 42.42`
  - Includes the gap-day date (e.g. `2026-06-22` in the seed)
  - Committed to the repo; this is the "real" data, the generated JSON is the "fake" data
- This file is the source of truth for the fixture. Any change to the seed is the way the fixture is updated.

### Phase 4 — Build-time generator: script

- New file `lib/fixtures/scripts/generate-fixture.mjs`:
  - Reads `lib/fixtures/seed/dashboard-fixture-seed.yaml` (uses a small YAML parser; if no YAML parser is available, use a hand-rolled minimal parser or pick a dependency — but the spec forbids new npm deps, so hand-rolled is fine for a small file)
  - Applies seeded RNG (constant seed `42`, e.g. mulberry32 or LCG) to:
    - Pick names from the pool
    - Pick dates within a recent week
    - Pick delivery times
    - Pick locations
  - Emits `lib/fixtures/dashboard-fixture.json` conforming to `SplitLayoutPayload`
  - Deterministic: consecutive runs produce byte-identical output
- New file `lib/fixtures/scripts/generate-fixture.test.ts` (or `.mjs.test.ts` depending on the test runner config):
  - Vitest cases: generator produces valid `SplitLayoutPayload`; generator output is byte-identical across consecutive runs (`shasum` equality); generator handles missing seed gracefully; generated fixture includes the gap day; generated names are all from the pool.

### Phase 5 — Build-time generator: prebuild hook + gitignore

- Update `package.json`:
  - Add `"prebuild": "node lib/fixtures/scripts/generate-fixture.mjs"` to the `scripts` section
  - No other changes
- New file `lib/fixtures/.gitignore`:
  - Contains: `dashboard-fixture.json` (excludes the generated JSON)
  - Comment block: explains that the generator script, seed, and tests are committed; only the generated artefact is gitignored

### Phase 6 — Static fixture reader

- New file `lib/fixtures/static-fixture-reader.ts`:
  - `import dashboardFixture from './dashboard-fixture.json'` — top-level import (Next.js bundles JSON imports at build time)
  - `export class StaticFixtureReader implements DashboardDataReader`:
    - Constructor: parses the fixture, builds an in-memory index of `path → content`
    - `readPointer()` → returns the fixture's pointer contents
    - `readManifest(path)` → returns the manifest blob content for the given path, or `{}` if not found
    - `readJsonBlob<T>(path)` → returns the parsed JSON for the given path, or null if not found
    - `listPaths(prefix)` → returns all indexed paths starting with `prefix`
  - Module-level validation: parses + validates shape at module init time, throws on mismatch (FR-011)
- New file `lib/fixtures/static-fixture-reader.test.ts`:
  - Vitest cases: `readPointer` returns fixture pointer; `readManifest` returns manifest content for known path; `readJsonBlob` returns parsed content for known path; `readJsonBlob` returns null for unknown path; `listPaths` returns paths matching prefix; full shape conformance to `DashboardDataReader`.

### Phase 7 — Demo mode banner

- New file `components/demo-mode-banner.tsx`:
  - Server-rendered React component. No `'use client'` directive.
  - Props: `{ demoMode: boolean }`.
  - Returns `null` when `demoMode` is false.
  - When true: renders a sticky top-of-page banner with:
    - Amber background (`bg-amber-500`), dark text
    - Z-index: highest (above all other content)
    - Text: "⚠️ DEMO MODE — showing sample data. Live data unavailable."
    - No dismiss button (FR-016)
    - `role="status"`, `aria-label="Demo mode — sample data, not real data"`
    - Emoji `aria-hidden="true"`
    - `data-testid="demo-mode-banner"` and `data-demo-mode="true"`

### Phase 8 — Demo mode chip

- New file `components/demo-mode-chip.tsx`:
  - Server-rendered React component. No `'use client'` directive.
  - Props: `{ demoMode: boolean }`.
  - Returns `null` when `demoMode` is false.
  - When true: renders a `<span>` with:
    - Amber background matching the banner
    - Text: "Demo"
    - `data-testid="demo-mode-chip"`, `data-demo-mode="true"`, `aria-label="Demo mode is active"`
    - Placed in the top-right header (between `<UserChip />` and `<ThemeToggle />` per spec 023)

### Phase 9 — Wire into dashboard

- Update `app/page.tsx`:
  - Import `isDemoMode` and `selectDashboardDataReader`.
  - Pass `reader` to `getDashboardData({ coverageWindow, reader })` via the helper.
  - The helper keeps the priority order `blob > fixture > empty` and catches a malformed bundled fixture import so the page still renders the empty state.
  - Pass `demoMode={isDemoMode()}` to `<DashboardClient />`.
- Update `app/layout.tsx`:
  - Import `isDemoMode` and `<DemoModeBanner />`.
  - Render `<DemoModeBanner demoMode={isDemoMode()} />` at the top of the root layout (above `{children}`).
- Update `components/dashboard-client.tsx`:
  - Add optional `demoMode?: boolean` to props interface.
  - Import `<DemoModeChip />` and render it in the top-right header flex row (between `<UserChip />` and `<ThemeToggle />` if spec 023 lands first, otherwise as the first child of the row).
  - Add `data-demo-mode={demoMode ? 'true' : 'false'}` to the dashboard root element.

### Phase 10 — Tests + governance

- New tests (per FR-021):
  - `lib/runtime-mode.test.ts` (Phase 1)
  - `lib/fixtures/empty-dashboard-reader.test.ts` (Phase 2)
  - `lib/fixtures/scripts/generate-fixture.test.ts` (Phase 4)
  - `lib/fixtures/static-fixture-reader.test.ts` (Phase 6)
  - Extension to `components/dashboard-client.test.ts` (or new `app/page.test.tsx`): demo mode renders banner and chip; non-demo mode does not; empty state shows notice; `data-demo-mode` attribute present.
  - Integration test: a full request cycle with `BLOB_READ_WRITE_TOKEN` unset produces HTML containing the banner, the chip, and the fixture data.
- Operator documentation:
  - The `MEALS_FIXTURE_MODE` env var does not exist in this spec. No operator setup is required for demo mode — the absence of `BLOB_READ_WRITE_TOKEN` triggers it. No `PREVIEW_ENVIRONMENT.md` update is needed for this spec.
- `skill.spec.yaml`:
  - `expected_artifacts:` updated per FR-022. Excludes `lib/fixtures/dashboard-fixture.json` from the artifact list.
- Static inspection:
  - With `BLOB_READ_WRITE_TOKEN` set, build the production bundle; grep for a name from the curated pool (e.g. "Sam Patel"); assert no hits in the production JS bundle.

## Risks

- **Fixture drift from production schema**: if `SplitLayoutPayload` evolves, the bundled fixture must be updated. Mitigation: schema-conformance validation at module load; build-time generator regenerates from the seed on every `npm run build`.
- **Production env-var confusion**: someone unsets `BLOB_READ_WRITE_TOKEN` on production by accident. Mitigation: NFR-005 warning log when demo mode is detected in production-looking environment.
- **Bundle size leak**: fixture JSON ends up in production bundle. Mitigation: NFR-003 + static-bundle scan; `StaticFixtureReader` import only taken when demo mode is detected.
- **Privacy leak**: fixture accidentally includes real data. Mitigation: build-time generation from a committed seed; the seed is the only source of data; PR review should check the seed contains no real Tesco order numbers, prices, or product names.
- **Auth bypass confusion**: someone thinks demo mode skips auth. Mitigation: spec 015 (OIDC) is unchanged; `app/page.tsx` still calls `getServerSession(authOptions)` before any reader selection. The banner and chip both render only on authenticated sessions.
- **Multiple env vars interaction**: spec 022 has `MEALS_DEBUG_MODE`, this spec adds no new env vars. The interaction is purely runtime: demo mode wins over debug mode (US-007). Mitigation: explicit Open Question 8 resolution; integration test asserting demo mode wins.
- **Generator non-determinism**: the seed RNG is supposed to be deterministic. Mitigation: NFR-008 determinism test; constant seed; no system entropy.
- **Seed file format**: the seed is YAML but the project may not have a YAML parser available (no new deps allowed). Mitigation: hand-roll a minimal YAML parser for the small seed file (~50 lines), or use a simpler format (JSON, or a `.ts` file exporting a constant). Decide during implementation.

## Verification

- `cd /home/hermes/workspace/meals-dashboard && npx vitest run lib/runtime-mode.test.ts lib/fixtures/empty-dashboard-reader.test.ts lib/fixtures/static-fixture-reader.test.ts lib/fixtures/scripts/generate-fixture.test.ts -v` — must pass.
- `cd /home/hermes/workspace/meals-dashboard && npx vitest run` — full suite must pass (existing + new).
- `cd /home/hermes/workspace/meals-dashboard && npx tsc --noEmit` — must pass.
- `cd /home/hermes/workspace/meals-dashboard && npx next build` — must succeed; the prebuild hook regenerates the fixture.
- `cd /home/hermes/workspace/meals-dashboard && shasum lib/fixtures/dashboard-fixture.json` — run twice; must match (determinism verification).
- Manual: deploy to preview (no `BLOB_READ_WRITE_TOKEN`); dashboard renders fixture; banner visible, sticky, no dismiss; chip visible; no Vercel Blob network requests.
- Manual: deploy to production (with `BLOB_READ_WRITE_TOKEN` set); dashboard behaviour unchanged; no banner; no chip; no fixture data leak.
- Manual: grep production bundle for a name from the curated pool; assert no hits in the production JS bundle.

## Documentation Artifacts

- `spec.md` — feature contract.
- `plan.md` — this implementation plan.
- `tasks.md` — delivery checklist.
- `CHANGELOG.md` — material change history.
- `scenarios.yaml` — machine-readable scenario coverage.
- `traceability.yaml` — machine-readable requirement traceability.
- `lib/fixtures/seed/dashboard-fixture-seed.yaml` — committed seed file (real-trip structure).
- `lib/fixtures/scripts/generate-fixture.mjs` — committed build-time generator.
- `lib/fixtures/dashboard-fixture.json` — generated, gitignored.
- `lib/fixtures/.gitignore` — committed; excludes only the generated JSON.
