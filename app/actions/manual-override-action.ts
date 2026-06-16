'use server';

/**
 * Spec 019 / FR-07 / T061 — server action for the "I have this" button.
 *
 * The action calls the durable /api/overrides route on the same
 * deployment, which writes to the Vercel blob. We deliberately do NOT
 * spawn a Python subprocess from the server action: that runs on the
 * serverless function's ephemeral disk, and any file written there is
 * wiped on the next cold start. The previous version of this action
 * (commit 226a104) used exactly that pattern, and the override you
 * applied via the dashboard never made it to the durable file.
 *
 * Flow now:
 *   1. User clicks "I have this" in the dashboard client.
 *   2. DashboardClient.submitManualOverrideAction(formData) is invoked.
 *   3. Action calls /api/overrides POST with the data secret in
 *      `x-dashboard-secret` (read from MEALS_DASHBOARD_DATA_SECRET env).
 *   4. /api/overrides writes the override to overrides/manual.json in
 *      the Vercel blob (durable).
 *   5. Next Python sync reads the blob via GET /api/overrides and
 *      applies the overrides via apply_manual_overrides(), which
 *      merges them into the coverage blob on the next sync.
 *
 * Auth: the action checks NextAuth session, then forwards the data
 * secret to the route. The route does the actual blob write.
 */

import 'server-only';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
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

export async function submitManualOverrideAction(formData: FormData): Promise<ManualOverrideResult> {
  // Auth: only signed-in users can override coverage. The page-level
  // server component already redirects on missing session, but we
  // double-check here because server actions can be invoked from
  // client components without going through the page.
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
    return { ok: false, error: 'MEALS_DASHBOARD_DATA_SECRET not configured on the server' };
  }

  // Resolve the route URL. The action runs inside the deployed app,
  // so we can use the same origin as the request. We can't just call
  // our own /api/overrides route handler directly because Next.js
  // server actions don't expose a clean inter-handler call. Instead
  // we POST over HTTP to the same origin.
  const hdrs = await headers();
  const host = hdrs.get('host') || 'localhost';
  const proto = hdrs.get('x-forwarded-proto') || 'https';
  const routeUrl = `${proto}://${host}/api/overrides`;

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to call /api/overrides: ${message}` };
  }

  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text) as OverridesRouteResponse;
      detail = parsed.detail || parsed.error || text;
    } catch {
      // text is not JSON, use raw
    }
    return {
      ok: false,
      error: `Override route returned ${response.status}: ${detail}`,
    };
  }

  const data = (await response.json()) as OverridesRouteResponse;
  if (!data.ok) {
    return { ok: false, error: data.error || data.detail || 'Override route returned ok:false' };
  }

  return {
    ok: true,
    meal_date: mealDate,
    meal_name: mealName,
    item_name: itemName,
    quantity,
  };
}
