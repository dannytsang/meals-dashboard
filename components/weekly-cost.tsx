'use client';

import { MealCoverage, TescoReceipt } from '@/lib/meals-data';

interface WeeklyCostProps {
  coverage: MealCoverage[];
  receipt: TescoReceipt | null;
  deliveries: any[];
}

export function WeeklyCost({ coverage, receipt, deliveries }: WeeklyCostProps) {
  if (!receipt) {
    return (
      <div className="card p-4">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Shop Cost
        </h3>
        <p className="text-xs text-[var(--text-muted)]">No data</p>
      </div>
    );
  }
  
  const costPerMeal = receipt.orderTotal / coverage.length;
  
  return (
    <div className="card p-4">
      <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
        Shop Cost
      </h3>
      
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold" style={{ color: 'var(--accent-emerald)' }}>
          £{receipt.orderTotal.toFixed(2)}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          ({receipt.items.length} items)
        </span>
      </div>
      
      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>
          <span style={{ color: 'var(--accent-amber)' }}>£{costPerMeal.toFixed(2)}</span>/meal
        </span>
        {deliveries[1] && deliveries[1].orderTotal > 0 && (
          <span>
            Next: <span style={{ color: 'var(--text-secondary)' }}>£{deliveries[1].orderTotal.toFixed(2)}</span>
          </span>
        )}
      </div>
    </div>
  );
}