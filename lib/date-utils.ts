export function parseISODateLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function formatISODate(isoDate: string, options: Intl.DateTimeFormatOptions): string {
  return parseISODateLocal(isoDate).toLocaleDateString('en-GB', options);
}

export function formatWeekdayShort(isoDate: string): string {
  return formatISODate(isoDate, { weekday: 'short' });
}

export function formatShortDayMonth(isoDate: string): string {
  return formatISODate(isoDate, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDayMonthUpper(isoDate: string): string {
  const date = parseISODateLocal(isoDate);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  return `${day} ${month}`;
}

export function toISODateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Spec 034 / FR-009 — time-machine offset helper.
 *
 * Shift an ISO date string by `days` whole days (negative values shift
 * backwards). Operates on the local-time ISO date components produced
 * by `parseISODateLocal` / `toISODateLocal` so DST transitions are
 * side-stepped (we round-trip via year/month/day, never via Date
 * arithmetic that crosses DST gaps in a non-UTC locale).
 *
 * Used by the debug-only `?delivery_date_offset=N` query param to
 * shift the `today` anchor used by `classifyOrderItemsByDelivery`
 * without waiting for real midnight.
 */
export function addDays(isoDate: string, days: number): string {
  const d = parseISODateLocal(isoDate);
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}
