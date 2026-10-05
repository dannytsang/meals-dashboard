# Tasks: Dashboard Static Fixture Mode for Preview

## Open: deferred login-page demo-banner correction

- [ ] T125 Reproduce and fix the login/shared-layout build-time versus runtime mode mismatch; verify live-mode login/sign-out/reload consistency, genuine demo-banner retention, unchanged auth/fail-closed boundaries and static privacy. See the pending note in `spec.md` and the matching note in the other repository's spec. Implementation and deployment are deferred by Danny; no runtime fix is claimed.

## Existing task record (unchanged)


**Input**: `.specify/specs/024-dashboard-static-fixture-mode-for-preview/spec.md`

> **Proposed status (2026-06-17)**: Spec promoted to Proposed after Rev 0 → Rev 3 work. The `MEALS_FIXTURE_MODE=1` env var opt-in is **gone**; mode is auto-detected from `BLOB_READ_WRITE_TOKEN` + `BLOB_STORE_ID` presence. Banner is permanent, no dismiss. Names are realistic UK pool, no "Demo" prefix. Fixture is build-time generated from a committed seed; the generated JSON is gitignored. All 9 open questions resolved; validator clean. Implementation work now eligible to begin.

## Phase 1: Spec authoring (this Draft → Proposed)

- [x] T001 Write `spec.md` (Rev 0 → Rev 3 rewrite)
- [x] T002 Write `plan.md` (Rev 0 → Rev 3 rewrite)
- [x] T003 Write `CHANGELOG.md` (Draft entry + Proposed promotion entry)
- [x] T004 Add entry to `.specify/specs/index.yaml` with `status: Proposed, readiness: needs_implementation`
- [x] T005 Write `scenarios.yaml` + `traceability.yaml` (Rev 0 → Rev 3: 20 FRs → 22 FRs, 10 AS → 12 AS)
- [x] T006 Update `skill.spec.yaml` `expected_artifacts:` to include this spec directory and source files
- [x] T007 Validate: `python /home/hermes/workspace/Hermes-Skills/software-development/spec-driven-skills/scripts/validate_spec_skill.py /home/hermes/workspace/Hermes-Skills/data-science/meals-check`

## Phase 2: Runtime-mode helper (Implementation)

- [ ] T010 Create `lib/runtime-mode.ts` with `BLOB_TOKEN_ENV`, `BLOB_STORE_ID_ENV`, `isBlobStorageConfigured()`, `isDemoMode()`, `runtimeModeStatus()`
- [ ] T011 `isBlobStorageConfigured` returns true iff BOTH `BLOB_READ_WRITE_TOKEN` AND `BLOB_STORE_ID` are set and non-empty (fails closed per FR-023)
- [ ] T012 Once-per-process warning log when `isDemoMode()` is true AND `VERCEL_ENV=production` (NFR-005)
- [ ] T013 Create `lib/runtime-mode.test.ts` covering: both creds set → demo mode false; only one set → demo mode true; neither set → demo mode true; empty string treated as unset; `runtimeModeStatus` shape

## Phase 3: Empty dashboard reader (Implementation)

- [ ] T020 Create `lib/fixtures/empty-dashboard-reader.ts` with `EmptyDashboardReader` implementing `DashboardDataReader`
- [ ] T021 All methods return null/empty (matches spec 017 FR-03 / SC-03 fallback behaviour)
- [ ] T022 Create `lib/fixtures/empty-dashboard-reader.test.ts` covering every method

## Phase 4: Build-time generator: seed file (Implementation)

- [ ] T030 Create `lib/fixtures/seed/dashboard-fixture-seed.yaml`
  - Capture real-trip structure: 7 meals across 8 days, 1 explicit gap day, ~6 products per meal
  - Curated name pool: 8 first names (no "Demo" prefix) × 6 last names
  - Obvious-fake sentinels: `dataGeneratedAt: '2026-01-01T00:00:00Z'`, `orderTotal: 42.42`
  - Include the gap-day date (e.g. `2026-06-22` in the seed)
  - Committed to the repo
- [ ] T031 Verify seed file is valid YAML (parse with hand-rolled parser or similar)
- [ ] T032 Verify seed file contains no real Tesco data, no real product metadata, no real coverage data

## Phase 5: Build-time generator: script (Implementation)

- [ ] T040 Create `lib/fixtures/scripts/generate-fixture.mjs`
  - Reads `lib/fixtures/seed/dashboard-fixture-seed.yaml`
  - Applies seeded RNG (constant seed `42`, e.g. mulberry32 or LCG) to names, dates, times, locations
  - Emits `lib/fixtures/dashboard-fixture.json` conforming to `SplitLayoutPayload`
  - Deterministic: consecutive runs produce byte-identical output
- [ ] T041 Decide on YAML parsing strategy: hand-rolled minimal parser for the small seed file (no new npm deps allowed). If the seed is small enough (~50 lines), a hand-rolled parser is feasible.
- [ ] T042 Create `lib/fixtures/scripts/generate-fixture.test.ts` (or `.test.mjs`) covering:
  - Generator produces valid `SplitLayoutPayload`
  - Generator output is byte-identical across consecutive runs (`shasum` equality)
  - Generator handles missing seed gracefully
  - Generated fixture includes the gap day
  - Generated names are all from the pool

## Phase 6: Build-time generator: prebuild hook + gitignore (Implementation)

- [ ] T050 Update `package.json`: add `"prebuild": "node lib/fixtures/scripts/generate-fixture.mjs"` to the `scripts` section. No other changes.
- [ ] T051 Create `lib/fixtures/.gitignore`: contains `dashboard-fixture.json` (excludes the generated JSON). Comment block explains the convention.
- [ ] T052 Run `npm run prebuild` and verify `lib/fixtures/dashboard-fixture.json` is generated
- [ ] T053 Run `npm run prebuild` twice; assert `shasum lib/fixtures/dashboard-fixture.json` matches across runs (determinism)

## Phase 7: Static fixture reader (Implementation)

- [ ] T060 Create `lib/fixtures/static-fixture-reader.ts` with `StaticFixtureReader` implementing `DashboardDataReader`
  - Top-level JSON import
  - In-memory index of `path → content`
  - Module-level validation: parses + validates shape at module init time, throws on mismatch
  - Methods: `readPointer`, `readManifest`, `readJsonBlob`, `listPaths`
- [ ] T061 Create `lib/fixtures/static-fixture-reader.test.ts` covering: readPointer, readManifest, readJsonBlob (known and unknown paths), listPaths, shape conformance

## Phase 8: Demo mode banner (Implementation)

- [ ] T070 Create `components/demo-mode-banner.tsx` as a server-rendered component (no `'use client'`)
- [ ] T071 Props: `{ demoMode: boolean }`; returns null when false
- [ ] T072 When true: sticky top-of-page banner with:
  - Amber background (`bg-amber-500`), dark text
  - Z-index: highest
  - Text: "⚠️ DEMO MODE — showing sample data. Live data unavailable."
  - No dismiss button (FR-016)
  - `role="status"`, `aria-label="Demo mode — sample data, not real data"`
  - Emoji `aria-hidden="true"`
  - `data-testid="demo-mode-banner"`, `data-demo-mode="true"`

## Phase 9: Demo mode chip (Implementation)

- [ ] T080 Create `components/demo-mode-chip.tsx` as a server-rendered component (no `'use client'`)
- [ ] T081 Props: `{ demoMode: boolean }`; returns null when false
- [ ] T082 When true: `<span>` with amber background, text "Demo", `data-testid="demo-mode-chip"`, `data-demo-mode="true"`, `aria-label="Demo mode is active"`
- [ ] T083 Position in the top-right header (between `<UserChip />` and `<ThemeToggle />` if spec 023 lands first, otherwise as the first child of the row)

## Phase 10: Wire into dashboard (Implementation)

- [x] T090 Update `app/page.tsx`:
  - Import `selectDashboardDataReader` and `isDemoMode`
  - Reader priority: blob > fixture > empty, with dynamic import fallback when the bundled fixture import fails
  - Pass `reader` to `getDashboardData({ coverageWindow, reader })`
  - Pass `demoMode={isDemoMode()}` to `<DashboardClient />`
- [ ] T091 Update `app/layout.tsx`:
  - Import `isDemoMode` and `<DemoModeBanner />`
  - Render `<DemoModeBanner demoMode={isDemoMode()} />` at the top of the root layout (above `{children}`)
- [ ] T092 Update `components/dashboard-client.tsx`:
  - Add optional `demoMode?: boolean` to props interface
  - Render `<DemoModeChip />` in the top-right header flex row
  - Add `data-demo-mode={demoMode ? 'true' : 'false'}` to dashboard root element

## Phase 11: Tests + governance (Implementation)

- [ ] T100 `npx tsc --noEmit` clean
- [ ] T101 `npx vitest run` clean (existing + new)
- [ ] T102 `npx next build` clean (prebuild hook runs and regenerates the fixture)
- [ ] T103 Determinism verification: run `node lib/fixtures/scripts/generate-fixture.mjs` twice; assert `shasum lib/fixtures/dashboard-fixture.json` matches
- [ ] T104 Manual: deploy to preview (no `BLOB_READ_WRITE_TOKEN`); confirm dashboard renders fixture; banner visible, sticky, no dismiss; chip visible; no Vercel Blob network requests
- [ ] T105 Manual: deploy to production (with `BLOB_READ_WRITE_TOKEN` set); confirm dashboard behaviour unchanged; no banner; no chip; no fixture data leak
- [ ] T106 Manual: grep production bundle for a name from the curated pool (e.g. "Sam Patel"); assert no hits in production JS bundle
- [ ] T107 Integration test: full request cycle with `BLOB_READ_WRITE_TOKEN` unset produces HTML containing the banner, the chip, and the fixture data
- [ ] T108 Update `skill.spec.yaml` `expected_artifacts:` per FR-022 (excludes the generated `dashboard-fixture.json`)
- [ ] T109 Capture live runtime evidence (screenshot of preview with banner + chip + fixture data; screenshot of production with neither; bundle grep output)

## Phase 12: Future considerations (deferred — not in this Proposed spec's surface)

- [ ] T120 Multiple fixtures (e.g. fixture-by-trip-type: weekly, monthly, special-event) — deferred future spec
- [ ] T121 Auto-generate fixture from a real snapshot — out of scope (privacy + repo-bloat)
- [ ] T122 Per-page fixture override — out of scope
- [ ] T123 Fixture data for debug shell (spec 022 DS-XX) — debug-mode spec owns its own fixtures
- [ ] T124 Larger name pool: 8 × 6 = 48 combinations is sufficient for demo purposes; can be expanded in the seed file if needed
