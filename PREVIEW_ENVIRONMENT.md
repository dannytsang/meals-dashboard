# Preview Environment Setup (Vercel)

This document captures the one-time Vercel UI steps to wire the
`preview` Git branch into a named **Preview** environment on the
`meals-dashboard` Vercel project. Idempotent — safe to re-run.

## Why

- **Production** deploys remain tied to `main` and use the
  `production` Vercel environment.
- **Preview** deploys come from the `preview` Git branch and use the
  `preview` Vercel environment.
- Per-PR previews still work — Vercel auto-builds any branch with the
  GitHub integration; those use Vercel's transient URLs.

## One-time setup

1. Open https://vercel.com/dannytsang/meals-dashboard/settings/environments
2. Click **Create Environment**
3. Name: `preview`
4. Branch: `preview`
5. **DO NOT** check "Automatically expose System Environment Variables" unless
   you also want preview to see the production secrets — it almost
   certainly should, see step 6.
6. Under **Environment Variables**, copy the variables you want preview
   to inherit from production. Recommended baseline (matches production):
   - `AUTHENTIK_CLIENT_ID`
   - `AUTHENTIK_CLIENT_SECRET`
   - `AUTHENTIK_ISSUER`
   - `NEXTAUTH_URL` — **set to the preview URL** (e.g.
     `https://meals-dashboard-preview.vercel.app`), NOT the production
     URL. Authentik must allow this callback URL.
   - `NEXTAUTH_SECRET`
   - `BLOB_READ_WRITE_TOKEN` — the same Vercel Blob token as production.
     The preview reads/writes to the **same** blob namespace by
     default; see "Data isolation" below.
   - Optional: `MEALS_DEBUG_MODE=1` — useful on preview, so the debug
     surface (spec 022) is available for QA without redeploying
     production.
7. Save.

## Firecrawl fallback (spec 027 Rev 2 — sync-time)

The Firecrawl description fallback runs in the Python sync pipeline
(`scripts/sync-dashboard-data.py`), NOT in the dashboard. The sync
calls Firecrawl's `/v1/search` endpoint for items where the Apollo
extraction returned an empty `description` field, and writes the
returned snippet to `products/{tpnc}.json` under a `firecrawl`
sub-object. The dashboard read path composes the snippet as the
third tier of the Apollo → curated-static → placeholder chain in
`resolveProductInfoForItem`.

**Disabled by default.** No code runs unless `MEALS_FIRECRAWL_FALLBACK=1`
is set in the sync process environment.

**Env vars**:
- `MEALS_FIRECRAWL_FALLBACK` (default off) — set to `1` to enable.
- `FIRECRAWL_API_KEY` — the Firecrawl API key. Same key used by the
  chef-profile MCP server (in `~/.hermes/.env` locally). For preview
  AND production cron jobs, this key must be available to the sync
  process — verify the cron shell sources `~/.hermes/.env` before
  invoking the sync (see `~/.hermes/profiles/chef/cron/jobs.json`).
- `MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS` (default 21) — **existing
  Apollo TTL** is reused for Firecrawl. No new env var. Items with
  a `firecrawl.lastFetched` within the TTL are NOT re-fetched.
- `MEALS_PRODUCT_ENRICHMENT_TIMEOUT_SECONDS` (default 5) and
  `MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS` (default 0.2) — **existing
  Apollo knobs** are reused for Firecrawl.

**Cost**: ~1 Firecrawl credit per `/v1/search` call. The 21-day TTL
bounds total spend: an item with an empty Apollo description burns
~1 credit per 21-day window, regardless of how often the dashboard is
viewed. The 2026-06-18 3-product test
(`references/tesco-firecrawl-fallback-investigation-2026-06-18.md`)
recorded 0 credits on failures, 0 credits on zero-hits (the
`status: "not_found"` short-circuit), and 1 credit per successful
snippet. Monitor at https://firecrawl.dev.

**Reversibility**: setting `MEALS_FIRECRAWL_FALLBACK=0` (or removing the
env var) restores the pre-spec sync behaviour. Existing product blobs
without the `firecrawl` key continue to render correctly (the key is
simply absent).

**Observability**:
- Sync-time warnings are logged via `print()` for every Firecrawl
  call path (missing key, HTTP error, network error, malformed JSON).
  Prefix: `⚠ Firecrawl`. Watch Vercel function / cron logs.
- The product blob's `firecrawl` sub-object carries `lastFetched`
  (ISO 8601 timestamp). Inspect the blob to confirm freshness.

## Data isolation

By default, preview and production share the same Vercel Blob
namespace. That is fine for the meals-dashboard — the pointer blob
(`pointers/latest.json`) is shared, so preview sees the same orders,
coverage, and products as production. This is the intended behaviour:
preview should render real household data.

If you ever want preview to use a separate blob namespace (e.g. to
test destructive sync flows), set a different `BLOB_READ_WRITE_TOKEN`
on the `preview` environment — but this needs careful coordination
with the sync script, which currently reads the token from one
shared env var.

## Auto-deploy behaviour

- Push to `preview` → Vercel deploys preview to a URL like
  `https://meals-dashboard-preview.vercel.app` (or the
  `<project>-git-preview-<owner>.vercel.app` URL Vercel picks).
- Push to any other branch (e.g. a feature branch) → Vercel still
  builds it as a transient preview; those URLs are unrelated to the
  named `preview` environment.

## Smoke test after setup

1. `git checkout preview`
2. Make a trivial commit (or just `git commit --allow-empty -m "chore: smoke preview"`)
3. `git push origin preview`
4. Watch https://vercel.com/dannytsang/meals-dashboard/deployments —
   a `preview` environment deployment should appear.
5. Open the deployment URL; confirm:
   - The OIDC sign-in page loads.
   - After sign-in, the dashboard renders with today's meals.
   - If `MEALS_DEBUG_MODE=1`, `/debug` returns 200.

## Files

- `.vercelignore` — files excluded from the Vercel upload (already
  covered by `.gitignore` for the most part, but kept explicit).

## Status

- [x] `preview` branch created off `main` at commit `5221507`.
- [x] `preview` branch pushed to `origin/preview`.
- [x] `.vercelignore` added.
- [ ] Vercel UI environment created and env vars set — **operator step**, see steps 1-7 above.
- [ ] Smoke test commit pushed, deploy confirmed.