'use client';

import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { MealCalendar } from '@/components/meal-calendar';
import { GroceryMatch } from '@/components/grocery-match';
import { MissingItems } from '@/components/missing-items';
import { HistoricalTrends } from '@/components/historical-trends';
import { MealPlanTimeline } from '@/components/meal-plan-timeline';
import { Chart } from '@/components/chart';
import { MealListInteractive } from '@/components/meal-list-interactive';
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries, TescoReceipt } from '@/lib/meals-data';
import { realCoverage, realReceipt, realLatestOrder, transformCachedOrder } from '@/lib/real-data';
import { DashboardState, filterCoverage } from '@/lib/dashboard-state';
import { Check, X, AlertTriangle, ShoppingCart, Calendar, TrendingUp } from 'lucide-react';

export default function MealsDashboardPage() {
  const [state, setState] = useState<DashboardState>({
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
  const partial = coverage.filter(c => c.status === 'partial').length;
  const missing = coverage.filter(c => c.status === 'missing').length;

  // Coverage bar (visual, not ASCII)
  const totalDays = 7;
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

  // Unmatched groceries (items that didn't match any meal)
  const unmatchedItems = receipt 
    ? receipt.items.filter(item => {
        const itemLower = item.name.toLowerCase();
        return !coverage.some(c => 
          c.meal.content.toLowerCase().includes(itemLower)
        );
      }).slice(0, 8)
    : [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header 
        className="sticky top-0 z-50 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            🍽️ {dashboardConfig.name}
          </h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Coverage Summary - mimics meals check header */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">MEALS CHECK</h2>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[var(--accent-emerald)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Order total</p>
                <p className="text-sm font-bold text-[var(--text-primary)]">£{receipt?.orderTotal.toFixed(2) || '—'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent-blue)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Delivery</p>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {deliveries[0] ? new Date(deliveries[0].date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[var(--accent-emerald)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Meals covered</p>
                <p className="text-sm font-bold text-[var(--text-primary)]">{covered}/{coverage.length}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <X className="w-4 h-4 text-[var(--accent-rose)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Unmatched groceries</p>
                <p className="text-sm font-bold text-[var(--text-primary)]">{unmatchedItems.length}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent-amber)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Coverage</p>
                <p className="text-sm font-bold" style={{ color: avgCoverage >= 80 ? 'var(--accent-emerald)' : avgCoverage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>
                  {avgCoverage}%
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Suggested</p>
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {missing > 2 ? 'Order soon' : missing > 0 ? 'Get missing items' : 'All good'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Coverage Bar - Visual (not ASCII) */}
          <div className="px-4 pb-3">
            <p className="text-xs text-[var(--text-muted)] mb-2">
              📅 DAY COVERAGE: {covered}/{coverage.length}
            </p>
            <div className="flex gap-1">
              {dates.map(date => {
                const dayData = coverageByDate[date];
                const pct = Math.round((dayData.covered / dayData.total) * 100);
                const color = pct >= 80 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
                return (
                  <div key={date} className="flex-1 text-center">
                    <div 
                      className="h-8 rounded-sm relative overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    >
                      <div 
                        className="absolute bottom-0 left-0 right-0 transition-all"
                        style={{ height: `${pct}%`, backgroundColor: color }}
                      />
                      {dayData.hasDelivery && (
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: 'var(--accent-blue)' }} />
                      )}
                    </div>
                    <p className="text-[10px] mt-1 text-[var(--text-muted)]">
                      {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                    </p>
                    <p className="text-[10px] font-medium" style={{ color }}>{pct}%</p>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2">
              Legend: <span style={{ color: 'var(--accent-emerald)' }}>●</span> covered <span style={{ color: 'var(--accent-amber)' }}>●</span> partial <span style={{ color: 'var(--accent-rose)' }}>●</span> missing <span style={{ color: 'var(--accent-blue)' }}>─</span> delivery
            </p>
          </div>
        </div>

        {/* Week Calendar */}
        <MealCalendar coverage={coverage} />

        {/* Meals List */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">📋 MEALS</h2>
            <div className="flex gap-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-emerald)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Covered</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-amber)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Partial</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-rose)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Missing</span>
              </span>
            </div>
          </div>
          <div className="p-2">
            <MealListInteractive coverage={filteredCoverage} />
          </div>
        </div>

        {/* Unmatched Groceries */}
        {unmatchedItems.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                📦 UNMATCHED GROCERIES ({unmatchedItems.length})
              </h2>
            </div>
            <div className="p-3 space-y-1">
              {unmatchedItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 px-2 rounded" 
                  style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
                    <span className="text-sm text-[var(--text-primary)]">{item.name}</span>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">No meal matched</span>
                </div>
              ))}
              {unmatchedItems.length === 8 && receipt && receipt.items.length > 8 && (
                <p className="text-xs text-center text-[var(--text-muted)] pt-2">
                  +{receipt.items.length - 8} more items
                </p>
              )}
            </div>
          </div>
        )}

        {/* Additional Sections - Collapsed by default on mobile */}
        <details className="card overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">
            🛒 Grocery Categories
          </summary>
          <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <GroceryMatch coverage={filteredCoverage} receipt={receipt} />
          </div>
        </details>

        <details className="card overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">
            📊 Trends & History
          </summary>
          <div className="p-4 border-t space-y-4" style={{ borderColor: 'var(--border-color)' }}>
            <HistoricalTrends currentCoverage={summary.coveragePercentage} />
            <Chart coverage={filteredCoverage} />
          </div>
        </details>

        <details className="card overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">
            🛍️ Deliveries
          </summary>
          <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            {/* Simple delivery list */}
            <div className="space-y-2">
              {deliveries.slice(0, 3).map((d, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {new Date(d.date).toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{d.slot || 'Evening slot'}</p>
                  </div>
                  {d.orderTotal > 0 && (
                    <p className="text-sm font-bold" style={{ color: 'var(--accent-emerald)' }}>£{d.orderTotal.toFixed(2)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </details>
      </main>

      {/* Footer */}
      <footer className="text-center py-3 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
        Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </footer>
    </div>
  );
}