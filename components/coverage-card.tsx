'use client';

import { CoverageSummary } from '@/lib/meals-data';

interface CoverageCardProps {
  summary: CoverageSummary;
}

export function CoverageCard({ summary }: CoverageCardProps) {
  const { totalMeals, covered, partial, missing, coveragePercentage } = summary;
  
  // Color based on coverage
  const getColor = (pct: number) => {
    if (pct >= 80) return 'var(--accent-emerald)';
    if (pct >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };
  
  const progressColor = getColor(coveragePercentage);
  const circumference = 2 * Math.PI * 44; // radius = 44
  const offset = circumference - (coveragePercentage / 100) * circumference;
  
  return (
    <div className="card p-6">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Coverage Overview
      </h3>
      
      <div className="flex items-center gap-6">
        {/* Circular Progress with SVG */}
        <div className="relative shrink-0 w-24 h-24">
          <svg width="96" height="96" className="transform -rotate-90">
            <circle
              cx="48" cy="48" r="44"
              fill="none"
              stroke="var(--bg-tertiary)"
              strokeWidth="8"
            />
            <circle
              cx="48" cy="48" r="44"
              fill="none"
              stroke={progressColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.7s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-[var(--text-primary)]">{coveragePercentage}%</span>
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex-1 min-w-0">
          <p className="text-[var(--text-secondary)] text-sm">
            <span className="text-[var(--accent-emerald)] font-bold">{covered}</span> of{' '}
            <span className="text-[var(--text-primary)] font-bold">{totalMeals}</span> meals fully covered
          </p>
          {partial > 0 && (
            <p className="text-[var(--accent-amber)] text-sm mt-1">
              {partial} meal{partial > 1 ? 's' : ''} partially covered
            </p>
          )}
          {missing > 0 && (
            <p className="text-[var(--accent-rose)] text-sm mt-1">
              {missing} meal{missing > 1 ? 's' : ''} missing ingredients
            </p>
          )}
        </div>
      </div>
      
      {/* Progress bars */}
      <div className="mt-6 space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-[var(--text-tertiary)]">Covered</span>
            <span className="text-[var(--accent-emerald)] font-medium">{covered}</span>
          </div>
          <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(covered / totalMeals) * 100}%`, backgroundColor: 'var(--accent-emerald)' }}
            />
          </div>
        </div>
        
        {partial > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-[var(--text-tertiary)]">Partial</span>
              <span className="text-[var(--accent-amber)] font-medium">{partial}</span>
            </div>
            <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(partial / totalMeals) * 100}%`, backgroundColor: 'var(--accent-amber)' }}
              />
            </div>
          </div>
        )}
        
        {missing > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-[var(--text-tertiary)]">Missing</span>
              <span className="text-[var(--accent-rose)] font-medium">{missing}</span>
            </div>
            <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(missing / totalMeals) * 100}%`, backgroundColor: 'var(--accent-rose)' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}