'use client';

import { useState, useEffect, Fragment } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { HistoricalTrends } from '@/components/historical-trends';
import { Chart } from '@/components/chart';
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries } from '@/lib/meals-data';
import { realCoverage, realLatestOrder, transformCachedOrder } from '@/lib/real-data';
import { DashboardState, filterCoverage } from '@/lib/dashboard-state';
import { Check, X, Calendar, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';

export default function MealsDashboardPage() {
  const [state] = useState<DashboardState>({
    selectedShop: 'current',
    statusFilter: 'all',
    expandedMealId: null,
    dateRange: { start: '2026-04-13', end: '2026-04-19' },
  });

  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(false);
  const [collapsedMealTypes, setCollapsedMealTypes] = useState<Set<string>>(new Set(['breakfast', 'lunch']));
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  
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

  // Identify unmatched items (items that don't match any meal)
  const matchedItemNames = new Set<string>();
  coverage.forEach(c => {
    matchedItemNames.add(c.meal.content.toLowerCase());
    c.matchedItems.forEach(name => matchedItemNames.add(name.toLowerCase()));
  });
  
  const trulyUnmatchedItems = unmatchedItems.filter(item => {
    const itemLower = item.name.toLowerCase();
    return !matchedItemNames.has(itemLower) && 
           !coverage.some(c => c.meal.content.toLowerCase().includes(itemLower));
  });

  // Group items by category
  const itemsByCategory: Record<string, typeof unmatchedItems> = {};
  unmatchedItems.forEach(item => {
    const cat = item.category || 'Pantry';
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push(item);
  });

  const categories = Object.keys(itemsByCategory).sort();
  
  // Get max price from items
  const maxItemPrice = unmatchedItems.length > 0 ? Math.max(...unmatchedItems.map(i => i.price || 0)) : 10;
  
  const displayItems = unmatchedItems.filter(item => {
    const catMatch = selectedCategories.size === 0 || selectedCategories.has(item.category || 'Pantry');
    const priceMatch = maxPrice === null || (item.price || 0) <= maxPrice;
    const unmatchedMatch = !showOnlyUnmatched || trulyUnmatchedItems.includes(item);
    return catMatch && priceMatch && unmatchedMatch;
  });

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

  // Check which meal types have meals
  const mealTypesWithMeals: Set<string> = new Set();
  coverage.forEach(c => {
    const m = c.meal.content.toLowerCase();
    if (m.includes('breakfast') || m.includes('cereal')) mealTypesWithMeals.add('breakfast');
    else if (m.includes('lunch') || m.includes('sandwich')) mealTypesWithMeals.add('lunch');
    else mealTypesWithMeals.add('dinner');
  });

  // Auto-expand meal types that have meals, collapse those that don't
  useEffect(() => {
    const newCollapsed = new Set<string>();
    ['breakfast', 'lunch', 'dinner'].forEach(type => {
      if (!mealTypesWithMeals.has(type)) {
        newCollapsed.add(type);
      }
    });
    setCollapsedMealTypes(newCollapsed);
  }, []);

  const toggleMealType = (type: string) => {
    const newCollapsed = new Set(collapsedMealTypes);
    if (newCollapsed.has(type)) {
      newCollapsed.delete(type);
    } else {
      newCollapsed.add(type);
    }
    setCollapsedMealTypes(newCollapsed);
  };

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
        
        {/* Stats Row - responsive grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(2, 1fr)',
          gap: '0.5rem', 
          marginBottom: '1.5rem'
        }}>
          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order Total</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>£{receipt?.orderTotal.toFixed(2) || '—'}</p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-blue-bg)' }}>
                <Calendar style={{ width: '20px', height: '20px', color: 'var(--accent-blue)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery</p>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {deliveries[0] ? new Date(deliveries[0].date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
            </p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meals Covered</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{covered}/{coverage.length}</p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-rose-bg)' }}>
                <X style={{ width: '20px', height: '20px', color: 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unmatched</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{unmatchedItems.length}</p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: summary.coveragePercentage >= 80 ? 'var(--accent-emerald-bg)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)' }}>
                <TrendingUp style={{ width: '20px', height: '20px', color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Coverage</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: summary.coveragePercentage >= 80 ? 'var(--accent-emerald)' : summary.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{summary.coveragePercentage}%</p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' as const : 'column' as const, gap: '1.5rem', alignItems: 'flex-start' as const }}>
          
          {/* Left Column - Week Calendar */}
          <div style={{ ...cardStyle, flex: isDesktop ? '1 1 65%' : '0 0 auto', display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch' as const }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>📅 WEEK MEALS</h2>
            </div>
            
            <div style={{ padding: '1rem' }}>
              {/* Legend at top */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)' }} />
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>Covered</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--accent-amber)' }} />
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>Partial</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--accent-rose)' }} />
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>Missing</span>
                </span>
              </div>

              {/* Calendar Grid - Table for proper column alignment */}
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '650px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '70px', padding: '0.75rem 0.5rem', backgroundColor: 'transparent' }} />
                      {days.map(({ date, isToday }) => {
                        const dayCoverage = coverageByDate[date] || [];
                        const avgPct = dayCoverage.length > 0 
                          ? Math.round(dayCoverage.reduce((s, c) => s + c.coverageScore, 0) / dayCoverage.length)
                          : 0;
                        const dayColor = avgPct >= 80 ? 'var(--accent-emerald)' : avgPct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
                        const hasMeals = dayCoverage.length > 0;
                        
                        return (
                          <th key={date} style={{ 
                            textAlign: 'center' as const,
                            padding: '0.75rem 0.25rem',
                            borderRadius: '10px',
                            backgroundColor: isToday ? `${dayColor}25` : 'var(--bg-tertiary)',
                            border: isToday ? `2px solid ${dayColor}` : '2px solid transparent'
                          }}>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                              {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                            </p>
                            <p style={{ fontSize: '22px', fontWeight: 'bold', color: hasMeals ? dayColor : 'var(--text-secondary)' }}>
                              {new Date(date).getDate()}
                            </p>
                            <p style={{ fontSize: '11px', fontWeight: '600', color: hasMeals ? dayColor : 'var(--text-secondary)', marginTop: '2px' }}>
                              {hasMeals ? `${avgPct}%` : '—'}
                            </p>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {['breakfast', 'lunch', 'dinner'].map(mealType => {
                      const isCollapsed = collapsedMealTypes.has(mealType);
                      const hasMeals = mealTypesWithMeals.has(mealType);
                      
                      return (
                        <Fragment key={mealType}>
                          {/* Meal Type Header Row */}
                          <tr 
                            onClick={() => hasMeals && toggleMealType(mealType)}
                            style={{ cursor: hasMeals ? 'pointer' : 'default', opacity: hasMeals ? 1 : 0.5 }}
                          >
                            <td style={{ 
                              padding: '0.75rem 0.5rem',
                              borderTop: '1px solid var(--border-color)',
                              verticalAlign: 'middle'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isCollapsed ? (
                                  <ChevronRight style={{ width: '18px', height: '18px', color: 'var(--text-secondary)' }} />
                                ) : (
                                  <ChevronDown style={{ width: '18px', height: '18px', color: 'var(--text-secondary)' }} />
                                )}
                                <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                  {mealType}
                                </span>
                              </div>
                            </td>
                            <td colSpan={7} style={{ 
                              padding: '0.75rem 0.25rem',
                              borderTop: '1px solid var(--border-color)',
                              textAlign: 'right'
                            }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                                {!hasMeals ? '(No meals)' : isCollapsed ? 'Show' : 'Hide'}
                              </span>
                            </td>
                          </tr>
                          
                          {/* Meal Cells Row */}
                          {!isCollapsed && (
                            <tr>
                              <td style={{ width: '70px', padding: '0.5rem 0.5rem', verticalAlign: 'top' }} />
                              {days.map(({ date }) => {
                                const dayMeals = (coverageByDate[date] || []).filter(c => {
                                  const m = c.meal.content.toLowerCase();
                                  if (mealType === 'breakfast') return m.includes('breakfast') || m.includes('cereal');
                                  if (mealType === 'lunch') return m.includes('lunch') || m.includes('sandwich');
                                  return m.includes('dinner') || m.includes('tea') || (!m.includes('breakfast') && !m.includes('lunch'));
                                });
                                
                                const meal = dayMeals[0];
                                
                                return (
                                  <td key={date} style={{ padding: '0.5rem 0.25rem', verticalAlign: 'top' }}>
                                    <div style={{ 
                                      padding: '0.6rem 0.25rem', 
                                      borderRadius: '8px', 
                                      backgroundColor: 'var(--bg-tertiary)',
                                      minHeight: '65px'
                                    }}>
                                      {meal ? (
                                        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                                              fontSize: '12px', 
                                              fontWeight: '600', 
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
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                              {meal.meal.labels.slice(0, 2).map((label: string, idx: number) => (
                                                <span 
                                                  key={idx}
                                                  style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: '500' }}
                                                >
                                                  {label}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          <p style={{ fontSize: '10px', fontWeight: '700', color: getStatusColor(meal.status, meal.coverageScore) }}>
                                            {meal.coverageScore}%
                                          </p>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '65px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
                                          —
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ flex: isDesktop ? '1 1 35%' : '0 0 auto', display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
            
            {/* Categories with Filter */}
            <div style={{ ...cardStyle, padding: '1rem' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'center' as const }}>🛒 ORDER ITEMS BY CATEGORY</h2>
              
              {/* Category Pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'center' }}>
                <button
                  onClick={() => setSelectedCategories(new Set())}
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '20px', 
                    fontSize: '11px',
                    fontWeight: '600',
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: selectedCategories.size === 0 ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                    borderColor: selectedCategories.size === 0 ? 'var(--accent-blue)' : 'var(--border-color)',
                    color: selectedCategories.size === 0 ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      const newCats = new Set(selectedCategories);
                      if (newCats.has(cat)) {
                        newCats.delete(cat);
                      } else {
                        newCats.add(cat);
                      }
                      setSelectedCategories(newCats);
                    }}
                    style={{ 
                      padding: '0.4rem 0.8rem', 
                      borderRadius: '20px', 
                      fontSize: '11px',
                      fontWeight: '600',
                      border: '1px solid',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      backgroundColor: selectedCategories.has(cat) ? (categoryColors[cat] || 'var(--accent-blue)') : 'var(--bg-tertiary)',
                      borderColor: selectedCategories.has(cat) ? (categoryColors[cat] || 'var(--accent-blue)') : 'var(--border-color)',
                      color: selectedCategories.has(cat) ? 'white' : 'var(--text-secondary)'
                    }}
                  >
                    {cat} ({itemsByCategory[cat]?.length || 0})
                  </button>
                ))}
                <button
                  onClick={() => setShowOnlyUnmatched(!showOnlyUnmatched)}
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '20px', 
                    fontSize: '11px',
                    fontWeight: '600',
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: showOnlyUnmatched ? 'var(--accent-rose)' : 'var(--bg-tertiary)',
                    borderColor: showOnlyUnmatched ? 'var(--accent-rose)' : 'var(--border-color)',
                    color: showOnlyUnmatched ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  Unmatched ({trulyUnmatchedItems.length})
                </button>
              </div>
              
              {/* Category Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', justifyContent: 'center' }}>
                {categories.map(cat => (
                  <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: categoryColors[cat] || 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{cat}</span>
                  </span>
                ))}
              </div>
              
              {/* Price Filter */}
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>
                    Max Price
                  </p>
                  <p style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {maxPrice !== null ? `£${maxPrice.toFixed(2)}` : 'Any'}
                  </p>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.ceil(maxItemPrice)}
                  step="0.50"
                  value={maxPrice !== null ? maxPrice : Math.ceil(maxItemPrice)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setMaxPrice(val >= Math.ceil(maxItemPrice) ? null : val);
                  }}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>£0</span>
                  <span>£{Math.ceil(maxItemPrice)}</span>
                </div>
              </div>
              
              {/* Items List */}
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: '600' }}>
                  {selectedCategories.size === 0 ? 'All' : Array.from(selectedCategories).join(', ')} Items ({displayItems.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' }}>
                  {displayItems.slice(0, 30).map((item, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '0.3rem 0.5rem', 
                      borderRadius: '6px', 
                      backgroundColor: 'var(--bg-tertiary)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                        <span style={{ 
                          width: '6px', 
                          height: '6px', 
                          borderRadius: '50%', 
                          backgroundColor: categoryColors[item.category || 'Pantry'] || 'var(--text-muted)',
                          flexShrink: 0
                        }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>×{item.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {displayItems.length > 20 && (
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
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
      <footer style={{ textAlign: 'center', padding: '1rem', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
        Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </footer>
    </div>
  );
}