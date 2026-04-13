'use client';

import { useState, useEffect } from 'react';
import { CoverageCard } from '@/components/coverage-card';
import { DeliveryCard } from '@/components/delivery-card';
import { Chart } from '@/components/chart';
import { ShopSelector } from '@/components/shop-selector';
import { StatusFilter } from '@/components/status-filter';
import { MealListInteractive } from '@/components/meal-list-interactive';
import { MealCalendar } from '@/components/meal-calendar';
import { ExpiryTimeline } from '@/components/expiry-timeline';
import { GroceryMatch } from '@/components/grocery-match';
import { MealPlanTimeline } from '@/components/meal-plan-timeline';
import { ThemeToggle } from '@/components/theme-toggle';
import { MissingItems } from '@/components/missing-items';
import { WeeklySummary } from '@/components/weekly-summary';
import { WeeklyCost } from '@/components/weekly-cost';
import { HistoricalTrends } from '@/components/historical-trends';
import { ToggleSection } from '@/components/collapsible';
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries, TescoReceipt } from '@/lib/meals-data';
import { realCoverage, realReceipt, realLatestOrder, transformCachedOrder } from '@/lib/real-data';
import { ShopPeriod, DashboardState, previousShopReceipt, nextShopReceipt, shopDataMap, filterCoverage } from '@/lib/dashboard-state';
import { Menu, X, LayoutGrid, List, Calendar, TrendingUp, ShoppingCart, AlertTriangle, PieChart } from 'lucide-react';

interface Section {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
}

const sections: Section[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'deliveries', label: 'Deliveries', icon: ShoppingCart },
  { id: 'expiry', label: 'Short-Life', icon: AlertTriangle },
  { id: 'shopping', label: 'Shopping List', icon: ShoppingCart },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'categories', label: 'Categories', icon: PieChart },
  { id: 'timeline', label: 'Timeline', icon: List },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'chart', label: 'Coverage Chart', icon: TrendingUp },
  { id: 'meals', label: 'Meal List', icon: List },
];

export default function MealsDashboardPage() {
  const [state, setState] = useState<DashboardState>({
    selectedShop: 'current',
    statusFilter: 'all',
    expandedMealId: null,
    dateRange: { start: '2026-04-13', end: '2026-04-19' },
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(['overview', 'deliveries', 'timeline', 'meals'])
  );
  const [compactView, setCompactView] = useState(true);

  const getReceiptForShop = (shop: ShopPeriod): TescoReceipt | null => {
    switch (shop) {
      case 'previous': return previousShopReceipt;
      case 'current': return transformCachedOrder(realLatestOrder);
      case 'next': return nextShopReceipt;
      default: return null;
    }
  };

  const currentShopData = {
    ...shopDataMap,
    current: {
      ...shopDataMap.current,
      receipt: transformCachedOrder(realLatestOrder),
      orderTotal: realReceipt.orderTotal,
      itemCount: realReceipt.items.length,
    },
  };

  const receipt = getReceiptForShop(state.selectedShop);
  const deliveries = getUpcomingDeliveries();
  const coverage = realCoverage;
  const filteredCoverage = filterCoverage(coverage, state.statusFilter);
  const summary = calculateCoverageSummary(coverage);

  const toggleSection = (id: string) => {
    const newVisible = new Set(visibleSections);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisibleSections(newVisible);
  };

  const toggleAllSections = (show: boolean) => {
    if (show) {
      setVisibleSections(new Set(sections.map(s => s.id)));
    } else {
      setVisibleSections(new Set(['overview', 'meals']));
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header 
        className="sticky top-0 z-50 px-3 py-2"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg lg:hidden"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Menu className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            </button>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">{dashboardConfig.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompactView(!compactView)}
              className="p-1.5 rounded-lg text-xs"
              style={{ 
                backgroundColor: compactView ? 'var(--accent-emerald-bg)' : 'var(--bg-tertiary)',
                color: compactView ? 'var(--accent-emerald)' : 'var(--text-muted)'
              }}
              title={compactView ? 'Expand view' : 'Compact view'}
            >
              {compactView ? 'Compact' : 'Expanded'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 py-4">
        {/* Shop Selector */}
        <div className="mb-3">
          <ShopSelector
            selectedShop={state.selectedShop}
            onShopChange={(shop) => setState(s => ({ ...s, selectedShop: shop }))}
            shopData={currentShopData}
          />
        </div>

        {/* Filter pills - compact horizontal scroll */}
        <div className="mb-4 overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {['all', 'covered', 'partial', 'missing', 'unknown'].map((filter) => (
              <button
                key={filter}
                onClick={() => setState(s => ({ ...s, statusFilter: filter as any }))}
                className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-fast"
                style={{
                  backgroundColor: state.statusFilter === filter ? 'var(--accent-emerald)' : 'var(--bg-tertiary)',
                  color: state.statusFilter === filter ? 'white' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)'
                }}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Section Toggle Bar (Desktop) */}
        <div className="hidden lg:flex flex-wrap gap-2 mb-4 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => toggleAllSections(true)}
            className="px-2 py-1 text-xs rounded"
            style={{ backgroundColor: 'var(--accent-blue-bg)', color: 'var(--accent-blue)' }}
          >
            Show All
          </button>
          <button
            onClick={() => toggleAllSections(false)}
            className="px-2 py-1 text-xs rounded"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
          >
            Hide All
          </button>
          <div className="flex-1" />
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => toggleSection(section.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-fast"
              style={{
                backgroundColor: visibleSections.has(section.id) ? 'var(--accent-emerald-bg)' : 'var(--bg-tertiary)',
                color: visibleSections.has(section.id) ? 'var(--accent-emerald)' : 'var(--text-muted)'
              }}
            >
              <section.icon className="w-3 h-3" />
              {section.label}
            </button>
          ))}
        </div>

        {/* Mobile Section Quick Toggle */}
        <div className="lg:hidden mb-4 flex gap-2 overflow-x-auto pb-1">
          {sections.slice(0, 5).map((section) => (
            <button
              key={section.id}
              onClick={() => toggleSection(section.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap"
              style={{
                backgroundColor: visibleSections.has(section.id) ? 'var(--accent-emerald-bg)' : 'var(--bg-tertiary)',
                color: visibleSections.has(section.id) ? 'var(--accent-emerald)' : 'var(--text-muted)',
                border: '1px solid var(--border-color)'
              }}
            >
              <section.icon className="w-3 h-3" />
            </button>
          ))}
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Overview Section */}
          {visibleSections.has('overview') && (
            <div className="md:col-span-2 lg:col-span-1">
              <CoverageCard summary={summary} />
            </div>
          )}

          {/* Deliveries Section */}
          {visibleSections.has('deliveries') && (
            <div>
              <DeliveryCard deliveries={deliveries} latestReceipt={receipt} />
            </div>
          )}

          {/* Expiry Section */}
          {visibleSections.has('expiry') && (
            <div>
              <ExpiryTimeline receipt={receipt} />
            </div>
          )}

          {/* Shopping List Section */}
          {visibleSections.has('shopping') && (
            <div>
              <MissingItems coverage={filteredCoverage} />
            </div>
          )}

          {/* Trends Section */}
          {visibleSections.has('trends') && (
            <div>
              <HistoricalTrends currentCoverage={summary.coveragePercentage} />
            </div>
          )}

          {/* Categories Section */}
          {visibleSections.has('categories') && (
            <div>
              <GroceryMatch coverage={filteredCoverage} receipt={receipt} />
            </div>
          )}

          {/* Weekly Cost */}
          {visibleSections.has('overview') && (
            <div>
              <WeeklyCost coverage={filteredCoverage} receipt={receipt} deliveries={deliveries} />
            </div>
          )}
        </div>

        {/* Timeline - Full Width */}
        {visibleSections.has('timeline') && (
          <div className="mt-4">
            <MealPlanTimeline coverage={filteredCoverage} />
          </div>
        )}

        {/* Calendar - Full Width */}
        {visibleSections.has('calendar') && (
          <div className="mt-4">
            <MealCalendar coverage={filteredCoverage} />
          </div>
        )}

        {/* Chart - Full Width */}
        {visibleSections.has('chart') && (
          <div className="mt-4">
            <Chart coverage={filteredCoverage} />
          </div>
        )}

        {/* Meal List - Full Width */}
        {visibleSections.has('meals') && (
          <div className="mt-4">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                  Meals ({filteredCoverage.length}/{coverage.length})
                </h3>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span style={{ color: 'var(--accent-emerald)' }}>●</span> Covered
                  <span style={{ color: 'var(--accent-amber)' }}>●</span> Partial
                  <span style={{ color: 'var(--accent-rose)' }}>●</span> Missing
                </div>
              </div>
              <MealListInteractive coverage={filteredCoverage} />
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {visibleSections.has('overview') && (
          <div className="mt-4">
            <WeeklySummary coverage={filteredCoverage} receipt={receipt} />
          </div>
        )}
      </main>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 lg:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div 
            className="absolute right-0 top-0 bottom-0 w-64 p-4 overflow-y-auto"
            style={{ backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Sections</h2>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            
            <div className="space-y-2">
              <button
                onClick={() => toggleAllSections(true)}
                className="w-full text-left px-3 py-2 text-xs rounded"
                style={{ backgroundColor: 'var(--accent-blue-bg)', color: 'var(--accent-blue)' }}
              >
                Show All Sections
              </button>
              <button
                onClick={() => toggleAllSections(false)}
                className="w-full text-left px-3 py-2 text-xs rounded"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
              >
                Hide All Sections
              </button>
              
              <div className="border-t border-[var(--border-color)] pt-2 mt-2" />
              
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => {
                    toggleSection(section.id);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded"
                  style={{
                    backgroundColor: visibleSections.has(section.id) ? 'var(--accent-emerald-bg)' : 'var(--bg-tertiary)',
                    color: visibleSections.has(section.id) ? 'var(--accent-emerald)' : 'var(--text-secondary)'
                  }}
                >
                  <section.icon className="w-4 h-4" />
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-3 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
        Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </footer>
    </div>
  );
}