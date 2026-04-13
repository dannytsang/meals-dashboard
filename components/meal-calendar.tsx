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
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3, 13));
  
  const getMealsForDate = (date: Date): MealCoverage[] => {
    const dateStr = date.toISOString().split('T')[0];
    return coverage.filter(c => c.meal.date === dateStr);
  };
  
  const getStatusStyles = (date: Date) => {
    const meals = getMealsForDate(date);
    if (meals.length === 0) {
      return {
        bg: 'var(--bg-secondary)',
        border: 'var(--border-color)',
        dot: 'var(--text-muted)'
      };
    }
    
    const avgCoverage = meals.reduce((sum, m) => sum + m.coverageScore, 0) / meals.length;
    if (avgCoverage >= 80) {
      return {
        bg: 'var(--accent-emerald-bg)',
        border: 'var(--accent-emerald)',
        dot: 'var(--accent-emerald)'
      };
    }
    if (avgCoverage >= 50) {
      return {
        bg: 'var(--accent-amber-bg)',
        border: 'var(--accent-amber)',
        dot: 'var(--accent-amber)'
      };
    }
    return {
      bg: 'var(--accent-rose-bg)',
      border: 'var(--accent-rose)',
      dot: 'var(--accent-rose)'
    };
  };
  
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
  
  const getWeekDates = (): Date[] => {
    const dates: Date[] = [];
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
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
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Meal Calendar
        </h3>
        <div className="flex items-center gap-4">
          <button 
            onClick={prevWeek}
            className="p-2 rounded-lg border border-[var(--border-color)] hover:border-[var(--border-light)] transition-all"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <span className="text-[var(--text-primary)] font-medium min-w-[140px] text-center">
            {monthYear}
          </span>
          <button 
            onClick={nextWeek}
            className="p-2 rounded-lg border border-[var(--border-color)] hover:border-[var(--border-light)] transition-all"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <ChevronRight className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
      </div>
      
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[var(--border-color)]">
        {DAYS.map(day => (
          <div 
            key={day} 
            className="px-2 py-3 text-center text-xs font-medium text-[var(--text-muted)] uppercase"
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {weekDates.map((date, idx) => {
          const meals = getMealsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();
          const styles = getStatusStyles(date);
          
          return (
            <div 
              key={idx}
              className="min-h-[100px] p-3 border-b border-r border-[var(--border-color)] last:border-r-0 transition-all"
              style={{ 
                backgroundColor: styles.bg,
                borderLeftWidth: idx === 0 ? '0' : '1px',
                borderLeftColor: idx > 0 ? 'var(--border-color)' : 'transparent'
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span 
                  className="text-sm font-medium"
                  style={{ color: isToday ? 'var(--accent-emerald)' : 'var(--text-primary)' }}
                >
                  {date.getDate()}
                </span>
                {isToday && (
                  <span 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: 'var(--accent-emerald)' }}
                  />
                )}
              </div>
              
              {meals.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <div 
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: styles.dot }}
                    />
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {meals.length} meal{meals.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${meals.reduce((sum, m) => sum + m.coverageScore, 0) / meals.length}%`,
                        backgroundColor: styles.dot
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
      <div className="px-6 py-3 flex items-center gap-6 text-xs" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--accent-emerald)', opacity: 0.4 }} />
          <span className="text-[var(--text-tertiary)]">High (80%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--accent-amber)', opacity: 0.4 }} />
          <span className="text-[var(--text-tertiary)]">Medium (50-79%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--accent-rose)', opacity: 0.4 }} />
          <span className="text-[var(--text-tertiary)]">Low (&lt;50%)</span>
        </div>
      </div>
    </div>
  );
}