import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { del, put } from '@vercel/blob';
import { createHash } from 'node:crypto';

import { VercelBlobStorageClient } from '@/lib/blob-storage';
import { buildCoverageWindowDates, getDashboardData } from '@/lib/dashboard-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DASHBOARD_DATA_SECRET = process.env.MEALS_DASHBOARD_DATA_SECRET;
const PRODUCTS_MANIFEST_PREFIX = 'meta/products-manifest-';
const DEFAULT_MAX_AGE_DAYS = 21;

type ProductManifest = Record<string, string>;

type ProductBlobLike = {
  tpnc?: string | null;
  title?: string | null;
  lastFetched?: string | null;
};

type RemovedProduct = {
  tpnc: string;
  path: string;
  title: string | null;
  lastFetched: string | null;
  reason: 'not-in-upcoming-order' | 'missing-blob' | 'expired' | 'invalid-path';
};

type KeptProduct = {
  tpnc: string;
  path: string;
  title: string | null;
  lastFetched: string | null;
  inUpcomingOrder: boolean;
};

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return fallback;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (['1', 'true', 'yes'].includes(value.toLowerCase())) return true;
    if (['0', 'false', 'no'].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function productManifestPath(manifest: ProductManifest): string {
  const sorted = Object.keys(manifest).sort().reduce<ProductManifest>((acc, key) => {
    acc[key] = manifest[key]!;
    return acc;
  }, {});
  const content = JSON.stringify(sorted, null, 2);
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');
  return `${PRODUCTS_MANIFEST_PREFIX}${hash}.json`;
}

function productManifestContent(manifest: ProductManifest): string {
  const sorted = Object.keys(manifest).sort().reduce<ProductManifest>((acc, key) => {
    acc[key] = manifest[key]!;
    return acc;
  }, {});
  return JSON.stringify(sorted, null, 2);
}

function isExpired(lastFetched: string | null | undefined, now: Date, maxAgeDays: number): boolean {
  if (!lastFetched) return false;
  const parsed = new Date(lastFetched);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageMs = now.getTime() - parsed.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('x-dashboard-secret');
  if (!authHeader || authHeader !== DASHBOARD_DATA_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const dryRun = parseBoolean(body.dryRun ?? url.searchParams.get('dryRun'), false);
  const maxAgeDays = parsePositiveInt(body.maxAgeDays ?? url.searchParams.get('maxAgeDays'), DEFAULT_MAX_AGE_DAYS);
  const keepUpcomingOnly = parseBoolean(body.keepUpcomingOnly ?? url.searchParams.get('keepUpcomingOnly'), true);
  const removeDangling = parseBoolean(body.removeDangling ?? url.searchParams.get('removeDangling'), true);
  const removeExpired = parseBoolean(body.removeExpired ?? url.searchParams.get('removeExpired'), true);

  const reader = new VercelBlobStorageClient();
  const pointer = await reader.readPointer();
  if (!pointer?.manifestPath) {
    return NextResponse.json({ error: 'No dashboard pointer found' }, { status: 409 });
  }

  const productsManifest = pointer.productsManifestPath
    ? await reader.readManifest(pointer.productsManifestPath)
    : {};

  const now = new Date();
  const today = toIsoDate(now);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 14);
  const coverageWindow = buildCoverageWindowDates(today, toIsoDate(end));
  const data = await getDashboardData({ reader, coverageWindow });
  const latestOrder = data.latestOrder;
  const upcomingTpncs = new Set(
    (latestOrder?.items ?? [])
      .map((item) => item.tpnc)
      .filter((tpnc): tpnc is string => typeof tpnc === 'string' && tpnc.trim() !== '')
  );

  const keptManifest: ProductManifest = {};
  const kept: KeptProduct[] = [];
  const removed: RemovedProduct[] = [];

  for (const [tpnc, path] of Object.entries(productsManifest).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^products\/\d+\.json$/.test(path)) {
      removed.push({ tpnc, path, title: null, lastFetched: null, reason: 'invalid-path' });
      continue;
    }

    const blob = await reader.readJsonBlob<ProductBlobLike>(path);
    const inUpcomingOrder = upcomingTpncs.has(tpnc);
    const missingBlob = !blob;
    const expired = blob ? isExpired(blob.lastFetched, now, maxAgeDays) : false;

    const reason =
      keepUpcomingOnly && !inUpcomingOrder
        ? 'not-in-upcoming-order'
        : removeDangling && missingBlob
          ? 'missing-blob'
          : removeExpired && expired
            ? 'expired'
            : null;

    if (reason) {
      removed.push({
        tpnc,
        path,
        title: blob?.title ?? null,
        lastFetched: blob?.lastFetched ?? null,
        reason,
      });
      continue;
    }

    keptManifest[tpnc] = path;
    kept.push({
      tpnc,
      path,
      title: blob?.title ?? null,
      lastFetched: blob?.lastFetched ?? null,
      inUpcomingOrder,
    });
  }

  const nextProductsManifestPath = productManifestPath(keptManifest);
  const deletedPaths = [...new Set(removed.map((item) => item.path).filter((path) => /^products\/\d+\.json$/.test(path)))];

  if (!dryRun) {
    await put(nextProductsManifestPath, productManifestContent(keptManifest), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    await reader.writePointer(pointer.manifestPath, nextProductsManifestPath);
    if (deletedPaths.length > 0) {
      await del(deletedPaths, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    policy: { maxAgeDays, keepUpcomingOnly, removeDangling, removeExpired },
    order: latestOrder ? {
      orderNumber: latestOrder.orderNumber,
      deliveryDate: latestOrder.deliveryDate,
      itemCount: latestOrder.items.length,
      tpncCount: upcomingTpncs.size,
    } : null,
    pointerBefore: pointer,
    productsManifestPathBefore: pointer.productsManifestPath ?? null,
    productsManifestPathAfter: nextProductsManifestPath,
    productCountBefore: Object.keys(productsManifest).length,
    productCountAfter: Object.keys(keptManifest).length,
    kept,
    removed,
    deletedPaths: dryRun ? [] : deletedPaths,
    wouldDeletePaths: dryRun ? deletedPaths : [],
  });
}
