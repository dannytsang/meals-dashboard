'use server';

/**
 * Spec 019 / FR-07 / T061 — server action for the "I have this" button.
 *
 * The action calls the durable /api/overrides route on the same deployment,
 * which writes to the Vercel blob. The route URL is derived from a canonical
 * deployment origin, never from request-controlled Host or X-Forwarded-* values.
 */

import 'server-only';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export interface ManualOverrideResult {
  ok: boolean;
  meal_date?: string;
  meal_name?: string;
  item_name?: string;
  quantity?: number;
  error?: string;
}

interface OverridesRouteResponse {
  ok: boolean;
  overrides?: unknown[];
  error?: string;
  detail?: string;
}

function configuredAppOrigin(): string {
  const raw = process.env.MEALS_DASHBOARD_APP_ORIGIN || process.env.NEXTAUTH_URL;
  if (!raw) throw new Error('APP_ORIGIN_NOT_CONFIGURED');
  const url = new URL(raw);
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('APP_ORIGIN_MUST_BE_HTTPS');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export async function submitManualOverrideAction(formData: FormData): Promise<ManualOverrideResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/auth/signin?callbackUrl=/');
  }

  const mealDate = String(formData.get('meal_date') || '');
  const mealName = String(formData.get('meal_name') || '');
  const itemName = String(formData.get('item_name') || '');
  const quantity = Number(formData.get('quantity') || 1);
  const reason = String(formData.get('reason') || 'user_clicked_i_have_this');
  const status = String(formData.get('status') || 'covered');

  if (!mealDate || !mealName || !itemName) {
    return { ok: false, error: 'meal_date, meal_name, item_name are required' };
  }

  const secret = process.env.MEALS_DASHBOARD_DATA_SECRET;
  if (!secret) {
    return { ok: false, error: 'Server is not configured for manual overrides' };
  }

  let routeUrl: string;
  try {
    routeUrl = `${configuredAppOrigin()}/api/overrides`;
  } catch (error) {
    console.error('[manual-override-action] invalid canonical origin', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, error: 'Server is not configured for manual overrides' };
  }

  let response: Response;
  try {
    response = await fetch(routeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-secret': secret,
      },
      body: JSON.stringify({
        meal_date: mealDate,
        meal_name: mealName,
        item_name: itemName,
        quantity,
        reason,
        status,
      }),
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[manual-override-action] override route call failed', {
      error: error instanceof Error ? error.name : 'unknown',
    });
    return { ok: false, error: 'Failed to apply manual override' };
  }

  if (!response.ok) {
    console.error('[manual-override-action] override route rejected request', {
      status: response.status,
    });
    return { ok: false, error: 'Failed to apply manual override' };
  }

  const data = (await response.json()) as OverridesRouteResponse;
  if (!data.ok) {
    console.error('[manual-override-action] override route returned ok:false');
    return { ok: false, error: 'Failed to apply manual override' };
  }

  return {
    ok: true,
    meal_date: mealDate,
    meal_name: mealName,
    item_name: itemName,
    quantity,
  };
}
