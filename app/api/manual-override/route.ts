/** Legacy subprocess override endpoint. Disabled throughout Stage A; all accepted
 * source operations are isolated to the v3 authority namespace. */
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

  // This legacy subprocess writes outside the v3 authority transaction and stays disabled.
  return NextResponse.json({ error: 'Legacy override writer disabled' }, { status: 403 });
}
