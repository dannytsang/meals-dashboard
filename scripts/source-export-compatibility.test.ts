// @vitest-environment node
// Optional cross-repository acceptance: point at the reviewed Meal Planner checkout.
import { expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { exportSource } from '../lib/source-export';
import { pathToFileURL } from 'node:url';

it.skipIf(!process.env.MEAL_PLANNER_REVIEW_ROOT)('source bytes are independently accepted by the actual Meal Planner archive and graph readers', async () => {
  const root = resolve(process.env.MEAL_PLANNER_REVIEW_ROOT!);
  const load = (path: string) => import(/* @vite-ignore */ pathToFileURL(resolve(root, path)).href);
  const { fixtureGraph } = await load('tests/inventory/store-fixture.ts');
  const { parseSourceExport } = await load('lib/source-export-archive.ts');
  const { inventory, compareInventories } = await load('lib/read-only-inventory.ts');
  const { buildInventoryReport } = await load('lib/inventory-report.ts');
  const f = fixtureGraph(); const read = vi.fn(async (path: string) => f.records.get(path) ?? null);
  const archive = await exportSource(read, new AbortController().signal);
  const a = await inventory(parseSourceExport(Buffer.from(JSON.stringify(archive)))), b = await inventory(f.source);
  expect(a.complete).toBe(true); expect(a.categories).toEqual(b.categories); expect(compareInventories(a, b).status).toBe('equal');
  const report = buildInventoryReport(a, b); expect(report.comparison.importReady).toBe(false);
  expect(JSON.stringify(report)).not.toContain('Synthetic');
  expect(archive.records.length).toBe(Object.keys(a.hashes).length);
});
