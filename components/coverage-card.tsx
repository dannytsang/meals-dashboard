'use client';

import { CoverageSummary } from '@/lib/meals-data';

interface CoverageCardProps {
  summary: CoverageSummary;
}

export function CoverageCard({ summary }: CoverageCardProps) {
  const { totalMeals, covered, partial, missing, coveragePercentage } = summary;
  
  // SVG circle settings
  const size = 96;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (coveragePercentage / 100) * circumference;
  
  const colorClass = coveragePercentage >= 80 
    ? 'text-emerald-500' 
    : coveragePercentage >= 50 
    ? 'text-amber-500' 
    : 'text-rose-500';
  
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
        Coverage Overview
      </h3>
      
      <div className="flex items-center gap-6">
        {/* Circular Progress */}
        <div className="relative shrink-0">
          <svg 
            width={size} 
            height={size} 
            className="transform -rotate-90"
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-slate-700"
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={`transition-all duration-700 ${colorClass}`}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{coveragePercentage}%</span>
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex-1 min-w-0">
          <p className="text-slate-300 text-sm">
            <span className="text-emerald-400 font-bold">{covered}</span> of{' '}
            <span className="text-white font-bold">{totalMeals}</span> meals fully covered
          </p>
          {partial > 0 && (
            <p className="text-amber-400 text-sm mt-1">
              {partial} meal{partial > 1 ? 's' : ''} partially covered
            </p>
          )}
          {missing > 0 && (
            <p className="text-rose-400 text-sm mt-1">
              {missing} meal{missing > 1 ? 's' : ''} missing ingredients
            </p>
          )}
        </div>
      </div>
      
      {/* Progress bars */}
      <div className="mt-6 space-y-3">
        {/* Covered */}
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-slate-400">Covered</span>
            <span className="text-emerald-400 font-medium">{covered}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${(covered / totalMeals) * 100}%` }}
            />
          </div>
        </div>
        
        {partial > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-400">Partial</span>
              <span className="text-amber-400 font-medium">{partial}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-700"
                style={{ width: `${(partial / totalMeals) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {missing > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-400">Missing</span>
              <span className="text-rose-400 font-medium">{missing}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-rose-500 rounded-full transition-all duration-700"
                style={{ width: `${(missing / totalMeals) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
