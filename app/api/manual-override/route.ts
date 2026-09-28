/** Legacy subprocess override endpoint. Disabled in the offline fenced-source candidate;
 * user edits use /api/overrides and installed production is unchanged. */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // This legacy subprocess writes outside the fenced Vercel source transaction.
  // Disable in the offline candidate; the installed deployment is unchanged.
  return NextResponse.json({ error: 'Legacy override writer disabled' }, { status: 403 });
}
