import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { DebugShell } from './debug-shell';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/debug/items-by-category')) {
      return jsonResponse({
        latestOrder: null,
        latestOrderStatus: 'null_no_order_blob',
        latestOrderBlobPath: null,
        receiptItemsLength: 0,
        unmatchedItemsLength: 0,
        displayItemsLength: 0,
        showCount: 10,
        filter: 'all',
        cats: [],
        dataGen: '',
        uiUpdatedAt: '',
        coverageWindow: [],
        pointerPath: 'pointers/latest.json',
        manifestPath: null,
        productsManifestPath: null,
        fetchedAt: '2026-06-19T12:00:00.000Z',
      });
    }
    if (url.includes('/api/debug/runtime-context')) {
      return jsonResponse({
        cookie: { state: 'verified_on', value: '1', effectiveDebugMode: true },
        runtime: { mode: 'live', blobConfigured: true, activeReader: 'vercel_blob' },
        user: { displayName: 'Danny Park', source: 'name' },
        request: { origin: 'https://meals.example.test', deploymentId: 'dpl_123', vercelEnv: 'preview', region: 'cdg1', fetchedAt: '2026-06-19T12:00:00.000Z' },
      });
    }
    if (url.includes('/api/debug/blob-read-freshness')) {
      return jsonResponse({
        pointerPath: 'pointers/latest.json',
        pointerRead: 'ok',
        manifestPath: 'meta/manifest-123.json',
        manifestRead: 'ok',
        summaryPath: 'meta/summary-123.json',
        summaryRead: 'ok',
        productsManifestPath: 'products/manifest-123.json',
        productsManifestRead: 'ok',
        coverageWindow: ['2026-06-17', '2026-06-18'],
        coverageReads: [],
        orderReads: [],
        productReads: [],
        summaryFreshness: { dataGeneratedAt: '', dataGeneratedAgeSeconds: null, uiUpdatedAt: '', uiUpdatedAgeSeconds: null },
        latestOrderFreshness: { deliveryDate: null, ageDays: null },
        fetchedAt: '2026-06-19T12:00:00.000Z',
      });
    }
    if (url.includes('/api/debug/product-resolution')) {
      return jsonResponse({
        itemName: 'Tesco Blueberries 150G',
        itemTpnc: '123456789',
        itemBlobPath: 'products/123456789.json',
        title: 'Tesco Blueberries 150G',
        description: 'Fresh British blueberries.',
        storage: 'Refrigerate',
        preparation: 'Ready to eat',
        ingredients: '',
        allergens: '',
        nutrition: 'Per 100g: energy 44kcal',
        image: '',
        productUrl: 'https://example.test/blueberries',
        lastFetched: '2026-06-18T09:30:00.000Z',
        expiresAt: '2026-07-09T09:30:00.000Z',
        productSource: 'apollo',
        descriptionSource: 'apollo',
        freshness: { lastFetched: '2026-06-18T09:30:00.000Z' },
        provenance: { generated: true, local: false, firecrawl: false, firecrawlStatus: null },
      });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe('DebugShell', () => {
  it('renders the four first-class observability panels', async () => {
    render(<DebugShell cookieValue="1" deploymentId="dpl_123" origin="https://meals.example.test" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh all/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /items by category/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /runtime context/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /blob read freshness/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /product resolution/i })).toBeTruthy();
    });
  });
});