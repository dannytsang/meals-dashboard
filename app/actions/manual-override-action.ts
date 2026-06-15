'use server';

/**
 * Spec 019 / FR-07 / T061 — server action for the "I have this" button.
 *
 * The matching API route at /api/manual-override requires a custom
 * `x-dashboard-secret` header for auth, which a normal HTML form
 * submission can't set. A Next.js server action is the right tool
 * here: it runs on the server (so the secret stays server-side), is
 * callable from the client component without exposing credentials,
 * and is naturally authenticated via the parent server component's
 * session check.
 *
 * The action re-uses the same Python subprocess invocation as the
 * API route, just without the HTTP layer. We keep the route around
 * for tests and any future server-to-server consumers.
 */

import 'server-only';
import { spawn } from 'node:child_process';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const OVERRIDES_SCRIPT_PATH =
  process.env.MEALS_OVERRIDES_SCRIPT_PATH
  || '/home/hermes/.hermes/scripts/apply_manual_override.py';

export interface ManualOverrideResult {
  ok: boolean;
  meal_date?: string;
  meal_name?: string;
  item_name?: string;
  quantity?: number;
  error?: string;
}

function runApplyManualOverride(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [OVERRIDES_SCRIPT_PATH, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
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

  if (!mealDate || !mealName || !itemName) {
    return { ok: false, error: 'meal_date, meal_name, item_name are required' };
  }

  const args = [
    '--meal-date', mealDate,
    '--meal-name', mealName,
    '--item-name', itemName,
    '--quantity', String(quantity),
    '--reason', reason,
  ];

  try {
    const result = await runApplyManualOverride(args);
    if (result.code !== 0) {
      return {
        ok: false,
        error: result.stderr || result.stdout || `Python exited ${result.code}`,
      };
    }
    return {
      ok: true,
      meal_date: mealDate,
      meal_name: mealName,
      item_name: itemName,
      quantity,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
