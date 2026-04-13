'use client';

import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { GroceryMatch } from '@/components/grocery-match';
import { HistoricalTrends } from '@/components/historical-trends';
import { Chart } from '@/components/chart';
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries } from '@/lib/meals-data';
import { realCoverage, realLatestOrder, transformCachedOrder } from '@/lib/real-data';
import { DashboardState, filterCoverage } from '@/lib/dashboard-state';
import { Check, X, AlertTriangle, Calendar, TrendingUp } from 'lucide-react';

export default function MealsDashboardPage() {
  const [state] = useState<DashboardState>({
    selectedShop: 'current',
    statusFilter: 'all',
    expandedMealId: null,
    dateRange: { start: '2026-04-13', end: '2026-04-19' },
  });

  const receipt = transformCachedOrder(realLatestOrder);
  const deliveries = getUpcomingDeliveries();
  const coverage = realCoverage;
  const filteredCoverage = filterCoverage(coverage, state.statusFilter);
  const summary = calculateCoverageSummary(coverage);
  
  const covered = coverage.filter(c => c.status === 'covered').length;
  const missing = coverage.filter(c => c.status === 'missing').length;
  const partial = coverage.filter(c => c.status === 'partial').length;

  // Group coverage by date
  const coverageByDate: Record<string, typeof coverage> = {};
  coverage.forEach(c => {
    const date = c.meal.date;
    if (!coverageByDate[date]) coverageByDate[date] = [];
    coverageByDate[date].push(c);
  });
  
  const dates = Object.keys(coverageByDate).sort();
  
  // Generate array of all days in range
  const startDate = dates[0] ? new Date(dates[0]) : new Date();
  const endDate = dates[dates.length - 1] ? new Date(dates[dates.length - 1]) : new Date();
  
  const days: { date: string; isToday: boolean }[] = [];
  const current = new Date(startDate);
  const today = new Date().toISOString().split('T')[0];
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    days.push({ date: dateStr, isToday: dateStr === today });
    current.setDate(current.getDate() + 1);
  }

  // Unmatched groceries
  const unmatchedItems = receipt 
    ? receipt.items.filter(item => {
        const itemLower = item.name.toLowerCase();
        return !coverage.some(c => c.meal.content.toLowerCase().includes(itemLower));
      }).slice(0, 10)
    : [];

  const getStatusColor = (status: string, score: number) => {
    if (status === 'covered' || score >= 80) return 'var(--accent-emerald)';
    if (status === 'partial' || score >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header 
        className="sticky top-0 z-50 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">🍽️ {dashboardConfig.name}</h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Widget Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {/* Order Total */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check className="w-4 h-4" style={{ color: 'var(--accent-emerald)' }} />
              </div>
              <span className="text-xs text-[var(--text-muted)]">Order total</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">£{receipt?.orderTotal.toFixed(2) || '—'}</p>
          </div>

          {/* Delivery */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-blue-bg)' }}>
                <Calendar className="w-4 h-4" style={{ color: 'var(--accent-blue)' }} />
              </div>
              <span className="text-xs text-[var(--text-muted)]">Delivery</span>
            </div>
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {deliveries[0] ? new Date(deliveries[0].date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
            </p>
          </div>

          {/* Meals Covered */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check className="w-4 h-4" style={{ color: 'var(--accent-emerald)' }} />
              </div>
              <span className="text-xs text-[var(--text-muted)]">Meals covered</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{covered}/{coverage.length}</p>
          </div>

          {/* Unmatched */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-rose-bg)' }}>
                <X className="w-4 h-4" style={{ color: 'var(--accent-rose)' }} />
              </div>
              <span className="text-xs text-[var(--text-muted)]">Unmatched</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{unmatchedItems.length}</p>
          </div>

          {/* Coverage */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ 
                backgroundColor: summary.coveragePercentage >= 80 ? 'var(--accent-emerald-bg)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)'
              }}>
                <TrendingUp className="w-4 h-4" style={{ 
                  color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)'
                }} />
              </div>
              <span className="text-xs text-[var(--text-muted)]">Coverage</span>
            </div>
            <p className="text-2xl font-bold" style={{ 
              color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)'
            }}>{summary.coveragePercentage}%</p>
          </div>
        </div>

        {/* Week Calendar - Meals */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">📅 WEEK MEALS</h2>
          </div>
          
          <div className="overflow-x-auto">
            <div className="min-w-[700px] p-4">
              {/* Days Header */}
              <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: `120px repeat(${days.length}, 1fr)` }}>
                <div /> {/* Empty for meal type column */}
                {days.map(({ date, isToday }) => {
                  const dayCoverage = coverageByDate[date] || [];
                  const avgPct = dayCoverage.length > 0 
                    ? Math.round(dayCoverage.reduce((s, c) => s + c.coverageScore, 0) / dayCoverage.length)
                    : 0;
                  const dayColor = avgPct >= 80 ? 'var(--accent-emerald)' : avgPct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
                  
                  return (
                    <div key={date} className="text-center p-2 rounded-lg" style={{ 
                      backgroundColor: isToday ? `${dayColor}15` : 'var(--bg-tertiary)',
                      border: isToday ? `2px solid ${dayColor}` : '2px solid transparent'
                    }}>
                      <p className="text-xs text-[var(--text-muted)] uppercase">
                        {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                      </p>
                      <p className="text-xl font-bold" style={{ color: dayColor }}>
                        {new Date(date).getDate()}
                      </p>
                      <p className="text-[10px] font-medium" style={{ color: dayColor }}>{avgPct}%</p>
                    </div>
                  );
                })}
              </div>

              {/* Meals by Type */}
              {['breakfast', 'lunch', 'dinner'].map(mealType => {
                return (
                  <div 
                    key={mealType}
                    className="grid gap-3 py-3"
                    style={{ gridTemplateColumns: `120px repeat(${days.length}, 1fr)`, borderTop: '1px solid var(--border-color)' }}
                  >
                    <div className="flex items-center">
                      <p className="text-sm font-medium text-[var(--text-muted)] capitalize">{mealType}</p>
                    </div>
                    
                    {days.map(({ date, isToday }) => {
                      const dayMeals = (coverageByDate[date] || []).filter(c => {
                        const m = c.meal.content.toLowerCase();
                        if (mealType === 'breakfast') return m.includes('breakfast') || m.includes('cereal');
                        if (mealType === 'lunch') return m.includes('lunch') || m.includes('sandwich');
                        return m.includes('dinner') || m.includes('tea') || (!m.includes('breakfast') && !m.includes('lunch'));
                      });
                      
                      const meal = dayMeals[0];
                      
                      return (
                        <div key={date} className="p-2 rounded-lg min-h-[80px]" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                          {meal ? (
                            <div>
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <p className="text-sm font-medium text-[var(--text-primary)] leading-tight truncate flex-1" title={meal.meal.content}>
                                  {meal.meal.content}
                                </p>
                                <span 
                                  className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0"
                                  style={{ backgroundColor: getStatusColor(meal.status, meal.coverageScore), color: 'white' }}
                                >
                                  {meal.status === 'covered' ? '✓' : meal.status === 'partial' ? '◧' : '✗'}
                                </span>
                              </div>
                              {meal.meal.labels && meal.meal.labels.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {meal.meal.labels.slice(0, 2).map((label: string, idx: number) => (
                                    <span 
                                      key={idx}
                                      className="text-[9px] px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <p className="text-[10px] mt-1 font-medium" style={{ color: getStatusColor(meal.status, meal.coverageScore) }}>
                                {meal.coverageScore}%
                              </p>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <span className="text-[var(--text-muted)]">—</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Legend */}
          <div className="px-5 py-3 flex items-center gap-4" style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--accent-emerald)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Covered</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--accent-amber)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Partial</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--accent-rose)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Missing</span>
            </span>
          </div>
        </div>

        {/* 2-Column Grid for remaining sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Unmatched Groceries */}
          {unmatchedItems.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  📦 UNMATCHED GROCERIES ({unmatchedItems.length})
                </h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {unmatchedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 px-3 rounded" 
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
                        <span className="text-sm text-[var(--text-primary)]">{item.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {unmatchedItems.length === 10 && receipt && receipt.items.length > 10 && (
                  <p className="text-xs text-center text-[var(--text-muted)] pt-3">
                    +{receipt.items.length - 10} more items
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Right: Grocery Categories */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">🛒 GROCERY CATEGORIES</h2>
            </div>
            <div className="p-4">
              <GroceryMatch coverage={filteredCoverage} receipt={receipt} />
            </div>
          </div>

          {/* Trends - Full Width */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">📊 TRENDS</h2>
            </div>
            <div className="p-4">
              <HistoricalTrends currentCoverage={summary.coveragePercentage} />
            </div>
          </div>

          {/* Chart - Full Width */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">📈 COVERAGE CHART</h2>
            </div>
            <div className="p-4">
              <Chart coverage={filteredCoverage} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
        Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </footer>
    </div>
  );
}