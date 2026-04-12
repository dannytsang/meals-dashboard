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

function MealCard({ item }: { item: MealCoverage }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[item.status];
  const Icon = config.icon;
  
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-start gap-4 hover:bg-slate-750 transition-colors text-left"
      >
        <div className={`p-2 rounded-lg ${config.bgColor} ${config.borderColor} border`}>
          <Icon className={`w-5 h-5 ${config.color}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="text-white font-medium truncate">{item.meal.content}</h4>
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
          
          <p className="text-slate-400 text-sm mt-1">{formatDate(item.meal.date)}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className={`text-xl font-bold ${config.color}`}>{item.coverageScore}%</span>
          <div className={`p-1 rounded ${expanded ? 'bg-slate-600' : 'bg-slate-700'}`}>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            )}
          </div>
        </div>
      </button>
      
      {expanded && (
        <div className="px-6 pb-4 pt-0 border-t border-slate-700 mt-0">
          <div className="pt-4 space-y-4">
            {item.matchedItems.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Matched items ({item.matchedItems.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.matchedItems.map((matched, idx) => (
                    <span 
                      key={idx}
                      className="text-sm px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                    >
                      {matched}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {item.missingItems.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                  <XCircle className="w-3 h-3 text-rose-400" />
                  Missing items ({item.missingItems.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.missingItems.map((missing, idx) => (
                    <span 
                      key={idx}
                      className="text-sm px-3 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20"
                    >
                      {missing}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {item.notes && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-300">{item.notes}</p>
              </div>
            )}
            
            <div className="text-xs text-slate-500">
              Task ID: {item.meal.id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MealListInteractive({ coverage }: MealListInteractiveProps) {
  // Group by date
  const groupedMeals = coverage.reduce((acc, item) => {
    const date = item.meal.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(item);
    return acc;
  }, {} as Record<string, MealCoverage[]>);

  const sortedDates = Object.keys(groupedMeals).sort();
  
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
              <h3 className="text-white font-medium">{dateLabel}</h3>
              <span className="text-xs text-slate-500">({meals.length} meal{meals.length > 1 ? 's' : ''})</span>
              <div className="flex-1 h-px bg-slate-700" />
              <span className={`text-sm font-medium ${
                avgCoverage >= 80 ? 'text-emerald-400' :
                avgCoverage >= 50 ? 'text-amber-400' :
                'text-rose-400'
              }`}>
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
