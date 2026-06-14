'use client';

import { useState, useEffect, Fragment } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { GroceryItem, Meal, MealCoverage, hasGeneratedDeliveryOnDate } from '@/lib/meals-data';
import { cleanItemName, deduplicateMatchedItems, MatchedItem } from '@/lib/item-utils';
import { getMealType } from '@/lib/meal-type';
import { formatDayMonthUpper, formatShortDayMonth, formatWeekdayShort, parseISODateLocal, toISODateLocal } from '@/lib/date-utils';
import { Check, X, Calendar, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import type { DashboardData } from '@/lib/dashboard-data';
import {
  buildHeadlineMetrics,
  classifyOrderItemMatch,
  deriveCollapsedCoverageColor,
  findReceiptItemForMatchedItem,
  getDisplayedProductName,
  getPartialMealMissingExplanation,
  getCoverageStatusColor,
  getCoverageStatusLabel,
  getTodoistCompletionLabel,
  getProductModalPrice,
  isTodoistMealCompleted,
  resolveProductInfoForItem,
  sortOrderItems,
  type OrderItemSortMode,
  transformCachedOrderSafely,
} from '@/lib/dashboard-ui-utils';

interface DashboardClientProps {
  today: string;
  defaultDateRange?: { start: string; end: string };
  data: DashboardData;
}

export function DashboardClient({ today, data }: DashboardClientProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [matchedFilter, setMatchedFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [itemSort, setItemSort] = useState<OrderItemSortMode>('name-asc');
  const [selectedMealData, setSelectedMealData] = useState<MealCoverage | null>(null);
  const [selectedItem, setSelectedItem] = useState<GroceryItem | null>(null);
  const [showCount, setShowCount] = useState(10);
  const [collapsedMealTypes, setCollapsedMealTypes] = useState<Set<string>>(new Set(['breakfast', 'lunch']));
  
  useEffect(() => {
    const checkWidth = () => setIsDesktop(window.innerWidth >= 1024);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  const receipt = transformCachedOrderSafely(data.latestOrder);
  const deliveries = data.deliveryWindows;
  const coverage = data.coverage ?? [];
  const headlineMetrics = buildHeadlineMetrics(data.mealsCheckSummary, receipt, coverage, deliveries);
  
  const unmatchedItems = receipt?.items || [];

  const trulyUnmatchedItems = unmatchedItems.filter(item => classifyOrderItemMatch(item, coverage) === 'unmatched');

  const itemsByCategory: Record<string, typeof unmatchedItems> = {};
  unmatchedItems.forEach(item => {
    const cat = item.category || 'Pantry';
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push(item);
  });

  const categories = Object.keys(itemsByCategory).sort();
  

  const getCategoryIcon = (itemName: string): string => {
    const name = itemName.toLowerCase();
    if (name.includes('strawberr') || name.includes('blueberr') || name.includes('raspberr') || name.includes('blackberr') || name.includes('grape')) return '🍇';
    if (name.includes('apple') || name.includes('banana') || name.includes('fruit')) return '🍎';
    if (name.includes('tomato') || name.includes('pepper') || name.includes('cucumber') || name.includes('celery') || name.includes('lettuce') || name.includes('salad') || name.includes('carrot')) return '🥕';
    if (name.includes('broccoli') || name.includes('spinach') || name.includes('kale')) return '🥦';
    if (name.includes('chicken') || name.includes('beef') || name.includes('pork') || name.includes('gammon') || name.includes('steak') || name.includes('bacon') || name.includes('ham') || name.includes('sausage') || name.includes('meat')) return '🥩';
    if (name.includes('fish') || name.includes('salmon') || name.includes('tuna')) return '🐟';
    if (name.includes('milk') || name.includes('cheese') || name.includes('yoghurt') || name.includes('butter') || name.includes('cream')) return '🧀';
    if (name.includes('egg')) return '🥚';
    if (name.includes('bread') || name.includes('pizza') || name.includes('pasta') || name.includes('noodle')) return '🍞';
    if (name.includes('rice') || name.includes('risotto')) return '🍚';
    if (name.includes('potato')) return '🥔';
    if (name.includes('juice') || name.includes('smoothie') || name.includes('drink')) return '🧃';
    if (name.includes('water') || name.includes('sparkling')) return '💧';
    if (name.includes('coffee') || name.includes('tea')) return '☕';
    if (name.includes('frozen') || name.includes('microwave')) return '🧊';
    if (name.includes('biscuit') || name.includes('cookie') || name.includes('cake') || name.includes('chocolate') || name.includes('sweet')) return '🍪';
    if (name.includes('popcorn')) return '🍿';
    if (name.includes('salad') || name.includes('bowl')) return '🥗';
    return '📦';
  };

  const displayItems = sortOrderItems(unmatchedItems.filter(item => {
    const catMatch = selectedCategories.size === 0 || selectedCategories.has(item.category || 'Pantry');
    const isUnmatched = trulyUnmatchedItems.includes(item);
    const isMatched = !isUnmatched;
    const matchedMatch = matchedFilter === 'all' || (matchedFilter === 'matched' && isMatched) || (matchedFilter === 'unmatched' && isUnmatched);
    return catMatch && matchedMatch;
  }), itemSort);

  const coverageByDate: Record<string, typeof coverage> = {};
  coverage.forEach(c => {
    const date = c.meal.date;
    if (!coverageByDate[date]) coverageByDate[date] = [];
    coverageByDate[date].push(c);
  });
  
  // Build a rolling 7-day window (Mon first, Sun last).
  // For past days (before today), show the same weekday 7 days ahead in the
  // display, but look up coverage using the shifted future date (not the old
  // past date) so meals are found correctly.
  const todayDate = parseISODateLocal(today);
  const todayDow = todayDate.getDay(); // 0=Sun, 1=Mon, ... 6=Sat

  // Find last Monday relative to today
  const daysSinceMonday = todayDow === 0 ? 6 : todayDow - 1;
  const thisMonday = new Date(todayDate);
  thisMonday.setDate(todayDate.getDate() - daysSinceMonday);

  const days: { date: string; displayDate: string; isToday: boolean; dataKey: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(thisMonday);
    d.setDate(thisMonday.getDate() + i);
    const dateStr = toISODateLocal(d);
    const isPast = d < todayDate;

    let displayDate: string;
    let dataKey: string;
    if (isPast) {
      // Show as same weekday 7 days ahead, and look up using that shifted date
      const nextWeek = new Date(d);
      nextWeek.setDate(d.getDate() + 7);
      displayDate = toISODateLocal(nextWeek);
      dataKey = displayDate; // use shifted date so meals are found
    } else {
      displayDate = dateStr;
      dataKey = dateStr;
    }

    days.push({ date: dateStr, displayDate, isToday: dateStr === today, dataKey });
  }

  const mealTypesWithMeals: Set<string> = new Set();
  coverage.forEach(c => { mealTypesWithMeals.add(getMealType(c.meal)); });

  useEffect(() => {
    const newCollapsed = new Set<string>();
    ['breakfast', 'lunch', 'dinner'].forEach(type => { if (!mealTypesWithMeals.has(type)) newCollapsed.add(type); });
    setCollapsedMealTypes(newCollapsed);
  }, []);

  const toggleMealType = (type: string) => {
    const newCollapsed = new Set(collapsedMealTypes);
    if (newCollapsed.has(type)) { newCollapsed.delete(type); } else { newCollapsed.add(type); }
    setCollapsedMealTypes(newCollapsed);
  };

  const getStatusColor = (status: string, score: number) => {
    if (status === 'covered' || score >= 80) return 'var(--accent-emerald)';
    if (status === 'partial' || score >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  const cardStyle = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' };

  const categoryColors: Record<string, string> = {
    Fresh: 'var(--accent-emerald)', Dairy: 'var(--accent-blue)', Meat: 'var(--accent-rose)',
    Bakery: 'var(--accent-amber)', Frozen: 'var(--accent-cyan)', Pantry: 'var(--accent-purple)',
    Beverages: 'var(--accent-pink)',
  };

  const selectedProductInfo = selectedItem ? resolveProductInfoForItem(selectedItem) : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, padding: '0.75rem 1rem', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>🍽️ Meals Dashboard</h1>
          <ThemeToggle />
        </div>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order Total</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{headlineMetrics.orderTotal !== null ? `£${headlineMetrics.orderTotal.toFixed(2)}` : '—'}</p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-blue-bg)' }}>
                <Calendar style={{ width: '20px', height: '20px', color: 'var(--accent-blue)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery</p>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {headlineMetrics.deliveryDate ? formatShortDayMonth(headlineMetrics.deliveryDate) : '—'}
            </p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }} onClick={() => setMatchedFilter(matchedFilter === 'matched' ? 'all' : 'matched')}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meals Covered</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{headlineMetrics.mealsCovered}/{headlineMetrics.mealsTotal}</p>
            {matchedFilter === 'matched' && <p style={{ fontSize: '9px', color: 'var(--accent-emerald)', fontWeight: '600', marginTop: '2px' }}>Filtered</p>}
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }} onClick={() => setMatchedFilter(matchedFilter === 'unmatched' ? 'all' : 'unmatched')}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-rose-bg)' }}>
                <X style={{ width: '20px', height: '20px', color: 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unmatched</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{headlineMetrics.unmatchedGroceries}</p>
            {matchedFilter === 'unmatched' && <p style={{ fontSize: '9px', color: 'var(--accent-rose)', fontWeight: '600', marginTop: '2px' }}>Filtered</p>}
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: headlineMetrics.coveragePercentage >= 80 ? 'var(--accent-emerald-bg)' : headlineMetrics.coveragePercentage >= 50 ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)' }}>
                <TrendingUp style={{ width: '20px', height: '20px', color: headlineMetrics.coveragePercentage >= 80 ? 'var(--accent-emerald)' : headlineMetrics.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Coverage</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: headlineMetrics.coveragePercentage >= 80 ? 'var(--accent-emerald)' : headlineMetrics.coveragePercentage >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{headlineMetrics.coveragePercentage}%</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'stretch' }}>
          
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>📅 WEEK MEALS</h2>
            </div>
            
            <div style={{ padding: '1rem' }}>
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

              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <th style={{ width: '80px', padding: '0.75rem 0.5rem', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Meal</span>
                      </th>
                      {days.map(({ date, displayDate, dataKey, isToday }) => {
                        const dayCoverage = coverageByDate[dataKey] || [];
                        const avgPct = dayCoverage.length > 0 ? Math.round(dayCoverage.reduce((s, c) => s + c.coverageScore, 0) / dayCoverage.length) : 0;
                        const hasMeals = dayCoverage.length > 0;
                        
                        return (
                          <th key={date} style={{ 
                            textAlign: 'center' as const, padding: '0.5rem 0.25rem',
                            borderLeft: '1px solid var(--border-color)',
                            borderBottom: isToday ? '3px solid var(--accent-emerald)' : '1px solid var(--border-color)',
                            backgroundColor: isToday ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                            boxShadow: isToday ? 'inset 5px 0 0 var(--accent-amber)' : 'none',
                            position: 'relative' as const
                          }}>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>
                              {formatWeekdayShort(displayDate)}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 'bold', color: hasMeals ? 'var(--text-primary)' : 'var(--text-secondary)', display: 'block' }}>
                                {formatDayMonthUpper(displayDate)}
                              </span>
                              {hasGeneratedDeliveryOnDate(deliveries, dataKey) && (
                                <span style={{ fontSize: '8px', fontWeight: '700', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'var(--accent-blue)', color: 'white', textTransform: 'uppercase' }}>Delivery</span>
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
                          <tr onClick={() => hasMeals && toggleMealType(mealType)} style={{ cursor: hasMeals ? 'pointer' : 'default', backgroundColor: isCollapsed ? 'var(--bg-tertiary)' : 'transparent', opacity: hasMeals ? 1 : 0.5 }}>
                            <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid var(--border-color)', verticalAlign: 'middle', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {isCollapsed ? <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} /> : <ChevronDown style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />}
                              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{mealType}</span>
                            </td>
                            {days.map(({ date, displayDate, dataKey, isToday }) => (
                              <td key={date} style={{ padding: '0.4rem 0.25rem', borderLeft: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', backgroundColor: isToday ? 'rgba(245, 158, 11, 0.12)' : 'transparent', boxShadow: isToday ? 'inset 5px 0 0 var(--accent-amber)' : 'none', textAlign: 'center' as const }}>
                                {!hasMeals && <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>No meals</span>}
                                {hasMeals && isCollapsed && (() => {
                                  const dayMeals = (coverageByDate[dataKey] || []).filter(c => getMealType(c.meal) === mealType);
                                  if (dayMeals.length === 0) return <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>—</span>;
                                  const avgCoverage = Math.round(dayMeals.reduce((sum, m) => sum + m.coverageScore, 0) / dayMeals.length);
                                  const barColor = deriveCollapsedCoverageColor(dayMeals);
                                  return (
                                    <div style={{ padding: '0.4rem 0.5rem', borderRadius: '6px', backgroundColor: barColor, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50px', gap: '0.25rem' }}>
                                      {dayMeals.length > 1 && <span style={{ fontSize: '10px', fontWeight: '700', color: 'white' }}>{dayMeals.length} meals</span>}
                                      <span style={{ fontSize: '11px', fontWeight: '600', color: 'white' }}>{avgCoverage}%</span>
                                    </div>
                                  );
                                })()}
                              </td>
                            ))}
                          </tr>
                          
                          {!isCollapsed && (
                            <tr>
                              <td style={{ borderBottom: '1px solid var(--border-color)' }} />
                              {days.map(({ date, displayDate, dataKey, isToday }) => {
                                const dayMeals = (coverageByDate[dataKey] || []).filter(c => getMealType(c.meal) === mealType);
                                
                                return (
                                  <td key={date} style={{ padding: '0.75rem 0.5rem', borderLeft: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', backgroundColor: isToday ? 'rgba(245, 158, 11, 0.12)' : 'transparent', boxShadow: isToday ? 'inset 5px 0 0 var(--accent-amber)' : 'none', verticalAlign: 'top' as const }}>
                                    {dayMeals.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        {dayMeals.map((meal, idx) => {
                                          const barColor = getStatusColor(meal.status, meal.coverageScore);
                                          return (
                                            <div key={idx} onClick={() => setSelectedMealData(meal)} style={{ padding: '0.5rem 0.5rem', borderRadius: '6px', backgroundColor: barColor, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', minHeight: '50px', boxSizing: 'border-box', cursor: 'pointer', outline: 'none', outlineOffset: '2px' }}>
                                              <span style={{ fontSize: '10px', fontWeight: '600', color: 'white', textAlign: 'center', lineHeight: '1.2', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{meal.meal.content}</span>
                                              {isTodoistMealCompleted(meal.meal) && <span title={getTodoistCompletionLabel(meal.meal) || undefined} style={{ fontSize: '8px', fontWeight: '700', padding: '1px 4px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.9)', color: 'var(--accent-emerald)' }}>✓ Todoist</span>}
                                              {meal.meal.labels && meal.meal.labels.length > 0 && <span style={{ fontSize: '8px', fontWeight: '600', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' }}>🏷️ {meal.meal.labels.join(', ')}</span>}
                                              <span style={{ fontSize: '9px', fontWeight: '700', color: 'white', flexShrink: 0 }}>{getCoverageStatusLabel(meal.status)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : <span style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>—</span>}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ ...cardStyle, padding: '1rem' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'center' as const }}>🛒 ORDER ITEMS BY CATEGORY</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'minmax(0, 1fr) auto auto' : '1fr', gap: '0.75rem', alignItems: 'start', marginBottom: '0.75rem' }}>
                <div>
                  <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Categories</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button onClick={() => { setSelectedCategories(new Set()); setMatchedFilter('all'); }} style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '11px', fontWeight: '600', border: '1px solid', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: selectedCategories.size === 0 && matchedFilter === 'all' ? 'var(--accent-emerald)' : 'transparent', borderColor: selectedCategories.size === 0 && matchedFilter === 'all' ? 'var(--accent-emerald)' : 'var(--border-color)', color: selectedCategories.size === 0 && matchedFilter === 'all' ? 'white' : 'var(--text-primary)' }}>All</button>
                    {categories.map(cat => {
                      const isSelected = selectedCategories.has(cat);
                      return (
                        <button key={cat} onClick={() => { const next = new Set(selectedCategories); next.has(cat) ? next.delete(cat) : next.add(cat); setSelectedCategories(next); }} style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '11px', fontWeight: '600', border: '1px solid', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: isSelected ? categoryColors[cat] || 'var(--accent-blue)' : 'transparent', borderColor: isSelected ? categoryColors[cat] || 'var(--accent-blue)' : 'var(--border-color)', color: isSelected ? 'white' : 'var(--text-primary)' }}>
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Match</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['all', 'matched', 'unmatched'].map(f => (
                      <button key={f} onClick={() => setMatchedFilter(f as typeof matchedFilter)} style={{ padding: '0.3rem 0.7rem', borderRadius: '15px', fontSize: '10px', fontWeight: '600', border: '1px solid', cursor: 'pointer', backgroundColor: matchedFilter === f ? 'var(--accent-blue)' : 'transparent', borderColor: matchedFilter === f ? 'var(--accent-blue)' : 'var(--border-color)', color: matchedFilter === f ? 'white' : 'var(--text-secondary)', textTransform: 'capitalize' }}>{f}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Sort</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {([
                      ['name-asc', 'Name A–Z'],
                      ['name-desc', 'Name Z–A'],
                      ['price-asc', 'Price ↑'],
                      ['price-desc', 'Price ↓'],
                    ] as [OrderItemSortMode, string][]).map(([sort, label]) => (
                      <button key={sort} onClick={() => setItemSort(sort)} style={{ padding: '0.3rem 0.7rem', borderRadius: '15px', fontSize: '10px', fontWeight: '600', border: '1px solid', cursor: 'pointer', backgroundColor: itemSort === sort ? 'var(--accent-purple)' : 'transparent', borderColor: itemSort === sort ? 'var(--accent-purple)' : 'var(--border-color)', color: itemSort === sort ? 'white' : 'var(--text-secondary)' }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {displayItems.slice(0, showCount).map((item, idx) => {
                  const qty = item.quantity || 1;
                  const unitPrice = item.price ? item.price / qty : 0;
                  const totalPrice = item.price || 0;
                  const isUnmatched = trulyUnmatchedItems.includes(item);
                  return (
                    <div key={idx} onClick={() => {
                      const sub = receipt?.substitutions?.find(s => s.original.toLowerCase() === item.name.toLowerCase());
                      setSelectedItem({ ...item, substitutedWith: item.substitutedWith || sub?.substitutedWith });
                    }} style={{ padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isUnmatched ? 1 : 0.7, borderLeft: isUnmatched ? '3px solid var(--accent-rose)' : '3px solid var(--accent-emerald)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span style={{ color: isUnmatched ? 'var(--accent-rose)' : 'var(--accent-emerald)', fontSize: '14px', flexShrink: 0 }}>{isUnmatched ? '✗' : '✓'}</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanItemName(item.name)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        {unitPrice > 0 ? (<><span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{qty > 1 ? `${qty}× £${unitPrice.toFixed(2)}` : ''}</span><span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-emerald)' }}>£{totalPrice.toFixed(2)}</span></>) : <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>(price N/A)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {displayItems.length > showCount && (
                <button onClick={() => setShowCount(prev => prev === 10 ? displayItems.length : 10)} style={{ marginTop: '0.5rem', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '11px', fontWeight: '600', border: '1px solid var(--border-color)', cursor: 'pointer', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                  {showCount === 10 ? `Show all ${displayItems.length} items` : 'Collapse to top 10'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {selectedMealData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setSelectedMealData(null)}>
          <div style={{ ...cardStyle, padding: '1.5rem', maxWidth: '400px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{selectedMealData.meal.content}</h3>
                <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px', backgroundColor: selectedMealData.status === 'covered' ? 'var(--accent-emerald-bg)' : selectedMealData.status === 'partial' ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)', color: selectedMealData.status === 'covered' ? 'var(--accent-emerald)' : selectedMealData.status === 'partial' ? 'var(--accent-amber)' : 'var(--accent-rose)', textTransform: 'capitalize' }}>{selectedMealData.status}</span>
                {isTodoistMealCompleted(selectedMealData.meal) && <div style={{ marginTop: '0.5rem', fontSize: '11px', fontWeight: '700', padding: '4px 8px', borderRadius: '999px', backgroundColor: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald)', display: 'inline-block' }}>{getTodoistCompletionLabel(selectedMealData.meal)}</div>}
              </div>
              <button onClick={() => setSelectedMealData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', padding: '0.25rem' }}>✕</button>
            </div>
            
            <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)' }}>
              <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Coverage status</p>
              <span style={{ fontSize: '13px', fontWeight: '700', padding: '4px 10px', borderRadius: '999px', backgroundColor: selectedMealData.status === 'covered' ? 'var(--accent-emerald-bg)' : selectedMealData.status === 'partial' ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)', color: getCoverageStatusColor(selectedMealData.status) }}>
                {getCoverageStatusLabel(selectedMealData.status)}
              </span>
            </div>

            {(() => {
              const deduped = deduplicateMatchedItems(selectedMealData.matchedItems || []);
              if (deduped.length === 0) return null;
              return (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Matched Items</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {deduped.map((item, idx) => {
                    const productItem = findReceiptItemForMatchedItem(item, receipt.items);
                    return (
                    <button key={idx} type="button" onClick={() => { setSelectedItem(productItem); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--accent-emerald-bg)', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span style={{ color: 'var(--accent-emerald)', fontSize: '12px', flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanItemName(item.name)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        {item.quantity && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>× {item.quantity}</span>}
                        {item.price !== null && <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-emerald)' }}>£{item.price.toFixed(2)}</span>}
                      </div>
                    </button>
                    );
                  })}
                </div>
              </div>
              );
            })()}

            {(() => {
              const missingExplanation = getPartialMealMissingExplanation(selectedMealData);
              if (missingExplanation.length === 0) return null;
              return (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Expected Items</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {missingExplanation.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--accent-amber-bg)', border: 'none', width: '100%', textAlign: 'left' }}>
                        <span style={{ color: 'var(--accent-amber)', fontSize: '12px', flexShrink: 0 }}>•</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {selectedMealData.notes && (<div style={{ marginBottom: '1rem' }}><h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Notes</h4><p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{selectedMealData.notes}</p></div>)}

            {selectedMealData.meal.id && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', textAlign: 'center' }}>
                <a href={`https://todoist.com/app/task/${selectedMealData.meal.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent-blue)', textDecoration: 'none' }}>View in Todoist →</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Info Modal */}
      {selectedItem && selectedProductInfo && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem'
          }}
          onClick={() => { setSelectedItem(null); }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)', borderRadius: '12px',
              padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflow: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, flex: 1 }}>{selectedProductInfo.title || getDisplayedProductName(selectedItem.name)}</h3>
              <button
                onClick={() => { setSelectedItem(null); }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 0 0 1rem' }}
              >×</button>
            </div>

            <div>
              {selectedProductInfo.image ? (
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <img
                    src={selectedProductInfo.image}
                    alt={selectedItem.name}
                    style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', marginBottom: '1rem', padding: '2rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '64px' }}>{getCategoryIcon(selectedItem.name)}</span>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Product image not available</p>
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Description</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{selectedProductInfo.description}</p>
              </div>

              {selectedProductInfo.storage && (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Storage & Preparation</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{selectedProductInfo.storage}</p>
                </div>
              )}

              {selectedProductInfo.productUrl && (
                <div style={{ marginBottom: '1rem' }}>
                  <a href={selectedProductInfo.productUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent-blue)', textDecoration: 'none' }}>Open product page →</a>
                </div>
              )}

              {selectedItem.substitutedWith && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--accent-amber-bg)', border: '1px solid var(--accent-amber-border)', borderRadius: '8px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Substituted With</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.4' }}>{selectedItem.substitutedWith}</p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Price</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>£{getProductModalPrice(selectedItem).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
