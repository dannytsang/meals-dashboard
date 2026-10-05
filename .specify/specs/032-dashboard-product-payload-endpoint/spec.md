---
name: dashboard-product-payload-endpoint
description: "Add a dedicated product payload endpoint so product backfill can write products/{tpnc}.json and meta/products-manifest-*.json without touching order, coverage, or summary blobs. Full sync will call the dashboard endpoint and the product endpoint separately."
---

# Feature Specification: Dashboard Product Payload Endpoint and Split Full Sync

Feature ID: `032-dashboard-product-payload-endpoint`
Feature Name: Dashboard Product Payload Endpoint and Split Full Sync

Target Skill: `data-science/meals-check`

Created: 2026-06-20

Status: Final

Change history: CHANGELOG.md

## Background

The current split Blob layout already separates dashboard data into order, coverage, summary, pointer, and product-related blobs. Today, the product enrichment path can still be coupled to the main dashboard sync payload, which is exactly the kind of coupling that caused the backfill blast-radius concern.

This spec introduces a dedicated product payload endpoint so product updates can be published independently of the main dashboard payload. The full sync pipeline should then make two sequential POST calls: one for the main dashboard state and one for the products state. That separation keeps product writes isolated, lets the backfill update only product data, and avoids ever using product payloads to republish the whole dashboard state.

This spec does **not** change the product blob schema, the dashboard read path, or the split-layout manifest/pointer format. It only separates the write surfaces.

## Promotion Criteria for Final

This spec stays at `Status: Proposed` until the implementation is deployed to the production meals-dashboard Vercel environment and verified. Preview-only deployment is necessary but not sufficient.

The status flips to `Final` only when all of the following are verified in production:

- `/api/dashboard-sync` publishes the main dashboard state without accepting product payloads.
- `/api/dashboard-products-sync` publishes product blobs and the products manifest without touching order, coverage, or summary blobs.
- The full sync pipeline publishes the main dashboard first and the product payload second.
- A product-only backfill can run without loading `dashboard_cache.json`.
- A failed product publish does not invalidate an already-published main dashboard state.

## Route Contracts

### `POST /api/dashboard-sync`

Main dashboard publication only.

**Request body**:

```json
{
  "orders": [...],
  "coverage": [...],
  "summary": {...},
  "deliveryWindows": [...],
  "coverageWindow": [...],
  "dataGeneratedAt": "2026-06-20T00:00:00Z",
  "uiUpdatedAt": "2026-06-20T00:00:00Z"
}
```

**Rules**:

- MUST reject unexpected `products` payload data with a 400-level error.
- MUST write only the main dashboard blobs and the main manifest/pointer.
- MUST not require a products payload to succeed.

**Response**:

```json
{
  "ok": true,
  "manifestPath": "meta/manifest-....json",
  "manifestHash": "...",
  "written": [...],
  "skipped": [...],
  "totalOps": 0,
  "productsManifestPath": null,
  "dryRun": false
}
```

### `POST /api/dashboard-products-sync`

Product publication only.

**Request body**:

```json
{
  "products": [
    {
      "productBlobPath": "products/123456789.json",
      "tpnc": "123456789",
      "...": "product blob fields"
    }
  ]
}
```

**Rules**:

- MUST accept product payload data only.
- MUST validate each `productBlobPath` against `^products/\d+\.json$`.
- MUST write only `products/{tpnc}.json` blobs and `meta/products-manifest-*.json`.
- MUST preserve the existing pointer's `manifestPath` and update only `productsManifestPath`.
- If the existing pointer cannot be read, the route MUST fail without creating partial dashboard state.

**Response**:

```json
{
  "ok": true,
  "manifestPath": "meta/manifest-....json",
  "manifestHash": "...",
  "written": [...],
  "skipped": [...],
  "totalOps": 0,
  "productsManifestPath": "meta/products-manifest-....json",
  "dryRun": false
}
```

## User Scenarios & Testing

### User Story 1 — Isolated product publication and split full sync (Priority: P1)

As Danny, I want product metadata updates to flow through a dedicated product endpoint rather than the main dashboard sync, so product backfill can refresh `products/` and `meta/` files without risking orders, coverage, or summary data.

**Why this priority**: Product backfill should be a narrow write path. If it shares the same payload contract as the dashboard state publisher, it can accidentally republish an incomplete dashboard and wipe visible data.

**Independent Test**: Seed a fake Blob client with an existing pointer and manifest. Call the product endpoint with a product-only payload and verify it writes only `products/{tpnc}.json` plus the `meta/products-manifest-*.json` blob, while leaving orders, coverage, and summary blobs untouched. Then run the full sync path and verify it makes two POST calls in order.

**Acceptance Scenarios**:

1. Given a product-only payload, When `/api/dashboard-products-sync` runs, Then it writes product blobs and `meta/products-manifest-*.json`, updates the pointer's `productsManifestPath`, and leaves orders, coverage, and summary blobs untouched.
2. Given the main dashboard payload changes but the product payload does not, When the full sync runs, Then the dashboard endpoint publishes the main manifest/pointer first and the product endpoint is not required to republish unchanged product data.
3. Given the full sync pipeline runs with changed products, When it executes, Then it makes two POST calls in order: first `/api/dashboard-sync`, then `/api/dashboard-products-sync`; the product payload is not embedded in the main payload.
4. Given the product endpoint fails after the main dashboard sync succeeds, When the pipeline completes, Then the dashboard data remains published and the run reports a product-update failure or partial success rather than rolling back the main publish.
5. Given the backfill script has an existing list of products or a cache snapshot, When it updates product data, Then it can call the product endpoint directly without loading `dashboard_cache.json`.

## Requirements

### Functional Requirements

- **FR-001**: A dedicated product payload endpoint MUST exist at `/api/dashboard-products-sync` and MUST accept a shared-secret authenticated POST request containing product payload data only.
- **FR-002**: The main dashboard sync endpoint `/api/dashboard-sync` MUST accept dashboard data only. If a caller includes product payload data in that request, the route MUST reject it rather than piggybacking the product write onto the main publish.
- **FR-003**: The product payload endpoint MUST validate each `productBlobPath` against `^products/\d+\.json$`, write only `products/{tpnc}.json` blobs, write the corresponding `meta/products-manifest-{hash}.json`, and MUST NOT write order, coverage, summary, or main-manifest blobs.
- **FR-004**: The product payload endpoint MUST read the existing pointer, preserve its `manifestPath`, and update only `productsManifestPath`. If no pointer exists, the endpoint MUST fail without creating partial dashboard state.
- **FR-005**: The full sync pipeline MUST split publication into two sequential POST calls: first `/api/dashboard-sync` for the main dashboard payload, then `/api/dashboard-products-sync` for product updates. Product data MUST NOT be embedded in the main dashboard payload.
- **FR-006**: `scripts/backfill_tesco_product_metadata.py` MUST be able to publish product updates directly to the product payload endpoint from an existing product list or product cache snapshot, without requiring `dashboard_cache.json`.
- **FR-007**: If the product payload endpoint fails after a successful main dashboard sync, the dashboard publish MUST remain intact. The pipeline MAY report a partial-success or product-update failure status, but it MUST NOT roll back or invalidate the main dashboard publish.
- **FR-008**: The new endpoint and split publication flow MUST preserve the existing dashboard read path contract, `products/` blob layout, and `productsManifestPath` pointer semantics.

### Non-Functional Requirements

- **NFR-001**: The split endpoint design MUST reduce blast radius: a product-write failure must not be able to erase or republish the main dashboard state.
- **NFR-002**: The new endpoint SHOULD reuse the same authentication and error-reporting conventions as the existing dashboard sync route so operators do not need a second mental model.
- **NFR-003**: The full sync pipeline SHOULD remain easy to audit: the main publish call and the product publish call should be explicit, ordered, and separately testable.

### Key Entities

- **Dashboard payload**: The main orders/coverage/summary payload published by `/api/dashboard-sync`.
- **Product payload**: A products-only payload containing `products[]` entries with `productBlobPath` values and product blob content.
- **Product payload endpoint**: The authenticated route that writes product blobs and the products manifest, while preserving the existing dashboard pointer's main manifest reference.
- **Split sync run**: A full meals-check publication run that issues two ordered POSTs: dashboard first, products second.
- **ProductsManifest**: The `meta/products-manifest-{hash}.json` blob mapping `tpnc` to `products/{tpnc}.json`.

### Contract Impact

- `scripts/sync-dashboard-data.py`: must split publication into two calls and stop sending product payloads through the main dashboard sync call.
- `scripts/backfill_tesco_product_metadata.py`: must call the product payload endpoint directly and no longer need the dashboard cache as a transport dependency.
- `app/api/dashboard-sync/route.ts`: must reject product payloads instead of treating them as part of the main dashboard state.
- `app/api/dashboard-products-sync/route.ts`: new route implementing the product-only write path.
- `lib/dashboard-sync.ts`: may be refactored to share manifest/pointer write helpers between the main sync and product sync paths.
- `lib/dashboard-data.ts`: unchanged; read path continues to compose products from the pointer and manifests.

## Open Questions

- None at Draft time. The route path, call ordering, and failure isolation are all resolved in this spec.

## Verification Plan

- Unit tests for the new product endpoint validating product-path regex, pointer preservation, and write isolation.
- Pipeline tests proving the full sync issues two ordered POSTs and that product failure does not undo a successful main publish.
- Backfill tests proving the script can publish product updates directly from a product list/cache snapshot without loading `dashboard_cache.json`.
- Validator pass: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check`.
