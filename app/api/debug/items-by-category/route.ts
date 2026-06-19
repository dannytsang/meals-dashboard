import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { DEBUG_COOKIE_NAME, verifyDebugCookie } from '@/lib/debug-cookie';
import {
  buildItemsByCategoryDebugPayload,
  type ItemsByCategoryDebugPayload,
} from '@/lib/debug-observability';
import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';
import { runtimeModeStatus } from '@/lib/runtime-mode';
import { StaticFixtureReader } from '@/lib/fixtures/static-fixture-reader';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { transformCachedOrderSafely } from '@/lib/dashboard-ui-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = NextResponse.json({ error: 'not_found' }, { status: 404 });
const POINTER_PATH = 'pointers/latest.json';

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isDebugCookieOn(raw: string | undefined | null): boolean {
  return verifyDebugCookie(raw)?.value === '1';
}

function pickReader() {
  const mode = runtimeModeStatus();
  return mode.blobConfigured ? new VercelBlobStorageClient() : new StaticFixtureReader();
}

export async function GET(): Promise<NextResponse> {
  const cookieRaw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
  if (!isDebugCookieOn(cookieRaw)) {
    return NOT_FOUND;
  }

  const now = new Date();
  const today = toIsoDate(now);
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setUTCDate(twoWeeksLater.getUTCDate() + 14);
  const endDate = toIsoDate(twoWeeksLater);
  const coverageWindow = buildCoverageWindowDates(today, endDate);
  const reader = pickReader();

  const pointer = await reader.readPointer();
  const manifestPath = pointer?.manifestPath ?? null;
  const productsManifestPath = pointer?.productsManifestPath ?? null;
  const manifest = manifestPath ? await reader.readManifest(manifestPath) : {};
  const summaryPath = Object.keys(manifest).find((p) => p.startsWith('meta/summary-')) ?? null;
  const allOrderPaths = Object.keys(manifest).filter((p) => p.startsWith('orders/'));
  const inWindow = allOrderPaths.filter((p) => {
    const m = /^orders\/(\d{4}-\d{2}-\d{2})\//.exec(p);
    return m ? coverageWindow.includes(m[1]!) : false;
  });
  const pastOrders = allOrderPaths
    .filter((p) => !inWindow.includes(p))
    .filter((p) => /^orders\/(\d{4}-\d{2}-\d{2})\//.test(p))
    .sort()
    .reverse();
  const orderPaths = [...inWindow, ...pastOrders.slice(0, 1)];
  const coveragePaths = coverageWindow.map((d) => `coverage/${d}.json`).filter((p) => p in manifest);

  const data = await getDashboardData({ reader, coverageWindow });
  const receipt = transformCachedOrderSafely(data.latestOrder);
  const receiptItems = receipt?.items ?? [];
  const unmatchedItemsLength = receiptItems.length;
  const displayItemsLength = unmatchedItemsLength;

  let latestOrderStatus: ItemsByCategoryDebugPayload['latestOrderStatus'] = 'null_pointer_missing';
  if (pointer && manifestPath) {
    latestOrderStatus = data.latestOrder ? 'ok' : 'null_no_order_blob';
  }

  const latestOrderWithPath = data.latestOrder ? Object.assign({}, data.latestOrder, { orderBlobPath: orderPaths[0] ?? null }) : null;
  const candidateLatestOrderPath = orderPaths[0] ?? null;
  const candidateLatestOrderDate = data.latestOrder?.deliveryDate ?? (candidateLatestOrderPath ? /^orders\/(\d{4}-\d{2}-\d{2})\//.exec(candidateLatestOrderPath)?.[1] ?? null : null);

  const payload = buildItemsByCategoryDebugPayload({
    now: now.toISOString(),
    coverageWindow,
    data: {
      latestOrder: latestOrderWithPath,
      dataGeneratedAt: data.dataGeneratedAt,
      uiUpdatedAt: data.uiUpdatedAt,
      loadError: data.loadError,
    },
    trace: {
      pointerPath: POINTER_PATH,
      manifestPath,
      productsManifestPath,
      candidateLatestOrderPath,
      candidateLatestOrderDate,
      latestOrderStatus,
    },
    receiptItemsLength: receiptItems.length,
    unmatchedItemsLength,
    displayItemsLength,
  });

  // Add the read-path specific fields the current panel surfaces.
  return NextResponse.json({
    ...payload,
    latestOrderStatus,
    pointerPath: POINTER_PATH,
    manifestPath,
    productsManifestPath,
    summaryPath,
    coverageReads: coveragePaths.map((path) => ({ path, status: 'ok' as const })),
    orderReads: orderPaths.map((path) => ({ path, status: 'ok' as const })),
    fetchedAt: payload.fetchedAt,
  });
}
