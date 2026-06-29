import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { buildCoverageWindowDates, getDashboardData } from '@/lib/dashboard-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = toIsoDate(now);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 14);
  const endDate = toIsoDate(end);
  const coverageWindow = buildCoverageWindowDates(today, endDate);

  const reader = new VercelBlobStorageClient();
  const pointer = await reader.readPointer();
  const manifest = pointer?.manifestPath ? await reader.readManifest(pointer.manifestPath) : {};
  const coverageKeys = Object.keys(manifest).filter((key) => key.startsWith('coverage/')).sort();
  const coverageBlobSummaries = await Promise.all(
    coverageKeys.map(async (path) => {
      const blob = await reader.readJsonBlob<{ meals?: Array<{ meal?: { date?: string; content?: string } }> }>(path);
      return {
        path,
        mealCount: blob?.meals?.length ?? 0,
        mealDates: [...new Set((blob?.meals ?? []).map((entry) => entry.meal?.date).filter(Boolean))],
        titles: (blob?.meals ?? []).map((entry) => entry.meal?.content ?? ''),
      };
    })
  );

  const data = await getDashboardData({ reader, coverageWindow });
  const dataCoverageDates = [...new Set(data.coverage.map((entry) => entry.meal.date))].sort();

  return NextResponse.json({
    today,
    endDate,
    pointer,
    manifestKeyCount: Object.keys(manifest).length,
    coverageKeys,
    coverageBlobSummaries,
    dataCoverageCount: data.coverage.length,
    dataCoverageDates,
    dataCoverageTitles: data.coverage.map((entry) => ({ date: entry.meal.date, title: entry.meal.content, type: entry.meal.meal_type ?? null })),
    loadError: data.loadError,
  });
}
