import { describe, expect, it } from 'vitest';

import { signDebugCookie } from './debug-cookie';
import {
  buildBlobReadFreshnessDebugPayload,
  buildExpectedProductBlobPath,
  buildItemsByCategoryDebugPayload,
  buildProductResolutionDebugPayload,
  buildRuntimeContextDebugPayload,
  classifyDebugCookieState,
  matchProductBlobPath,
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
      path: '/api/debug/runtime-context',
      origin: 'https://meals.example.test',
      deploymentId: 'dpl_12345',
      vercelEnv: 'production',
      region: 'cdg1',
    });

    expect(payload).toEqual(expect.objectContaining({
      cookie: expect.objectContaining({ state: 'verified_on', value: '1', effectiveDebugMode: true }),
      runtime: expect.objectContaining({ mode: 'live', blobConfigured: true, activeReader: 'vercel_blob' }),
      runtimeMode: 'live',
      blobCredentialsState: 'complete',
      user: expect.objectContaining({ displayName: 'Danny Park', source: 'name' }),
      request: expect.objectContaining({
        path: '/api/debug/runtime-context',
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
      path: '/api/debug/runtime-context',
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
      runtimeMode: 'live',
      blobCredentialsState: 'complete',
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
        manifestCoverageDates: ['2026-06-17', '2026-06-18'],
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
        selectedOrderBlobPath: 'orders/2026-06-17-ord-123.json',
        selectedCoverageBlobPaths: ['coverage/2026-06-17.json'],
        selectedProductBlobPath: 'products/123.json',
        loadError: null,
      },
    });

    expect(payload).toEqual(expect.objectContaining({
      runtimeMode: 'live',
      blobCredentialsState: 'complete',
      pointerPath: 'pointers/latest.json',
      manifestPath: 'manifests/latest.json',
      summaryPath: 'meta/summary-2026-06-18.json',
      productsManifestPath: 'products/manifest.json',
      pointerRead: 'ok',
      manifestRead: 'ok',
      summaryRead: 'ok',
      productsManifestRead: 'ok',
      selectedOrderBlobPath: 'orders/2026-06-17-ord-123.json',
      selectedCoverageBlobPaths: ['coverage/2026-06-17.json'],
      selectedProductBlobPath: 'products/123.json',
      loadError: null,
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
  it('labels generated metadata as apollo, firecrawl snippets as firecrawl, and fallbacks as placeholder (curated_static tier is gone per spec 010 Rev 4)', () => {
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
    expect(apolloPayload.fieldSources).toEqual({
      description: 'apollo',
      image: 'placeholder',
      storage: 'apollo',
      preparation: 'apollo',
    });
    expect(apolloPayload.freshness.lastFetched).toBe('2026-06-18T09:30:00.000Z');
    expect(apolloPayload.provenance.generated).toBe(true);
    expect(apolloPayload.provenance.local).toBe(false);

    // Spec 010 Rev 4: the `curated_static` tier is gone. An item
    // with no `productMetadata` falls through to the placeholder
    // chain rather than the static-DB substring map.
    const placeholderForNoMetadata = buildProductResolutionDebugPayload({
      item: {
        name: 'Tesco Blueberries 150G',
        tpnc: null,
      },
      resolution: {
        title: 'Tesco Blueberries 150G',
        description: 'Product information not available in generated data.',
        storage: 'Check packaging for storage instructions.',
        preparation: '',
        ingredients: '',
        allergens: '',
        nutrition: 'Nutrition information not available.',
        image: '',
        source: 'fallback',
      },
    });
    expect(placeholderForNoMetadata.descriptionSource).toBe('placeholder');
    expect(placeholderForNoMetadata.productSource).toBe('placeholder');
    expect(placeholderForNoMetadata.fieldSources).toEqual({
      description: 'placeholder',
      image: 'placeholder',
      storage: 'placeholder',
      preparation: 'placeholder',
    });

    // Spec 010 Rev 4: an item with generated metadata but a blank
    // Apollo description still has Apollo as the resolved source
    // (per-field); curated_static is no longer a tier in the
    // generated branch.
    const apolloWithBlankDesc = buildProductResolutionDebugPayload({
      item: {
        name: 'Tesco Blueberries 150G',
        tpnc: '123456789',
        productMetadata: {
          title: 'Tesco Blueberries 150G',
          description: '',
          storage: 'Refrigerate',
          preparation: 'Wash before use',
          imageUrl: 'https://example.test/blueberries.jpg',
          source: 'tesco',
          lastFetched: '2026-06-18T09:30:00.000Z',
        },
      },
      resolution: {
        title: 'Tesco Blueberries 150G',
        description: 'Generated Tesco product details are incomplete for this item.',
        storage: 'Refrigerate',
        preparation: 'Wash before use',
        ingredients: '',
        allergens: '',
        nutrition: 'Per 100g: energy 44kcal',
        image: 'https://example.test/blueberries.jpg',
        productUrl: 'https://example.test/blueberries',
        lastFetched: '2026-06-18T09:30:00.000Z',
        expiresAt: '2026-07-09T09:30:00.000Z',
        source: 'generated',
      },
    });
    expect(apolloWithBlankDesc.descriptionSource).toBe('apollo');
    expect(apolloWithBlankDesc.productSource).toBe('apollo');

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
    expect(firecrawlPayload.fieldSources).toEqual({
      description: 'firecrawl',
      image: 'placeholder',
      storage: 'apollo',
      preparation: 'placeholder',
    });
    expect(firecrawlPayload.freshness.firecrawlLastFetched).toBe('2026-06-18T10:00:00.000Z');

    const placeholderPayload = buildProductResolutionDebugPayload({
      item: { name: 'Unknown Snack', tpnc: null },
      resolution: {
        title: 'Unknown Snack',
        description: 'Product information not available in generated data.',
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
    expect(placeholderPayload.fieldSources).toEqual({
      description: 'placeholder',
      image: 'placeholder',
      storage: 'placeholder',
      preparation: 'placeholder',
    });
  });
});

/**
 * Spec 031 Rev 3 / FR-005 + spec 010 Rev 5.1 / FR-011.
 *
 * The matcher helper is the single source of truth for the
 * `products/{tpnc}.json` convention. Spec 010's modal-side chip
 * imports it from this module rather than re-deriving the
 * convention client-side.
 */
describe('productBlobPath matcher (spec 031 Rev 3 / spec 010 Rev 5.1)', () => {
  describe('buildExpectedProductBlobPath', () => {
    it('derives the spec 021 Key Entities convention products/<tpnc>.json', () => {
      expect(buildExpectedProductBlobPath('123456789')).toBe('products/123456789.json');
    });

    it('returns null when tpnc is null or undefined (a missing tpnc is a different problem from a wrong path)', () => {
      expect(buildExpectedProductBlobPath(null)).toBeNull();
      expect(buildExpectedProductBlobPath(undefined)).toBeNull();
      expect(buildExpectedProductBlobPath('')).toBeNull();
      expect(buildExpectedProductBlobPath('   ')).toBeNull();
    });
  });

  describe('matchProductBlobPath', () => {
    it('returns true when the actual path matches products/<tpnc>.json', () => {
      expect(matchProductBlobPath('12345', 'products/12345.json')).toBe(true);
    });

    it('returns false when the actual path is drifted (e.g. products/legacy/12345.json)', () => {
      expect(matchProductBlobPath('12345', 'products/legacy/12345.json')).toBe(false);
    });

    it('returns null when tpnc is unknown (MUST NOT show a misleading false)', () => {
      expect(matchProductBlobPath(null, 'products/legacy/12345.json')).toBeNull();
      expect(matchProductBlobPath(undefined, 'products/legacy/12345.json')).toBeNull();
      expect(matchProductBlobPath('', 'products/legacy/12345.json')).toBeNull();
    });

    it('returns null when productBlobPath is absent even if tpnc is known (MUST NOT show a misleading false)', () => {
      expect(matchProductBlobPath('12345', null)).toBeNull();
      expect(matchProductBlobPath('12345', undefined)).toBeNull();
      expect(matchProductBlobPath('12345', '')).toBeNull();
    });

    it('returns null when both sides are absent', () => {
      expect(matchProductBlobPath(null, null)).toBeNull();
      expect(matchProductBlobPath(undefined, undefined)).toBeNull();
    });
  });

  describe('buildProductResolutionDebugPayload surfaces expectedProductBlobPath + productBlobPathMatch', () => {
    it('reports expected=products/<tpnc>.json and match=true when paths agree', () => {
      const payload = buildProductResolutionDebugPayload({
        item: {
          name: 'Tesco Blueberries',
          tpnc: '12345',
          productBlobPath: 'products/12345.json',
        },
        resolution: {
          title: 'Tesco Blueberries',
          description: 'desc',
          storage: '',
          preparation: '',
          ingredients: '',
          allergens: '',
          nutrition: '',
          image: '',
          source: 'generated',
        },
      });
      expect(payload.expectedProductBlobPath).toBe('products/12345.json');
      expect(payload.productBlobPathMatch).toBe(true);
    });

    it('reports expected=products/<tpnc>.json and match=false when the actual path drifted', () => {
      const payload = buildProductResolutionDebugPayload({
        item: {
          name: 'Tesco Blueberries',
          tpnc: '12345',
          productBlobPath: 'products/legacy/12345.json',
        },
        resolution: {
          title: 'Tesco Blueberries',
          description: 'desc',
          storage: '',
          preparation: '',
          ingredients: '',
          allergens: '',
          nutrition: '',
          image: '',
          source: 'generated',
        },
      });
      expect(payload.expectedProductBlobPath).toBe('products/12345.json');
      expect(payload.productBlobPathMatch).toBe(false);
    });

    it('reports expected=null and match=null when tpnc is absent', () => {
      const payload = buildProductResolutionDebugPayload({
        item: { name: 'Unknown', tpnc: null, productBlobPath: null },
        resolution: {
          title: 'Unknown',
          description: 'Product information not available in generated data.',
          storage: '',
          preparation: '',
          ingredients: '',
          allergens: '',
          nutrition: '',
          image: '',
          source: 'fallback',
        },
      });
      expect(payload.expectedProductBlobPath).toBeNull();
      expect(payload.productBlobPathMatch).toBeNull();
    });

    it('falls back to productMetadata.tpnc when item.tpnc is not present at the top level', () => {
      const payload = buildProductResolutionDebugPayload({
        item: {
          name: 'Tesco Blueberries',
          productBlobPath: 'products/12345.json',
          productMetadata: { tpnc: '12345', description: 'desc' } as never,
        },
        resolution: {
          title: 'Tesco Blueberries',
          description: 'desc',
          storage: '',
          preparation: '',
          ingredients: '',
          allergens: '',
          nutrition: '',
          image: '',
          source: 'generated',
        },
      });
      expect(payload.expectedProductBlobPath).toBe('products/12345.json');
      expect(payload.productBlobPathMatch).toBe(true);
    });
  });
});