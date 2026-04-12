'use client';

import { mockCoverage } from '@/lib/meals-data';

export function Chart() {
  // Group coverage by date for a simple bar chart
  const coverageByDate = mockCoverage.reduce((acc, item) => {
    const date = item.meal.date;
    if (!acc[date]) {
      acc[date] = { total: 0, score: 0 };
    }
    acc[date].total += 1;
    acc[date].score += item.coverageScore;
    return acc;
  }, {} as Record<string, { total: number; score: number }>);

  const data = Object.entries(coverageByDate).map(([date, { total, score }]) => ({
    date: new Date(date).toLocaleDateString('en-GB', { weekday: 'short' }),
    value: Math.round(score / total),
  }));

  const maxValue = Math.max(...data.map((d) => d.value), 100);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
      <h3 className="text-lg font-semibold text-white mb-6">Coverage by Day</h3>
      <div className="flex items-end gap-2 h-48">
        {data.map((item) => (
          <div key={item.date} className="flex-1 flex flex-col items-center gap-2">
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
