'use client';

import { MealCoverage } from '@/lib/meals-data';

interface MealCalendarProps {
  coverage: MealCoverage[];
}

export function MealCalendar({ coverage }: MealCalendarProps) {
  // Group coverage by date
  const coverageByDate: Record<string, MealCoverage[]> = {};
  coverage.forEach(c => {
    const date = c.meal.date;
    if (!coverageByDate[date]) coverageByDate[date] = [];
    coverageByDate[date].push(c);
  });

  const dates = Object.keys(coverageByDate).sort();
  
  // Generate array of all days in range
  const startDate = dates[0] ? new Date(dates[0]) : new Date();
  const endDate = dates[dates.length - 1] ? new Date(dates[dates.length - 1]) : new Date();
  
  const days: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  const getStatusColor = (status: string, score: number) => {
    if (status === 'covered' || score >= 80) return 'var(--accent-emerald)';
    if (status === 'partial' || score >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  const getMealTypeEmoji = (mealContent: string) => {
    const lower = mealContent.toLowerCase();
    if (lower.includes('breakfast') || lower.includes('cereal')) return '🌅';
    if (lower.includes('lunch')) return '☀️';
    if (lower.includes('dinner') || lower.includes('tea')) return '🌙';
    return '🍽️';
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">📅 WEEK VIEW</h2>
      </div>
      
      <div className="overflow-x-auto">
        <div className="min-w-[600px] p-4">
          {/* Header with dates */}
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
            <div /> {/* Empty cell for meal type column */}
            {days.map(date => {
              const dayData = coverageByDate[date];
              const coveragePct = dayData 
                ? Math.round(dayData.reduce((s, c) => s + c.coverageScore, 0) / dayData.length) 
                : 0;
              const isToday = date === new Date().toISOString().split('T')[0];
              const dayColor = coveragePct >= 80 ? 'var(--accent-emerald)' : coveragePct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
              
              return (
                <div key={date} className="text-center">
                  <p className="text-xs text-[var(--text-muted)] uppercase mb-1">
                    {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                  </p>
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                    style={{ 
                      backgroundColor: isToday ? `${dayColor}20` : 'var(--bg-tertiary)',
                      border: isToday ? `2px solid ${dayColor}` : '2px solid transparent'
                    }}
                  >
                    <span className="text-lg font-bold" style={{ color: dayColor }}>
                      {new Date(date).getDate()}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full mt-2 overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ width: `${coveragePct}%`, backgroundColor: dayColor }}
                    />
                  </div>
                  <p className="text-xs font-medium mt-1" style={{ color: dayColor }}>{coveragePct}%</p>
                </div>
              );
            })}
          </div>

          {/* Meals rows */}
          {['breakfast', 'lunch', 'dinner'].map(mealType => (
            <div 
              key={mealType} 
              className="grid gap-3 items-start py-3"
              style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)`, borderTop: '1px solid var(--border-color)' }}
            >
              <div className="pt-2">
                <p className="text-sm text-[var(--text-muted)] capitalize">{mealType}</p>
              </div>
              
              {days.map(date => {
                const dayMeals = coverageByDate[date]?.filter(c => {
                  const m = c.meal.content.toLowerCase();
                  if (mealType === 'breakfast') return m.includes('breakfast') || m.includes('cereal');
                  if (mealType === 'lunch') return m.includes('lunch') || m.includes('sandwich');
                  return m.includes('dinner') || m.includes('tea') || (!m.includes('breakfast') && !m.includes('lunch'));
                }) || [];
                
                const meal = dayMeals[0];
                
                return (
                  <div key={date} className="min-h-[70px] p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    {meal ? (
                      <div className="flex items-start gap-1.5">
                        <span className="text-sm">{getMealTypeEmoji(meal.meal.content)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-tight text-[var(--text-primary)] truncate" title={meal.meal.content}>
                            {meal.meal.content}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <span 
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: getStatusColor(meal.status, meal.coverageScore) }}
                            />
                            <span className="text-[10px] font-medium" style={{ color: getStatusColor(meal.status, meal.coverageScore) }}>
                              {meal.coverageScore}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-[var(--text-muted)]">—</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}