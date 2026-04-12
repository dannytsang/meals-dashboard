'use client';

import { MealCoverage } from '@/lib/meals-data';

interface ChartProps {
  coverage: MealCoverage[];
}

export function Chart({ coverage }: ChartProps) {
  // Group coverage by date
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

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
      <h3 className="text-lg font-semibold text-white mb-6">Coverage by Day</h3>
      <div className="flex items-end gap-3 h-48">
        {data.map((item) => (
          <div key={item.date} className="flex-1 flex flex-col items-center gap-2 group relative">
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl whitespace-nowrap">
                <p className="text-white font-medium">{item.fullDate}</p>
                <p className="text-slate-400 text-sm">{item.mealCount} meal{item.mealCount > 1 ? 's' : ''}</p>
                <div className="mt-2 space-y-1">
                  {item.meals.map((meal, idx) => (
                    <p key={idx} className="text-xs text-slate-300 truncate max-w-[200px]">• {meal}</p>
                  ))}
                </div>
                <p className={`text-sm font-bold mt-2 ${
                  item.value >= 80 ? 'text-emerald-400' : 
                  item.value >= 50 ? 'text-amber-400' : 
                  'text-rose-400'
                }`}>
                  {item.value}% coverage
                </p>
              </div>
            </div>
            
            <div
              className={`w-full rounded-t transition-all duration-500 ${
                item.value >= 80 ? 'bg-emerald-500/80' : 
                item.value >= 50 ? 'bg-amber-500/80' : 
                'bg-rose-500/80'
              }`}
              style={{ height: `${(item.value / maxValue) * 100}%` }}
            />
            <span className="text-xs text-slate-400">{item.date}</span>
            <span className="text-xs text-slate-500">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
