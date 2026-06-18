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
   - Optional: `MEALS_FIRECRAWL_FALLBACK=1` — spec 027 Firecrawl search
     fallback for missing product descriptions. **Disabled by default.**
     When set, the dashboard's Product Detail modal will call
     `/api/firecrawl-description` for items whose Apollo cache blob
     (spec 021) and curated static dictionary (lib/product-database.ts)
     both have empty `description`, and progressively enhance the
     description with a ~200-char Google snippet. See
     "Firecrawl fallback (spec 027)" below for credit costs and
     observability.
   - Optional: `MEALS_FIRECRAWL_FALLBACK_BUDGET_PER_RENDER=3` (default 3)
     — spec 027 per-server-runtime budget. Caps the number of Firecrawl
     `/v1/search` requests a single server-runtime instance can make
     before falling through to the placeholder. Production should keep
     this at the default; raise cautiously if real-world snippet quality
     is good and you've reviewed Firecrawl credit spend.
   - Required if `MEALS_FIRECRAWL_FALLBACK=1`: `FIRECRAWL_API_KEY` —
     the same Firecrawl API key used by the chef-profile MCP server
     (stored in `~/.hermes/.env` locally; set as a Vercel env var for
     preview/production).
7. Save.

## Firecrawl fallback (spec 027)

The Firecrawl description fallback is opt-in. Default behaviour is
unchanged from before this spec: items with empty description show the
existing placeholder string. No code runs unless
`MEALS_FIRECRAWL_FALLBACK=1` is set.

**Cost**: ~1 Firecrawl credit per `/v1/search` call. With the default
budget of 3 per render, a single Order Items page load burns at most 3
credits when every item triggers the fallback. The 2026-06-18 3-product
test (`references/tesco-firecrawl-fallback-investigation-2026-06-18.md`)
recorded ~1 credit per successful query and 0 credits on failures or
budget exhaustion. Check your Firecrawl billing dashboard at
https://firecrawl.dev to monitor spend.

**Reversibility**: setting `MEALS_FIRECRAWL_FALLBACK=0` (or removing the
env var) restores the pre-spec behaviour with zero code changes (spec
027 NFR-005). The fallback is read-time only — no writes to Vercel Blob,
no schema changes to `products/{tpnc}.json`.

**Observability**:
- Server-side warnings are logged via `console.warn` for every fallback
  path that returns null (missing key, HTTP error, network error, zero
  hits, budget exhausted). Watch Vercel function logs for the
  `[firecrawl-description-fallback]` prefix.
- The modal description `<p>` carries a `data-source` attribute:
  `firecrawl-search` when the snippet rendered, otherwise the
  resolver's `source` value (`generated`, `local`, or `fallback`).
  Inspect from DevTools to confirm the fallback fired.

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