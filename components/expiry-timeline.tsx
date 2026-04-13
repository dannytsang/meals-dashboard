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
      <div className="card p-6">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Short-Life Items
        </h3>
        <p className="text-[var(--text-muted)] text-sm">No receipt data available</p>
      </div>
    );
  }

  const categorizeItems = (): ExpiryItem[] => {
    if (!receipt.shortLifeItems || receipt.shortLifeItems.length === 0) {
      return [];
    }

    return receipt.shortLifeItems.map(item => {
      let category: ExpiryItem['category'] = 'other';
      let urgency: ExpiryItem['urgency'] = 'notice';

      const name = item.name.toLowerCase();
      
      if (name.includes('milk') || name.includes('yoghurt') || name.includes('cheese') || name.includes('cream')) {
        category = 'dairy';
      } else if (name.includes('frozen') || name.includes('freezer')) {
        category = 'frozen';
      } else if (name.includes('berry') || name.includes('lettuce') || name.includes('salad') || name.includes('spinach') || name.includes('fresh')) {
        category = 'fresh';
      }

      if (item.daysRemaining <= 1) {
        urgency = 'critical';
      } else if (item.daysRemaining <= 3) {
        urgency = 'urgent';
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
      bg: 'var(--accent-rose-bg)',
      border: 'var(--accent-rose-border)',
      icon: AlertTriangle,
      color: 'var(--accent-rose)',
      label: 'Use Today',
    },
    urgent: {
      bg: 'var(--accent-amber-bg)',
      border: 'var(--accent-amber-border)',
      icon: Clock,
      color: 'var(--accent-amber)',
      label: 'Use Soon',
    },
    notice: {
      bg: 'var(--accent-blue-bg)',
      border: 'var(--accent-blue-bg)',
      icon: Snowflake,
      color: 'var(--accent-blue)',
      label: 'Keep Refrigerated',
    },
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Short-Life Items
        </h3>
        <span className="text-xs text-[var(--text-muted)]">
          {items.length} item{items.length !== 1 ? 's' : ''} to track
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">No short-life items in this order</p>
      ) : (
        <div className="space-y-4">
          {criticalItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--accent-rose)' }}>
                <AlertTriangle className="w-3 h-3" />
                Critical - Use Today
              </p>
              {criticalItems.map((item, idx) => (
                <div 
                  key={idx}
                  className="rounded-lg p-3 border"
                  style={{ backgroundColor: urgencyConfig.critical.bg, borderColor: urgencyConfig.critical.border }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-primary)] text-sm font-medium truncate pr-4">{item.name}</span>
                    <span className="font-bold text-xs whitespace-nowrap" style={{ color: urgencyConfig.critical.color }}>
                      {item.daysRemaining === 0 ? 'Today' : `${item.daysRemaining}d left`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {urgentItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--accent-amber)' }}>
                <Clock className="w-3 h-3" />
                Urgent - Use Within 3 Days
              </p>
              {urgentItems.map((item, idx) => (
                <div 
                  key={idx}
                  className="rounded-lg p-3 border"
                  style={{ backgroundColor: urgencyConfig.urgent.bg, borderColor: urgencyConfig.urgent.border }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-primary)] text-sm font-medium truncate pr-4">{item.name}</span>
                    <span className="font-bold text-xs whitespace-nowrap" style={{ color: urgencyConfig.urgent.color }}>
                      {item.daysRemaining}d left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {noticeItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--accent-blue)' }}>
                <Snowflake className="w-3 h-3" />
                Keep Refrigerated
              </p>
              {noticeItems.map((item, idx) => (
                <div 
                  key={idx}
                  className="rounded-lg p-3 border"
                  style={{ backgroundColor: urgencyConfig.notice.bg, borderColor: urgencyConfig.notice.border }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-primary)] text-sm font-medium truncate pr-4">{item.name}</span>
                    <span className="text-xs whitespace-nowrap" style={{ color: urgencyConfig.notice.color }}>
                      ~{item.daysRemaining}d
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex flex-wrap gap-3 text-xs">
        <span className="text-[var(--text-muted)]">Category:</span>
        <span style={{ color: 'var(--accent-emerald)' }}>• Fresh</span>
        <span style={{ color: 'var(--accent-amber)' }}>• Dairy</span>
        <span style={{ color: 'var(--accent-blue)' }}>• Frozen</span>
        <span className="text-[var(--text-tertiary)]">• Other</span>
      </div>
    </div>
  );
}
