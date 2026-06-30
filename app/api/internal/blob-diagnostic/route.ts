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

  const orderKeys = Object.keys(manifest).filter((key) => key.startsWith('orders/')).sort();
  const orderBlobSummaries = await Promise.all(
    orderKeys.map(async (path) => {
      const blob = await reader.readJsonBlob<{
        orderNumber?: string;
        deliveryDate?: string;
        deliverySlot?: string;
        status?: string;
        items?: Array<{ name?: string; tpnc?: string | null; quantity?: number; price?: number; category?: string | null }>;
      }>(path);
      return {
        path,
        orderNumber: blob?.orderNumber ?? null,
        deliveryDate: blob?.deliveryDate ?? null,
        deliverySlot: blob?.deliverySlot ?? null,
        status: blob?.status ?? null,
        itemCount: blob?.items?.length ?? 0,
        itemNames: (blob?.items ?? []).map((item) => item.name ?? ''),
        items: (blob?.items ?? []).map((item) => ({
          name: item.name ?? '',
          tpnc: item.tpnc ?? null,
          quantity: item.quantity ?? null,
          price: item.price ?? null,
          category: item.category ?? null,
        })),
      };
    })
  );

  const productsManifest = pointer?.productsManifestPath ? await reader.readManifest(pointer.productsManifestPath) : {};
  const productKeys = Object.keys(productsManifest).sort();
  const productBlobSummaries = await Promise.all(
    productKeys.map(async (tpnc) => {
      const path = productsManifest[tpnc];
      const blob = path ? await reader.readJsonBlob<{
        title?: string;
        description?: string;
        brand?: string;
        category?: string;
        imageUrl?: string;
        productUrl?: string;
        storage?: string;
        preparation?: string;
        ingredients?: string;
        allergens?: string;
        nutrition?: string;
        source?: string;
        lastFetched?: string;
        firecrawl?: { snippet?: string | null; status?: string | null; lastFetched?: string | null };
      }>(path) : null;
      return {
        tpnc,
        path,
        title: blob?.title ?? null,
        description: blob?.description ?? null,
        brand: blob?.brand ?? null,
        category: blob?.category ?? null,
        imageUrl: blob?.imageUrl ?? null,
        productUrl: blob?.productUrl ?? null,
        hasStorage: Boolean(blob?.storage),
        hasPreparation: Boolean(blob?.preparation),
        hasIngredients: Boolean(blob?.ingredients),
        hasAllergens: Boolean(blob?.allergens),
        hasNutrition: Boolean(blob?.nutrition),
        source: blob?.source ?? null,
        lastFetched: blob?.lastFetched ?? null,
        firecrawlStatus: blob?.firecrawl?.status ?? null,
        firecrawlSnippet: blob?.firecrawl?.snippet ?? null,
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
    orderKeys,
    orderBlobSummaries,
    productManifestKeyCount: productKeys.length,
    productBlobSummaries,
    dataCoverageCount: data.coverage.length,
    dataCoverageDates,
    dataCoverageTitles: data.coverage.map((entry) => ({ date: entry.meal.date, title: entry.meal.content, type: entry.meal.meal_type ?? null })),
    deliveryWindows: data.deliveryWindows,
    latestOrder: data.latestOrder ? {
      orderNumber: data.latestOrder.orderNumber,
      deliveryDate: data.latestOrder.deliveryDate,
      deliverySlot: data.latestOrder.deliverySlot,
      orderStatus: data.latestOrder.orderStatus,
      itemCount: data.latestOrder.items.length,
      itemNames: data.latestOrder.items.map((item) => item.name),
      items: data.latestOrder.items.map((item) => ({
        name: item.name,
        tpnc: item.tpnc ?? null,
        quantity: item.quantity,
        price: item.price,
        category: item.category ?? null,
      })),
    } : null,
    loadError: data.loadError,
  });
}
