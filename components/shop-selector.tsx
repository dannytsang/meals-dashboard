'use client';

import { ShopPeriod, ShopData } from '@/lib/dashboard-state';
import { Package, Truck, History } from 'lucide-react';

interface ShopSelectorProps {
  selectedShop: ShopPeriod;
  onShopChange: (shop: ShopPeriod) => void;
  shopData: Record<ShopPeriod, ShopData>;
}

const shopConfig = {
  previous: {
    icon: History,
    color: 'text-slate-400',
    bgColor: 'bg-slate-700',
    borderColor: 'border-slate-600',
    activeBg: 'bg-slate-600',
  },
  current: {
    icon: Package,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    activeBg: 'bg-emerald-500/20',
  },
  next: {
    icon: Truck,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    activeBg: 'bg-blue-500/20',
  },
};

export function ShopSelector({ selectedShop, onShopChange, shopData }: ShopSelectorProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
        Select Shop
      </h3>
      <div className="flex gap-2">
        {(Object.keys(shopData) as ShopPeriod[]).map((shop) => {
          const config = shopConfig[shop];
          const Icon = config.icon;
          const isSelected = selectedShop === shop;
          const data = shopData[shop];
          
          return (
            <button
              key={shop}
              onClick={() => onShopChange(shop)}
              className={`flex-1 flex items-center gap-2 p-3 rounded-lg border transition-all ${
                isSelected
                  ? `${config.activeBg} ${config.borderColor} border-2`
                  : `bg-slate-750 border-slate-700 hover:border-slate-600`
              }`}
            >
              <div className={`p-1.5 rounded ${isSelected ? config.bgColor : 'bg-slate-700'}`}>
                <Icon className={`w-4 h-4 ${isSelected ? config.color : 'text-slate-400'}`} />
              </div>
              <div className="text-left">
                <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                  {shop.charAt(0).toUpperCase() + shop.slice(1)}
                </p>
                <p className="text-xs text-slate-500">
                  {data.itemCount > 0 ? `${data.itemCount} items` : 'Empty'}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
