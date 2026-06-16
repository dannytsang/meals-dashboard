'use client';

import { MealCoverage } from '@/lib/meals-data';
import { CheckCircle2, AlertCircle, XCircle, HelpCircle, ChefHat } from 'lucide-react';

interface MealListProps {
  coverage: MealCoverage[];
}

const statusConfig = {
  covered: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    label: 'Covered',
  },
  partial: {
    icon: AlertCircle,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    label: 'Partial',
  },
  missing: {
    icon: XCircle,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/20',
    label: 'Missing',
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/20',
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

export function MealList({ coverage }: MealListProps) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Meal Plan & Coverage
        </h3>
      </div>
      
      <div className="divide-y divide-slate-700">
        {coverage.map((item) => {
          const config = statusConfig[item.status];
          const Icon = config.icon;
          
          return (
            <div 
              key={item.meal.id}
              className="px-6 py-4 hover:bg-slate-750 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${config.bgColor} ${config.borderColor} border`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="text-white font-medium truncate">
                      {item.meal.content}
                    </h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                      {config.label}
                    </span>
                    {item.meal.labels.includes('adult') && item.meal.labels.includes('children') && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Family
                      </span>
                    )}
                    {item.meal.labels.includes('adult') && !item.meal.labels.includes('children') && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        Adults
                      </span>
                    )}
                    {item.meal.labels.includes('children') && !item.meal.labels.includes('adult') && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                        Kids
                      </span>
                    )}
                  </div>
                  
                  <p className="text-slate-400 text-sm mt-1">
                    {formatDate(item.meal.date)}
                  </p>
                  
                  {item.matchedItems.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 mb-1">Matched items:</p>
                      <div className="flex flex-wrap gap-1">
                        {item.matchedItems.map((matched, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300"
                          >
                            {matched.name}
                            {matched.source === 'grocy' && (
                              <span title="In your Grocy pantry" className="ml-1">🏠</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {item.missingItems.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-rose-400 mb-1">Missing:</p>
                      <div className="flex flex-wrap gap-1">
                        {item.missingItems.map((missing, idx) => (
                          <span 
                            key={idx}
                            className="text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          >
                            {missing}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {item.notes && (
                    <p className="text-xs text-amber-400 mt-2">
                      Note: {item.notes}
                    </p>
                  )}
                </div>
                
                <div className="text-right">
                  <span className={`text-lg font-bold ${config.color}`}>
                    {item.coverageScore}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
