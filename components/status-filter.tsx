'use client';

import type { StatusFilter } from '@/lib/dashboard-state';
import { getFilterStats } from '@/lib/dashboard-state';
import { MealCoverage } from '@/lib/meals-data';
import { CheckCircle2, AlertCircle, XCircle, HelpCircle } from 'lucide-react';

interface StatusFilterProps {
  coverage: MealCoverage[];
  currentFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

const filterConfig: Record<StatusFilter, { 
  label: string; 
  icon: typeof CheckCircle2;
  color: string;
  bgColor: string;
}> = {
  all: { label: 'All', icon: null as unknown as typeof CheckCircle2, color: 'text-white', bgColor: 'bg-slate-600' },
  covered: { label: 'Covered', icon: CheckCircle2, color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  partial: { label: 'Partial', icon: AlertCircle, color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  missing: { label: 'Missing', icon: XCircle, color: 'text-rose-400', bgColor: 'bg-rose-500/20' },
  unknown: { label: 'Unknown', icon: HelpCircle, color: 'text-slate-400', bgColor: 'bg-slate-500/20' },
};

export function StatusFilter({ coverage, currentFilter, onFilterChange }: StatusFilterProps) {
  const stats = getFilterStats(coverage);
  const filters: StatusFilter[] = ['all', 'covered', 'partial', 'missing', 'unknown'];
  
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
        Filter by Status
      </h3>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const config = filterConfig[filter];
          const count = stats[filter];
          const isSelected = currentFilter === filter;
          
          return (
            <button
              key={filter}
              onClick={() => onFilterChange(filter)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                isSelected
                  ? `${config.bgColor} border-transparent`
                  : 'bg-slate-750 border-slate-700 hover:border-slate-600'
              }`}
            >
              {filter !== 'all' && (
                <config.icon className={`w-4 h-4 ${isSelected ? config.color : 'text-slate-400'}`} />
              )}
              <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                {config.label}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isSelected ? 'bg-slate-600 text-white' : 'bg-slate-700 text-slate-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
