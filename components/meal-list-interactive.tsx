'use client';

import { MealCoverage } from '@/lib/meals-data';
import { useState } from 'react';
import { CheckCircle2, AlertCircle, XCircle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface MealListInteractiveProps {
  coverage: MealCoverage[];
}

const statusConfig = {
  covered: {
    icon: CheckCircle2,
    color: 'var(--accent-emerald)',
    bgColor: 'var(--accent-emerald-bg)',
    borderColor: 'var(--accent-emerald-border)',
    label: 'Covered',
  },
  partial: {
    icon: AlertCircle,
    color: 'var(--accent-amber)',
    bgColor: 'var(--accent-amber-bg)',
    borderColor: 'var(--accent-amber-border)',
    label: 'Partial',
  },
  missing: {
    icon: XCircle,
    color: 'var(--accent-rose)',
    bgColor: 'var(--accent-rose-bg)',
    borderColor: 'var(--accent-rose-border)',
    label: 'Missing',
  },
  unknown: {
    icon: HelpCircle,
    color: 'var(--text-muted)',
    bgColor: 'var(--bg-tertiary)',
    borderColor: 'var(--border-color)',
    label: 'Unknown',
  },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }
  
  return date.toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  });
}

function MealCard({ item }: { item: MealCoverage }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[item.status];
  const Icon = config.icon;
  
  return (
    <div 
      className="rounded-lg border overflow-hidden transition-all hover:shadow-md"
      style={{ 
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)'
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-start gap-4 text-left transition-colors"
        style={{ backgroundColor: 'transparent' }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <div 
          className="p-2 rounded-lg border"
          style={{ backgroundColor: config.bgColor, borderColor: config.borderColor }}
        >
          <Icon className="w-5 h-5" style={{ color: config.color }} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="text-[var(--text-primary)] font-medium truncate">{item.meal.content}</h4>
            <span 
              className="text-xs px-2 py-0.5 rounded-full border"
              style={{ 
                backgroundColor: config.bgColor, 
                color: config.color, 
                borderColor: config.borderColor 
              }}
            >
              {config.label}
            </span>
            {item.meal.labels.includes('adult') && item.meal.labels.includes('children') && (
              <span 
                className="text-xs px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', borderColor: 'transparent' }}
              >
                Family
              </span>
            )}
            {item.meal.labels.includes('adult') && !item.meal.labels.includes('children') && (
              <span 
                className="text-xs px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', borderColor: 'transparent' }}
              >
                Adults
              </span>
            )}
            {item.meal.labels.includes('children') && !item.meal.labels.includes('adult') && (
              <span 
                className="text-xs px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: 'var(--accent-pink-bg)', color: 'var(--accent-pink)', borderColor: 'transparent' }}
              >
                Kids
              </span>
            )}
          </div>
          
          <p className="text-[var(--text-secondary)] text-sm mt-1">{formatDate(item.meal.date)}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <span 
            className="text-xl font-bold"
            style={{ color: config.color }}
          >
            {item.coverageScore}%
          </span>
          <div 
            className="p-1 rounded transition-colors"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            )}
          </div>
        </div>
      </button>
      
      {expanded && (
        <div 
          className="px-5 pb-4 pt-0 mt-0"
          style={{ borderTop: '1px solid var(--border-color)' }}
        >
          <div className="pt-4 space-y-4">
            {item.matchedItems.length > 0 && (
              <div>
                <p 
                  className="text-xs mb-2 flex items-center gap-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--accent-emerald)' }} />
                  Matched items ({item.matchedItems.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.matchedItems.map((matched, idx) => (
                    <span 
                      key={idx}
                      className="text-sm px-3 py-1.5 rounded-lg border"
                      style={{ 
                        backgroundColor: 'var(--accent-emerald-bg)', 
                        color: 'var(--accent-emerald)', 
                        borderColor: 'var(--accent-emerald-border)'
                      }}
                    >
                      {matched}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {item.missingItems.length > 0 && (
              <div>
                <p 
                  className="text-xs mb-2 flex items-center gap-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <XCircle className="w-3 h-3" style={{ color: 'var(--accent-rose)' }} />
                  Missing items ({item.missingItems.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.missingItems.map((missing, idx) => (
                    <span 
                      key={idx}
                      className="text-sm px-3 py-1.5 rounded-lg border"
                      style={{ 
                        backgroundColor: 'var(--accent-rose-bg)', 
                        color: 'var(--accent-rose)', 
                        borderColor: 'var(--accent-rose-border)'
                      }}
                    >
                      {missing}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {item.notes && (
              <div 
                className="p-3 rounded-lg border"
                style={{ 
                  backgroundColor: 'var(--accent-amber-bg)', 
                  borderColor: 'var(--accent-amber-border)'
                }}
              >
                <p className="text-sm" style={{ color: 'var(--accent-amber)' }}>{item.notes}</p>
              </div>
            )}
            
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Task ID: {item.meal.id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MealListInteractive({ coverage }: MealListInteractiveProps) {
  const groupedMeals = coverage.reduce((acc, item) => {
    const date = item.meal.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(item);
    return acc;
  }, {} as Record<string, MealCoverage[]>);

  const sortedDates = Object.keys(groupedMeals).sort();
  
  const getAvgColor = (avg: number) => {
    if (avg >= 80) return 'var(--accent-emerald)';
    if (avg >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };
  
  return (
    <div className="space-y-6">
      {sortedDates.map((date) => {
        const meals = groupedMeals[date];
        const dateObj = new Date(date);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        let dateLabel: string;
        if (dateObj.toDateString() === today.toDateString()) {
          dateLabel = 'Today';
        } else if (dateObj.toDateString() === tomorrow.toDateString()) {
          dateLabel = 'Tomorrow';
        } else {
          dateLabel = dateObj.toLocaleDateString('en-GB', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
          });
        }
        
        const avgCoverage = Math.round(
          meals.reduce((sum, m) => sum + m.coverageScore, 0) / meals.length
        );
        
        return (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[var(--text-primary)] font-medium">{dateLabel}</h3>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ({meals.length} meal{meals.length > 1 ? 's' : ''})
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-color)' }} />
              <span 
                className="text-sm font-medium"
                style={{ color: getAvgColor(avgCoverage) }}
              >
                {avgCoverage}% avg
              </span>
            </div>
            <div className="space-y-2">
              {meals.map((item) => (
                <MealCard key={item.meal.id} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}