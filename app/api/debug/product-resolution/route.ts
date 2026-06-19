import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { DEBUG_COOKIE_NAME, verifyDebugCookie } from '@/lib/debug-cookie';
import { buildProductResolutionDebugPayload } from '@/lib/debug-observability';
import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';
import { runtimeModeStatus } from '@/lib/runtime-mode';
import { StaticFixtureReader } from '@/lib/fixtures/static-fixture-reader';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { resolveProductInfoForItem } from '@/lib/dashboard-ui-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = NextResponse.json({ error: 'not_found' }, { status: 404 });

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

export async function GET(request: Request): Promise<NextResponse> {
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
  const data = await getDashboardData({ reader, coverageWindow });

  const url = new URL(request.url);
  const tpnc = url.searchParams.get('tpnc');
  const name = url.searchParams.get('name');
  const items = (data.latestOrder?.items ?? []) as Array<{
    name: string;
    tpnc?: string | null;
    productBlobPath?: string | null;
    productMetadata?: {
      description?: string;
      firecrawl?: { snippet?: string | null; lastFetched?: string; status?: 'ok' | 'not_found' };
    } | null;
  }>;

  const selectedItem = items.find((item) => (tpnc ? item.tpnc === tpnc : false))
    ?? items.find((item) => (name ? item.name.toLowerCase() === name.toLowerCase() : false))
    ?? items[0]
    ?? { name: 'Unknown item', tpnc: null, productBlobPath: null, productMetadata: null };

  const resolution = resolveProductInfoForItem(selectedItem as Parameters<typeof resolveProductInfoForItem>[0]);
  const payload = buildProductResolutionDebugPayload({
    item: selectedItem,
    resolution,
  });

  return NextResponse.json(payload);
}
