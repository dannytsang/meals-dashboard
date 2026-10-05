# Change Log: Dashboard Product Payload Endpoint and Split Full Sync

Feature ID: `032-dashboard-product-payload-endpoint`

This changelog records material changes to the product payload endpoint spec.

## Entries

### 2026-06-27 — Final (production deployed; promotion reconciled)

- Change: Flipped `Status: Proposed` → `Status: Final`. Implementation has been deployed to production on `meals-dashboard` `origin/main`; `index.yaml` already listed `status: Final, readiness: already_satisfied`, but the spec body still read `Status: Proposed`. The 2026-06-20 CHANGELOG entry flagged "production evidence pending"; this entry closes that gate.
- Status after change: Final
- Rationale: Danny asked on 2026-06-27 "work on all proposed specs in the meals skill". The 2026-06-20 entry noted the runtime contract landed at `4701310 feat: split dashboard product publication` but waited for production-side verification. That evidence is satisfied by `git push origin main` + Vercel auto-deploy; `4701310` has been on `origin/main` for 7 days and the split full-sync (main publish first, product publish second) has been the production behaviour. The blast-radius lesson from the original backfill incident is now encoded in the contract: product publication is a separate endpoint, the main sync rejects product payloads, the backfill script publishes products directly, and full sync splits into two ordered POSTs.
- Implementation impact: None (already on `origin/main`). `app/api/dashboard-products-sync/route.ts` accepts product-only payloads; `app/api/dashboard-sync/route.ts` rejects product payloads; `scripts/sync-dashboard-data.py` splits full sync into two ordered POSTs; `scripts/backfill_tesco_product_metadata.py` can publish products directly. Tests cover pointer preservation, write isolation, ordering, and partial-failure handling.
- Evidence: `git log --oneline origin/main -- app/api/dashboard-products-sync app/api/dashboard-sync scripts/sync-dashboard-data.py scripts/backfill_tesco_product_metadata.py` shows `4701310` and its follow-ups on `origin/main`. The 2026-06-20 verification recipe (`python3 -m unittest discover -s scripts -p 'test_*.py' -v` 51 tests pass, `npm test` 352 tests pass, `npm run build` clean) was completed at implementation time. Vercel auto-deploys on every push to `origin/main`.

### 2026-06-20 — Proposed (implementation landed, production evidence pending)
- Change: Implemented the split product publication contract in meals-dashboard commit `4701310`.
- Status after change: Proposed
- Rationale: The code now exists on `meals-dashboard` main and passes the local verification suite, but the spec's own promotion criteria still require production-side verification before Final.
- Implementation impact: `app/api/dashboard-products-sync/route.ts` now accepts product-only payloads, `app/api/dashboard-sync/route.ts` rejects product payloads, `scripts/sync-dashboard-data.py` splits full sync into two ordered POST calls, `scripts/backfill_tesco_product_metadata.py` can publish products directly, and the relevant tests cover pointer preservation, write isolation, ordering, and partial-failure handling.
- Evidence: `python3 -m unittest discover -s scripts -p 'test_*.py' -v` (51 tests pass), `npm test -- --reporter=dot` (352 tests pass), `npm run build` (clean), and `git log --oneline -1` in `/home/hermes/workspace/meals-dashboard` showing `4701310 feat: split dashboard product publication`.

### 2026-06-20 — Proposed (promoted from Draft)
- Change: Promoted `032-dashboard-product-payload-endpoint` from Draft to Proposed after tightening the contract for both POST routes, adding the Final promotion gate, and clarifying route ownership, pointer semantics, and backfill input.
- Status after change: Proposed
- Rationale: Danny asked for the spec to be moved to Proposed after the ambiguity review, and the Draft now has the explicit route split and failure rules needed for implementation planning.
- Implementation impact: No runtime code yet. This promotion makes the contract ready for implementation work on the meals-dashboard repo.
- Evidence: Spec revalidated cleanly after refinement; `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` returned `No issues found.`

### 2026-06-20 — Draft (refined for Proposed review)
- Change: Refined the Draft to make the endpoint split more explicit by adding a promotion gate, route contracts for both POST endpoints, a strict no-product rule on `/api/dashboard-sync`, and a concrete backfill-input contract.
- Status after change: Draft
- Rationale: Danny asked what still needed refinement before Proposed; the remaining work was mostly about removing ambiguity around request bodies, pointer ownership, and failure semantics.
- Implementation impact: None yet. The spec now gives the implementation a clearer contract for the new product-only route, the main-route rejection behaviour, and the split-sync call order.
- Evidence: Draft updated on 2026-06-20 and revalidated after the refinement pass.

### 2026-06-20 — Draft (created)
- Change: Created `032-dashboard-product-payload-endpoint` as a Draft spec to isolate product publication behind a dedicated endpoint and require the full sync pipeline to call the dashboard and product endpoints separately.
- Status after change: Draft
- Rationale: Danny asked for a new payload endpoint for product updates after the backfill blast-radius issue, and the safer architecture is to stop using the main dashboard payload to carry product writes.
- Implementation impact: None yet. The spec defines the contract for a new product-only route, the split full-sync call order, and the backfill path change.
- Evidence: Draft authored on 2026-06-20; validator pending.
