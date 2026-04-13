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
  const unmatchedItems = receipt 
    ? receipt.items.filter(item => {
        const itemLower = item.name.toLowerCase();
        return !coverage.some(c => c.meal.content.toLowerCase().includes(itemLower));
      }).slice(0, 10)
    : [];

  // Group coverage by date
  const coverageByDate: Record<string, typeof coverage> = {};
  coverage.forEach(c => {
    const date = c.meal.date;
    if (!coverageByDate[date]) coverageByDate[date] = [];
    coverageByDate[date].push(c);
  });
  
  const dates = Object.keys(coverageByDate).sort();
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

  const getStatusColor = (status: string, score: number) => {
    if (status === 'covered' || score >= 80) return 'var(--accent-emerald)';
    if (status === 'partial' || score >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  // Layout styles
  const mainStyle = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '1.5rem 1rem',
  };

  const statsRowStyle = {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.75rem',
    marginBottom: '1.5rem',
  };

  const statCardStyle = {
    flex: isDesktop ? '1 1 calc(20% - 0.75rem)' : '1 1 calc(50% - 0.75rem)',
    minWidth: '140px',
    maxWidth: isDesktop ? 'none' : 'calc(50% - 0.75rem)',
  };

  const twoColStyle = {
    display: 'flex',
    flexDirection: isDesktop ? 'row' as const : 'column' as const,
    gap: '1.5rem',
  };

  const leftColStyle = {
    flex: isDesktop ? '2 1 0' : '0 0 auto',
    minWidth: 0,
  };

  const rightColStyle = {
    flex: isDesktop ? '1 1 300px' : '0 0 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.5rem',
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header 
        className="sticky top-0 z-50 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>🍽️ {dashboardConfig.name}</h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main style={mainStyle}>
        
        {/* Stats Row */}
        <div style={statsRowStyle}>
          <div className="card p-4" style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '16px', height: '16px', color: 'var(--accent-emerald)' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Order total</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>£{receipt?.orderTotal.toFixed(2) || '—'}</p>
          </div>

          <div className="card p-4" style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-blue-bg)' }}>
                <Calendar style={{ width: '16px', height: '16px', color: 'var(--accent-blue)' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Delivery</span>
            </div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {deliveries[0] ? new Date(deliveries[0].date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
            </p>
          </div>

          <div className="card p-4" style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '16px', height: '16px', color: 'var(--accent-emerald)' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Meals covered</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{covered}/{coverage.length}</p>
          </div>

          <div className="card p-4" style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-rose-bg)' }}>
                <X style={{ width: '16px', height: '16px', color: 'var(--accent-rose)' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Unmatched</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{unmatchedItems.length}</p>
          </div>

          <div className="card p-4" style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: summary.coveragePercentage >= 80 ? 'var(--accent-emerald-bg)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)' }}>
                <TrendingUp style={{ width: '16px', height: '16px', color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Coverage</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{summary.coveragePercentage}%</p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={twoColStyle}>
          
          {/* Left Column - Week Calendar */}
          <div style={leftColStyle}>
            <div className="card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>📅 WEEK MEALS</h2>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: isDesktop ? 'auto' : '700px' }}>
                  {/* Days Header */}
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem' }}>
                    <div style={{ width: '80px', flexShrink: 0 }} />
                    {days.map(({ date, isToday }) => {
                      const dayCoverage = coverageByDate[date] || [];
                      const avgPct = dayCoverage.length > 0 
                        ? Math.round(dayCoverage.reduce((s, c) => s + c.coverageScore, 0) / dayCoverage.length)
                        : 0;
                      const dayColor = avgPct >= 80 ? 'var(--accent-emerald)' : avgPct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
                      
                      return (
                        <div key={date} className="text-center p-2 rounded-lg" style={{ 
                          flex: '1 1 0',
                          backgroundColor: isToday ? `${dayColor}15` : 'var(--bg-tertiary)',
                          border: isToday ? `2px solid ${dayColor}` : '2px solid transparent'
                        }}>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                          </p>
                          <p style={{ fontSize: '20px', fontWeight: 'bold', color: dayColor }}>
                            {new Date(date).getDate()}
                          </p>
                          <p style={{ fontSize: '10px', fontWeight: '500', color: dayColor }}>{avgPct}%</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Meals by Type */}
                  {['breakfast', 'lunch', 'dinner'].map(mealType => (
                    <div 
                      key={mealType}
                      style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid var(--border-color)', alignItems: 'flex-start' }}
                    >
                      <div style={{ width: '80px', flexShrink: 0, paddingTop: '0.5rem' }}>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{mealType}</p>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', flex: '1 1 0' }}>
                        {days.map(({ date }) => {
                          const dayMeals = (coverageByDate[date] || []).filter(c => {
                            const m = c.meal.content.toLowerCase();
                            if (mealType === 'breakfast') return m.includes('breakfast') || m.includes('cereal');
                            if (mealType === 'lunch') return m.includes('lunch') || m.includes('sandwich');
                            return m.includes('dinner') || m.includes('tea') || (!m.includes('breakfast') && !m.includes('lunch'));
                          });
                          
                          const meal = dayMeals[0];
                          
                          return (
                            <div key={date} style={{ flex: '1 1 0', padding: '0.5rem', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', minHeight: '70px' }}>
                              {meal ? (
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px', marginBottom: '4px' }}>
                                    <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)', lineHeight: '1.3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={meal.meal.content}>
                                      {meal.meal.content}
                                    </p>
                                    <span 
                                      style={{ width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white', flexShrink: 0, backgroundColor: getStatusColor(meal.status, meal.coverageScore) }}
                                    >
                                      {meal.status === 'covered' ? '✓' : meal.status === 'partial' ? '◧' : '✗'}
                                    </span>
                                  </div>
                                  {meal.meal.labels && meal.meal.labels.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                                      {meal.meal.labels.slice(0, 2).map((label: string, idx: number) => (
                                        <span 
                                          key={idx}
                                          style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                                        >
                                          {label}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <p style={{ fontSize: '10px', fontWeight: '500', marginTop: '4px', color: getStatusColor(meal.status, meal.coverageScore) }}>
                                    {meal.coverageScore}%
                                  </p>
                                </div>
                              ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
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
              </div>
              
              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)' }} />
                  <span style={{ color: 'var(--text-muted)' }}>Covered</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--accent-amber)' }} />
                  <span style={{ color: 'var(--text-muted)' }}>Partial</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--accent-rose)' }} />
                  <span style={{ color: 'var(--text-muted)' }}>Missing</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div style={rightColStyle}>
            
            {/* Unmatched Groceries */}
            {unmatchedItems.length > 0 && (
              <div className="card overflow-hidden">
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    📦 UNMATCHED ({unmatchedItems.length})
                  </h2>
                </div>
                <div style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {unmatchedItems.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.5rem', borderRadius: '6px', backgroundColor: 'var(--bg-tertiary)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-muted)' }} />
                        <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Grocery Categories */}
            <div className="card overflow-hidden">
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>🛒 CATEGORIES</h2>
              </div>
              <div style={{ padding: '0.75rem' }}>
                <GroceryMatch coverage={filteredCoverage} receipt={receipt} />
              </div>
            </div>

            {/* Trends */}
            <div className="card overflow-hidden">
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>📊 TRENDS</h2>
              </div>
              <div style={{ padding: '0.75rem' }}>
                <HistoricalTrends currentCoverage={summary.coveragePercentage} />
              </div>
            </div>

            {/* Chart */}
            <div className="card overflow-hidden">
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>📈 CHART</h2>
              </div>
              <div style={{ padding: '0.75rem' }}>
                <Chart coverage={filteredCoverage} />
              </div>
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