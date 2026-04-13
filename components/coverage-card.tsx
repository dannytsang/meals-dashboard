'use client';

import { CoverageSummary } from '@/lib/meals-data';

interface CoverageCardProps {
  summary: CoverageSummary;
}

export function CoverageCard({ summary }: CoverageCardProps) {
  const { totalMeals, covered, partial, missing, coveragePercentage } = summary;
  
  const progressColor = coveragePercentage >= 80 ? 'var(--accent-emerald)' : 
                        coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (coveragePercentage / 100) * circumference;
  
  return (
    <div className="card p-4">
      <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
        Coverage
      </h3>
      
      <div className="flex items-center gap-4">
        {/* Ring */}
        <div className="relative w-20 h-20 shrink-0">
          <svg width="80" height="80" className="transform -rotate-90">
            <circle cx="40" cy="40" r="40" fill="none" stroke="var(--bg-tertiary)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="40"
              fill="none"
              stroke={progressColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.5s' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-[var(--text-primary)]">{coveragePercentage}%</span>
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="font-bold" style={{ color: 'var(--accent-emerald)' }}>{covered}</span>
            <span className="text-[var(--text-muted)]"> / </span>
            <span className="font-bold text-[var(--text-primary)]">{totalMeals}</span>
            <span className="text-[var(--text-muted)]"> meals</span>
          </p>
          {partial > 0 && (
            <p className="text-xs" style={{ color: 'var(--accent-amber)' }}>
              {partial} partial
            </p>
          )}
          {missing > 0 && (
            <p className="text-xs" style={{ color: 'var(--accent-rose)' }}>
              {missing} missing
            </p>
          )}
        </div>
      </div>
      
      {/* Mini progress bars */}
      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-[var(--text-muted)]">Covered</span>
          <span style={{ color: 'var(--accent-emerald)' }}>{covered}</span>
        </div>
        <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(covered / totalMeals) * 100}%`, backgroundColor: 'var(--accent-emerald)' }} />
        </div>
      </div>
    </div>
  );
}