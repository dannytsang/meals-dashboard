import { AuthDebugBanner } from '@/components/auth-debug-banner';
import { DashboardClient } from '@/components/dashboard-client';

// Force SSR on every request so `today` is always current
export const dynamic = 'force-dynamic';

export default function MealsDashboardPage() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Default date range: today + 14 days
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
  const endDate = `${twoWeeksLater.getFullYear()}-${String(twoWeeksLater.getMonth() + 1).padStart(2, '0')}-${String(twoWeeksLater.getDate()).padStart(2, '0')}`;

  return (
    <>
      <AuthDebugBanner issuer={process.env.AUTHENTIK_ISSUER} />
      <DashboardClient today={today} defaultDateRange={{ start: today, end: endDate }} />
    </>
  );
}
