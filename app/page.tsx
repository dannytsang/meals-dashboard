import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { DashboardClient } from '@/components/dashboard-client';
import { assertAuthConfigured, authOptions } from '@/lib/auth';
import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';
import { isDebugModeEnabled } from '@/lib/debug-mode';

// Force SSR on every request so `today` is always current and private data stays server-loaded.
export const dynamic = 'force-dynamic';

interface MealsDashboardPageProps {
  searchParams?: Promise<{ debug?: string | string[] }>;
}

export default async function MealsDashboardPage({ searchParams }: MealsDashboardPageProps) {
  assertAuthConfigured();
  const session = await getServerSession(authOptions);
  console.log('[page] session:', session ? 'authenticated' : 'NOT authenticated');
  if (!session) {
    redirect('/auth/signin?callbackUrl=/');
  }

  // Spec 022 / FR-009: ?debug=inject is honoured only when
  // MEALS_DEBUG_MODE=1. With debug off, the flag is silently ignored
  // and the dashboard renders as production. The env-var check is
  // server-side, so the client component never sees a `debugInject`
  // prop in production builds.
  const resolvedParams = searchParams ? await searchParams : {};
  const rawDebug = resolvedParams.debug;
  const injectRequested = rawDebug === 'inject';
  const debugInject = injectRequested && isDebugModeEnabled();

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

  return <DashboardClient today={today} defaultDateRange={{ start: today, end: endDate }} data={data} debugInject={debugInject} />;
}
