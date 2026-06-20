import { describe, expect, it } from 'vitest';

import { signDebugCookie } from './debug-cookie';
import {
  buildBlobReadFreshnessDebugPayload,
  buildItemsByCategoryDebugPayload,
  buildProductResolutionDebugPayload,
  buildRuntimeContextDebugPayload,
  classifyDebugCookieState,
  resolveAuthenticatedUserDisplay,
} from './debug-observability';

const NOW = '2026-06-19T12:00:00.000Z';

describe('classifyDebugCookieState', () => {
  it('reports missing when the cookie is unset', () => {
    expect(classifyDebugCookieState(undefined)).toBe('missing');
    expect(classifyDebugCookieState(null)).toBe('missing');
  });

  it('reports verified_on and verified_off for signed cookies', () => {
    expect(classifyDebugCookieState(signDebugCookie('1'))).toBe('verified_on');
    expect(classifyDebugCookieState(signDebugCookie('0'))).toBe('verified_off');
  });

  it('reports tampered when the signature is wrong', () => {
    expect(classifyDebugCookieState('1.bogus')).toBe('tampered');
  });
});

describe('resolveAuthenticatedUserDisplay', () => {
  it('prefers name, then email, then fallback', () => {
    expect(resolveAuthenticatedUserDisplay({ name: '  Danny Park  ', email: 'danny@example.com' })).toEqual({
      displayName: 'Danny Park',
      source: 'name',
    });
    expect(resolveAuthenticatedUserDisplay({ name: '', email: '  danny@example.com  ' })).toEqual({
      displayName: 'danny@example.com',
      source: 'email',
    });
    expect(resolveAuthenticatedUserDisplay({ name: '   ', email: '   ' }, 'fallback traveller')).toEqual({
      displayName: 'fallback traveller',
      source: 'fallback',
    });
  });
});

describe('buildRuntimeContextDebugPayload', () => {
  it('summarises the runtime, cookie, request and user provenance for live mode', () => {
    const payload = buildRuntimeContextDebugPayload({
      now: NOW,
      cookieRaw: signDebugCookie('1'),
      blobConfigured: true,
      sessionUser: { name: 'Danny Park', email: 'danny@example.com' },
      origin: 'https://meals.example.test',
      deploymentId: 'dpl_12345',
      vercelEnv: 'production',
      region: 'cdg1',
    });

    expect(payload).toEqual(expect.objectContaining({
      cookie: expect.objectContaining({ state: 'verified_on', value: '1', effectiveDebugMode: true }),
      runtime: expect.objectContaining({ mode: 'live', blobConfigured: true, activeReader: 'vercel_blob' }),
      user: expect.objectContaining({ displayName: 'Danny Park', source: 'name' }),
      request: expect.objectContaining({
        origin: 'https://meals.example.test',
        deploymentId: 'dpl_12345',
        vercelEnv: 'production',
        region: 'cdg1',
      }),
    }));
  });

  it('falls back to demo mode and email provenance when no name is present', () => {
    const payload = buildRuntimeContextDebugPayload({
      now: NOW,
      cookieRaw: undefined,
      blobConfigured: false,
      sessionUser: { name: null, email: 'danny@example.com' },
      origin: '',
      deploymentId: null,
      vercelEnv: 'preview',
      region: null,
    });

    expect(payload.cookie.state).toBe('missing');
    expect(payload.cookie.effectiveDebugMode).toBe(false);
    expect(payload.runtime.mode).toBe('demo');
    expect(payload.runtime.activeReader).toBe('static_fixture_reader');
    expect(payload.user).toEqual({ displayName: 'danny@example.com', source: 'email' });
  });
});

describe('buildItemsByCategoryDebugPayload', () => {
  it('includes the active window, chosen filter state and selection provenance', () => {
    const payload = buildItemsByCategoryDebugPayload({
      now: NOW,
      coverageWindow: ['2026-06-17', '2026-06-18'],
      data: {
        latestOrder: {
          orderNumber: 'ORD-123',
          deliveryDate: '2026-06-17',
          orderBlobPath: 'orders/2026-06-17-ord-123.json',
          items: [{ name: 'Milk', quantity: 1 }],
        },
        dataGeneratedAt: '2026-06-18T10:00:00.000Z',
        uiUpdatedAt: '2026-06-18T11:00:00.000Z',
        loadError: null,
      },
      trace: {
        pointerPath: 'pointers/latest.json',
        manifestPath: 'manifests/latest.json',
        productsManifestPath: 'products/manifest.json',
        candidateLatestOrderPath: 'orders/2026-06-17-ord-123.json',
        candidateLatestOrderDate: '2026-06-17',
        latestOrderStatus: 'ok',
      },
      displayItemsLength: 1,
      unmatchedItemsLength: 1,
      receiptItemsLength: 1,
    });

    expect(payload).toEqual(expect.objectContaining({
      latestOrderStatus: 'ok',
      latestOrderBlobPath: 'orders/2026-06-17-ord-123.json',
      candidateLatestOrderPath: 'orders/2026-06-17-ord-123.json',
      candidateLatestOrderDate: '2026-06-17',
      receiptItemsLength: 1,
      unmatchedItemsLength: 1,
      displayItemsLength: 1,
      filter: 'all',
      chosenFilterState: 'all',
      chosenFilterReason: 'server_default',
      dataGen: '2026-06-18T10:00:00.000Z',
      uiUpdatedAt: '2026-06-18T11:00:00.000Z',
      coverageWindow: ['2026-06-17', '2026-06-18'],
      pointerPath: 'pointers/latest.json',
      manifestPath: 'manifests/latest.json',
      productsManifestPath: 'products/manifest.json',
    }));
  });
});

describe('buildBlobReadFreshnessDebugPayload', () => {
  it('exposes the per-stage read trace and freshness timestamps', () => {
    const payload = buildBlobReadFreshnessDebugPayload({
      now: NOW,
      data: {
        latestOrder: {
          orderNumber: 'ORD-123',
          deliveryDate: '2026-06-17',
          orderBlobPath: 'orders/2026-06-17-ord-123.json',
          items: [{ name: 'Milk', quantity: 1 }],
        },
        dataGeneratedAt: '2026-06-18T10:00:00.000Z',
        uiUpdatedAt: '2026-06-18T11:00:00.000Z',
        loadError: null,
      },
      trace: {
        pointerPath: 'pointers/latest.json',
        pointerRead: 'ok',
        manifestPath: 'manifests/latest.json',
        manifestRead: 'ok',
        summaryPath: 'meta/summary-2026-06-18.json',
        summaryRead: 'ok',
        coverageWindow: ['2026-06-17', '2026-06-18'],
        coverageReads: [
          { path: 'coverage/2026-06-17.json', status: 'ok' },
          { path: 'coverage/2026-06-18.json', status: 'missing' },
        ],
        orderReads: [
          { path: 'orders/2026-06-17-ord-123.json', status: 'ok' },
        ],
        productsManifestPath: 'products/manifest.json',
        productsManifestRead: 'ok',
        productReads: [
          { path: 'products/123.json', status: 'ok', lastFetched: '2026-06-17T09:30:00.000Z' },
        ],
      },
    });

    expect(payload).toEqual(expect.objectContaining({
      pointerPath: 'pointers/latest.json',
      manifestPath: 'manifests/latest.json',
      summaryPath: 'meta/summary-2026-06-18.json',
      productsManifestPath: 'products/manifest.json',
      pointerRead: 'ok',
      manifestRead: 'ok',
      summaryRead: 'ok',
      productsManifestRead: 'ok',
      coverageReads: [
        { path: 'coverage/2026-06-17.json', status: 'ok' },
        { path: 'coverage/2026-06-18.json', status: 'missing' },
      ],
      orderReads: [{ path: 'orders/2026-06-17-ord-123.json', status: 'ok' }],
      productReads: [{ path: 'products/123.json', status: 'ok', lastFetched: '2026-06-17T09:30:00.000Z' }],
      summaryFreshness: expect.objectContaining({
        dataGeneratedAt: '2026-06-18T10:00:00.000Z',
        uiUpdatedAt: '2026-06-18T11:00:00.000Z',
      }),
    }));
  });
});

describe('buildProductResolutionDebugPayload', () => {
  it('labels generated metadata as apollo, local catalogue hits as curated_static, firecrawl snippets as firecrawl, and fallbacks as placeholder', () => {
    const apolloPayload = buildProductResolutionDebugPayload({
      item: {
        name: 'Tesco Blueberries 150G',
        tpnc: '123456789',
        productMetadata: {
          title: 'Tesco Blueberries 150G',
          description: 'Fresh British blueberries.',
          storage: 'Refrigerate',
          preparation: 'Ready to eat',
          ingredients: '',
          allergens: '',
          nutrition: 'Per 100g: energy 44kcal',
          brand: 'Tesco',
          category: 'Fruit',
          imageUrl: '',
          productUrl: 'https://example.test/blueberries',
          source: 'tesco.com',
          lastFetched: '2026-06-18T09:30:00.000Z',
        },
      },
      resolution: {
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
        source: 'generated',
      },
    });

    expect(apolloPayload.descriptionSource).toBe('apollo');
    expect(apolloPayload.productSource).toBe('apollo');
    expect(apolloPayload.freshness.lastFetched).toBe('2026-06-18T09:30:00.000Z');

    const curatedPayload = buildProductResolutionDebugPayload({
      item: {
        name: 'Tesco Blueberries 150G',
        tpnc: null,
      },
      resolution: {
        title: 'Tesco Blueberries 150G',
        description: 'Fresh British blueberries, perfect for breakfast cereals, yoghurts or as a healthy snack.',
        storage: 'Refrigerate and consume within 5 days. Wash before use.',
        preparation: '',
        ingredients: '',
        allergens: '',
        nutrition: 'Per 100g: Energy 44kcal, Protein 0.7g, Carbohydrates 9g, Fat 0.3g',
        image: 'https://images.openfoodfacts.org/images/products/000/000/326/6038/front_en.5.400.jpg',
        source: 'local',
      },
    });
    expect(curatedPayload.descriptionSource).toBe('curated_static');
    expect(curatedPayload.productSource).toBe('curated_static');

    const curatedViaGeneratedPayload = buildProductResolutionDebugPayload({
      item: {
        name: 'Tesco Blueberries 150G',
        tpnc: '123456789',
        productMetadata: {
          title: 'Tesco Blueberries 150G',
          description: '',
          storage: 'Refrigerate and consume within 5 days. Wash before use.',
          preparation: '',
          ingredients: '',
          allergens: '',
          nutrition: 'Per 100g: Energy 44kcal, Protein 0.7g, Carbohydrates 9g, Fat 0.3g',
          imageUrl: 'https://images.openfoodfacts.org/images/products/000/000/326/6038/front_en.5.400.jpg',
          productUrl: 'https://example.test/blueberries',
          source: 'tesco',
          lastFetched: '2026-06-18T09:30:00.000Z',
        },
      },
      resolution: {
        title: 'Tesco Blueberries 150G',
        description: 'Fresh British blueberries, perfect for breakfast cereals, yoghurts or as a healthy snack.',
        storage: 'Refrigerate and consume within 5 days. Wash before use.',
        preparation: '',
        ingredients: '',
        allergens: '',
        nutrition: 'Per 100g: Energy 44kcal, Protein 0.7g, Carbohydrates 9g, Fat 0.3g',
        image: 'https://images.openfoodfacts.org/images/products/000/000/326/6038/front_en.5.400.jpg',
        productUrl: 'https://example.test/blueberries',
        lastFetched: '2026-06-18T09:30:00.000Z',
        expiresAt: '2026-07-09T09:30:00.000Z',
        source: 'generated',
      },
    });
    expect(curatedViaGeneratedPayload.descriptionSource).toBe('curated_static');
    expect(curatedViaGeneratedPayload.productSource).toBe('curated_static');

    const firecrawlPayload = buildProductResolutionDebugPayload({
      item: {
        name: 'Mystery Yoghurts',
        tpnc: '987654321',
        productMetadata: {
          title: 'Mystery Yoghurts',
          description: '',
          storage: '',
          preparation: '',
          ingredients: '',
          allergens: '',
          nutrition: '',
          brand: '',
          category: '',
          imageUrl: '',
          productUrl: '',
          source: 'tesco.com',
          lastFetched: '2026-06-18T09:00:00.000Z',
          firecrawl: {
            snippet: 'Firecrawl description wins here.',
            lastFetched: '2026-06-18T10:00:00.000Z',
            status: 'ok',
          },
        },
      },
      resolution: {
        title: 'Mystery Yoghurts',
        description: 'Firecrawl description wins here.',
        storage: 'Check packaging for storage instructions.',
        preparation: '',
        ingredients: '',
        allergens: '',
        nutrition: 'Nutrition information not available from generated Tesco metadata.',
        image: '',
        source: 'generated',
        lastFetched: '2026-06-18T09:00:00.000Z',
        expiresAt: '2026-07-09T09:00:00.000Z',
      },
    });

    expect(firecrawlPayload.descriptionSource).toBe('firecrawl');
    expect(firecrawlPayload.productSource).toBe('firecrawl');
    expect(firecrawlPayload.freshness.firecrawlLastFetched).toBe('2026-06-18T10:00:00.000Z');

    const placeholderPayload = buildProductResolutionDebugPayload({
      item: { name: 'Unknown Snack', tpnc: null },
      resolution: {
        title: 'Unknown Snack',
        description: 'Product information not available in generated data or the local product database.',
        storage: 'Check packaging for storage instructions.',
        preparation: '',
        ingredients: '',
        allergens: '',
        nutrition: 'Nutrition information not available.',
        image: '',
        source: 'fallback',
      },
    });
    expect(placeholderPayload.descriptionSource).toBe('placeholder');
    expect(placeholderPayload.productSource).toBe('placeholder');
  });
});