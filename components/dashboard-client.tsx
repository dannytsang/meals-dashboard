'use client';

import { useState, useEffect, Fragment } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { calculateCoverageSummary, getUpcomingDeliveries, Meal } from '@/lib/meals-data';
import { cleanItemName, deduplicateMatchedItems, MatchedItem } from '@/lib/item-utils';
import { getMealType } from '@/lib/meal-type';
import { formatDayMonthUpper, formatShortDayMonth, formatWeekdayShort, parseISODateLocal, toISODateLocal } from '@/lib/date-utils';
import { realCoverage, realLatestOrder, realMealsCheckSummary, transformCachedOrder } from '@/lib/real-data';
import { syncMeta } from '@/lib/sync-meta';
import { DashboardState, filterCoverage } from '@/lib/dashboard-state';
import { Check, X, Calendar, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { findProductInfo } from '@/lib/product-database';

interface DashboardClientProps {
  today: string;
  defaultDateRange?: { start: string; end: string };
}

export function DashboardClient({ today, defaultDateRange }: DashboardClientProps) {
  const [state] = useState<DashboardState>({
    selectedShop: 'current',
    statusFilter: 'all',
    expandedMealId: null,
    dateRange: defaultDateRange ?? { start: '2026-04-13', end: '2026-04-19' },
  });

  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [matchedFilter, setMatchedFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null);
  const [selectedMealData, setSelectedMealData] = useState<{meal: Meal, status: string, coverageScore: number, matchedItems: MatchedItem[], missingItems: string[], notes?: string} | null>(null);
  const [selectedItem, setSelectedItem] = useState<{name: string, price: number, quantity: number, substitutedWith?: string} | null>(null);
  const [productInfo, setProductInfo] = useState<{description: string, storage: string, nutrition: string, image: string} | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [showCount, setShowCount] = useState(20);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
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
  const deliveries = getUpcomingDeliveries(realLatestOrder.delivery_date);
  const coverage = realCoverage;

  const filteredCoverage = filterCoverage(coverage, state.statusFilter);
  const summary = calculateCoverageSummary(coverage);
  const headlineSummary = realMealsCheckSummary;
  
  const unmatchedItems = receipt?.items || [];

  const trulyUnmatchedItems = unmatchedItems.filter(item => {
    const itemWords = item.name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    const isMatched = coverage.some(c => {
      const mealWords = c.meal.content.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      return itemWords.some(iw => mealWords.some(mw => mw.includes(iw) || iw.includes(mw)));
    });
    return !isMatched;
  });

  const itemsByCategory: Record<string, typeof unmatchedItems> = {};
  unmatchedItems.forEach(item => {
    const cat = item.category || 'Pantry';
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push(item);
  });

  const categories = Object.keys(itemsByCategory).sort();
  
  const maxItemPrice = unmatchedItems.length > 0 ? Math.max(...unmatchedItems.map(i => i.price || 0)) : 10;
  
  const getMatchedItemsForMeal = (mealContent: string) => {
    const mealCoverage = coverage.find(c => c.meal.content === mealContent);
    if (!mealCoverage) return [];
    const mealWords = mealContent.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    return unmatchedItems.filter(item => {
      const itemWords = item.name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      return itemWords.some(iw => mealWords.some(mw => mw.includes(iw) || iw.includes(mw)));
    });
  };
  
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

  const fetchProductInfo = async (itemName: string) => {
    setLoadingProduct(true);
    setProductInfo(null);
    await new Promise(resolve => setTimeout(resolve, 300));
    const product = findProductInfo(itemName);
    let imageUrl = product?.image || '';
    if (!imageUrl) {
      try {
        const searchQuery = encodeURIComponent(itemName + ' tesco');
        const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${searchQuery}&json=1&page_size=1`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
        const searchResponse = await fetch(proxyUrl);
        const searchData = await searchResponse.json();
        if (searchData.products && searchData.products.length > 0) {
          const firstProduct = searchData.products[0];
          if (firstProduct.image_front_url) {
            imageUrl = firstProduct.image_front_url;
          }
        }
      } catch (e) {
        console.log('Open Food Facts lookup failed:', e);
      }
    }
    if (product) {
      setProductInfo({ description: product.description, storage: product.storage, nutrition: product.nutrition, image: imageUrl });
    } else {
      setProductInfo({ description: 'Product information not available in database.', storage: 'Check packaging for storage instructions.', nutrition: 'Nutrition information not available.', image: imageUrl });
    }
    setLoadingProduct(false);
  };
  
  const clearAllFilters = () => {
    setSelectedCategories(new Set());
    setMatchedFilter('all');
    setSelectedMeal(null);
    setMaxPrice(null);
    setShowCount(20);
    setLabelFilter(null);
  };
  
  const displayItems = unmatchedItems.filter(item => {
    const catMatch = selectedCategories.size === 0 || selectedCategories.has(item.category || 'Pantry');
    const priceMatch = maxPrice === null || (item.price || 0) <= maxPrice;
    const isUnmatched = trulyUnmatchedItems.includes(item);
    const isMatched = !isUnmatched;
    const matchedMatch = matchedFilter === 'all' || (matchedFilter === 'matched' && isMatched) || (matchedFilter === 'unmatched' && isUnmatched);
    const mealMatch = !selectedMeal || (() => {
      const mealWords = selectedMeal.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      const itemWords = item.name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
      return itemWords.some(iw => mealWords.some(mw => mw.includes(iw) || iw.includes(mw)));
    })();
    return catMatch && priceMatch && matchedMatch && mealMatch;
  });

  const coverageByDate: Record<string, typeof coverage> = {};
  coverage.forEach(c => {
    const date = c.meal.date;
    if (!coverageByDate[date]) coverageByDate[date] = [];
    coverageByDate[date].push(c);
  });
  
  // Build a rolling 7-day window.
  // For days in the past, we show the same weekday from next week instead,
  // but still look up coverage using the equivalent past date in the data.
  const todayDate = parseISODateLocal(today);
  const todayDow = todayDate.getDay(); // 0=Sun, 1=Mon, ... 6=Sat

  // Find last Monday relative to today (could be today itself if today is Monday)
  const daysSinceMonday = todayDow === 0 ? 6 : todayDow - 1;
  const thisMonday = new Date(todayDate);
  thisMonday.setDate(todayDate.getDate() - daysSinceMonday);

  const days: { date: string; displayDate: string; isToday: boolean; dataKey: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(thisMonday);
    d.setDate(thisMonday.getDate() + i);
    const dateStr = toISODateLocal(d);
    const isPast = d < parseISODateLocal(today);

    // For past days: show next week's date but look up data for the actual past date
    let displayDate: string;
    let dataKey: string;
    if (isPast) {
      // Same weekday, 7 days ahead
      const nextWeek = new Date(d);
      nextWeek.setDate(d.getDate() + 7);
      displayDate = toISODateLocal(nextWeek);
      dataKey = dateStr; // but data is under the actual past date
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
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>£{headlineSummary.order_total?.toFixed(2) || receipt?.orderTotal.toFixed(2) || '—'}</p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-blue-bg)' }}>
                <Calendar style={{ width: '20px', height: '20px', color: 'var(--accent-blue)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery</p>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {headlineSummary.delivery_date ? formatShortDayMonth(headlineSummary.delivery_date) : deliveries[0] ? formatShortDayMonth(deliveries[0].date) : '—'}
            </p>
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }} onClick={() => { setMatchedFilter(matchedFilter === 'matched' ? 'all' : 'matched'); setSelectedMeal(null); }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-emerald-bg)' }}>
                <Check style={{ width: '20px', height: '20px', color: 'var(--accent-emerald)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meals Covered</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{headlineSummary.meals_covered ?? summary.covered}/{headlineSummary.meals_total ?? coverage.length}</p>
            {matchedFilter === 'matched' && <p style={{ fontSize: '9px', color: 'var(--accent-emerald)', fontWeight: '600', marginTop: '2px' }}>Filtered</p>}
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }} onClick={() => { setMatchedFilter(matchedFilter === 'unmatched' ? 'all' : 'unmatched'); setSelectedMeal(null); }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent-rose-bg)' }}>
                <X style={{ width: '20px', height: '20px', color: 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unmatched</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{headlineSummary.unmatched_groceries ?? unmatchedItems.length}</p>
            {matchedFilter === 'unmatched' && <p style={{ fontSize: '9px', color: 'var(--accent-rose)', fontWeight: '600', marginTop: '2px' }}>Filtered</p>}
          </div>

          <div style={{ ...cardStyle, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: (headlineSummary.coverage_percentage ?? summary.coveragePercentage) >= 80 ? 'var(--accent-emerald-bg)' : (headlineSummary.coverage_percentage ?? summary.coveragePercentage) >= 50 ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)' }}>
                <TrendingUp style={{ width: '20px', height: '20px', color: (headlineSummary.coverage_percentage ?? summary.coveragePercentage) >= 80 ? 'var(--accent-emerald)' : (headlineSummary.coverage_percentage ?? summary.coveragePercentage) >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }} />
              </div>
            </div>
            <p style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Coverage</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: (headlineSummary.coverage_percentage ?? summary.coveragePercentage) >= 80 ? 'var(--accent-emerald)' : (headlineSummary.coverage_percentage ?? summary.coveragePercentage) >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{headlineSummary.coverage_percentage ?? summary.coveragePercentage}%</p>
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
                              {deliveries.some(d => d.date === dataKey) && (
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
                                  const barColor = getStatusColor(dayMeals[0].status, avgCoverage);
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
                                              {meal.meal.labels && meal.meal.labels.length > 0 && <span style={{ fontSize: '8px', fontWeight: '600', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' }}>{meal.meal.labels.join(', ')}</span>}
                                              <span style={{ fontSize: '9px', fontWeight: '700', color: 'white', flexShrink: 0 }}>{meal.coverageScore}%</span>
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
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'center' }}>
                <button onClick={() => { setSelectedCategories(new Set()); setMatchedFilter('all'); setSelectedMeal(null); }} style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '11px', fontWeight: '600', border: '1px solid', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: selectedCategories.size === 0 && matchedFilter === 'all' ? 'var(--accent-emerald)' : 'transparent', borderColor: selectedCategories.size === 0 && matchedFilter === 'all' ? 'var(--accent-emerald)' : 'var(--border-color)', color: selectedCategories.size === 0 && matchedFilter === 'all' ? 'white' : 'var(--text-primary)' }}>All</button>
                {categories.map(cat => {
                  const isSelected = selectedCategories.has(cat);
                  return (
                    <button key={cat} onClick={() => { const next = new Set(selectedCategories); next.has(cat) ? next.delete(cat) : next.add(cat); setSelectedCategories(next); }} style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '11px', fontWeight: '600', border: '1px solid', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: isSelected ? categoryColors[cat] || 'var(--accent-blue)' : 'transparent', borderColor: isSelected ? categoryColors[cat] || 'var(--accent-blue)' : 'var(--border-color)', color: isSelected ? 'white' : 'var(--text-primary)' }}>
                      {cat}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {['all', 'matched', 'unmatched'].map(f => (
                  <button key={f} onClick={() => setMatchedFilter(f as typeof matchedFilter)} style={{ padding: '0.3rem 0.7rem', borderRadius: '15px', fontSize: '10px', fontWeight: '600', border: '1px solid', cursor: 'pointer', backgroundColor: matchedFilter === f ? 'var(--accent-blue)' : 'transparent', borderColor: matchedFilter === f ? 'var(--accent-blue)' : 'var(--border-color)', color: matchedFilter === f ? 'white' : 'var(--text-secondary)', textTransform: 'capitalize' }}>{f}</button>
                ))}
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
                      setSelectedMeal(null);
                      setSelectedItem({ name: item.name, price: item.price || 0, quantity: item.quantity || 1, substitutedWith: sub?.substitutedWith });
                      fetchProductInfo(item.name);
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
              </div>
              <button onClick={() => setSelectedMealData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', padding: '0.25rem' }}>✕</button>
            </div>
            
            <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)' }}>
              <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Coverage</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedMealData.coverageScore}%`, height: '100%', backgroundColor: selectedMealData.coverageScore >= 80 ? 'var(--accent-emerald)' : selectedMealData.coverageScore >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)', borderRadius: '4px', transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '14px', fontWeight: '700', color: selectedMealData.coverageScore >= 80 ? 'var(--accent-emerald)' : selectedMealData.coverageScore >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{selectedMealData.coverageScore}%</span>
              </div>
            </div>

            {(() => {
              const deduped = deduplicateMatchedItems(selectedMealData.matchedItems || []);
              if (deduped.length === 0) return null;
              return (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Matched Items</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {deduped.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--accent-emerald-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span style={{ color: 'var(--accent-emerald)', fontSize: '12px', flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanItemName(item.name)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        {item.quantity && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>× {item.quantity}</span>}
                        {item.price !== null && <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-emerald)' }}>£{item.price.toFixed(2)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })()}

            {selectedMealData.missingItems && selectedMealData.missingItems.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Missing Items</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedMealData.missingItems.map((item, idx) => (<span key={idx} style={{ fontSize: '11px', fontWeight: '600', padding: '4px 8px', borderRadius: '6px', backgroundColor: 'var(--accent-rose-bg)', color: 'var(--accent-rose)' }}>✗ {item}</span>))}
                </div>
              </div>
            )}

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
      {selectedItem && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem'
          }}
          onClick={() => { setSelectedItem(null); setProductInfo(null); }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)', borderRadius: '12px',
              padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflow: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, flex: 1 }}>{selectedItem.name}</h3>
              <button
                onClick={() => { setSelectedItem(null); setProductInfo(null); }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 0 0 1rem' }}
              >×</button>
            </div>

            {loadingProduct ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Loading product info...</p>
              </div>
            ) : productInfo ? (
              <div>
                {productInfo.image ? (
                  <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <img
                      src={productInfo.image}
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
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{productInfo.description}</p>
                </div>

                {productInfo.storage && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Storage & Preparation</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{productInfo.storage}</p>
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
                  <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>£{((selectedItem.price || 0) * (selectedItem.quantity || 1)).toFixed(2)}</span>
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
