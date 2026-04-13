'use client';

import { useState } from 'react';
import { MealCoverage } from '@/lib/meals-data';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface MealListInteractiveProps {
  coverage: MealCoverage[];
}

export function MealListInteractive({ coverage }: MealListInteractiveProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'covered': return 'var(--accent-emerald)';
      case 'partial': return 'var(--accent-amber)';
      case 'missing': return 'var(--accent-rose)';
      default: return 'var(--text-muted)';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'covered': return '✓';
      case 'partial': return '◧';
      case 'missing': return '✗';
      default: return '?';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Today';
    if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-1">
      {coverage.map((item) => {
        const isExpanded = expandedId === `${item.meal.date}-${item.meal.content}`;
        
        return (
          <div key={`${item.meal.date}-${item.meal.content}`}>
            <button
              onClick={() => setExpandedId(isExpanded ? null : `${item.meal.date}-${item.meal.content}`)}
              className="w-full flex items-center gap-2 p-2 rounded transition-fast hover:bg-[var(--bg-tertiary)]"
            >
              <span 
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                style={{ backgroundColor: getStatusColor(item.status), color: 'white' }}
              >
                {getStatusIcon(item.status)}
              </span>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">{item.meal.content}</p>
                <p className="text-xs text-[var(--text-muted)]">{formatDate(item.meal.date)}</p>
              </div>
              <span className="text-xs font-medium" style={{ color: getStatusColor(item.status) }}>
                {item.coverageScore}%
              </span>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>
            
            {isExpanded && (
              <div className="ml-7 mr-2 mb-2 p-2 rounded text-xs" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {item.missingItems && item.missingItems.length > 0 && (
                  <div>
                    <p className="text-[var(--text-muted)] mb-1">Missing:</p>
                    <div className="flex flex-wrap gap-1">
                      {item.missingItems.map((missing: string, idx: number) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)' }}>
                          ✗ {missing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {!item.missingItems?.length && !item.matchedItems?.length && (
                  <p className="text-[var(--text-muted)] text-center py-2">No ingredient details available</p>
                )}
              </div>
            )}
          </div>
        );
      })}
      
      {coverage.length === 0 && (
        <p className="text-center py-4 text-xs text-[var(--text-muted)]">No meals match the current filter</p>
      )}
    </div>
  );
}