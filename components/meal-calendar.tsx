'use client';

import { MealCoverage } from '@/lib/meals-data';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface MealCalendarProps {
  coverage: MealCoverage[];
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function MealCalendar({ coverage }: MealCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3, 13)); // April 13, 2026
  
  // Get meals for a specific date
  const getMealsForDate = (date: Date): MealCoverage[] => {
    const dateStr = date.toISOString().split('T')[0];
    return coverage.filter(c => c.meal.date === dateStr);
  };
  
  // Check if date is in the meal plan range
  const isInRange = (date: Date): boolean => {
    const dateStr = date.toISOString().split('T')[0];
    return coverage.some(c => c.meal.date === dateStr);
  };
  
  // Get status color for a date
  const getStatusColor = (date: Date): string => {
    const meals = getMealsForDate(date);
    if (meals.length === 0) return 'bg-slate-800';
    
    const avgCoverage = meals.reduce((sum, m) => sum + m.coverageScore, 0) / meals.length;
    if (avgCoverage >= 80) return 'bg-emerald-500/20 border-emerald-500/40';
    if (avgCoverage >= 50) return 'bg-amber-500/20 border-amber-500/40';
    return 'bg-rose-500/20 border-rose-500/40';
  };
  
  // Navigation
  const prevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };
  
  const nextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };
  
  // Get dates for current week view
  const getWeekDates = (): Date[] => {
    const dates: Date[] = [];
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    startOfWeek.setDate(diff);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };
  
  const weekDates = getWeekDates();
  const monthYear = MONTHS[currentDate.getMonth()] + ' ' + currentDate.getFullYear();
  
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Meal Calendar
        </h3>
        <div className="flex items-center gap-4">
          <button 
            onClick={prevWeek}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <span className="text-white font-medium min-w-[140px] text-center">{monthYear}</span>
          <button 
            onClick={nextWeek}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>
      
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-700">
        {DAYS.map(day => (
          <div key={day} className="px-2 py-3 text-center text-xs font-medium text-slate-500 uppercase">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {weekDates.map((date, idx) => {
          const meals = getMealsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();
          const statusColor = getStatusColor(date);
          
          return (
            <div 
              key={idx}
              className={`min-h-[100px] p-2 border-b border-r border-slate-700 last:border-r-0 ${statusColor}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${isToday ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {date.getDate()}
                </span>
                {isToday && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </div>
              
              {/* Meal count indicator */}
              {meals.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-400">
                    {meals.length} meal{meals.length > 1 ? 's' : ''}
                  </p>
                  {/* Mini coverage bar */}
                  <div className="w-full bg-slate-600 rounded-full h-1">
                    <div 
                      className={`h-1 rounded-full ${
                        meals.some(m => m.status === 'covered') ? 'bg-emerald-500' :
                        meals.some(m => m.status === 'partial') ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`}
                      style={{ 
                        width: `${meals.reduce((sum, m) => sum + m.coverageScore, 0) / meals.length}%` 
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="px-6 py-3 bg-slate-750 flex items-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-500/40" />
          <span className="text-slate-400">High coverage (80%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-500/40" />
          <span className="text-slate-400">Medium coverage (50-79%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-rose-500/40" />
          <span className="text-slate-400">Low coverage (&lt;50%)</span>
        </div>
      </div>
    </div>
  );
}
