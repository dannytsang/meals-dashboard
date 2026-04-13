'use client';

import { useState, useEffect } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { GroceryMatch } from '@/components/grocery-match';
import { HistoricalTrends } from '@/components/historical-trends';
import { Chart } from '@/components/chart';
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries } from '@/lib/meals-data';
import { realCoverage, realLatestOrder, transformCachedOrder } from '@/lib/real-data';
import { DashboardState, filterCoverage } from '@/lib/dashboard-state';
import { Check, X, Calendar, TrendingUp } from 'lucide-react';

export default function MealsDashboardPage() {
  const [state] = useState<DashboardState>({
    selectedShop: 'current',
    statusFilter: 'all',
    expandedMealId: null,
    dateRange: { start: '2026-04-13', end: '2026-04-19' },
  });

  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  useEffect(() => {
    const checkWidth = () => setIsDesktop(window.innerWidth >= 1024);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  const receipt = transformCachedOrder(realLatestOrder);
  const deliveries = getUpcomingDeliveries();
  const coverage = realCoverage;
  const filteredCoverage = filterCoverage(coverage, state.statusFilter);
  const summary = calculateCoverageSummary(coverage);
  
  const covered = coverage.filter(c => c.status === 'covered').length;
  const unmatchedItems = receipt?.items || [];

  // Group items by category
  const itemsByCategory: Record<string, typeof unmatchedItems> = {};
  unmatchedItems.forEach(item => {
    const cat = item.category || 'Pantry';
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push(item);
  });

  const categories = Object.keys(itemsByCategory).sort();
  
  // Filter to show items in selected category (or all unmatched if none selected)
  const displayItems = selectedCategory 
    ? unmatchedItems.filter(item => (item.category || 'Pantry') === selectedCategory)
    : unmatchedItems;

  // Group coverage by date
  const coverageByDate: Record<string, typeof coverage> = {};
  coverage.forEach(c => {
    const date = c.meal.date;
    if (!coverageByDate[date]) coverageByDate[date] = [];
    coverageByDate[date].push(c);
  });
  
  // Always show full week (Mon-Sun)
  const startDate = '2026-04-13';
  const endDate = '2026-04-19';
  
  const days: { date: string; isToday: boolean }[] = [];
  const current = new Date(startDate);
  const today = new Date().toISOString().split('T')[0];
  while (current <= new Date(endDate)) {
    const dateStr = current.toISOString().split('T')[0];
    days.push({ date: dateStr, isToday: dateStr === today });
    current.setDate(current.getDate() + 1);
  }

  const getStatusColor = (status: string, score: number) => {
    if (status === 'covered' || score >= 80) return 'var(--accent-emerald)';
    if (status === 'partial' || score >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  const cardStyle = {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
  };

  const categoryColors: Record<string, string> = {
    Fresh: 'var(--accent-emerald)',
    Dairy: 'var(--accent-blue)',
    Meat: 'var(--accent-rose)',
    Bakery: 'var(--accent-amber)',
    Frozen: 'var(--accent-cyan)',
    Pantry: 'var(--accent-purple)',
    Beverages: 'var(--accent-pink)',
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header 
        style={{ position: 'sticky', top: 0, zIndex: 50, padding: '0.75rem 1rem', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>🍽️ {dashboardConfig.name}</h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        
        {/* Stats Row - 5 stats in a row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ ...cardStyle, padding: '1rem', flex: isDesktop ? '1 1 calc(20% - 0.75rem)' : '1 1 calc(50% - 0.75rem)', minWidth: '140px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>ORDER TOTAL</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>£{receipt?.orderTotal.toFixed(2) || '—'}</p>
          </div>

          <div style={{ ...cardStyle, padding: '1rem', flex: isDesktop ? '1 1 calc(20% - 0.75rem)' : '1 1 calc(50% - 0.75rem)', minWidth: '140px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-blue-bg)' }}>
                <Calendar style={{ width: '20px', height: '20px', color: 'var(--accent-blue)' }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>DELIVERY</p>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {deliveries[0] ? new Date(deliveries[0].date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
            </p>
          </div>

          <div style={{ ...cardStyle, padding: '1rem', flex: isDesktop ? '1 1 calc(20% - 0.75rem)' : '1 1 calc(50% - 0.75rem)', minWidth: '140px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>MEALS COVERED</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{covered}/{coverage.length}</p>
          </div>

          <div style={{ ...cardStyle, padding: '1rem', flex: isDesktop ? '1 1 calc(20% - 0.75rem)' : '1 1 calc(50% - 0.75rem)', minWidth: '140px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-rose-bg)' }}>
                <X style={{ width: '20px', height: '20px', color: 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>UNMATCHED</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{unmatchedItems.length}</p>
          </div>

          <div style={{ ...cardStyle, padding: '1rem', flex: isDesktop ? '1 1 calc(20% - 0.75rem)' : '1 1 calc(50% - 0.75rem)', minWidth: '140px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: summary.coveragePercentage >= 80 ? 'var(--accent-emerald-bg)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)' }}>
                <TrendingUp style={{ width: '20px', height: '20px', color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>COVERAGE</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{summary.coveragePercentage}%</p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' as const : 'column' as const, gap: '1.5rem', alignItems: 'stretch' as const }}>
          
          {/* Left Column - Week Calendar */}
          <div style={{ ...cardStyle, flex: isDesktop ? '1 1 65%' : '0 0 auto', display: 'flex', flexDirection: 'column' as const }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>📅 WEEK MEALS</h2>
            </div>
            
            <div style={{ padding: '1rem', flex: 1 }}>
              {/* Days Header */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ width: '90px', flexShrink: 0 }} />
                {days.map(({ date, isToday }) => {
                  const dayCoverage = coverageByDate[date] || [];
                  const avgPct = dayCoverage.length > 0 
                    ? Math.round(dayCoverage.reduce((s, c) => s + c.coverageScore, 0) / dayCoverage.length)
                    : 0;
                  const dayColor = avgPct >= 80 ? 'var(--accent-emerald)' : avgPct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
                  const hasMeals = dayCoverage.length > 0;
                  
                  return (
                    <div key={date} style={{ 
                      flex: '1 1 0',
                      textAlign: 'center' as const,
                      padding: '0.75rem 0.5rem',
                      borderRadius: '10px',
                      backgroundColor: isToday ? `${dayColor}20` : 'var(--bg-tertiary)',
                      border: isToday ? `2px solid ${dayColor}` : '2px solid transparent'
                    }}>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                        {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                      </p>
                      <p style={{ fontSize: '18px', fontWeight: 'bold', color: hasMeals ? dayColor : 'var(--text-muted)' }}>
                        {new Date(date).getDate()}
                      </p>
                      <p style={{ fontSize: '10px', fontWeight: '500', color: hasMeals ? dayColor : 'var(--text-muted)', marginTop: '2px' }}>
                        {hasMeals ? `${avgPct}%` : '—'}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Meals by Type */}
              {['breakfast', 'lunch', 'dinner'].map(mealType => (
                <div 
                  key={mealType}
                  style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 0', borderTop: '1px solid var(--border-color)', alignItems: 'stretch' as const }}
                >
                  <div style={{ width: '90px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{mealType}</p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                    {days.map(({ date }) => {
                      const dayMeals = (coverageByDate[date] || []).filter(c => {
                        const m = c.meal.content.toLowerCase();
                        if (mealType === 'breakfast') return m.includes('breakfast') || m.includes('cereal');
                        if (mealType === 'lunch') return m.includes('lunch') || m.includes('sandwich');
                        return m.includes('dinner') || m.includes('tea') || (!m.includes('breakfast') && !m.includes('lunch'));
                      });
                      
                      const meal = dayMeals[0];
                      
                      return (
                        <div key={date} style={{ 
                          flex: '1 1 0', 
                          padding: '0.6rem', 
                          borderRadius: '8px', 
                          backgroundColor: 'var(--bg-tertiary)',
                          display: 'flex',
                          flexDirection: 'column' as const,
                          justifyContent: 'center',
                          minHeight: '65px'
                        }}>
                          {meal ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                <span 
                                  style={{ 
                                    width: '18px', 
                                    height: '18px', 
                                    borderRadius: '50%', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontSize: '10px', 
                                    color: 'white', 
                                    backgroundColor: getStatusColor(meal.status, meal.coverageScore),
                                    flexShrink: 0
                                  }}
                                >
                                  {meal.status === 'covered' ? '✓' : meal.status === 'partial' ? '◧' : '✗'}
                                </span>
                                <p style={{ 
                                  fontSize: '11px', 
                                  fontWeight: '500', 
                                  color: 'var(--text-primary)', 
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  flex: 1
                                }} title={meal.meal.content}>
                                  {meal.meal.content}
                                </p>
                              </div>
                              {meal.meal.labels && meal.meal.labels.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '2px' }}>
                                  {meal.meal.labels.slice(0, 2).map((label: string, idx: number) => (
                                    <span 
                                      key={idx}
                                      style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <p style={{ fontSize: '9px', fontWeight: '500', color: getStatusColor(meal.status, meal.coverageScore) }}>
                                {meal.coverageScore}%
                              </p>
                            </>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '14px' }}>
                              —
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', borderRadius: '0 0 12px 12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Covered</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent-amber)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Partial</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent-rose)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Missing</span>
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ flex: isDesktop ? '1 1 35%' : '0 0 auto', display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
            
            {/* Categories with Filter */}
            <div style={{ ...cardStyle, padding: '1rem' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'center' as const }}>🛒 ORDER ITEMS BY CATEGORY</h2>
              
              {/* Category Pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => setSelectedCategory(null)}
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '20px', 
                    fontSize: '11px',
                    fontWeight: '500',
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: selectedCategory === null ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                    borderColor: selectedCategory === null ? 'var(--accent-blue)' : 'var(--border-color)',
                    color: selectedCategory === null ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  All ({unmatchedItems.length})
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    style={{ 
                      padding: '0.4rem 0.8rem', 
                      borderRadius: '20px', 
                      fontSize: '11px',
                      fontWeight: '500',
                      border: '1px solid',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      backgroundColor: selectedCategory === cat ? (categoryColors[cat] || 'var(--accent-blue)') : 'var(--bg-tertiary)',
                      borderColor: selectedCategory === cat ? (categoryColors[cat] || 'var(--accent-blue)') : 'var(--border-color)',
                      color: selectedCategory === cat ? 'white' : 'var(--text-secondary)'
                    }}
                  >
                    {cat} ({itemsByCategory[cat]?.length || 0})
                  </button>
                ))}
              </div>
              
              {/* Items List */}
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  {selectedCategory || 'All'} Items ({displayItems.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' }}>
                  {displayItems.slice(0, 20).map((item, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.6rem', 
                      borderRadius: '8px', 
                      backgroundColor: 'var(--bg-tertiary)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          backgroundColor: categoryColors[item.category || 'Pantry'] || 'var(--text-muted)'
                        }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{item.name}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>×{item.quantity}</span>
                    </div>
                  ))}
                </div>
                {displayItems.length > 20 && (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
                    +{displayItems.length - 20} more items
                  </p>
                )}
              </div>
            </div>

            {/* Trends */}
            <div style={{ ...cardStyle, padding: '1rem' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'center' as const }}>📊 TRENDS</h2>
              <HistoricalTrends currentCoverage={summary.coveragePercentage} />
            </div>

            {/* Chart */}
            <div style={{ ...cardStyle, padding: '1rem' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'center' as const }}>📈 CHART</h2>
              <Chart coverage={filteredCoverage} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '1rem', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
        Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </footer>
    </div>
  );
}