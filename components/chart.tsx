'use client';

import { MealCoverage } from '@/lib/meals-data';

interface ChartProps {
  coverage: MealCoverage[];
}

export function Chart({ coverage }: ChartProps) {
  const coverageByDate = coverage.reduce((acc, item) => {
    const date = item.meal.date;
    if (!acc[date]) {
      acc[date] = { total: 0, score: 0, meals: [] };
    }
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

  const maxValue = Math.max(...data.map((d) => d.value), 100);

  const getBarColor = (value: number) => {
    if (value >= 80) return 'var(--accent-emerald)';
    if (value >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Coverage by Day</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--accent-emerald)' }} />
            <span style={{ color: 'var(--text-tertiary)' }}>High (80%+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--accent-amber)' }} />
            <span style={{ color: 'var(--text-tertiary)' }}>Medium (50-79%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--accent-rose)' }} />
            <span style={{ color: 'var(--text-tertiary)' }}>Low (&lt;50%)</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-end gap-3 h-48">
        {data.map((item, idx) => (
          <div 
            key={item.date} 
            className="flex-1 flex flex-col items-center gap-2 group relative"
          >
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
              <div 
                className="rounded-lg p-3 shadow-xl whitespace-nowrap"
                style={{ 
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  boxShadow: 'var(--shadow-lg)'
                }}
              >
                <p className="text-[var(--text-primary)] font-medium">{item.fullDate}</p>
                <p className="text-[var(--text-secondary)] text-sm">
                  {item.mealCount} meal{item.mealCount > 1 ? 's' : ''}
                </p>
                <div className="mt-2 space-y-1">
                  {item.meals.map((meal, i) => (
                    <p 
                      key={i} 
                      className="text-[var(--text-tertiary)] text-xs truncate max-w-[200px]"
                    >
                      • {meal}
                    </p>
                  ))}
                </div>
                <p 
                  className="text-sm font-bold mt-2"
                  style={{ color: getBarColor(item.value) }}
                >
                  {item.value}% coverage
                </p>
              </div>
            </div>
            
            {/* Bar */}
            <div
              className="w-full rounded-t transition-all duration-500 relative overflow-hidden"
              style={{ 
                height: `${(item.value / maxValue) * 100}%`,
                backgroundColor: getBarColor(item.value),
                opacity: 0.85
              }}
            >
              {/* Shine effect */}
              <div 
                className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"
              />
            </div>
            
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.date}</span>
            <span className="text-xs font-medium" style={{ color: getBarColor(item.value) }}>
              {item.value}%
            </span>
          </div>
        ))}
      </div>
      
      {/* Summary stats */}
      <div className="mt-6 pt-4 border-t border-[var(--border-color)] flex justify-between">
        <div>
          <p className="text-xs text-[var(--text-muted)]">Average Coverage</p>
          <p className="text-lg font-bold" style={{ color: 'var(--accent-amber)' }}>
            {Math.round(data.reduce((s, d) => s + d.value, 0) / data.length)}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">Best Day</p>
          <p className="text-lg font-bold" style={{ color: 'var(--accent-emerald)' }}>
            {Math.max(...data.map(d => d.value))}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">Needs Attention</p>
          <p className="text-lg font-bold" style={{ color: 'var(--accent-rose)' }}>
            {data.filter(d => d.value < 50).length}
          </p>
        </div>
      </div>
    </div>
  );
}