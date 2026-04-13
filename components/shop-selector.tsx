'use client';

import { History, Package, Truck } from 'lucide-react';
import { ShopPeriod, ShopData } from '@/lib/dashboard-state';

interface ShopSelectorProps {
  selectedShop: ShopPeriod;
  onShopChange: (shop: ShopPeriod) => void;
  shopData: Record<ShopPeriod, ShopData>;
}

const shopIcons = {
  previous: History,
  current: Package,
  next: Truck,
};

const shopLabels = {
  previous: 'Previous',
  current: 'Current',
  next: 'Next',
};

export function ShopSelector({ selectedShop, onShopChange, shopData }: ShopSelectorProps) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
        Select Shop
      </h3>
      <div className="flex gap-2">
        {(['previous', 'current', 'next'] as ShopPeriod[]).map((shop) => {
          const Icon = shopIcons[shop];
          const data = shopData[shop];
          const isSelected = selectedShop === shop;
          
          return (
            <button
              key={shop}
              onClick={() => onShopChange(shop)}
              className="flex-1 flex items-center gap-2 p-3 rounded-lg border transition-all"
              style={{
                backgroundColor: isSelected ? 'var(--accent-emerald-bg)' : 'var(--bg-tertiary)',
                borderColor: isSelected ? 'var(--accent-emerald)' : 'var(--border-color)',
                borderWidth: isSelected ? '2px' : '1px',
              }}
            >
              <div 
                className="p-1.5 rounded"
                style={{ backgroundColor: isSelected ? 'var(--accent-emerald)' : 'var(--bg-tertiary)' }}
              >
                <Icon 
                  className="w-4 h-4" 
                  style={{ color: isSelected ? 'white' : 'var(--text-secondary)' }} 
                />
              </div>
              <div className="text-left">
                <p 
                  className="text-sm font-medium"
                  style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {shopLabels[shop]}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {data.itemCount} item{data.itemCount !== 1 ? 's' : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
