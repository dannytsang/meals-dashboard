'use client';

/**
 * components/delivery-badge.tsx
 *
 * Spec 034 / FR-004 + NFR-003 + NFR-004 — the per-item delivery badge
 * rendered on the right-hand side of each item row in the Order Items
 * by Category section, immediately to the LEFT of the price column.
 *
 * Hard constraints (locked by AS-014 / AS-015 on 2026-06-30):
 *   - Date-only label shape ("Next · 02 Jul" / "Prev · 25 Jun" / "Pending").
 *     NO slot window, NO time component on the badge (Q2 resolution).
 *   - Both colour AND icon so the badge is colour-blind-safe (NFR-003):
 *     Next → ↓ (arrow-down) + --accent-blue
 *     Prev → ✓ (check) + --accent-emerald
 *     Pending → ⏱ (clock) + --accent-amber
 *   - `aria-label` annotated for screen reader users per FR-004.
 *   - When `classification === 'pending'`, the badge text is just
 *     "Pending" (with NO date) — used exclusively on the placeholder
 *     row (FR-006).
 */

import { ArrowDown, Check, Clock } from 'lucide-react';

import type { DeliveryClassification } from '@/lib/item-utils';

export interface DeliveryBadgeProps {
  classification: DeliveryClassification;
  /** ISO date string (YYYY-MM-DD) the badge is anchored to. Required for
   *  `next` and `previous`; ignored when `classification === 'pending'`. */
  deliveryDate: string;
}

const ARIA_PREFIX: Record<DeliveryClassification, string> = {
  next: 'Next delivery on',
  previous: 'Previous delivery on',
  'pending-next': 'Pending next delivery',
};

/**
 * Renders the small delivery pill. Extracted to its own component so
 * `dashboard-client.tsx` stays focused on the section's pipeline + state
 * and so the badge is independently testable.
 */
export function DeliveryBadge({ classification, deliveryDate }: DeliveryBadgeProps) {
  // Date-only label shape (FR-004). Use the `Intl` short-month + day
  // format so e.g. "02 Jul" renders identically to the existing
  // Delivery chip on the Week Meals grid.
  const datePart = formatBadgeDate(deliveryDate);
  const text = classification === 'pending-next' ? 'Pending' : `${prefixFor(classification)}${datePart}`;
  const ariaLabel = classification === 'pending-next'
    ? ARIA_PREFIX['pending-next']
    : `${ARIA_PREFIX[classification]} ${deliveryDate}`;
  const bg = bgFor(classification);
  const fg = fgFor(classification);

  const icon = (() => {
    const size = 12;
    if (classification === 'next') return <ArrowDown style={{ width: size, height: size }} aria-hidden="true" />;
    if (classification === 'previous') return <Check style={{ width: size, height: size }} aria-hidden="true" />;
    return <Clock style={{ width: size, height: size }} aria-hidden="true" />;
  })();

  return (
    <span
      data-testid={`delivery-badge-${classification}`}
      aria-label={ariaLabel}
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
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      <span>{text}</span>
    </span>
  );
}

function prefixFor(c: DeliveryClassification): string {
  if (c === 'next') return 'Next · ';
  if (c === 'previous') return 'Prev · ';
  return '';
}

function bgFor(c: DeliveryClassification): string {
  if (c === 'next') return 'var(--accent-blue-bg)';
  if (c === 'previous') return 'var(--accent-emerald-bg)';
  return 'var(--accent-amber-bg)';
}

function fgFor(c: DeliveryClassification): string {
  if (c === 'next') return 'var(--accent-blue)';
  if (c === 'previous') return 'var(--accent-emerald)';
  return 'var(--accent-amber)';
}

/**
 * Format `YYYY-MM-DD` as the spec-canonical "DD MMM" (e.g. "02 Jul").
 * Pure; exported as a named export so sub-heading tests can assert on
 * the exact format independently of the badge component.
 */
export function formatBadgeDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const day = m[3];
  if (!day) return isoDate;
  const monthIdx = Number(m[2]) - 1;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[monthIdx];
  if (!month) return isoDate;
  return `${day} ${month}`;
}
