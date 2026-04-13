'use client';

import { MealCoverage } from '@/lib/meals-data';

interface MissingItemsProps {
  coverage: MealCoverage[];
}

export function MissingItems({ coverage }: MissingItemsProps) {
  // Aggregate all missing items across meals
  const missingItems: Record<string, { count: number; meals: string[] }> = {};
  
  coverage.forEach(c => {
    if (c.status === 'partial' || c.status === 'missing') {
      c.missingItems.forEach(item => {
        const normalized = item.toLowerCase().trim();
        if (!missingItems[normalized]) {
          missingItems[normalized] = { count: 0, meals: [] };
        }
        missingItems[normalized].count++;
        if (!missingItems[normalized].meals.includes(c.meal.content)) {
          missingItems[normalized].meals.push(c.meal.content);
        }
      });
    }
  });
  
  const sortedMissing = Object.entries(missingItems)
    .sort((a, b) => b[1].count - a[1].count);
  
  if (sortedMissing.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Shopping List
        </h3>
        <div className="text-center py-8">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-[var(--text-secondary)]">All ingredients covered!</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">No missing items for current meal plan</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Shopping List
        </h3>
        <span className="text-xs px-2 py-1 rounded-full" style={{ 
          backgroundColor: 'var(--accent-amber-bg)', 
          color: 'var(--accent-amber)' 
        }}>
          {sortedMissing.length} items
        </span>
      </div>
      
      <div className="space-y-2">
        {sortedMissing.map(([item, data]) => (
          <div 
            key={item}
            className="flex items-center justify-between p-3 rounded-lg border"
            style={{ 
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)'
            }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
                style={{ 
                  backgroundColor: 'var(--accent-rose-bg)', 
                  color: 'var(--accent-rose)' 
                }}
              >
                {data.count}
              </div>
              <span className="text-[var(--text-primary)] capitalize">{item}</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">
                {data.meals.length} meal{data.meals.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
        <button 
          className="w-full py-2 px-4 rounded-lg text-sm font-medium transition-all"
          style={{ 
            backgroundColor: 'var(--accent-emerald-bg)', 
            color: 'var(--accent-emerald)',
            border: '1px solid var(--accent-emerald-border)'
          }}
          onClick={() => {
            // Copy to clipboard functionality would go here
            const text = sortedMissing.map(([item]) => item).join('\n');
            navigator.clipboard.writeText(text);
          }}
        >
          Copy to Clipboard
        </button>
      </div>
    </div>
  );
}