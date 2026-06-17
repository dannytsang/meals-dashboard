/**
 * app/api/debug/items-by-category/route.ts
 *
 * Spec 022 / FR-004, FR-008: server-gated JSON endpoint returning the
 * items-by-category diagnostic. The shape is consumed by
 * components/items-by-category-debug-panel.tsx on /debug and by
 * components/dashboard-debug-chips.tsx on the main dashboard.
 *
 * Gating (Rev 2): the route is gated on the EFFECTIVE debug mode
 * (env-var + per-user signed cookie). With MEALS_DEBUG_MODE off OR
 * the per-user cookie unset/malformed, the route returns 404 with no
 * body. The env var dominates: a signed "1" cookie alone cannot turn
 * debug on when the env is off.
 *
 * The endpoint reuses the existing `getDashboardData` read path, so
 * the values surfaced are byte-identical to what the main dashboard
 * sees (modulo client-side state like the user-toggled category
 * filter — those default to the initial state here).
 *
 * NFR-004: this endpoint is read-only; it never writes to Vercel Blob.
 * NFR-005: the same OIDC gate that protects `/` also protects this
 * route via the middleware matcher (see middleware.ts).
 */
import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { effectiveDebugMode } from '@/lib/debug-mode';
import { DEBUG_COOKIE_NAME } from '@/lib/debug-cookie';
import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';
import { transformCachedOrderSafely } from '@/lib/dashboard-ui-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function GET(): Promise<NextResponse> {
  // Next.js 15 makes `cookies()` async; await it.
  const cookieRaw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
  if (!effectiveDebugMode(cookieRaw)) {
    return NOT_FOUND;
  }

  // Build the same coverage window the main dashboard builds: today + 14 days.
  const now = new Date();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setUTCDate(twoWeeksLater.getUTCDate() + 14);
  const endDate = `${twoWeeksLater.getUTCFullYear()}-${String(twoWeeksLater.getUTCMonth() + 1).padStart(2, '0')}-${String(twoWeeksLater.getUTCDate()).padStart(2, '0')}`;
  const coverageWindow = buildCoverageWindowDates(today, endDate);

  const data = await getDashboardData({ coverageWindow });
  const receipt = transformCachedOrderSafely(data.latestOrder);
  const receiptItems = receipt?.items ?? [];
  // Spec 022 / FR-004 semantics: `unmatchedItems` is the full receipt
  // item list (it represents what was *not* matched against the planned
  // coverage — the `receipt.items` list IS the unmatched list in the
  // current data model, see dashboard-client.tsx line 132).
  const unmatchedItemsLength = receiptItems.length;
  // The dashboard applies no client-side filter at the API tier; this
  // is the server-default view that /debug surfaces.
  const displayItemsLength = unmatchedItemsLength;

  let latestOrderStatus: 'ok' | 'null_window_filtered' | 'null_no_order_blob' | 'null_pointer_missing';
  if (data.latestOrder) {
    latestOrderStatus = 'ok';
  } else {
    // The data was loaded but no order blob matched the window OR the
    // pointer was missing. Without a pointer we cannot tell which; the
    // API reports 'null_no_order_blob' as a conservative default that
    // matches the diagnostic we did by hand on 2026-06-17.
    latestOrderStatus = 'null_no_order_blob';
  }

  const payload = {
    latestOrder: data.latestOrder ?? null,
    latestOrderStatus,
    latestOrderBlobPath: (data.latestOrder as unknown as { orderBlobPath?: string } | null)?.orderBlobPath ?? null,
    receiptItemsLength: receiptItems.length,
    unmatchedItemsLength,
    displayItemsLength,
    // Server-default values; the panel surfaces these so the operator
    // can verify the default state matches the documented initial state.
    showCount: 10,
    filter: 'all' as const,
    cats: [] as string[],
    dataGen: data.dataGeneratedAt ?? '',
    coverageWindow,
    pointerPath: 'pointers/latest.json',
    manifestPath: '',
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
