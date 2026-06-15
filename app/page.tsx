import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { DashboardClient } from '@/components/dashboard-client';
import { assertAuthConfigured, authOptions } from '@/lib/auth';
import { getDashboardData, buildCoverageWindowDates } from '@/lib/dashboard-data';

// Force SSR on every request so `today` is always current and private data stays server-loaded.
export const dynamic = 'force-dynamic';

export default async function MealsDashboardPage() {
  assertAuthConfigured();
  const session = await getServerSession(authOptions);
  console.log('[page] session:', session ? 'authenticated' : 'NOT authenticated');
  if (!session) {
    redirect('/auth/signin?callbackUrl=/');
  }

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
    latestOrder: data.latestOrder ? 'has order' : 'no order',
  });

  return <DashboardClient today={today} defaultDateRange={{ start: today, end: endDate }} data={data} />;
}
