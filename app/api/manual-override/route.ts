/**
 * Manual override API route — Spec 019 / FR-07 / T062.
 *
 * Called by the dashboard when the user clicks "I have this" on an
 * unmatched item. Forwards the override to the Python pipeline's
 * `apply_manual_override()` function, which persists the entry to
 * `~/.hermes/scripts/data/manual_overrides.json` and audit-logs the
 * change.
 *
 * Auth: the same `MEALS_DASHBOARD_DATA_SECRET` used by the existing
 * `/api/dashboard-data` and `/api/dashboard-sync` routes.
 *
 * Why a Python subprocess instead of writing the JSON directly? The
 * Python pipeline owns the dedup-by-triple-key logic, the audit log
 * entry, and the canonical storage path. Calling it keeps the file
 * format and audit semantics consistent with the existing
 * `apply_manual_overrides()` flow.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const OVERRIDES_SCRIPT_PATH = process.env.MEALS_OVERRIDES_SCRIPT_PATH
  || '/home/hermes/.hermes/scripts/apply_manual_override.py';

interface OverrideRequestBody {
  meal_date: string;
  meal_name: string;
  item_name: string;
  quantity?: number;
  reason?: string;
  status?: 'covered' | 'partial';
}

function isOverrideRequestBody(value: unknown): value is OverrideRequestBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.meal_date === 'string' &&
    typeof v.meal_name === 'string' &&
    typeof v.item_name === 'string'
  );
}

function runApplyManualOverride(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isOverrideRequestBody(body)) {
    return NextResponse.json(
      { error: 'Invalid payload: meal_date, meal_name, item_name are required' },
      { status: 400 }
    );
  }

  const args = [
    '--meal-date', body.meal_date,
    '--meal-name', body.meal_name,
    '--item-name', body.item_name,
    '--quantity', String(body.quantity ?? 1),
  ];
  if (body.reason) args.push('--reason', body.reason);
  if (body.status) args.push('--status', body.status);

  try {
    const result = await runApplyManualOverride(args);
    if (result.code !== 0) {
      console.error('[manual-override] Python script failed', {
        code: result.code,
        stderrLength: result.stderr.length,
        stdoutLength: result.stdout.length,
      });
      return NextResponse.json(
        { error: 'Failed to apply override' },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      meal_date: body.meal_date,
      meal_name: body.meal_name,
      item_name: body.item_name,
      quantity: body.quantity ?? 1,
    });
  } catch (err) {
    console.error('[manual-override] Spawn failed', { error: err instanceof Error ? err.name : 'unknown' });
    return NextResponse.json(
      { error: 'Failed to invoke override script' },
      { status: 500 }
    );
  }
}
