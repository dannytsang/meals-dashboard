import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { redirect } from 'next/navigation';
import { DashboardClient } from '@/components/dashboard-client';
import { assertAuthConfigured, authOptions } from '@/lib/auth';
import { getDashboardData, buildCoverageWindowDates, type DashboardDataReader } from '@/lib/dashboard-data';
import { effectiveDebugMode } from '@/lib/debug-mode';
import { DEBUG_COOKIE_NAME } from '@/lib/debug-cookie';
import { isBlobStorageConfigured, isDemoMode } from '@/lib/runtime-mode';
import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { StaticFixtureReader } from '@/lib/fixtures/static-fixture-reader';
import { EmptyDashboardReader } from '@/lib/fixtures/empty-dashboard-reader';

// Force SSR on every request so `today` is always current and private data stays server-loaded.
export const dynamic = 'force-dynamic';

// Spec 024 / FR-005 / FR-003: at request time, pick the right reader.
// Priority: blob > fixture > empty. The fixture file is build-time generated
// (prebuild hook in package.json); if it's missing, fall back to the
// empty reader so the dashboard renders an empty state rather than crashing.
function selectReader(): DashboardDataReader {
  if (isBlobStorageConfigured()) {
    return new VercelBlobStorageClient();
  }
  // The bundled fixture is generated next to this file's compiled output.
  // Use process.cwd() because Next.js runs from the project root.
  const fixturePath = join(process.cwd(), 'lib', 'fixtures', 'dashboard-fixture.json');
  if (existsSync(fixturePath)) {
    return new StaticFixtureReader();
  }
  return new EmptyDashboardReader();
}

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

  // Spec 024 / FR-005 / FR-001: detect demo mode at request time.
  // The dashboard reader is selected before getDashboardData() is called.
  const demoMode = isDemoMode();
  const reader = selectReader();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Default date range: today + 14 days
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
  const endDate = `${twoWeeksLater.getFullYear()}-${String(twoWeeksLater.getMonth() + 1).padStart(2, '0')}-${String(twoWeeksLater.getDate()).padStart(2, '0')}`;

  const coverageWindow = buildCoverageWindowDates(today, endDate);
  const data = await getDashboardData({ coverageWindow, reader });
  console.log('[page] data loaded:', {
    coverageCount: data.coverage.length,
    mealsCount: data.mealsCheckSummary ? 'has summary' : 'no summary',
    latestOrder: data.latestOrder ? `has order (${data.latestOrder.items?.length ?? 0} items, $${data.latestOrder.orderTotal ?? '?'})` : 'no order',
    dataGeneratedAt: data.dataGeneratedAt,
    demoMode,
  });

  return (
    <DashboardClient
      today={today}
      defaultDateRange={{ start: today, end: endDate }}
      data={data}
      debugOn={debugOn}
      demoMode={demoMode}
    />
  );
}
