import { DashboardClient } from '@/components/dashboard-client';

// Force SSR on every request so `today` is always current
export const dynamic = 'force-dynamic';

export default function MealsDashboardPage() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return <DashboardClient today={today} />;
}
