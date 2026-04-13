'use client';

import { TescoReceipt } from '@/lib/meals-data';
import { AlertTriangle, Clock, Snowflake } from 'lucide-react';

interface ExpiryTimelineProps {
  receipt: TescoReceipt | null;
}

interface ExpiryItem {
  name: string;
  daysRemaining: number;
  urgency: 'critical' | 'urgent' | 'notice';
  category: 'fresh' | 'dairy' | 'frozen' | 'other';
}

export function ExpiryTimeline({ receipt }: ExpiryTimelineProps) {
  if (!receipt) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
          Short-Life Items
        </h3>
        <p className="text-slate-500 text-sm">No receipt data available</p>
      </div>
    );
  }

  // Categorize items by urgency
  const categorizeItems = (): ExpiryItem[] => {
    if (!receipt.shortLifeItems || receipt.shortLifeItems.length === 0) {
      return [];
    }

    return receipt.shortLifeItems.map(item => {
      let category: ExpiryItem['category'] = 'other';
      let urgency: ExpiryItem['urgency'] = 'notice';

      const name = item.name.toLowerCase();
      
      // Categorize
      if (name.includes('milk') || name.includes('yoghurt') || name.includes('cheese') || name.includes('cream')) {
        category = 'dairy';
      } else if (name.includes('frozen') || name.includes('freezer')) {
        category = 'frozen';
      } else if (name.includes('berry') || name.includes('lettuce') || name.includes('salad') || name.includes('spinach') || name.includes('fresh')) {
        category = 'fresh';
      }

      // Determine urgency
      if (item.daysRemaining <= 1) {
        urgency = 'critical';
      } else if (item.daysRemaining <= 3) {
        urgency = 'urgent';
      } else {
        urgency = 'notice';
      }

      return {
        name: item.name,
        daysRemaining: item.daysRemaining,
        urgency,
        category,
      };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);
  };

  const items = categorizeItems();
  const criticalItems = items.filter(i => i.urgency === 'critical');
  const urgentItems = items.filter(i => i.urgency === 'urgent');
  const noticeItems = items.filter(i => i.urgency === 'notice');

  const urgencyConfig = {
    critical: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      icon: AlertTriangle,
      color: 'text-rose-400',
      label: 'Use Today',
    },
    urgent: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      icon: Clock,
      color: 'text-amber-400',
      label: 'Use Soon',
    },
    notice: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      icon: Snowflake,
      color: 'text-blue-400',
      label: ' refrigerate',
    },
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Short-Life Items Timeline
        </h3>
        <span className="text-xs text-slate-500">
          {items.length} item{items.length !== 1 ? 's' : ''} to track
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 text-sm">No short-life items in this order</p>
      ) : (
        <div className="space-y-4">
          {/* Critical items first */}
          {criticalItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" />
                Critical - Use Today
              </p>
              {criticalItems.map((item, idx) => (
                <div 
                  key={idx}
                  className={`${urgencyConfig.critical.bg} border ${urgencyConfig.critical.border} rounded-lg p-3`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium truncate pr-4">{item.name}</span>
                    <span className={`${urgencyConfig.critical.color} text-xs font-bold whitespace-nowrap`}>
                      {item.daysRemaining === 0 ? 'Today' : `${item.daysRemaining}d left`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Urgent items */}
          {urgentItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Urgent - Use Within 3 Days
              </p>
              {urgentItems.map((item, idx) => (
                <div 
                  key={idx}
                  className={`${urgencyConfig.urgent.bg} border ${urgencyConfig.urgent.border} rounded-lg p-3`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium truncate pr-4">{item.name}</span>
                    <span className={`${urgencyConfig.urgent.color} text-xs font-bold whitespace-nowrap`}>
                      {item.daysRemaining}d left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notice items */}
          {noticeItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <Snowflake className="w-3 h-3" />
                Keep Refrigerated
              </p>
              {noticeItems.map((item, idx) => (
                <div 
                  key={idx}
                  className={`${urgencyConfig.notice.bg} border ${urgencyConfig.notice.border} rounded-lg p-3`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium truncate pr-4">{item.name}</span>
                    <span className={`${urgencyConfig.notice.color} text-xs whitespace-nowrap`}>
                      ~{item.daysRemaining}d
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category legend */}
      <div className="mt-4 pt-4 border-t border-slate-700 flex flex-wrap gap-3 text-xs">
        <span className="text-slate-500">Category:</span>
        <span className="text-emerald-400">• Fresh</span>
        <span className="text-amber-400">• Dairy</span>
        <span className="text-blue-400">• Frozen</span>
        <span className="text-slate-400">• Other</span>
      </div>
    </div>
  );
}
