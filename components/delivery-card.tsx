'use client';

import { DeliveryWindow, TescoReceipt } from '@/lib/meals-data';
import { Truck, Clock, Package, AlertTriangle } from 'lucide-react';

interface DeliveryCardProps {
  deliveries: DeliveryWindow[];
  latestReceipt?: TescoReceipt | null;
}

export function DeliveryCard({ deliveries, latestReceipt }: DeliveryCardProps) {
  const latestDelivery = deliveries[0];
  const nextDelivery = deliveries[1];
  
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
        Deliveries
      </h3>
      
      {latestReceipt && (
        <div className="mb-6 p-4 bg-slate-750 rounded-lg border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Package className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-medium">Latest Delivery</p>
              <p className="text-slate-400 text-sm">
                {new Date(latestReceipt.deliveryDate).toLocaleDateString('en-GB', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'short' 
                })}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Order Total</p>
              <p className="text-white font-medium">£{latestReceipt.orderTotal.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-slate-500">Items</p>
              <p className="text-white font-medium">{latestReceipt.items.length}</p>
            </div>
            <div>
              <p className="text-slate-500">Slot</p>
              <p className="text-white font-medium">{latestReceipt.deliverySlot}</p>
            </div>
            <div>
              <p className="text-slate-500">Order #</p>
              <p className="text-slate-300">{latestReceipt.orderNumber}</p>
            </div>
          </div>
          
          {latestReceipt.substitutions.length > 0 && (
            <div className="mt-4 p-3 bg-amber-500/10 rounded border border-amber-500/20">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {latestReceipt.substitutions.length} substitution{latestReceipt.substitutions.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}
          
          {latestReceipt.shortLifeItems.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-slate-500 mb-2">Short life items:</p>
              <div className="space-y-1">
                {latestReceipt.shortLifeItems.map((item, idx) => (
                  <div 
                    key={idx}
                    className={`flex justify-between text-sm px-2 py-1 rounded ${
                      item.daysRemaining <= 1 ? 'bg-rose-500/10 text-rose-400' : 
                      item.daysRemaining <= 3 ? 'bg-amber-500/10 text-amber-400' : 
                      'bg-slate-700 text-slate-300'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span>{item.daysRemaining} day{item.daysRemaining > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {nextDelivery && (
        <div className="p-4 bg-slate-750 rounded-lg border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Truck className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Next Delivery</p>
              <p className="text-slate-400 text-sm">
                {new Date(nextDelivery.date).toLocaleDateString('en-GB', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'short' 
                })}
              </p>
            </div>
            <div className="text-right">
              <Clock className="w-4 h-4 text-slate-500 ml-auto mb-1" />
              <p className="text-slate-300 text-sm">{nextDelivery.slot}</p>
            </div>
          </div>
          
          {nextDelivery.orderTotal > 0 ? (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Current total</span>
                <span className="text-white font-medium">£{nextDelivery.orderTotal.toFixed(2)}</span>
              </div>
              {nextDelivery.orderTotal < 50 && (
                <p className="text-xs text-amber-400 mt-1">
                  £{(50 - nextDelivery.orderTotal).toFixed(2)} more for free delivery
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-3">
              No items in basket yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
