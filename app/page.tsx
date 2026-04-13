'use client';

import { useState } from 'react';
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
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries, TescoReceipt } from '@/lib/meals-data';
import { 
  realCoverage, 
  realReceipt, 
  realMealPlan,
  realLatestOrder,
  transformCachedOrder 
} from '@/lib/real-data';
import {
  ShopPeriod,
  StatusFilter as StatusFilterType,
  DashboardState,
  previousShopReceipt,
  nextShopReceipt,
  shopDataMap,
  filterCoverage,
} from '@/lib/dashboard-state';

export default function MealsDashboardPage() {
  const [state, setState] = useState<DashboardState>({
    selectedShop: 'current',
    statusFilter: 'all',
    expandedMealId: null,
    dateRange: {
      start: '2026-04-13',
      end: '2026-04-19',
    },
  });

  // Get the receipt for the selected shop
  const getReceiptForShop = (shop: ShopPeriod): TescoReceipt | null => {
    switch (shop) {
      case 'previous':
        return previousShopReceipt;
      case 'current':
        return transformCachedOrder(realLatestOrder);
      case 'next':
        return nextShopReceipt;
      default:
        return null;
    }
  };

  // Update shop data with real current receipt
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
  
  return (
    <div className="min-h-screen gradient-mesh-dark">
      {/* Header */}
      <header className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{dashboardConfig.name}</h1>
              <p className="text-[var(--text-secondary)] mt-1">{dashboardConfig.description}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm text-[var(--text-muted)]">
                <p>Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-xs mt-1 text-[var(--accent-emerald)]">Live data from meals skill</p>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Shop Selector */}
        <div className="mb-6">
          <ShopSelector
            selectedShop={state.selectedShop}
            onShopChange={(shop) => setState(s => ({ ...s, selectedShop: shop }))}
            shopData={currentShopData}
          />
        </div>

        {/* Filters Row */}
        <div className="mb-6">
          <StatusFilter
            coverage={coverage}
            currentFilter={state.statusFilter}
            onFilterChange={(filter) => setState(s => ({ ...s, statusFilter: filter }))}
          />
        </div>

        {/* Top Row: Coverage Overview & Delivery Info & Grocery */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          <div className="lg:col-span-1">
            <CoverageCard summary={summary} />
          </div>
          <div className="lg:col-span-1">
            <DeliveryCard 
              deliveries={deliveries} 
              latestReceipt={receipt}
            />
          </div>
          <div className="lg:col-span-1">
            <ExpiryTimeline receipt={receipt} />
          </div>
          <div className="lg:col-span-1">
            <GroceryMatch coverage={filteredCoverage} receipt={receipt} />
          </div>
        </div>

        {/* Meal Plan Timeline */}
        <div className="mb-6">
          <MealPlanTimeline coverage={filteredCoverage} />
        </div>

        {/* Calendar View */}
        <div className="mb-6">
          <MealCalendar coverage={filteredCoverage} />
        </div>

        {/* Middle Row: Chart */}
        <div className="mb-6">
          <Chart coverage={filteredCoverage} />
        </div>

        {/* Bottom Row: Interactive Meal List */}
        <div className="grid grid-cols-1 gap-6">
          <div className="card p-6">
            <div className="px-6 py-4 border-b border-[var(--border-color)] mb-4">
              <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Meal Plan & Coverage ({filteredCoverage.length} of {coverage.length})
              </h3>
            </div>
            <MealListInteractive coverage={filteredCoverage} />
          </div>
        </div>
      </main>
    </div>
  );
}