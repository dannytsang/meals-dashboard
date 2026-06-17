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