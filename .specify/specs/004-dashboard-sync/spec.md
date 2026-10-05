# Feature Specification: Dashboard Sync

Feature ID: `004-dashboard-sync`

Feature Name: Dashboard Sync

Target Skill: `data-science/meals-check`

Created: 2026-06-04

Status: Final

Change history: CHANGELOG.md

Input: Reverse-engineered from `sync-dashboard-data.py` and the `tesco_meal_check.py` dashboard sync call; amended by Danny on 2026-06-13 to add a pre-push Tesco product-enrichment stage for dashboard product detail metadata; amended by Danny on 2026-06-14 to migrate from git-committed data to Vercel Blob storage, removing private data from the public GitHub repository.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vercel Dashboard Reflects Pipeline Data (Priority: P1)

As Danny, I want the Vercel meals dashboard to reflect the same data as the Telegram report, so the dashboard is not a separate source of truth.

**Why this priority**: The dashboard provides a shareable/readable view of meal coverage while the pipeline remains the canonical data producer.

**Independent Test**: Run the dashboard sync in dry-run mode from an existing pipeline cache and verify that it reports the intended dashboard data update without committing, pushing, or deploying.

**Acceptance Scenarios**:

1. **Given** the meals-check pipeline produces matched meal data, **When** it writes dashboard state, **Then** `dashboard_cache.json` is generated from the same matched data used for the Telegram report.
2. **Given** `dashboard_cache.json` exists, **When** `sync-dashboard-data.py --skip-fetch` runs, **Then** it updates `real-data.ts` in the meals-dashboard repository from that cache, preserving supported generated item metadata such as optional `substitutedWith` values.
3. **Given** dashboard data changes are detected, **When** sync runs outside dry-run mode, **Then** the dashboard is built, committed, pushed, and deployed to Vercel production.
4. **Given** no dashboard data changes are detected, **When** sync runs outside dry-run mode, **Then** no production deployment is triggered unless `--force-deploy` is passed manually.
5. **Given** `--dry-run` is passed, **When** sync validates dashboard data, **Then** it avoids commit, push, and deploy side effects.
6. **Given** the pipeline has resolved actual Tesco delivery events and delivery usability dates, **When** it writes dashboard cache data, **Then** the cache exposes explicit delivery metadata for the visible dashboard planning window rather than requiring the dashboard to reconstruct delivery events from fixed weekday patterns or a single receipt date.
7. **Given** dashboard cache generation has produced receipt/order items, **When** the dashboard sync/enrichment path runs before `real-data.ts` is pushed, **Then** it performs best-effort Tesco product metadata enrichment for those items and stores supported metadata in generated dashboard data for fast product modal rendering.
8. **Given** Tesco product enrichment fails, is rate-limited, or cannot find a confident product match, **When** sync continues, **Then** dashboard generation must preserve truthful fallback metadata and must not fabricate product details or block indefinitely.

### Edge Cases

- A missing or stale cache should be diagnosed by the sync path rather than fabricating dashboard data.
- Build failures must block commit/push/deploy.
- Deployment side effects are allowed only in the documented dashboard sync flow.
- Dashboard UI interactions are specified in separate dashboard feature specs; this feature owns the data-sync/deployment boundary only.
- Dashboard sync must not require the frontend to infer operational delivery facts from display-side assumptions such as every Tuesday/Saturday being a delivery day.
- Tesco product enrichment is best-effort and should attempt normal Tesco website search/product pages for each item, using caching/timeouts/rate limits and truthful fallbacks. It must not fabricate product data or attempt credential theft/CAPTCHA evasion/security-control circumvention; ordinary public website search failure (including HTTP 403/rate limits/no confident match) is a handled fallback, not a permanent spec blocker.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `tesco_meal_check.py` MUST write `dashboard_cache.json` from the same matched data used for the Telegram report.
- **FR-002**: `sync-dashboard-data.py --skip-fetch` MUST read that cache and POST the generated dashboard data to the dashboard's private `/api/dashboard-data` endpoint, preserving supported receipt item fields including name, quantity, price, and optional substitution metadata. It MUST NOT write to `lib/real-data.ts`.
- **FR-011**: Dashboard sync MUST preserve generated matched-item receipt details, including name, quantity, and price, from the meals-check cache into `realCoverage[].matchedItems`. Matched items may come from a different delivery window than the currently visible order receipt, so the sync MUST NOT rely only on the visible receipt item list to recover matched-item prices.
- **FR-012**: The dashboard's private `/api/dashboard-data` API route MUST accept a POST request with a shared secret header, validate the secret, parse the dashboard data payload, and store it to Vercel Blob under a fixed blob name. Requests without a valid secret MUST return `401 Unauthorized`.
- **FR-013**: The dashboard's data-reading path (`lib/dashboard-data.ts`) MUST read from Vercel Blob at server-side runtime rather than from `lib/real-data.ts`. If the blob is unavailable or unreadable, it MUST fall back to an empty/null-safe state that renders the dashboard without private data rather than exposing an error to users.
- **FR-014**: `lib/real-data.ts` and any committed private data file MUST be added to `.gitignore`. No private meal/order/receipt data MUST be committed to the GitHub repository.
- **FR-015**: Dashboard sync MUST perform best-effort Tesco product metadata enrichment before POSTing to the dashboard API, using the same enrichment stage as the git-based workflow.
- **FR-003**: Dashboard sync MUST run `npm run build` before posting data.
- **FR-004**: Vercel production deployment MUST trigger after data is posted to the API, regardless of whether `lib/real-data.ts` has changed.
- **FR-005**: `--dry-run` mode MUST validate without posting data, building, or deploying.
- **FR-006**: Dashboard cache and generated dashboard data MUST be treated as runtime/generated artifacts. No private data file path (`lib/real-data.ts` or equivalent) MUST be written to the dashboard repository or committed to git.
- **FR-007**: Generated dashboard data MUST expose pipeline-resolved Tesco delivery metadata for the dashboard visible planning window, sufficient for the frontend to render delivery markers without deriving deliveries from hard-coded weekdays, recurring schedule assumptions, receipt dates, or client-side date reconstruction.
- **FR-008**: Generated delivery metadata MUST distinguish actual Tesco delivery event dates from delivery-usable meal-window dates and from non-delivery Tesco events such as in-store shops, so the dashboard can label delivery dates without changing meal coverage/window semantics.
- **FR-009**: Dashboard cache/sync MUST support optional generated Tesco product metadata for receipt/order items, produced after order data is created and before dashboard data is posted. Supported metadata SHOULD include product title, image URL, product URL, description, and storage/preparation where available.
- **FR-010**: Tesco product enrichment MUST be best-effort, using normal Tesco website search/product pages where available, cached where possible, bounded by timeouts/rate limits, and safe to skip for unresolved items. Failed enrichment, HTTP 403/rate limiting, or no confident match MUST not block dashboard deploy indefinitely and MUST preserve fallback behaviour.

### Contract Impact

- `skill.spec.yaml` changes required: Yes — dashboard cache/write/deploy behaviour and expected artifacts are declared.
- `SKILL.md` changes required: Yes — dashboard sync operating rules are documented.
- Runtime state changes required: Yes — dashboard cache is written outside committed skill source.
- Secrets/config changes required: No.
- Cron/hook changes required: No separate cron; sync runs inside the meals-check pipeline.

### Key Entities

- **Dashboard Blob**: Private Vercel Blob store containing the current dashboard data payload. Named `dashboard-data.json` with `add` access. Read and written only server-side.
- **Dashboard Data API Route**: Private authenticated API route at `/api/dashboard-data` on the dashboard that accepts POST requests with a shared secret, writes the payload to Vercel Blob, and serves GET requests by reading from Blob. Not publicly accessible without a valid secret.
- **Dashboard Data Secret**: Shared secret stored as a Vercel environment variable (`DASHBOARD_DATA_SECRET`). Used to authenticate POST requests from the Hermes sync to the dashboard API. Never committed to git.
- **Dashboard Cache**: Generated JSON data from the meals-check pipeline used as dashboard input.
- **Generated Delivery Metadata**: Pipeline-resolved Tesco delivery facts emitted for dashboard display, including actual delivery dates and, where needed, delivery-usable dates/window context.
- **Dashboard Repository**: The Vercel-deployed frontend repository. Private meal/order/receipt data is no longer committed to this repository.
- **Tesco Product Enrichment Stage**: A pre-push generated-data step that enriches order items with Tesco product metadata for product detail rendering.
- **Deployment Run**: The build/POST-to-API/Vercel deploy sequence triggered after each sync.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The dashboard sync uses the same matched data source as the Telegram report.
- **SC-002**: Dry-run validation completes without commit, push, or deploy side effects.
- **SC-003**: Production deployment is skipped when there are no data changes and no manual force flag.
- **SC-004**: Build failure prevents commit, push, and deployment.
- **SC-005**: A dashboard generated from the cache can render delivery markers for actual pipeline-resolved deliveries while showing no marker for a regular Tesco weekday that has no corresponding delivery event.
- **SC-006**: A dashboard generated from the cache can render product detail metadata for enriched Tesco items without requiring slow client-side product search on modal open.

## Assumptions

- The meals-dashboard repository and Vercel deployment workflow remain available to the runtime environment.
- `dashboard_cache.json` is generated data and is not committed to the external skills repository.
- The pipeline's matched data, resolved delivery/calendar facts, and generated product metadata are the dashboard source of truth.
- A Vercel Blob store named `meals-dashboard-blob` is connected to the Vercel project and `BLOB_READ_WRITE_TOKEN` is available as a Vercel environment variable.
- `DASHBOARD_DATA_SECRET` is configured as a Vercel environment variable accessible to server-side routes.

## Out of Scope

- Dashboard UI components, interaction behaviour, or visual design beyond generated data consumption; Product Info Modal rendering is governed by `010-dashboard-product-detail`.
- Creating a separate dashboard cron job.
- Changing Telegram report formatting.
- Migrating existing committed data out of git history (git history rewrite is a separate concern if needed).

## Clarifications
### Session 2026-04

- Q: Should dashboard sync be a separate scheduled step? → A: No. It runs inside the existing meals-check pipeline.

### Session 2026-06-13 — Product enrichment timing

- Q: When should Tesco product metadata be fetched? → A: After pipeline/dashboard data is created but before it is pushed to the meals dashboard, so product pages render quickly from generated metadata.
- Q: Should enrichment be mandatory for every item? → A: No. It is best-effort with caching, timeouts, and truthful fallbacks.

### Session 2026-06-14 — Blob migration

- Q: Why migrate from git-committed data to Vercel Blob? → A: The dashboard GitHub repo is public. Committing private meal/order data (Tesco order numbers, item names, prices, delivery dates, meal plans) to a public repo is not acceptable.
- Q: How does the new flow work? → A: Hermes sync POSTs dashboard data to the dashboard's private API route. The API route stores it to Vercel Blob. The dashboard reads from Blob at server-side runtime. No private data is committed to git.
- Q: What about the free tier upload limit? → A: Vercel Blob free tier allows 1,000 uploads/month. The daily upload (once per day after morning sync) is well within this. Hermes hourly syncs continue to run without re-uploading to the dashboard — only the daily upload triggers a new Blob write.
- Q: What happens if Blob is unavailable? → A: The dashboard falls back to null/empty state gracefully, rendering without private data rather than throwing an error.
- Q: Should enrichment be mandatory for every item? → A: No. It is best-effort with caching, timeouts, and truthful fallbacks.

### Session 2026-06-14 — Split storage (see `016-dashboard-blob-storage-layout`)

- Q: What about the single-blob storage inefficiency? → A: See `016-dashboard-blob-storage-layout/spec.md`. The single-blob approach requires delete + rewrite of the entire payload on every sync. The split storage approach writes immutable order/coverage blobs per delivery/meal-date and only mutates a small `pointers/latest.json` pointer file.
