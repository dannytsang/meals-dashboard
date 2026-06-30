/**
 * Item display utilities for the meals dashboard.
 */

import type { GroceryItem, DeliveryWindow } from './meals-data';
import type { OrderBlob } from './dashboard-sync';

// re-export for downstream convenience
export type { GroceryItem };

/**
 * Strip "Substitutions: On" and similar suffixes from item names.
 * The raw receipt data embeds "Substitutions: On" in item names, but
 * substitution info is shown separately in the product modal.
 */
export function cleanItemName(name: string): string {
  return name.replace(/\s*Substitutions:\s*On\s*$/i, '').trim();
}

// Spec 019 / FR-04 — re-export the canonical MatchedItem from meals-data
// so this module (and the dashboard client) sees the same shape, including
// the shelf-life + source fields populated by the Python pipeline.
export type { MatchedItem } from './meals-data';

import type { MatchedItem } from './meals-data';

export type DeliveryClassification = 'previous' | 'next' | 'pending-next';

/**
 * Spec 034 / FR-001 + FR-004 + FR-005 — per-delivery classification
 * shape consumed by the dashboard's Order Items by Category section.
 * Pure render-time derivation; lives in component state only.
 */
export interface DeliveryGroup {
  /** The order blob backing this delivery. `null` for pending-next
   *  entries that come from the merged deliveryWindows only. */
  order: OrderBlob | null;
  deliveryDate: string;
  deliverySlot: string;
  status?: OrderBlob['status'];
  items: GroceryItem[];
  classification: DeliveryClassification;
}

export interface ClassifiedOrderItems {
  previous: DeliveryGroup[];
  next: DeliveryGroup[];
  /** Pending-next entries: `order: null` for a `deliveryWindow.date >= today`
   *  that has no matching order blob. Each entry has the expected
   *  deliveryDate so the placeholder can surface "(expected {DD MMM})". */
  pendingNext: DeliveryGroup[];
}

function isValidIsoDate(s: string): boolean {
  // Defensive: `Date.parse` accepts a wider range than spec 034's
  // `YYYY-MM-DD` ISO calendar date. Match the strict shape first so a
  // `not-a-date` literal or a malformed string never classifies.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

/**
 * Spec 034 / FR-001 + FR-002 + FR-006 + FR-008 — pure derivation of the
 * per-order "previous / next / pending-next" classification, consumed by
 * the Order Items by Category section in dashboard-client.tsx.
 *
 * Behavioural contract (locked by spec.md FR-001, FR-006, edge cases):
 *   - An order is `previous` when `deliveryDate < today`.
 *   - An order is `next` when `deliveryDate >= today` AND an order blob
 *     exists for that date (i.e. it was returned by the read path).
 *   - An order is `pending-next` when its expected `deliveryDate >= today`
 *     AND no matching `OrderBlob` was returned. Sourced from the
 *     `deliveryWindows` merged list — only calendar-event entries with
 *     no order email count as "pending next", since the section's
 *     job is to show the groceries the user actually bought.
 *   - Each input array is iterated exactly once. Total work is O(n+m)
 *     where n = validOrders (≤ 4 in practice) and m = deliveryWindows
 *     (≤ 4). Matches NFR-001's ≤ 16 comparisons / render budget.
 *   - Malformed `deliveryDate` (non-ISO or invalid date) → excluded
 *     silently, no throw. Covers the spec's edge case.
 *   - Duplicate `deliveryDate` across multiple `OrderBlob`s → items are
 *     concatenated into a single `DeliveryGroup` per date (per edge case).
 *   - `cancelled` / `superseded` / `refunded` orders are still classified
 *     by date and carry their `status` on the group (FR-005 / AS-012).
 *   - Each bucket is sorted ascending by `deliveryDate` (chronological,
 *     earliest first).
 *
 * Intentionally a pure function (no React state, no `Date.now()`); the
 * dashboard passes in the canonical `today` value already used elsewhere
 * (spec 022 cookie-gated render path), so auto-flip behaviour at
 * re-render is automatic (FR-009).
 */
export function classifyOrderItemsByDelivery(
  validOrders: OrderBlob[],
  deliveryWindows: DeliveryWindow[],
  today: string,
): ClassifiedOrderItems {
  if (!isValidIsoDate(today)) {
    // Defensive fallback — the dashboard always passes a real ISO date,
    // but vitest fixtures / debug-callers may not. Mirrors the
    // malformed-delivery-date branch: classify everything as previous
    // rather than mis-bucket.
    today = '1970-01-01';
  }

  // Aggregate items per deliveryDate across all valid OrderBlobs so
  // duplicates (amended-order scenario) collapse into one DeliveryGroup
  // per spec 034 edge case.
  const groupsByDate = new Map<string, DeliveryGroup>();

  for (const o of validOrders) {
    if (!isValidIsoDate(o.deliveryDate)) continue;
    const existing = groupsByDate.get(o.deliveryDate);
    if (existing) {
      // Preserve the FIRST occurrence's metadata (status, slot) so
      // a cancelled order followed by an amendment doesn't silently
      // upgrade the group's status. Append the items.
      existing.items = [...existing.items, ...(o.items ?? [])];
    } else {
      groupsByDate.set(o.deliveryDate, {
        order: o,
        deliveryDate: o.deliveryDate,
        deliverySlot: o.deliverySlot ?? '',
        status: o.status,
        items: [...(o.items ?? [])],
        classification: o.deliveryDate < today ? 'previous' : 'next',
      });
    }
  }

  const previous: DeliveryGroup[] = [];
  const next: DeliveryGroup[] = [];
  for (const g of groupsByDate.values()) {
    if (g.classification === 'previous') previous.push(g);
    else next.push(g);
  }

  // Pending-next: a calendar-event date with no matching OrderBlob and
  // a date in the future. Source = the merged deliveryWindows list. The
  // dashboard already merges summary windows + order-blob dates into
  // that list (lib/dashboard-data.ts:316-330), so we just cross-check
  // against `groupsByDate`.
  const pendingNext: DeliveryGroup[] = [];
  const seenPending = new Set<string>();
  for (const w of deliveryWindows) {
    if (!isValidIsoDate(w.date)) continue;
    if (groupsByDate.has(w.date)) continue;
    if (w.date < today) continue;
    if (seenPending.has(w.date)) continue;
    seenPending.add(w.date);
    pendingNext.push({
      order: null,
      deliveryDate: w.date,
      deliverySlot: w.slot ?? '',
      items: [],
      classification: 'pending-next',
    });
  }

  previous.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  next.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  pendingNext.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

  return { previous, next, pendingNext };
}

/**
 * Deduplicate matched items by their cleaned name.
 *
 * The meal_coverage module can sometimes return both:
 *   "Tesco Aioli Dip 200G Substitutions: On"
 *   "Tesco Aioli Dip 200G"
 * as separate matched items for the same ingredient.
 * This function deduplicates by cleaned name to avoid showing
 * the same product twice in the meal detail modal.
 */
export function deduplicateMatchedItems(items: MatchedItem[]): MatchedItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = cleanItemName(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculateMatchedItemsTotal(items: MatchedItem[]): number {
  return items.reduce((total, item) => total + (typeof item.price === 'number' ? item.price : 0), 0);
}
