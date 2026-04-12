'use client';

import { CoverageSummary } from '@/lib/meals-data';

interface CoverageCardProps {
  summary: CoverageSummary;
}

export function CoverageCard({ summary }: CoverageCardProps) {
  const { totalMeals, covered, partial, missing, coveragePercentage } = summary;
  
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
        Coverage Overview
      </h3>
      
      <div className="flex items-center gap-4 mb-6">
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-slate-700"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className={coveragePercentage >= 80 ? 'text-emerald-500' : coveragePercentage >= 50 ? 'text-amber-500' : 'text-rose-500'}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${coveragePercentage}, 100`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{coveragePercentage}%</span>
          </div>
        </div>
        
        <div className="flex-1">
          <p className="text-slate-300 text-sm">
            {covered} of {totalMeals} meals fully covered
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
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Covered</span>
          <span className="text-emerald-400 font-medium">{covered}</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div 
            className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(covered / totalMeals) * 100}%` }}
          />
        </div>
        
        {partial > 0 && (
          <>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-slate-400">Partial</span>
              <span className="text-amber-400 font-medium">{partial}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(partial / totalMeals) * 100}%` }}
              />
            </div>
          </>
        )}
        
        {missing > 0 && (
          <>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-slate-400">Missing</span>
              <span className="text-rose-400 font-medium">{missing}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-rose-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(missing / totalMeals) * 100}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
