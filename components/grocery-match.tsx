'use client';

import { MealCoverage, TescoReceipt } from '@/lib/meals-data';

interface GroceryMatchProps {
  coverage: MealCoverage[];
  receipt: TescoReceipt | null;
}

export function GroceryMatch({ coverage, receipt }: GroceryMatchProps) {
  if (!receipt) {
    return null;
  }

  const getCategories = () => {
    const categories: Record<string, { count: number; items: string[] }> = {};
    
    receipt.items.forEach(item => {
      const cat = item.category || 'Other';
      if (!categories[cat]) {
        categories[cat] = { count: 0, items: [] };
      }
      categories[cat].count++;
      if (categories[cat].items.length < 3) {
        categories[cat].items.push(item.name);
      }
    });
    
    return Object.entries(categories)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);
  };

  const categoryColors: Record<string, string> = {
    'Fresh': 'var(--accent-emerald)',
    'Dairy': 'var(--accent-amber)', 
    'Meat': 'var(--accent-rose)',
    'Frozen': 'var(--accent-blue)',
    'Bakery': '#eab308',
    'Pantry': 'var(--accent-purple)',
    'Beverages': 'var(--accent-cyan)',
    'Other': 'var(--text-tertiary)',
  };

  const categories = getCategories();
  const maxCount = Math.max(...categories.map(c => c[1].count));
  
  return (
    <div className="card p-6">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Grocery Categories
      </h3>
      
      <div className="space-y-4">
        {categories.map(([cat, data]) => {
          const color = categoryColors[cat] || categoryColors['Other'];
          const pct = (data.count / maxCount) * 100;
          
          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                  <span className="text-[var(--text-primary)] text-sm">{cat}</span>
                </div>
                <span className="text-[var(--text-tertiary)] text-sm">{data.count}</span>
              </div>
              <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
        <p className="text-xs text-[var(--text-muted)] mb-2">Top items:</p>
        <div className="flex flex-wrap gap-1">
          {categories.slice(0, 3).flatMap(([cat, data]) => 
            data.items.slice(0, 2).map((item, i) => (
              <span 
                key={i} 
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                {item.length > 20 ? item.slice(0, 20) + '...' : item}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
