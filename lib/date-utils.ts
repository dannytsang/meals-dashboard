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
