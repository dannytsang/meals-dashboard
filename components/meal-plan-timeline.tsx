'use client';

import { MealCoverage } from '@/lib/meals-data';

interface MealPlanTimelineProps {
  coverage: MealCoverage[];
}

export function MealPlanTimeline({ coverage }: MealPlanTimelineProps) {
  const groupByDate = () => {
    const groups: Record<string, MealCoverage[]> = {};
    coverage.forEach(c => {
      const date = c.meal.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(c);
    });
    return groups;
  };

  const getStatusStyles = (score: number) => {
    if (score >= 80) return { dot: 'var(--accent-emerald)', border: 'var(--accent-emerald)', bg: 'var(--accent-emerald-bg)' };
    if (score >= 50) return { dot: 'var(--accent-amber)', border: 'var(--accent-amber)', bg: 'var(--accent-amber-bg)' };
    return { dot: 'var(--accent-rose)', border: 'var(--accent-rose)', bg: 'var(--accent-rose-bg)' };
  };

  const getDayLabel = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    if (dateStr === tomorrow) return 'Tomorrow';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const groups = groupByDate();
  const dates = Object.keys(groups).sort();

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Meal Timeline
        </h3>
        <span className="text-[10px] text-[var(--text-muted)]">{dates.length} days</span>
      </div>
      
      <div className="p-3">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {dates.map((date, idx) => {
            const meals = groups[date];
            const avgCoverage = Math.round(meals.reduce((sum, m) => sum + m.coverageScore, 0) / meals.length);
            const styles = getStatusStyles(avgCoverage);
            
            return (
              <div 
                key={date}
                className="shrink-0 p-3 rounded-lg border-2 w-28"
                style={{ backgroundColor: styles.bg, borderColor: styles.border }}
              >
                <p className="text-xs font-medium text-[var(--text-primary)] mb-1">{getDayLabel(date)}</p>
                <p className="text-lg font-bold" style={{ color: styles.dot }}>{avgCoverage}%</p>
                <p className="text-[10px] text-[var(--text-muted)]">{meals.length} meals</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {meals.slice(0, 2).map((m, i) => (
                    <span key={i} className="text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      {m.meal.content.length > 10 ? m.meal.content.slice(0, 10) + '...' : m.meal.content}
                    </span>
                  ))}
                  {meals.length > 2 && (
                    <span className="text-[10px] text-[var(--text-muted)]">+{meals.length - 2}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}