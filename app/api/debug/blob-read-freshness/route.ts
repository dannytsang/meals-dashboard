import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { DEBUG_COOKIE_NAME, verifyDebugCookie } from '@/lib/debug-cookie';
import {
  buildBlobReadFreshnessDebugPayload,
  type BlobReadFreshnessDebugPayload,
} from '@/lib/debug-observability';
import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';
import { runtimeModeStatus } from '@/lib/runtime-mode';
import { StaticFixtureReader } from '@/lib/fixtures/static-fixture-reader';
import { VercelBlobStorageClient } from '@/lib/blob-storage';

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

  let pointerRead: BlobReadFreshnessDebugPayload['pointerRead'] = 'bypassed';
  let manifestRead: BlobReadFreshnessDebugPayload['manifestRead'] = 'bypassed';
  let manifestPath: string | null = null;
  let productsManifestPath: string | null = null;
  let summaryPath: string | null = null;
  let coverageReads: BlobReadFreshnessDebugPayload['coverageReads'] = [];
  let orderReads: BlobReadFreshnessDebugPayload['orderReads'] = [];
  let productReads: BlobReadFreshnessDebugPayload['productReads'] = [];

  try {
    const pointer = await reader.readPointer();
    pointerRead = pointer ? 'ok' : 'missing';
    if (pointer?.manifestPath) {
      manifestPath = pointer.manifestPath;
      productsManifestPath = pointer.productsManifestPath ?? null;
      try {
        const manifest = await reader.readManifest(pointer.manifestPath);
        manifestRead = manifest && Object.keys(manifest).length > 0 ? 'ok' : 'missing';
        summaryPath = Object.keys(manifest).find((p) => p.startsWith('meta/summary-')) ?? null;
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

        const [coverageResults, orderResults] = await Promise.all([
          Promise.all(coveragePaths.map(async (path) => ({ path, status: (await reader.readJsonBlob(path)) ? 'ok' : 'missing' } as const))),
          Promise.all(orderPaths.map(async (path) => ({ path, status: (await reader.readJsonBlob(path)) ? 'ok' : 'missing' } as const))),
        ]);
        coverageReads = coverageResults;
        orderReads = orderResults;

        const latestOrder = await getDashboardData({ reader, coverageWindow }).then((data) => data.latestOrder);
        const productPaths = latestOrder
          ? [...new Set((latestOrder.items as Array<{ productBlobPath?: string | null }>).map((item) => item.productBlobPath).filter((p): p is string => Boolean(p)))]
          : [];
        productReads = await Promise.all(
          productPaths.map(async (path) => {
            const blob = await reader.readJsonBlob<{ lastFetched?: string }>(path);
            return {
              path,
              status: blob ? 'ok' : 'missing',
              lastFetched: blob?.lastFetched,
            } as const;
          })
        );
      } catch {
        manifestRead = 'error';
      }
    }
  } catch {
    pointerRead = 'error';
  }

  const data = await getDashboardData({ reader, coverageWindow });
  const payload = buildBlobReadFreshnessDebugPayload({
    now: now.toISOString(),
    data: {
      latestOrder: data.latestOrder,
      dataGeneratedAt: data.dataGeneratedAt,
      uiUpdatedAt: data.uiUpdatedAt,
      loadError: data.loadError,
    },
    trace: {
      pointerPath: POINTER_PATH,
      pointerRead,
      manifestPath,
      manifestRead,
      summaryPath,
      summaryRead: summaryPath ? 'ok' : manifestRead === 'missing' ? 'missing' : manifestRead === 'error' ? 'error' : 'bypassed',
      productsManifestPath,
      productsManifestRead: productsManifestPath ? 'ok' : 'bypassed',
      coverageWindow,
      coverageReads,
      orderReads,
      productReads,
    },
  });

  return NextResponse.json(payload);
}
