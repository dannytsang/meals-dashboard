import { USER_NAME_FALLBACK, type SessionUser, resolveUserChipName } from './user-chip';
import { verifyDebugCookie, type VerifiedDebugCookie } from './debug-cookie';
import { resolveProductInfoForItem, type ResolvedProductInfo } from './dashboard-ui-utils';

export type DebugCookieState = 'missing' | 'verified_on' | 'verified_off' | 'tampered';
export type DebugUserSource = 'name' | 'email' | 'fallback';
export type DebugRuntimeMode = 'demo' | 'live';
export type DebugReader = 'static_fixture_reader' | 'vercel_blob';
export type DebugProductSource = 'apollo' | 'firecrawl' | 'placeholder';

export interface RuntimeContextDebugPayload {
  runtimeMode: DebugRuntimeMode;
  blobCredentialsState: 'complete' | 'incomplete';
  cookie: {
    state: DebugCookieState;
    value: '0' | '1' | null;
    effectiveDebugMode: boolean;
  };
  runtime: {
    mode: DebugRuntimeMode;
    blobConfigured: boolean;
    activeReader: DebugReader;
  };
  user: {
    displayName: string;
    source: DebugUserSource;
  };
  request: {
    path: string;
    origin: string;
    deploymentId: string | null;
    vercelEnv: string | null;
    region: string | null;
    fetchedAt: string;
  };
}

export interface ItemsByCategoryDebugPayload {
  latestOrder: unknown | null;
  latestOrderStatus: 'ok' | 'null_window_filtered' | 'null_no_order_blob' | 'null_pointer_missing';
  latestOrderBlobPath: string | null;
  candidateLatestOrderPath: string | null;
  candidateLatestOrderDate: string | null;
  receiptItemsLength: number;
  unmatchedItemsLength: number;
  displayItemsLength: number;
  chosenFilterState: 'all';
  chosenFilterReason: 'server_default';
  showCount: number;
  filter: 'all';
  cats: string[];
  dataGen: string;
  uiUpdatedAt: string;
  coverageWindow: string[];
  pointerPath: string;
  manifestPath: string | null;
  productsManifestPath: string | null;
  fetchedAt: string;
}

export interface BlobReadFreshnessDebugPayload {
  runtimeMode: DebugRuntimeMode;
  blobCredentialsState: 'complete' | 'incomplete';
  pointerPath: string;
  pointerRead: 'ok' | 'missing' | 'error' | 'bypassed';
  manifestPath: string | null;
  manifestRead: 'ok' | 'missing' | 'error' | 'bypassed';
  summaryPath: string | null;
  summaryRead: 'ok' | 'missing' | 'error' | 'bypassed';
  productsManifestPath: string | null;
  productsManifestRead: 'ok' | 'missing' | 'error' | 'bypassed';
  selectedOrderBlobPath: string | null;
  selectedCoverageBlobPaths: string[];
  selectedProductBlobPath: string | null;
  loadError: unknown;
  coverageWindow: string[];
  coverageReads: Array<{ path: string; status: 'ok' | 'missing' | 'error' | 'bypassed' }>;
  orderReads: Array<{ path: string; status: 'ok' | 'missing' | 'error' | 'bypassed' }>;
  productReads: Array<{ path: string; status: 'ok' | 'missing' | 'error' | 'bypassed'; lastFetched?: string }>;
  summaryFreshness: {
    dataGeneratedAt: string;
    dataGeneratedAgeSeconds: number | null;
    uiUpdatedAt: string;
    uiUpdatedAgeSeconds: number | null;
  };
  latestOrderFreshness: {
    deliveryDate: string | null;
    ageDays: number | null;
  };
  deliveryWindows: Array<{
    date: string;
    slot: string;
    status: string;
    orderTotal: number | null;
  }>;
  fetchedAt: string;
}

export interface ProductResolutionDebugPayload {
  itemName: string;
  itemTpnc: string | null;
  itemBlobPath: string | null;
  title: string;
  description: string;
  storage: string;
  preparation: string;
  ingredients: string;
  allergens: string;
  nutrition: string;
  image: string;
  productUrl?: string;
  lastFetched?: string;
  expiresAt?: string;
  productSource: DebugProductSource;
  descriptionSource: DebugProductSource;
  fieldSources: {
    description: DebugProductSource;
    image: DebugProductSource;
    storage: DebugProductSource;
    preparation: DebugProductSource;
  };
  freshness: {
    lastFetched?: string;
    firecrawlLastFetched?: string;
  };
  provenance: {
    generated: boolean;
    local: boolean;
    firecrawl: boolean;
    firecrawlStatus: 'ok' | 'not_found' | null;
  };
  /**
   * Spec 031 Rev 3 / FR-005 + spec 010 Rev 5.1 / FR-011. The
   * expected productBlobPath derived from the spec 021 Key
   * Entities convention `products/{tpnc}.json`. `null` when the
   * tpnc is unknown — a missing tpnc is a different problem from
   * a wrong path.
   */
  expectedProductBlobPath: string | null;
  /**
   * Spec 031 Rev 3 / FR-005 + spec 010 Rev 5.1 / FR-011. Boolean
   * comparing `expectedProductBlobPath` to `productBlobPath`. `null`
   * when either side is absent (a missing tpnc OR a missing
   * productBlobPath), not `false` — the chip MUST NOT show a
   * misleading `false` for an absent tpnc.
   */
  productBlobPathMatch: boolean | null;
}

export function classifyDebugCookieState(raw: string | undefined | null): DebugCookieState {
  if (!raw) return 'missing';
  const verified = verifyDebugCookie(raw);
  if (!verified) return 'tampered';
  return verified.value === '1' ? 'verified_on' : 'verified_off';
}

export function resolveAuthenticatedUserDisplay(
  user: SessionUser | null | undefined,
  fallback: string = USER_NAME_FALLBACK,
): { displayName: string; source: DebugUserSource } {
  const displayName = resolveUserChipName(user, fallback);
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  if (name.length > 0) return { displayName, source: 'name' };
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  if (email.length > 0) return { displayName, source: 'email' };
  return { displayName, source: 'fallback' };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function maybeAgeSeconds(iso: string | undefined | null, nowIso: string): number | null {
  if (!isNonEmptyString(iso)) return null;
  const then = new Date(iso);
  const now = new Date(nowIso);
  const diff = now.getTime() - then.getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.round(diff / 1000));
}

function maybeAgeDays(iso: string | undefined | null, nowIso: string): number | null {
  const seconds = maybeAgeSeconds(iso, nowIso);
  return seconds === null ? null : Math.floor(seconds / 86400);
}

/**
 * Spec 021 Key Entities convention for the product blob path:
 * `products/{tpnc}.json`. The string template is the SINGLE source
 * of truth on the dashboard side; spec 010's modal-side chip
 * (Rev 5.1) and spec 031's product-resolution panel (Rev 3) both
 * consume the matcher below rather than re-deriving the convention.
 */
export function buildExpectedProductBlobPath(tpnc: string | null | undefined): string | null {
  if (typeof tpnc !== 'string' || tpnc.trim() === '') return null;
  return `products/${tpnc}.json`;
}

/**
 * Spec 031 Rev 3 / FR-005 matcher + spec 010 Rev 5.1 / FR-011.
 *
 * Compares the actual `productBlobPath` (the path that was
 * chosen / observed for the item) against the expected path
 * derived from the spec 021 Key Entities convention
 * `products/{tpnc}.json`. Returns `null` (not `false`) when
 * either side is absent — a missing tpnc is a different problem
 * from a wrong path.
 *
 * Golden inputs:
 *  - tpnc='12345', path='products/12345.json'   → true
 *  - tpnc='12345', path='products/legacy/12345.json' → false
 *  - tpnc=null,     path='products/legacy/12345.json' → null
 *  - tpnc='12345', path=null                    → null
 *  - tpnc=null,     path=null                    → null
 */
export function matchProductBlobPath(
  tpnc: string | null | undefined,
  productBlobPath: string | null | undefined,
): boolean | null {
  if (typeof tpnc !== 'string' || tpnc.trim() === '') return null;
  if (typeof productBlobPath !== 'string' || productBlobPath === '') return null;
  return productBlobPath === buildExpectedProductBlobPath(tpnc);
}

function resolveProductSource(resolution: ResolvedProductInfo, item: { name: string; productMetadata?: { description?: string; firecrawl?: { snippet?: string | null; status?: 'ok' | 'not_found' } } | null }) : DebugProductSource {
  // Spec 010 Rev 4: the `local` source tier was removed along with the
  // static `lib/product-database.ts` substring-map. The resolver no
  // longer returns `'local'`; the chip's source set is now strictly
  // apollo / firecrawl / placeholder.
  if (resolution.source === 'fallback') return 'placeholder';
  const generated = item.productMetadata;
  if (generated?.description && generated.description.trim().length > 0) return 'apollo';
  const firecrawlSnippet = generated?.firecrawl?.snippet;
  if (isNonEmptyString(firecrawlSnippet)) return 'firecrawl';
  return 'apollo';
}

export function buildRuntimeContextDebugPayload(args: {
  now: string;
  cookieRaw: string | undefined | null;
  blobConfigured: boolean;
  sessionUser: SessionUser | null | undefined;
  path: string;
  origin: string;
  deploymentId: string | null;
  vercelEnv: string | null;
  region: string | null;
}): RuntimeContextDebugPayload {
  const cookieState = classifyDebugCookieState(args.cookieRaw);
  const cookieVerified = verifyDebugCookie(args.cookieRaw);
  const user = resolveAuthenticatedUserDisplay(args.sessionUser);
  return {
    runtimeMode: args.blobConfigured ? 'live' : 'demo',
    blobCredentialsState: args.blobConfigured ? 'complete' : 'incomplete',
    cookie: {
      state: cookieState,
      value: cookieVerified?.value ?? null,
      effectiveDebugMode: cookieVerified?.value === '1',
    },
    runtime: {
      mode: args.blobConfigured ? 'live' : 'demo',
      blobConfigured: args.blobConfigured,
      activeReader: args.blobConfigured ? 'vercel_blob' : 'static_fixture_reader',
    },
    user,
    request: {
      path: args.path,
      origin: args.origin,
      deploymentId: args.deploymentId,
      vercelEnv: args.vercelEnv,
      region: args.region,
      fetchedAt: args.now,
    },
  };
}

export function buildItemsByCategoryDebugPayload(args: {
  now: string;
  coverageWindow: string[];
  data: {
    latestOrder: (unknown & { orderNumber?: string | null; orderBlobPath?: string | null; deliveryDate?: string | null; items?: unknown[] }) | null;
    dataGeneratedAt: string;
    uiUpdatedAt: string;
    loadError: unknown;
  };
  trace: {
    pointerPath: string;
    manifestPath: string | null;
    productsManifestPath: string | null;
    candidateLatestOrderPath: string | null;
    candidateLatestOrderDate: string | null;
    latestOrderStatus: 'ok' | 'null_window_filtered' | 'null_no_order_blob' | 'null_pointer_missing';
  };
  receiptItemsLength: number;
  unmatchedItemsLength: number;
  displayItemsLength: number;
}): ItemsByCategoryDebugPayload {
  return {
    latestOrder: args.data.latestOrder ?? null,
    latestOrderStatus: args.trace.latestOrderStatus,
    latestOrderBlobPath: args.data.latestOrder?.orderBlobPath ?? args.trace.candidateLatestOrderPath,
    candidateLatestOrderPath: args.trace.candidateLatestOrderPath,
    candidateLatestOrderDate: args.trace.candidateLatestOrderDate,
    receiptItemsLength: args.receiptItemsLength,
    unmatchedItemsLength: args.unmatchedItemsLength,
    displayItemsLength: args.displayItemsLength,
    chosenFilterState: 'all',
    chosenFilterReason: 'server_default',
    showCount: 10,
    filter: 'all',
    cats: [],
    dataGen: args.data.dataGeneratedAt ?? '',
    uiUpdatedAt: args.data.uiUpdatedAt ?? '',
    coverageWindow: args.coverageWindow,
    pointerPath: args.trace.pointerPath,
    manifestPath: args.trace.manifestPath,
    productsManifestPath: args.trace.productsManifestPath,
    fetchedAt: args.now,
  };
}

export function buildBlobReadFreshnessDebugPayload(args: {
  now: string;
  runtimeMode: DebugRuntimeMode;
  blobCredentialsState: 'complete' | 'incomplete';
  data: {
    latestOrder: (unknown & { orderNumber?: string | null; orderBlobPath?: string | null; deliveryDate?: string | null; items?: unknown[] }) | null;
    dataGeneratedAt: string;
    uiUpdatedAt: string;
    loadError: unknown;
    deliveryWindows?: Array<{
      date: string;
      slot: string;
      status: string;
      orderTotal: number | null;
    }>;
  };
  trace: {
    pointerPath: string;
    pointerRead: 'ok' | 'missing' | 'error' | 'bypassed';
    manifestPath: string | null;
    manifestRead: 'ok' | 'missing' | 'error' | 'bypassed';
    summaryPath: string | null;
    summaryRead: 'ok' | 'missing' | 'error' | 'bypassed';
    productsManifestPath: string | null;
    productsManifestRead: 'ok' | 'missing' | 'error' | 'bypassed';
    selectedOrderBlobPath: string | null;
    selectedCoverageBlobPaths: string[];
    selectedProductBlobPath: string | null;
    loadError: unknown;
    coverageWindow: string[];
    coverageReads: Array<{ path: string; status: 'ok' | 'missing' | 'error' | 'bypassed' }>;
    orderReads: Array<{ path: string; status: 'ok' | 'missing' | 'error' | 'bypassed' }>;
    productReads: Array<{ path: string; status: 'ok' | 'missing' | 'error' | 'bypassed'; lastFetched?: string }>;
  };
}): BlobReadFreshnessDebugPayload {
  return {
    runtimeMode: args.runtimeMode,
    blobCredentialsState: args.blobCredentialsState,
    pointerPath: args.trace.pointerPath,
    pointerRead: args.trace.pointerRead,
    manifestPath: args.trace.manifestPath,
    manifestRead: args.trace.manifestRead,
    summaryPath: args.trace.summaryPath,
    summaryRead: args.trace.summaryRead,
    productsManifestPath: args.trace.productsManifestPath,
    productsManifestRead: args.trace.productsManifestRead,
    selectedOrderBlobPath: args.trace.selectedOrderBlobPath,
    selectedCoverageBlobPaths: args.trace.selectedCoverageBlobPaths,
    selectedProductBlobPath: args.trace.selectedProductBlobPath,
    loadError: args.trace.loadError,
    coverageWindow: args.trace.coverageWindow,
    coverageReads: args.trace.coverageReads,
    orderReads: args.trace.orderReads,
    productReads: args.trace.productReads,
    summaryFreshness: {
      dataGeneratedAt: args.data.dataGeneratedAt ?? '',
      dataGeneratedAgeSeconds: maybeAgeSeconds(args.data.dataGeneratedAt, args.now),
      uiUpdatedAt: args.data.uiUpdatedAt ?? '',
      uiUpdatedAgeSeconds: maybeAgeSeconds(args.data.uiUpdatedAt, args.now),
    },
    latestOrderFreshness: {
      deliveryDate: args.data.latestOrder?.deliveryDate ?? null,
      ageDays: maybeAgeDays(args.data.latestOrder?.deliveryDate ?? null, args.now),
    },
    deliveryWindows: args.data.deliveryWindows ?? [],
    fetchedAt: args.now,
  };
}

export function buildProductResolutionDebugPayload(args: {
  item: {
    name: string;
    tpnc?: string | null;
    productBlobPath?: string | null;
    productMetadata?: ({
      /** Tesco product numeric ID. Sourced from spec 021 / FR-001.
       * Used by the spec 031 Rev 3 matcher to derive the expected
       * productBlobPath (`products/{tpnc}.json`). */
      tpnc?: string | null;
      gtin?: string | null;
      title?: string;
      description?: string;
      storage?: string;
      preparation?: string;
      ingredients?: string;
      allergens?: string;
      nutrition?: string;
      brand?: string;
      category?: string;
      productUrl?: string;
      source?: string;
      lastFetched?: string;
      imageUrl?: string;
      firecrawl?: { snippet?: string | null; lastFetched?: string; status?: 'ok' | 'not_found' };
    }) | null;
  };
  resolution: ResolvedProductInfo;
}): ProductResolutionDebugPayload {
  const productSource = resolveProductSource(args.resolution, args.item);
  const descriptionSource = productSource;
  const fieldSources: ProductResolutionDebugPayload['fieldSources'] = {
    // Spec 010 Rev 4: the `curated_static` tier was removed along
    // with the static `lib/product-database.ts` substring-map. The
    // field-source set is now strictly apollo / firecrawl / placeholder.
    description:
      productSource === 'placeholder'
        ? 'placeholder'
        : productSource === 'firecrawl'
          ? 'firecrawl'
          : args.item.productMetadata?.description?.trim()
            ? 'apollo'
            : 'placeholder',
    image:
      productSource === 'placeholder'
        ? 'placeholder'
        : args.resolution.image?.trim()
          ? 'apollo'
          : 'placeholder',
    storage:
      productSource === 'placeholder'
        ? 'placeholder'
        : args.resolution.storage?.trim()
          ? 'apollo'
          : 'placeholder',
    preparation:
      productSource === 'placeholder'
        ? 'placeholder'
        : args.resolution.preparation?.trim()
          ? 'apollo'
          : 'placeholder',
  };
  const tpncForMatcher = args.item.tpnc ?? args.item.productMetadata?.tpnc ?? null;
  const productBlobPathForMatcher = args.item.productBlobPath ?? null;
  const expectedProductBlobPath = buildExpectedProductBlobPath(tpncForMatcher);
  const productBlobPathMatch = matchProductBlobPath(tpncForMatcher, productBlobPathForMatcher);
  return {
    itemName: args.item.name,
    itemTpnc: args.item.tpnc ?? null,
    itemBlobPath: args.item.productBlobPath ?? null,
    title: args.resolution.title,
    description: args.resolution.description,
    storage: args.resolution.storage,
    preparation: args.resolution.preparation,
    ingredients: args.resolution.ingredients,
    allergens: args.resolution.allergens,
    nutrition: args.resolution.nutrition,
    image: args.resolution.image,
    productUrl: args.resolution.productUrl,
    lastFetched: args.resolution.lastFetched,
    expiresAt: args.resolution.expiresAt,
    productSource,
    descriptionSource,
    fieldSources,
    freshness: {
      lastFetched: args.resolution.lastFetched,
      firecrawlLastFetched: args.item.productMetadata?.firecrawl?.lastFetched,
    },
    provenance: {
      generated: args.resolution.source === 'generated',
      // Spec 010 Rev 4: the `local` provenance flag is removed
      // (along with the static-DB substring-map tier). The flag is
      // retained as a back-compat field on the wire shape but is
      // always `false` now; consumers should ignore it.
      local: false,
      firecrawl: Boolean(args.item.productMetadata?.firecrawl?.snippet && args.item.productMetadata.firecrawl.snippet.trim().length > 0),
      firecrawlStatus: args.item.productMetadata?.firecrawl?.status ?? null,
    },
    expectedProductBlobPath,
    productBlobPathMatch,
  };
}

export function describeProductResolutionSource(item: {
  name: string;
  productMetadata?: {
    description?: string;
    firecrawl?: { snippet?: string | null; status?: 'ok' | 'not_found' };
  } | null;
}, resolution: ResolvedProductInfo): DebugProductSource {
  return resolveProductSource(resolution, item);
}
