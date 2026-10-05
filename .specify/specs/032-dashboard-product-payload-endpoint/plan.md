# Plan: Dashboard Product Payload Endpoint and Split Full Sync

**Input**: `.specify/specs/032-dashboard-product-payload-endpoint/spec.md`

## Goal

Separate product publication from the main dashboard publication so product backfill can update `products/` and `meta/` blobs without touching order, coverage, or summary data.

## Files Touched

| File | Purpose |
|---|---|
| `app/api/dashboard-products-sync/route.ts` | New product-only payload endpoint |
| `app/api/dashboard-sync/route.ts` | Reject product payloads on the main route |
| `lib/dashboard-sync.ts` | Shared helpers for manifest / pointer publication |
| `scripts/sync-dashboard-data.py` | Split full sync into two ordered POST calls |
| `scripts/backfill_tesco_product_metadata.py` | Direct product-endpoint publishing for backfill |
| `tests/*` | Endpoint, pipeline, and backfill tests |

## Files NOT Touched

| File | Reason |
|---|---|
| `lib/dashboard-data.ts` | Read path remains unchanged |
| `components/*` | No UI change is required for this contract |
| `scripts/tesco_meal_check.py` | Upstream cache generation remains the same |

## Implementation Outline

1. Add a dedicated product-only route that preserves the current pointer's `manifestPath`.
2. Make the main sync route reject product payloads instead of accepting them.
3. Update the main sync pipeline so it publishes the dashboard payload first, then the product payload second.
4. Update the backfill script to call the product endpoint directly from a product list/cache snapshot.
5. Add tests for write isolation, call ordering, and failure containment.
6. Validate the spec and keep the dashboard read path unchanged.
