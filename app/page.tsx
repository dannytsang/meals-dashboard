import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardClient } from '@/components/dashboard-client';
import { assertAuthConfigured, authOptions } from '@/lib/auth';
import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';
import { effectiveDebugMode } from '@/lib/debug-mode';
import { DEBUG_COOKIE_NAME } from '@/lib/debug-cookie';

// Force SSR on every request so `today` is always current and private data stays server-loaded.
export const dynamic = 'force-dynamic';

export default async function MealsDashboardPage() {
  assertAuthConfigured();
  const session = await getServerSession(authOptions);
  console.log('[page] session:', session ? 'authenticated' : 'NOT authenticated');
  if (!session) {
    redirect('/auth/signin?callbackUrl=/');
  }

  // Spec 022 / Rev 3: the per-user signed cookie is the only gate.
  // The env-var is gone; the cookie decides whether the inline debug
  // chips appear on the main dashboard for this user.
  const cookieRaw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
  const debugOn = effectiveDebugMode(cookieRaw);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Default date range: today + 14 days
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
  const endDate = `${twoWeeksLater.getFullYear()}-${String(twoWeeksLater.getMonth() + 1).padStart(2, '0')}-${String(twoWeeksLater.getDate()).padStart(2, '0')}`;

  const coverageWindow = buildCoverageWindowDates(today, endDate);
  const data = await getDashboardData({ coverageWindow });
  console.log('[page] data loaded:', {
    coverageCount: data.coverage.length,
    mealsCount: data.mealsCheckSummary ? 'has summary' : 'no summary',
    latestOrder: data.latestOrder ? `has order (${data.latestOrder.items?.length ?? 0} items, $${data.latestOrder.orderTotal ?? '?'})` : 'no order',
    dataGeneratedAt: data.dataGeneratedAt,
  });

  return (
    <DashboardClient
      today={today}
      defaultDateRange={{ start: today, end: endDate }}
      data={data}
      debugOn={debugOn}
    />
  );
}
