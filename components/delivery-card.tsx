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
    <div className="card p-6">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Deliveries
      </h3>
      
      {latestReceipt && (
        <div className="mb-4 p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--accent-emerald-bg)' }}>
              <Package className="w-5 h-5" style={{ color: 'var(--accent-emerald)' }} />
            </div>
            <div>
              <p className="text-[var(--text-primary)] font-medium">Latest Delivery</p>
              <p className="text-[var(--text-secondary)] text-sm">
                {new Date(latestReceipt.deliveryDate).toLocaleDateString('en-GB', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'short' 
                })}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[var(--text-muted)]">Order Total</p>
              <p className="text-[var(--text-primary)] font-medium">£{latestReceipt.orderTotal.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Items</p>
              <p className="text-[var(--text-primary)] font-medium">{latestReceipt.items.length}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Slot</p>
              <p className="text-[var(--text-primary)] font-medium">{latestReceipt.deliverySlot}</p>
            </div>
          </div>
          
          {latestReceipt.substitutions.length > 0 && (
            <div className="mt-4 p-3 rounded border" style={{ backgroundColor: 'var(--accent-amber-bg)', borderColor: 'var(--accent-amber-border)' }}>
              <div className="flex items-center gap-2" style={{ color: 'var(--accent-amber)' }}>
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {latestReceipt.substitutions.length} substitution{latestReceipt.substitutions.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}
          
          {latestReceipt.shortLifeItems.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-[var(--text-muted)] mb-2">Short life items:</p>
              <div className="space-y-1">
                {latestReceipt.shortLifeItems.map((item, idx) => (
                  <div 
                    key={idx}
                    className="flex justify-between text-sm px-2 py-1 rounded"
                    style={{
                      backgroundColor: item.daysRemaining <= 1 ? 'var(--accent-rose-bg)' : 
                                      item.daysRemaining <= 3 ? 'var(--accent-amber-bg)' : 'var(--bg-tertiary)',
                      color: item.daysRemaining <= 1 ? 'var(--accent-rose)' : 
                             item.daysRemaining <= 3 ? 'var(--accent-amber)' : 'var(--text-secondary)'
                    }}
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
        <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--accent-blue-bg)' }}>
              <Truck className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
            </div>
            <div className="flex-1">
              <p className="text-[var(--text-primary)] font-medium">Next Delivery</p>
              <p className="text-[var(--text-secondary)] text-sm">
                {new Date(nextDelivery.date).toLocaleDateString('en-GB', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'short' 
                })}
              </p>
            </div>
            <div className="text-right">
              <Clock className="w-4 h-4 text-[var(--text-muted)] ml-auto mb-1" />
              <p className="text-[var(--text-secondary)] text-sm">{nextDelivery.slot}</p>
            </div>
          </div>
          
          {nextDelivery.orderTotal > 0 ? (
            <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Current total</span>
                <span className="text-[var(--text-primary)] font-medium">£{nextDelivery.orderTotal.toFixed(2)}</span>
              </div>
              {nextDelivery.orderTotal < 50 && (
                <p className="text-xs text-[var(--accent-amber)] mt-1">
                  £{(50 - nextDelivery.orderTotal).toFixed(2)} more for free delivery
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)] mt-3">
              No items in basket yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}