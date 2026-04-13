'use client';

import { useState, useEffect, Fragment } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { HistoricalTrends } from '@/components/historical-trends';
import { dashboardConfig } from '@/lib/config';
import { calculateCoverageSummary, getUpcomingDeliveries } from '@/lib/meals-data';
import { realCoverage, realLatestOrder, transformCachedOrder } from '@/lib/real-data';
import { DashboardState, filterCoverage } from '@/lib/dashboard-state';
import { Check, X, Calendar, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { findProductInfo } from '@/lib/product-database';

export default function MealsDashboardPage() {
  const [state] = useState<DashboardState>({
    selectedShop: 'current',
    statusFilter: 'all',
    expandedMealId: null,
    dateRange: { start: '2026-04-13', end: '2026-04-19' },
  });

  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [matchedFilter, setMatchedFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<{name: string, price: number, quantity: number} | null>(null);
  const [productInfo, setProductInfo] = useState<{description: string, storage: string, nutrition: string, image: string} | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [showCount, setShowCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

  // Identify unmatched items using word-based matching
  // An item is "matched" if any of its words appear in a meal's content, or if any meal keywords appear in the item name
  const trulyUnmatchedItems = unmatchedItems.filter(item => {
    const itemWords = item.name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    const isMatched = coverage.some(c => {
      const mealWords = c.meal.content.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      // Check if any item word matches any meal word
      return itemWords.some(iw => mealWords.some(mw => mw.includes(iw) || iw.includes(mw)));
    });
    return !isMatched;
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
  
  // Get items that match a specific meal using word-based matching
  const getMatchedItemsForMeal = (mealContent: string) => {
    const mealCoverage = coverage.find(c => c.meal.content === mealContent);
    if (!mealCoverage) return [];
    const mealWords = mealContent.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    return unmatchedItems.filter(item => {
      const itemWords = item.name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      return itemWords.some(iw => mealWords.some(mw => mw.includes(iw) || iw.includes(mw)));
    });
  };
  
  // Fetch product info from local database
  const fetchProductInfo = async (itemName: string) => {
    setLoadingProduct(true);
    setProductInfo(null);
    
    // Simulate a brief loading for UX
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const product = findProductInfo(itemName);
    if (product) {
      setProductInfo({
        description: product.description,
        storage: product.storage,
        nutrition: product.nutrition,
        image: product.image
      });
    } else {
      setProductInfo({
        description: 'Product information not available in database.',
        storage: 'Check packaging for storage instructions.',
        nutrition: 'Nutrition information not available.',
        image: ''
      });
    }
    
    setLoadingProduct(false);
  };
  
  // Clear all filters
  const clearAllFilters = () => {
    setSelectedCategories(new Set());
    setMatchedFilter('all');
    setSelectedMeal(null);
    setMaxPrice(null);
    setShowCount(20);
  };
  
  const displayItems = unmatchedItems.filter(item => {
    const catMatch = selectedCategories.size === 0 || selectedCategories.has(item.category || 'Pantry');
    const priceMatch = maxPrice === null || (item.price || 0) <= maxPrice;
    
    // Matched/unmatched filter
    const isUnmatched = trulyUnmatchedItems.includes(item);
    const isMatched = !isUnmatched;
    const matchedMatch = matchedFilter === 'all' || 
      (matchedFilter === 'matched' && isMatched) || 
      (matchedFilter === 'unmatched' && isUnmatched);
    
    // Meal filter - if a meal is selected, show only items that match that meal's content
    const mealMatch = !selectedMeal || (() => {
      const mealWords = selectedMeal.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      const itemWords = item.name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      return itemWords.some(iw => mealWords.some(mw => mw.includes(iw) || iw.includes(mw)));
    })();
    
    return catMatch && priceMatch && matchedMatch && mealMatch;
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

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }} onClick={() => { setMatchedFilter(matchedFilter === 'matched' ? 'all' : 'matched'); setSelectedMeal(null); }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meals Covered</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{covered}/{coverage.length}</p>
            {matchedFilter === 'matched' && <p style={{ fontSize: '9px', color: 'var(--accent-emerald)', fontWeight: '600', marginTop: '2px' }}>Filtered</p>}
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }} onClick={() => { setMatchedFilter(matchedFilter === 'unmatched' ? 'all' : 'unmatched'); setSelectedMeal(null); }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-rose-bg)' }}>
                <X style={{ width: '20px', height: '20px', color: 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unmatched</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{unmatchedItems.length}</p>
            {matchedFilter === 'unmatched' && <p style={{ fontSize: '9px', color: 'var(--accent-rose)', fontWeight: '600', marginTop: '2px' }}>Filtered</p>}
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
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.5rem', alignItems: 'stretch' as const }}>
          
          {/* Full Width Calendar */}
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch' as const }}>
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

              {/* Week Calendar - DayPilot style */}
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  minWidth: '700px',
                  tableLayout: 'fixed'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <th style={{ 
                        width: '80px', 
                        padding: '0.75rem 0.5rem', 
                        borderBottom: '1px solid var(--border-color)',
                        textAlign: 'left'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Meal</span>
                      </th>
                      {days.map(({ date, isToday }) => {
                        const dayCoverage = coverageByDate[date] || [];
                        const avgPct = dayCoverage.length > 0 
                          ? Math.round(dayCoverage.reduce((s, c) => s + c.coverageScore, 0) / dayCoverage.length)
                          : 0;
                        const hasMeals = dayCoverage.length > 0;
                        
                        return (
                          <th key={date} style={{ 
                            textAlign: 'center' as const,
                            padding: '0.5rem 0.25rem',
                            borderLeft: '1px solid var(--border-color)',
                            borderBottom: '1px solid var(--border-color)',
                            position: 'relative' as const
                          }}>
                            <span style={{ 
                              fontSize: '11px', 
                              fontWeight: '600', 
                              color: 'var(--text-secondary)', 
                              textTransform: 'uppercase',
                              display: 'block'
                            }}>
                              {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <span style={{ 
                                fontSize: '14px', 
                                fontWeight: 'bold', 
                                color: hasMeals ? 'var(--text-primary)' : 'var(--text-secondary)',
                                display: 'block'
                              }}>
                                {new Date(date).getDate()} {new Date(date).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
                              </span>
                              {deliveries.some(d => d.date === date) && (
                                <span style={{
                                  fontSize: '8px',
                                  fontWeight: '700',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  backgroundColor: 'var(--accent-blue)',
                                  color: 'white',
                                  textTransform: 'uppercase'
                                }}>
                                  Delivery
                                </span>
                              )}
                            </div>
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
                            style={{ 
                              cursor: hasMeals ? 'pointer' : 'default',
                              backgroundColor: isCollapsed ? 'var(--bg-tertiary)' : 'transparent',
                              opacity: hasMeals ? 1 : 0.5
                            }}
                          >
                            <td style={{ 
                              padding: '0.75rem 0.5rem',
                              borderBottom: '1px solid var(--border-color)',
                              verticalAlign: 'middle',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              {isCollapsed ? (
                                <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
                              ) : (
                                <ChevronDown style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
                              )}
                              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                {mealType}
                              </span>
                            </td>
                            {days.map(({ date }) => (
                              <td key={date} style={{ 
                                padding: '0.4rem 0.25rem',
                                borderLeft: '1px solid var(--border-color)',
                                borderBottom: '1px solid var(--border-color)',
                                textAlign: 'center' as const
                              }}>
                                {!hasMeals && (
                                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>No meals</span>
                                )}
                                {hasMeals && isCollapsed && (() => {
                                  const dayMeals = (coverageByDate[date] || []).filter(c => {
                                    const m = c.meal.content.toLowerCase();
                                    if (mealType === 'breakfast') return m.includes('breakfast') || m.includes('cereal');
                                    if (mealType === 'lunch') return m.includes('lunch') || m.includes('sandwich');
                                    return m.includes('dinner') || m.includes('tea') || (!m.includes('breakfast') && !m.includes('lunch'));
                                  });
                                  const meal = dayMeals[0];
                                  if (!meal) return <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>—</span>;
                                  const barColor = getStatusColor(meal.status, meal.coverageScore);
                                  return (
                                    <div style={{
                                      padding: '0.4rem 0.5rem',
                                      borderRadius: '6px',
                                      backgroundColor: barColor,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minHeight: '50px',
                                      gap: '0.25rem'
                                    }}>
                                      <span style={{ fontSize: '11px', fontWeight: '600', color: 'white' }}>{meal.coverageScore}%</span>
                                    </div>
                                  );
                                })()}
                              </td>
                            ))}
                          </tr>
                          
                          {/* Meal Event Bars */}
                          {!isCollapsed && (
                            <tr>
                              <td style={{ borderBottom: '1px solid var(--border-color)' }} />
                              {days.map(({ date }) => {
                                const dayMeals = (coverageByDate[date] || []).filter(c => {
                                  const m = c.meal.content.toLowerCase();
                                  if (mealType === 'breakfast') return m.includes('breakfast') || m.includes('cereal');
                                  if (mealType === 'lunch') return m.includes('lunch') || m.includes('sandwich');
                                  return m.includes('dinner') || m.includes('tea') || (!m.includes('breakfast') && !m.includes('lunch'));
                                });
                                
                                const meal = dayMeals[0];
                                const barColor = meal ? getStatusColor(meal.status, meal.coverageScore) : 'transparent';
                                
                                return (
                                  <td key={date} style={{ 
                                    padding: '0.75rem 0.5rem',
                                    borderLeft: '1px solid var(--border-color)',
                                    borderBottom: '1px solid var(--border-color)',
                                    verticalAlign: 'middle' as const
                                  }}>
                                    {meal ? (
                                      <div 
                                        onClick={() => setSelectedMeal(selectedMeal === meal.meal.content ? null : meal.meal.content)}
                                        style={{ 
                                          padding: '0.75rem 0.75rem',
                                          borderRadius: '6px',
                                          backgroundColor: barColor,
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '0.35rem',
                                          minHeight: '80px',
                                          boxSizing: 'border-box',
                                          cursor: 'pointer',
                                          outline: selectedMeal === meal.meal.content ? '3px solid white' : 'none',
                                          outlineOffset: '2px'
                                        }}>
                                        <span style={{ 
                                          fontSize: '12px', 
                                          fontWeight: '600', 
                                          color: 'white',
                                          textAlign: 'center',
                                          lineHeight: '1.2',
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden'
                                        }}>
                                          {meal.meal.content}
                                        </span>
                                        <span style={{ 
                                          fontSize: '10px', 
                                          fontWeight: '700', 
                                          color: 'white',
                                          flexShrink: 0
                                        }}>
                                          {meal.coverageScore}%
                                        </span>
                                      </div>
                                    ) : (
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>—</span>
                                    )}
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

          {/* Order Items Section */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
            
            {/* Categories with Filter */}
            <div style={{ ...cardStyle, padding: '1rem' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'center' as const }}>🛒 ORDER ITEMS BY CATEGORY</h2>
              
              {/* Category Pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'center' }}>
                <button
                  onClick={() => { setSelectedCategories(new Set()); setMatchedFilter('all'); setSelectedMeal(null); }}
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '20px', 
                    fontSize: '11px',
                    fontWeight: '600',
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: selectedCategories.size === 0 && matchedFilter === 'all' && !selectedMeal ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                    borderColor: selectedCategories.size === 0 && matchedFilter === 'all' && !selectedMeal ? 'var(--accent-blue)' : 'var(--border-color)',
                    color: selectedCategories.size === 0 && matchedFilter === 'all' && !selectedMeal ? 'white' : 'var(--text-secondary)'
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
              </div>
              
              {/* Matched/Unmatched/Meal Filter */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'center', alignItems: 'center' }}>
                {(matchedFilter !== 'all' || selectedMeal || selectedCategories.size > 0 || maxPrice !== null) && (
                  <button
                    onClick={clearAllFilters}
                    style={{
                      padding: '0.4rem 0.8rem',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => { setMatchedFilter(matchedFilter === 'matched' ? 'all' : 'matched'); setSelectedMeal(null); }}
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '8px', 
                    fontSize: '11px',
                    fontWeight: '600',
                    border: '2px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: matchedFilter === 'matched' ? 'var(--accent-emerald)' : 'transparent',
                    borderColor: matchedFilter === 'matched' ? 'var(--accent-emerald)' : 'var(--accent-emerald)',
                    color: matchedFilter === 'matched' ? 'white' : 'var(--accent-emerald)'
                  }}
                >
                  ✓ Matched ({unmatchedItems.length - trulyUnmatchedItems.length})
                </button>
                <button
                  onClick={() => { setMatchedFilter(matchedFilter === 'unmatched' ? 'all' : 'unmatched'); setSelectedMeal(null); }}
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '8px', 
                    fontSize: '11px',
                    fontWeight: '600',
                    border: '2px dashed',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: matchedFilter === 'unmatched' ? 'var(--accent-rose)' : 'transparent',
                    borderColor: matchedFilter === 'unmatched' ? 'var(--accent-rose)' : 'var(--accent-rose)',
                    color: matchedFilter === 'unmatched' ? 'white' : 'var(--accent-rose)'
                  }}
                >
                  ✗ Unmatched ({trulyUnmatchedItems.length})
                </button>
              </div>
              
              {/* Active Meal Filter Indicator */}
              {selectedMeal && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Filtering by:</span>
                  <span style={{ 
                    padding: '0.25rem 0.6rem', 
                    borderRadius: '6px', 
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: 'var(--accent-emerald)',
                    color: 'white'
                  }}>
                    {selectedMeal}
                  </span>
                  <button 
                    onClick={() => setSelectedMeal(null)}
                    style={{ 
                      padding: '0.2rem 0.4rem', 
                      borderRadius: '4px', 
                      fontSize: '10px',
                      fontWeight: '600',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
              
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
                  {selectedCategories.size === 0 && matchedFilter === 'all' && !selectedMeal ? 'All' : 'Filtered'} Items ({showCount > displayItems.length ? displayItems.length : showCount}/{displayItems.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' }}>
                  {displayItems.slice(0, showCount).map((item, idx) => (
                    <div key={idx} 
                      onClick={() => { setSelectedItem({ name: item.name, price: item.price || 0, quantity: item.quantity }); fetchProductInfo(item.name); }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '0.3rem 0.5rem', 
                        borderRadius: '6px', 
                        backgroundColor: 'var(--bg-tertiary)',
                        cursor: 'pointer'
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
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>×{item.quantity}</span>
                        <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-primary)' }}>£{((item.price || 0) * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {displayItems.length > showCount && (
                  <button 
                    onClick={() => setShowCount(prev => prev + 20)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      marginTop: '0.5rem',
                      borderRadius: '6px',
                      border: '1px dashed var(--border-color)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Load {Math.min(20, displayItems.length - showCount)} more ({displayItems.length - showCount} remaining)
                  </button>
                )}
              </div>
            </div>

            {/* Trends */}
            <div style={{ ...cardStyle, padding: '1rem' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'center' as const }}>📊 TRENDS</h2>
              <HistoricalTrends currentCoverage={summary.coveragePercentage} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '1rem', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
        Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </footer>
      
      {/* Product Modal */}
      {selectedItem && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => { setSelectedItem(null); setProductInfo(null); }}
        >
          <div 
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, flex: 1 }}>{selectedItem.name}</h3>
              <button 
                onClick={() => { setSelectedItem(null); setProductInfo(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '0 0 0 1rem'
                }}
              >
                ×
              </button>
            </div>
            
            {loadingProduct ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Loading product info...</p>
              </div>
            ) : productInfo ? (
              <div>
                {productInfo.image && (
                  <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <img 
                      src={productInfo.image} 
                      alt={selectedItem.name}
                      style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Description</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{productInfo.description}</p>
                </div>
                
                {productInfo.storage && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Storage & Preparation</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{productInfo.storage}</p>
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Price</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>£{(selectedItem.price * selectedItem.quantity).toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Unable to load product information.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}