'use client';

import { MealCoverage, TescoReceipt } from '@/lib/meals-data';

interface WeeklySummaryProps {
  coverage: MealCoverage[];
  receipt: TescoReceipt | null;
}

export function WeeklySummary({ coverage }: WeeklySummaryProps) {
  const totalMeals = coverage.length;
  const covered = coverage.filter(c => c.status === 'covered').length;
  const partial = coverage.filter(c => c.status === 'partial').length;
  const missing = coverage.filter(c => c.status === 'missing').length;
  
  const avgCoverage = totalMeals > 0 
    ? Math.round(coverage.reduce((sum, c) => sum + c.coverageScore, 0) / totalMeals)
    : 0;
  
  return (
    <div className="card p-4">
      <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
        Weekly Stats
      </h3>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-2 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <p className="text-xl font-bold" style={{ color: 'var(--accent-emerald)' }}>{totalMeals}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Meals</p>
        </div>
        <div className="text-center p-2 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <p className="text-xl font-bold" style={{ color: 'var(--accent-emerald)' }}>{avgCoverage}%</p>
          <p className="text-[10px] text-[var(--text-muted)]">Avg Coverage</p>
        </div>
        <div className="text-center p-2 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <p className="text-xl font-bold" style={{ color: 'var(--accent-amber)' }}>{partial + missing}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Need Items</p>
        </div>
        <div className="text-center p-2 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <p className="text-xl font-bold" style={{ color: 'var(--accent-blue)' }}>{covered}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Covered</p>
        </div>
      </div>
    </div>
  );
}