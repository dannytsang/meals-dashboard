'use client';

import { CircleCheck, CircleAlert, CircleX, CircleHelp } from 'lucide-react';
import { MealCoverage } from '@/lib/meals-data';
import { StatusFilter as StatusFilterType } from '@/lib/dashboard-state';

interface StatusFilterProps {
  coverage: MealCoverage[];
  currentFilter: StatusFilterType;
  onFilterChange: (filter: StatusFilterType) => void;
}

const filters: { key: StatusFilterType; label: string; icon: typeof CircleCheck }[] = [
  { key: 'all', label: 'All', icon: CircleCheck },
  { key: 'covered', label: 'Covered', icon: CircleCheck },
  { key: 'partial', label: 'Partial', icon: CircleAlert },
  { key: 'missing', label: 'Missing', icon: CircleX },
  { key: 'unknown', label: 'Unknown', icon: CircleHelp },
];

export function StatusFilter({ coverage, currentFilter, onFilterChange }: StatusFilterProps) {
  const getCounts = () => {
    const counts: Record<string, number> = { all: coverage.length };
    coverage.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  };
  
  const counts = getCounts();
  
  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
        Filter by Status
      </h3>
      <div className="flex flex-wrap gap-2">
        {filters.map(({ key, label, icon: Icon }) => {
          const count = counts[key] || 0;
          const isSelected = currentFilter === key;
          
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all"
              style={{
                backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                borderColor: isSelected ? 'var(--border-light)' : 'var(--border-color)',
              }}
            >
              <Icon 
                className="w-4 h-4" 
                style={{ 
                  color: isSelected ? 'var(--accent-emerald)' : 'var(--text-tertiary)',
                  opacity: isSelected ? 1 : 0.6
                }} 
              />
              <span 
                className="text-sm font-medium"
                style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              >
                {label}
              </span>
              <span 
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ 
                  backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
