'use client';

import { useState, useEffect, Fragment, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/user-menu';
import { DemoModeChip } from '@/components/demo-mode-chip';
import { OrderStatusBadge } from '@/components/order-status-badge';
import dynamic from 'next/dynamic';
import { GroceryItem, Meal, MealCoverage, hasGeneratedDeliveryOnDate } from '@/lib/meals-data';
// Spec 022 / NFR-002: the debug chip component is dynamically imported
// so its JS lives in a separate chunk that's only fetched when the
// debug cookie is set. With the cookie unset, the chip is never
// rendered and its code never reaches the main bundle. The inline
// Debug toggle that used to live here was collapsed into the
// UserMenu component's always-visible Debug row by spec 026 Rev 2
// (FR-005). The UserMenu module is NOT dynamic-imported because the
// chip text (and the chip click → menu open) is the at-a-glance
// identity affordance the user always sees.
const DashboardDebugChips = dynamic(
  () => import('@/components/dashboard-debug-chips').then((m) => m.DashboardDebugChips),
  { ssr: false }
);
import { cleanItemName, deduplicateMatchedItems, calculateMatchedItemsTotal } from '@/lib/item-utils';
import { getMealType } from '@/lib/meal-type';
import { formatDayMonthUpper, formatShortDayMonth, formatWeekdayShort, parseISODateLocal, toISODateLocal } from '@/lib/date-utils';
import { Check, X, Calendar, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import type { DashboardData } from '@/lib/dashboard-data';
import { submitManualOverrideAction } from '@/app/actions/manual-override-action';
import {
  buildHeadlineMetrics,
  classifyOrderItemMatch,
  deriveCollapsedCoverageColor,
  findReceiptItemForMatchedItem,
  formatUseByDate,
  getDisplayedProductName,
  getPartialMealMissingExplanation,
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
  /** Spec 022 / Rev 3: server-gated effective debug mode (cookie
   *  only — no env-var). When true, the inline debug chips
   *  (initially: items-by-category) are rendered next to the Order
   *  Items by Category heading. The cookie check is also server-side;
   *  this prop is false in production AND in preview when the
   *  per-user cookie is unset. */
  debugOn?: boolean;
  /** Spec 024 / FR-018: server-gated demo mode. True when the
   *  runtime is in demo mode (no BLOB_READ_WRITE_TOKEN). Drives the
   *  demo-mode chip in the header and the data-demo-mode attribute
   *  on the root element. */
  demoMode?: boolean;
  /** Spec 023 / FR-009: server-resolved display name for the
   *  user chip. Always non-empty — the page-level helper
   *  (`resolveUserChipName`) guarantees a string fallback. */
  userName: string;
}

export function DashboardClient({ today, data, debugOn, demoMode, userName }: DashboardClientProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [matchedFilter, setMatchedFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [itemSort, setItemSort] = useState<OrderItemSortMode>('name-asc');
  const [selectedMealData, setSelectedMealData] = useState<MealCoverage | null>(null);
  const [selectedItem, setSelectedItem] = useState<GroceryItem | null>(null);
  const [showCount, setShowCount] = useState(10);
  const [collapsedMealTypes, setCollapsedMealTypes] = useState<Set<string>>(new Set(['breakfast', 'lunch']));
  const [overridePendingItem, setOverridePendingItem] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideSuccess, setOverrideSuccess] = useState<string | null>(null);

  useEffect(() => {
    const checkWidth = () => setIsDesktop(window.innerWidth >= 1024);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  // Spec 019 / FR-07 / T061 — the "I have this" button submits a
  // server action (`submitManualOverrideAction`) that runs on the
  // server, authenticates via the NextAuth session, and invokes the
  // Python `apply_manual_override()` pipeline via a subprocess. The
  // page is revalidated on success so the new "manual_override"
  // source flows through the dashboard on the next render.
  const router = useRouter();
  const [pendingTransition, startTransition] = useTransition();

  async function applyManualOverrideForItem(item: GroceryItem) {
    setOverrideError(null);
    setOverrideSuccess(null);

    // Choose a meal context: prefer the meal currently open in the
    // overlay; fall back to the first planned meal in the upcoming
    // window so the button has a sensible no-picker default.
    let mealDate: string | null = null;
    let mealName: string | null = null;
    if (selectedMealData) {
      mealDate = selectedMealData.meal.date;
      mealName = selectedMealData.meal.content;
    } else {
      const upcoming = [...coverage]
        .filter((c) => c.meal.date >= today)
        .sort((a, b) => a.meal.date.localeCompare(b.meal.date));
      const first = upcoming[0];
      if (first) {
        mealDate = first.meal.date;
        mealName = first.meal.content;
      }
    }

    if (!mealDate || !mealName) {
      setOverrideError('No upcoming meal to attach the override to');
      return;
    }

    const itemName = item.name;
    setOverridePendingItem(itemName);
    try {
      const formData = new FormData();
      formData.set('meal_date', mealDate);
      formData.set('meal_name', mealName);
      formData.set('item_name', itemName);
      formData.set('quantity', String(item.quantity ?? 1));
      formData.set('reason', 'user_clicked_i_have_this');

      const result = await submitManualOverrideAction(formData);
      if (!result.ok) {
        setOverrideError(result.error || 'Override failed');
        return;
      }
      setOverrideSuccess(itemName);
      // Re-fetch the dashboard data so the new "manual_override"
      // source flows through. The page is a server component fed
      // by getDashboardData, so router.refresh() re-runs the loader
      // and merges the new state without a full page reload.
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOverrideError(`Override failed: ${message}`);
    } finally {
      setOverridePendingItem(null);
    }
  }

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
    <div
      className="min-h-screen"
      data-demo-mode={demoMode ? 'true' : 'false'}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <header style={{ position: 'sticky', top: 0, zIndex: 50, padding: '0.75rem 1rem', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>🍽️ Meals Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/*
              Spec 024 / FR-017: the demo-mode chip is the first
              element in the action row when demo mode is active.
              Server-rendered (returns null when demoMode is false).
              Sits leftmost in the row so the eye lands on it first.
            */}
            <DemoModeChip demoMode={!!demoMode} />
            {/*
              Spec 026 / FR-022: replace the standalone UserChip and
              the three inline controls (DebugToggle, ThemeToggle,
              SignOutButton) with a single UserMenu that owns the
              dropdown containing Debug, Theme, and Sign out rows.
              The Debug row is always-visible regardless of the
              server-rendered `debugOn` prop (spec 026 Rev 2 / FR-005;
              the row's `aria-checked` reflects the current
              meals_debug_mode signed-cookie state, and click flips
              it). The DemoModeChip stays a
              separate sibling of the menu (FR-014) — demo mode is a
              data-mode signal that must stay visible regardless of
              menu state.
            */}
            <UserMenu userName={userName} debugOn={!!debugOn} />
          </div>
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
            {receipt.orderStatus && receipt.orderStatus !== 'active' && (
              <div style={{ marginTop: '0.4rem' }}>
                <OrderStatusBadge status={receipt.orderStatus} />
              </div>
            )}
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
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '0.75rem', position: 'relative' }}>
                <h2 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', textAlign: 'center' as const, margin: 0 }}>🛒 ORDER ITEMS BY CATEGORY</h2>
                {debugOn && <DashboardDebugChips />}
              </div>
              
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
                  // When coverage data is missing (stale blob, sync failure), show a neutral
                  // "?" classification instead of an incorrect ✓/✗, and treat the item as
                  // neither matched nor unmatched so the row stays visually neutral.
                  const classificationUnknown = coverage.length === 0;
                  const showUnmatched = isUnmatched && !classificationUnknown;
                  return (
                    <div key={idx} onClick={() => {
                      const sub = receipt?.substitutions?.find(s => s.original.toLowerCase() === item.name.toLowerCase());
                      setSelectedItem({ ...item, substitutedWith: item.substitutedWith || sub?.substitutedWith });
                    }} style={{ padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 1, borderLeft: classificationUnknown ? '3px solid var(--text-muted)' : showUnmatched ? '3px solid var(--accent-rose)' : '3px solid var(--accent-emerald)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span style={{ color: classificationUnknown ? 'var(--text-muted)' : showUnmatched ? 'var(--accent-rose)' : 'var(--accent-emerald)', fontSize: '14px', flexShrink: 0 }}>{classificationUnknown ? '?' : showUnmatched ? '✗' : '✓'}</span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px', backgroundColor: selectedMealData.status === 'covered' ? 'var(--accent-emerald-bg)' : selectedMealData.status === 'partial' ? 'var(--accent-amber-bg)' : 'var(--accent-rose-bg)', color: selectedMealData.status === 'covered' ? 'var(--accent-emerald)' : selectedMealData.status === 'partial' ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{getCoverageStatusLabel(selectedMealData.status)}</span>
                  {isTodoistMealCompleted(selectedMealData.meal) && <div style={{ fontSize: '11px', fontWeight: '700', padding: '4px 8px', borderRadius: '999px', backgroundColor: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald)', display: 'inline-block' }}>{getTodoistCompletionLabel(selectedMealData.meal)}</div>}
                  {(() => {
                    // Spec 019 / FR-05 — perishable badge when any matched
                    // item has use_by_warning: true. The badge is the meal-
                    // summary ⚠️ indicator, distinct from the in-section
                    // "Use today" items.
                    const hasPerishable = (selectedMealData.matchedItems || []).some(
                      (it) => it.use_by_warning
                    );
                    if (!hasPerishable) return null;
                    return (
                      <span
                        data-testid="perishable-badge"
                        style={{ fontSize: '11px', fontWeight: '700', padding: '4px 8px', borderRadius: '999px', backgroundColor: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', display: 'inline-block' }}
                      >
                        ⚠️ Use today
                      </span>
                    );
                  })()}
                </div>
              </div>
              <button onClick={() => setSelectedMealData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', padding: '0.25rem' }}>✕</button>
            </div>

            {(() => {
              // Spec 019 / FR-05 — "Use today" section at the top of the
              // meal detail overlay. Lists only the matched items with
              // use_by_warning: true, each with its use_by date badge.
              // Distinct from the main Matched Items section below.
              const useTodayItems = deduplicateMatchedItems(
                (selectedMealData.matchedItems || []).filter((it) => it.use_by_warning)
              );
              if (useTodayItems.length === 0) return null;
              return (
                <div data-testid="use-today-section" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--accent-amber-bg)', borderRadius: '8px', border: '1px solid var(--accent-amber-border, var(--accent-amber))' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>⚠️ Use today</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {useTodayItems.map((item, idx) => {
                      const productItem = findReceiptItemForMatchedItem(item, receipt.items);
                      const price = getProductModalPrice(productItem);
                      return (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 72px', columnGap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            <span style={{ fontSize: '12px', flexShrink: 0 }}>⚠️</span>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanItemName(item.name)}</span>
                          </div>
                          {item.use_by_date ? (
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: 'var(--accent-amber)', color: 'var(--bg-primary)' }}>Use by {formatUseByDate(item.use_by_date)}</span>
                          ) : <span />}
                          {price !== null ? <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', justifySelf: 'end', whiteSpace: 'nowrap' }}>£{price.toFixed(2)}</span> : <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', justifySelf: 'end' }}>N/A</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {(() => {
              // Spec 019 / FR-06 — refunded items section. The list of
              // refunded items comes from `selectedMealData.refundedItems`
              // (an array of names, populated by `process_refund` in the
              // Python pipeline). Each rendered with a red "£X refunded"
              // badge.
              const refunded = selectedMealData.refundedItems || [];
              if (refunded.length === 0) return null;
              return (
                <div data-testid="refunded-items-section" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--accent-rose-bg)', borderRadius: '8px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-rose)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Refunded</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {refunded.map((name, idx) => {
                      const productItem = (receipt.items || []).find((it) => it.name === name);
                      const price = productItem ? productItem.price : null;
                      return (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            <span style={{ fontSize: '12px', flexShrink: 0 }}>↩</span>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanItemName(name)}</span>
                          </div>
                          {price !== null && price !== undefined ? (
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: 'var(--accent-rose)', color: 'var(--bg-primary)' }}>£{price.toFixed(2)} refunded</span>
                          ) : <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>refunded</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const deduped = deduplicateMatchedItems(selectedMealData.matchedItems || []);
              // Filter out items already shown in the "Use today" section
              const nonPerishableMatches = deduped.filter((it) => !it.use_by_warning);
              if (nonPerishableMatches.length === 0) return null;
              const matchedItemsTotal = calculateMatchedItemsTotal(nonPerishableMatches);
              return (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Matched Items</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {nonPerishableMatches.map((item, idx) => {
                    const productItem = findReceiptItemForMatchedItem(item, receipt.items);
                    const matchedItemPrice = getProductModalPrice(productItem);
                    // Spec 019 / FR-08 — manual override badge on items
                    // whose source is "manual_override" (set by the
                    // apply_manual_overrides function in the Python
                    // pipeline after the "I have this" button click).
                    const isOverride = item.source === 'manual_override';
                    return (
                    <button key={idx} type="button" onClick={() => { setSelectedItem(productItem); }} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 56px 72px', columnGap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--accent-emerald-bg)', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        <span style={{ color: 'var(--accent-emerald)', fontSize: '12px', flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanItemName(item.name)}</span>
                        {isOverride && (
                          <span
                            data-testid="manual-override-badge"
                            style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: 'var(--accent-blue)', color: 'var(--bg-primary)' }}
                          >
                            ✓ We have it
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', justifySelf: 'end', whiteSpace: 'nowrap' }}>{productItem.quantity ? `× ${productItem.quantity}` : '—'}</span>
                      {matchedItemPrice !== null ? <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-emerald)', justifySelf: 'end', whiteSpace: 'nowrap' }}>£{matchedItemPrice.toFixed(2)}</span> : <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', justifySelf: 'end', whiteSpace: 'nowrap' }}>N/A</span>}
                    </button>
                    );
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 56px 72px', columnGap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border-color)' }}>
                    <span style={{ gridColumn: '1 / 3', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Matched items total</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-emerald)', justifySelf: 'end', whiteSpace: 'nowrap' }}>£{matchedItemsTotal.toFixed(2)}</span>
                  </div>
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
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--accent-amber-bg)', border: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
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

              {selectedProductInfo.expiresAt && (
                (() => {
                  const expiresAt = new Date(selectedProductInfo.expiresAt!);
                  const now = new Date();
                  const isExpired = now > expiresAt;
                  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {selectedProductInfo.lastFetched && (
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Fetched {new Date(selectedProductInfo.lastFetched).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: isExpired ? 'var(--accent-amber-bg)' : 'var(--bg-tertiary)',
                        color: isExpired ? 'var(--accent-amber)' : 'var(--text-secondary)',
                        border: isExpired ? '1px solid var(--accent-amber-border)' : 'none',
                      }}>
                        {isExpired ? `Refresh overdue (${daysUntilExpiry < 0 ? Math.abs(daysUntilExpiry) + 'd ago' : 'expired'})` : `Refreshes ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                      </span>
                    </div>
                  );
                })()
              )}

              {selectedProductInfo.storage && (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Storage</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{selectedProductInfo.storage}</p>
                </div>
              )}

              {selectedProductInfo.preparation && (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Preparation</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{selectedProductInfo.preparation}</p>
                </div>
              )}

              {selectedProductInfo.ingredients && (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Ingredients</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{selectedProductInfo.ingredients}</p>
                </div>
              )}

              {selectedProductInfo.allergens && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--accent-amber-bg)', border: '1px solid var(--accent-amber-border)', borderRadius: '8px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Allergens</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{selectedProductInfo.allergens}</p>
                </div>
              )}

              {selectedProductInfo.nutrition && !selectedProductInfo.nutrition.includes('not available') && (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Nutrition</h4>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{selectedProductInfo.nutrition}</div>
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
                {(() => {
                  const modalPrice = getProductModalPrice(selectedItem);
                  return modalPrice !== null ? (
                    <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>£{modalPrice.toFixed(2)}</span>
                  ) : (
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', fontStyle: 'italic' }}>price N/A</span>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer with timestamps */}
      {(data.dataGeneratedAt || data.uiUpdatedAt) && (
        <div style={{
          padding: '0.6rem 1rem',
          borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          gap: '1.5rem',
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          flexWrap: 'wrap',
        }}>
          {data.dataGeneratedAt && (
            <span>Data: {new Date(data.dataGeneratedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {data.uiUpdatedAt && (
            <span>UI: {new Date(data.uiUpdatedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
      )}
    </div>
  );
}
