import { CoverageCard } from '@/components/coverage-card';
import { MealList } from '@/components/meal-list';
import { DeliveryCard } from '@/components/delivery-card';
import { Chart } from '@/components/chart';
import { dashboardConfig } from '@/lib/config';
import { 
  calculateCoverageSummary,
  getUpcomingDeliveries 
} from '@/lib/meals-data';
import { realCoverage, realReceipt, realMealPlan } from '@/lib/real-data';

export default function MealsDashboardPage() {
  const summary = calculateCoverageSummary(realCoverage);
  const deliveries = getUpcomingDeliveries();
  
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{dashboardConfig.name}</h1>
              <p className="text-slate-400 mt-1">{dashboardConfig.description}</p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p>Last updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-xs mt-1 text-emerald-400">Live data from meals skill</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Row: Coverage Overview & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1">
            <CoverageCard summary={summary} />
          </div>
          <div className="lg:col-span-1">
            <DeliveryCard 
              deliveries={deliveries} 
              latestReceipt={realReceipt} 
            />
          </div>
          <div className="lg:col-span-1">
            <QuickStatsCard coverage={realCoverage} receipt={realReceipt} />
          </div>
        </div>

        {/* Middle Row: Chart */}
        <div className="mb-8">
          <Chart coverage={realCoverage} />
        </div>

        {/* Bottom Row: Meal List */}
        <div className="grid grid-cols-1 gap-6">
          <MealList coverage={realCoverage} />
        </div>
      </main>
    </div>
  );
}

function QuickStatsCard({ coverage, receipt }: { coverage: typeof realCoverage; receipt: typeof realReceipt }) {
  const familyMeals = coverage.filter(c => 
    c.meal.labels.includes('adult') && c.meal.labels.includes('children')
  ).length;
  const splitMeals = coverage.filter(c => 
    c.meal.labels.includes('adult') !== c.meal.labels.includes('children')
  ).length;
  const urgentItems = receipt?.shortLifeItems.filter(i => i.daysRemaining <= 2).length || 0;
  const totalValue = receipt?.items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0) || 0;
  
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
        Quick Stats
      </h3>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-slate-750 rounded-lg">
          <span className="text-slate-300">Family meals</span>
          <span className="text-white font-bold">{familyMeals}</span>
        </div>
        
        <div className="flex items-center justify-between p-3 bg-slate-750 rounded-lg">
          <span className="text-slate-300">Split meals</span>
          <span className="text-white font-bold">{splitMeals}</span>
        </div>
        
        <div className={`flex items-center justify-between p-3 rounded-lg ${
          urgentItems > 0 ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-slate-750'
        }`}>
          <span className={urgentItems > 0 ? 'text-rose-400' : 'text-slate-300'}>
            Urgent items
          </span>
          <span className={urgentItems > 0 ? 'text-rose-400 font-bold' : 'text-white font-bold'}>
            {urgentItems}
          </span>
        </div>
        
        <div className="flex items-center justify-between p-3 bg-slate-750 rounded-lg">
          <span className="text-slate-300">Order total</span>
          <span className="text-white font-bold">£{totalValue.toFixed(2)}</span>
        </div>
        
        <div className="flex items-center justify-between p-3 bg-slate-750 rounded-lg">
          <span className="text-slate-300">Planned days</span>
          <span className="text-white font-bold">
            {new Set(coverage.map(c => c.meal.date)).size}
          </span>
        </div>
      </div>
    </div>
  );
}
