'use client';

import type { OrderStatus } from '@/lib/meals-data';

export interface OrderStatusBadgeProps {
  status?: OrderStatus;
  className?: string;
}

/**
 * Order status badge — renders nothing for `active` orders (the common case)
 * and a small coloured pill for `cancelled` / `superseded` / `refunded` orders.
 *
 * Spec 018 (`018-dashboard-order-status-tracking` FR-06): the dashboard MUST
 * display appropriate status badges for non-active orders. Active orders have
 * no badge.
 *
 * The icon-and-text combination follows the spec's preferred style:
 *   ❌ Cancelled  ↪️ Moved  💸 Refunded
 */
export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  if (!status || status === 'active') return null;

  let label: string;
  let icon: string;
  let bg: string;
  let fg: string;
  switch (status) {
    case 'cancelled':
      label = 'Cancelled';
      icon = '❌';
      bg = 'var(--accent-rose-bg)';
      fg = 'var(--accent-rose)';
      break;
    case 'superseded':
      label = 'Moved';
      icon = '↪️';
      bg = 'var(--accent-amber-bg)';
      fg = 'var(--accent-amber)';
      break;
    case 'refunded':
      label = 'Refunded';
      icon = '💸';
      bg = 'var(--accent-blue-bg)';
      fg = 'var(--accent-blue)';
      break;
  }

  const cls = className ?? 'order-status-badge';
  return (
    <span
      className={cls}
      data-testid="order-status-badge"
      data-status={status}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '10px',
        backgroundColor: bg,
        color: fg,
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}
