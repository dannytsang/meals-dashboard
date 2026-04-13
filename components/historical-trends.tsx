'use client';

interface TrendData {
  date: string;
  label: string;
  coverage: number;
  meals: number;
}

interface HistoricalTrendsProps {
  // For now, we'll show mock historical data based on available info
  currentCoverage: number;
}

export function HistoricalTrends({ currentCoverage }: HistoricalTrendsProps) {
  // Generate sample historical data points
  // In a real implementation, this would come from stored history
  const trends: TrendData[] = [
    { date: '2026-04-06', label: '6 Apr', coverage: 72, meals: 14 },
    { date: '2026-04-07', label: '7 Apr', coverage: 85, meals: 12 },
    { date: '2026-04-08', label: '8 Apr', coverage: 68, meals: 15 },
    { date: '2026-04-09', label: '9 Apr', coverage: 91, meals: 13 },
    { date: '2026-04-10', label: '10 Apr', coverage: 78, meals: 14 },
    { date: '2026-04-11', label: '11 Apr', coverage: 65, meals: 11 },
    { date: '2026-04-12', label: 'Yesterday', coverage: currentCoverage, meals: 15 },
  ];
  
  const maxCoverage = Math.max(...trends.map(t => t.coverage), 100);
  const minCoverage = Math.min(...trends.map(t => t.coverage), 0);
  const avgTrend = Math.round(trends.reduce((s, t) => s + t.coverage, 0) / trends.length);
  const trendDirection = currentCoverage >= avgTrend ? 'up' : 'down';
  
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Coverage Trend
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]">7-day avg:</span>
          <span 
            className="font-bold"
            style={{ color: trendDirection === 'up' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}
          >
            {avgTrend}%
          </span>
          <span style={{ color: trendDirection === 'up' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
            {trendDirection === 'up' ? '↑' : '↓'}
          </span>
        </div>
      </div>
      
      {/* Sparkline chart */}
      <div className="h-24 mb-4 flex items-end gap-1">
        {trends.map((t, i) => {
          const height = ((t.coverage - minCoverage) / (maxCoverage - minCoverage)) * 100 || 10;
          const isCurrentDay = i === trends.length - 1;
          
          return (
            <div 
              key={t.date} 
              className="flex-1 flex flex-col items-center gap-1 group relative"
            >
              {/* Tooltip */}
              <div 
                className="absolute bottom-full mb-2 hidden group-hover:block z-10 px-2 py-1 rounded text-xs whitespace-nowrap"
                style={{ 
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}
              >
                <p className="font-medium">{t.label}</p>
                <p style={{ color: 'var(--text-muted)' }}>{t.coverage}% • {t.meals} meals</p>
              </div>
              
              {/* Bar */}
              <div 
                className="w-full rounded-t transition-all duration-300"
                style={{ 
                  height: `${height}%`,
                  backgroundColor: isCurrentDay ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  opacity: isCurrentDay ? 1 : 0.4
                }}
              />
            </div>
          );
        })}
      </div>
      
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[var(--border-color)]">
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: 'var(--accent-emerald)' }}>
            {Math.max(...trends.map(t => t.coverage))}%
          </p>
          <p className="text-xs text-[var(--text-muted)]">Best</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold">{avgTrend}%</p>
          <p className="text-xs text-[var(--text-muted)]">Average</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: 'var(--accent-rose)' }}>
            {Math.min(...trends.map(t => t.coverage))}%
          </p>
          <p className="text-xs text-[var(--text-muted)]">Lowest</p>
        </div>
      </div>
    </div>
  );
}