'use client';

import { MealCoverage } from '@/lib/meals-data';

interface ChartProps {
  coverage: MealCoverage[];
}

export function Chart({ coverage }: ChartProps) {
  const coverageByDate = coverage.reduce((acc, item) => {
    const date = item.meal.date;
    if (!acc[date]) acc[date] = { total: 0, score: 0, meals: [] };
    acc[date].total += 1;
    acc[date].score += item.coverageScore;
    acc[date].meals.push(item.meal.content);
    return acc;
  }, {} as Record<string, { total: number; score: number; meals: string[] }>);

  const data = Object.entries(coverageByDate)
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([date, { total, score, meals }]) => ({
      date: new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      fullDate: new Date(date).toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' }),
      value: Math.round(score / total),
      mealCount: total,
      meals,
    }));

  const maxValue = Math.max(...data.map(d => d.value), 100);

  const getBarColor = (value: number) => {
    if (value >= 80) return 'var(--accent-emerald)';
    if (value >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  return (
    <div className="card p-4">
      <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Coverage by Day
      </h3>
      
      <div className="flex items-end gap-2 h-32">
        {data.map((item) => (
          <div key={item.date} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div 
              className="w-full rounded-t transition-all duration-300 relative"
              style={{ 
                height: `${(item.value / maxValue) * 100}%`,
                backgroundColor: getBarColor(item.value),
                minHeight: item.value > 0 ? '4px' : '0'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent" />
            </div>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.date}</span>
            <span className="text-[10px] font-medium" style={{ color: getBarColor(item.value) }}>{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}