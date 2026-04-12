export const dashboardConfig = {
  name: 'Meals Dashboard',
  description: 'Meal plan coverage and grocery matching',
  refreshInterval: 5 * 60 * 1000, // 5 minutes
};

export type DashboardConfig = typeof dashboardConfig;

export function formatValue(value: number, format?: string): string {
  if (format === 'currency') return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
  if (format === 'percent') return `${value}%`;
  return new Intl.NumberFormat('en-GB').format(value);
}
