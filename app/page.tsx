'use client';

import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { MealCalendar } from '@/components/meal-calendar';
import { GroceryMatch } from '@/components/grocery-match';
import { HistoricalTrends } from '@/components/historical-trends';
import { Chart } from '@/components/chart';
import { MealListInteractive } from '@/components/meal-list-interactive';
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries } from '@/lib/meals-data';
import { realCoverage, realLatestOrder, transformCachedOrder } from '@/lib/real-data';
import { DashboardState, filterCoverage } from '@/lib/dashboard-state';
import { Check, X, AlertTriangle, ShoppingCart, Calendar, TrendingUp } from 'lucide-react';

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

  // Group coverage by date for calendar
  const coverageByDate: Record<string, { covered: number; total: number; hasDelivery?: boolean }> = {};
  coverage.forEach(c => {
    const date = c.meal.date;
    if (!coverageByDate[date]) {
      coverageByDate[date] = { covered: 0, total: 0, hasDelivery: deliveries.some(d => d.date === date) };
    }
    coverageByDate[date].total += 1;
    if (c.status === 'covered') coverageByDate[date].covered += 1;
  });
  
  const dates = Object.keys(coverageByDate).sort();
  const avgCoverage = dates.length > 0 
    ? Math.round(dates.reduce((sum, d) => sum + (coverageByDate[d].covered / coverageByDate[d].total) * 100, 0) / dates.length)
    : 0;

  // Unmatched groceries
  const unmatchedItems = receipt 
    ? receipt.items.filter(item => {
        const itemLower = item.name.toLowerCase();
        return !coverage.some(c => c.meal.content.toLowerCase().includes(itemLower));
      }).slice(0, 10)
    : [];

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
        {/* Coverage Header Card - mimics meals check */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">MEALS CHECK</h2>
          </div>
          
          {/* Stats Row */}
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-emerald-bg)' }}>
                  <Check className="w-5 h-5" style={{ color: 'var(--accent-emerald)' }} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Order total</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">£{receipt?.orderTotal.toFixed(2) || '—'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-blue-bg)' }}>
                  <Calendar className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Delivery</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {deliveries[0] ? new Date(deliveries[0].date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-emerald-bg)' }}>
                  <Check className="w-5 h-5" style={{ color: 'var(--accent-emerald)' }} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Meals covered</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{covered}/{coverage.length}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-rose-bg)' }}>
                  <X className="w-5 h-5" style={{ color: 'var(--accent-rose)' }} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Unmatched</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{unmatchedItems.length}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ 
                  backgroundColor: avgCoverage >= 80 ? 'var(--accent-emerald-bg)' : avgCoverage >= 50 ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)'
                }}>
                  <TrendingUp className="w-5 h-5" style={{ 
                    color: avgCoverage >= 80 ? 'var(--accent-emerald)' : avgCoverage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)'
                  }} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Coverage</p>
                  <p className="text-lg font-bold" style={{ 
                    color: avgCoverage >= 80 ? 'var(--accent-emerald)' : avgCoverage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)'
                  }}>{avgCoverage}%</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-amber-bg)' }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: 'var(--accent-amber)' }} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Suggested</p>
                  <p className="text-sm font-medium text-[var(--text-secondary)]">
                    {missing > 2 ? 'Order soon' : missing > 0 ? 'Get items' : 'All good'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Coverage Bar - Visual */}
            <div className="mb-3">
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                📅 DAY COVERAGE: {covered}/{coverage.length}
              </p>
              <div className="flex gap-2">
                {dates.map(date => {
                  const dayData = coverageByDate[date];
                  const pct = Math.round((dayData.covered / dayData.total) * 100);
                  const color = pct >= 80 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
                  return (
                    <div key={date} className="flex-1 text-center">
                      <div className="flex items-end justify-center gap-1 mb-1">
                        <div 
                          className="w-10 rounded-sm overflow-hidden"
                          style={{ backgroundColor: 'var(--bg-tertiary)', height: '48px' }}
                        >
                          <div 
                            className="w-full transition-all"
                            style={{ height: `${pct}%`, backgroundColor: color }}
                          />
                          {dayData.hasDelivery && (
                            <div className="w-full h-1" style={{ backgroundColor: 'var(--accent-blue)' }} />
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                      </p>
                      <p className="text-xs font-semibold" style={{ color }}>{pct}%</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-3">
                <span style={{ color: 'var(--accent-emerald)' }}>●</span> covered 
                <span className="mx-2" />
                <span style={{ color: 'var(--accent-amber)' }}>●</span> partial 
                <span className="mx-2" />
                <span style={{ color: 'var(--accent-rose)' }}>●</span> missing 
                <span className="mx-2" />
                <span style={{ color: 'var(--accent-blue)' }}>─</span> delivery
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid - 2 columns on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Meals List */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">📋 MEALS</h2>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-emerald)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Covered</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-amber)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Partial</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-rose)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Missing</span>
                  </span>
                </div>
              </div>
              <div className="p-4">
                <MealListInteractive coverage={filteredCoverage} />
              </div>
            </div>

            {/* Unmatched Groceries */}
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
                        <span className="text-xs text-[var(--text-muted)]">No match</span>
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
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Week Calendar */}
            <MealCalendar coverage={coverage} />

            {/* Grocery Categories */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">🛒 GROCERY CATEGORIES</h2>
              </div>
              <div className="p-4">
                <GroceryMatch coverage={filteredCoverage} receipt={receipt} />
              </div>
            </div>

            {/* Trends */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">📊 TRENDS</h2>
              </div>
              <div className="p-4">
                <HistoricalTrends currentCoverage={summary.coveragePercentage} />
              </div>
            </div>

            {/* Chart */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">📈 COVERAGE CHART</h2>
              </div>
              <div className="p-4">
                <Chart coverage={filteredCoverage} />
              </div>
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