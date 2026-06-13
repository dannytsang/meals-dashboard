import 'server-only';

import {
  realCoverage,
  realDeliveryWindows,
  realLatestOrder,
  realMealsCheckSummary,
} from '@/lib/real-data';

export function getDashboardData() {
  return {
    coverage: realCoverage ?? [],
    deliveryWindows: realDeliveryWindows ?? [],
    latestOrder: realLatestOrder,
    mealsCheckSummary: realMealsCheckSummary,
  };
}

export type DashboardData = ReturnType<typeof getDashboardData>;
