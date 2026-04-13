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
    if (score >= 80) {
      return { 
        bg: 'var(--accent-emerald-bg)', 
        border: 'var(--accent-emerald)', 
        text: 'var(--accent-emerald)', 
        dot: 'var(--accent-emerald)' 
      };
    }
    if (score >= 50) {
      return { 
        bg: 'var(--accent-amber-bg)', 
        border: 'var(--accent-amber)', 
        text: 'var(--accent-amber)', 
        dot: 'var(--accent-amber)' 
      };
    }
    return { 
      bg: 'var(--accent-rose-bg)', 
      border: 'var(--accent-rose)', 
      text: 'var(--accent-rose)', 
      dot: 'var(--accent-rose)' 
    };
  };

  const getDayLabel = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    if (dateStr === today) return { label: 'Today', short: 'Today' };
    if (dateStr === tomorrow) return { label: 'Tomorrow', short: 'Tmrw' };
    
    const date = new Date(dateStr);
    return {
      label: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
      short: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    };
  };

  const groups = groupByDate();
  const dates = Object.keys(groups).sort();

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border-color)]">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Meal Plan Timeline
        </h3>
      </div>
      
      <div className="p-6">
        <div className="relative">
          {/* Vertical timeline line */}
          <div 
            className="absolute left-[19px] top-4 bottom-4 w-0.5" 
            style={{ backgroundColor: 'var(--border-color)' }}
          />
          
          <div className="space-y-4">
            {dates.map((date, idx) => {
              const meals = groups[date];
              const dayLabel = getDayLabel(date);
              const avgCoverage = meals.reduce((sum, m) => sum + m.coverageScore, 0) / meals.length;
              const status = getStatusStyles(avgCoverage);
              
              return (
                <div key={date} className="relative flex gap-4">
                  {/* Date indicator */}
                  <div className="flex flex-col items-center shrink-0">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center border-2"
                      style={{ 
                        backgroundColor: status.bg, 
                        borderColor: status.border 
                      }}
                    >
                      <span className="text-xs font-bold" style={{ color: status.text }}>
                        {new Date(date).getDate()}
                      </span>
                    </div>
                    {idx < dates.length - 1 && (
                      <div 
                        className="w-3 h-3 rounded-full mt-2"
                        style={{ backgroundColor: status.dot }}
                      />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div 
                    className="flex-1 p-4 rounded-lg border"
                    style={{ backgroundColor: status.bg, borderColor: status.border }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[var(--text-primary)] font-medium">{dayLabel.label}</span>
                      <span 
                        className="text-sm font-bold"
                        style={{ color: status.text }}
                      >
                        {avgCoverage}%
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {meals.map((m, i) => (
                        <div 
                          key={i}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs"
                          style={{ backgroundColor: 'var(--bg-tertiary)' }}
                        >
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: m.status === 'covered' ? 'var(--accent-emerald)' :
                                              m.status === 'partial' ? 'var(--accent-amber)' :
                                              m.status === 'unknown' ? 'var(--text-muted)' : 'var(--accent-rose)'
                            }}
                          />
                          <span className="text-[var(--text-secondary)] truncate max-w-[140px]">
                            {m.meal.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}