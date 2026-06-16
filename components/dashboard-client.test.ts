import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'components/dashboard-client.tsx'), 'utf8');
const pageSource = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

describe('DashboardClient meal card/detail contract', () => {
  it('keeps targeted missing explanations out of compact Week Meals cards and in the detail overlay', () => {
    const compactCardStart = source.indexOf('{dayMeals.map((meal, idx) => {');
    const compactCardEnd = source.indexOf('{selectedMealData && (');
    const compactCardSource = source.slice(compactCardStart, compactCardEnd);
    const detailOverlaySource = source.slice(compactCardEnd);

    expect(compactCardSource).not.toContain('Missing for 100%');
    expect(compactCardSource).not.toContain('Expected Items');
    expect(detailOverlaySource).toContain('Expected Items');
    expect(source).not.toContain('Missing for 100%');
  });

  it('prefixes visible Week Meals labels with the label emoji', () => {
    expect(source).toContain('>🏷️ {meal.meal.labels.join');
  });

  it('uses simple coverage labels for individual meal card/detail display instead of percentages or RAG wording', () => {
    const compactCardStart = source.indexOf('{dayMeals.map((meal, idx) => {');
    const compactCardEnd = source.indexOf('{selectedMealData && (');
    const compactCardSource = source.slice(compactCardStart, compactCardEnd);
    const detailOverlaySource = source.slice(compactCardEnd, source.indexOf('{(() => {', compactCardEnd));

    expect(compactCardSource).toContain('getCoverageStatusLabel(meal.status)');
    expect(compactCardSource).not.toContain('{meal.coverageScore}%');
    expect(detailOverlaySource).toContain('getCoverageStatusLabel(selectedMealData.status)');
    expect(detailOverlaySource).not.toContain('Coverage status');
    expect(detailOverlaySource).not.toContain('selectedMealData.coverageScore}%');
    expect(source).not.toContain('Green · covered');
    expect(source).not.toContain('Amber · partial');
    expect(source).not.toContain('Red · missing');
  });

  it('does not duplicate the meal detail coverage status section below the title badge', () => {
    const detailOverlayStart = source.indexOf('{selectedMealData && (');
    const detailOverlayEnd = source.indexOf('{selectedItem && selectedProductInfo && (');
    const detailOverlaySource = source.slice(detailOverlayStart, detailOverlayEnd);

    expect(detailOverlaySource).toContain('getCoverageStatusLabel(selectedMealData.status)');
    expect(detailOverlaySource).not.toContain('Coverage status');
  });

  it('does not import generated private data into the client component', () => {
    expect(source).not.toContain("@/lib/real-data");
    expect(pageSource).toContain('getServerSession(authOptions)');
    expect(pageSource).toContain('buildCoverageWindowDates(today, endDate)');
    expect(pageSource).toContain('getDashboardData({ coverageWindow })');
  });

  it('does not perform slow client-side product search on modal open', () => {
    expect(source).not.toContain('api.allorigins');
    expect(source).not.toContain('Open Food Facts');
    expect(source).not.toContain('fetchProductInfo');
    expect(source).toContain('resolveProductInfoForItem(selectedItem)');
  });

  it('provides grouped order item controls with sorting', () => {
    expect(source).toContain('Categories</p>');
    expect(source).toContain('Match</p>');
    expect(source).toContain('Sort</p>');
    expect(source).toContain("setItemSort(sort)");
    expect(source).toContain('Name A–Z');
    expect(source).toContain('Name Z–A');
    expect(source).toContain('Price ↑');
    expect(source).toContain('Price ↓');
  });

  it('renders matched item rows as name, quantity, and price columns with a total row', () => {
    const detailOverlayStart = source.indexOf('{selectedMealData && (');
    const detailOverlayEnd = source.indexOf('{selectedItem && selectedProductInfo && (');
    const detailOverlaySource = source.slice(detailOverlayStart, detailOverlayEnd);

    expect(detailOverlaySource).toContain("gridTemplateColumns: 'minmax(0, 1fr) 56px 72px'");
    expect(detailOverlaySource).toContain('Matched items total');
    expect(detailOverlaySource).toContain('calculateMatchedItemsTotal(');
    expect(detailOverlaySource).toContain('justifySelf');
  });

  it('styles Expected Items like Matched Items with one boxed row per item and matching row width', () => {
    expect(source).toContain('Expected Items</h4>');
    expect(source).toContain('missingExplanation.map((item, idx)');
    expect(source).toContain("backgroundColor: 'var(--accent-amber-bg)'");
    expect(source).toContain("border: 'none'");
    expect(source).toContain("width: '100%'");
    expect(source).toContain("boxSizing: 'border-box'");
    expect(source).not.toContain('{missingExplanation.join(\', \')}');  });

  // Spec 019 / FR-05 — "Use today" section for perishable items
  it('renders a "Use today" section at the top of the meal detail overlay for perishable items', () => {
    const detailOverlayStart = source.indexOf('{selectedMealData && (');
    const detailOverlayEnd = source.indexOf('{selectedItem && selectedProductInfo && (');
    const detailOverlaySource = source.slice(detailOverlayStart, detailOverlayEnd);

    expect(detailOverlaySource).toContain('Use today');
    // The section must come BEFORE the Matched Items section
    const useTodayIdx = detailOverlaySource.indexOf('Use today');
    const matchedItemsIdx = detailOverlaySource.indexOf('Matched Items');
    expect(useTodayIdx).toBeGreaterThan(-1);
    expect(matchedItemsIdx).toBeGreaterThan(-1);
    expect(useTodayIdx).toBeLessThan(matchedItemsIdx);
  });

  // Spec 019 / FR-05 — perishable badge on meal summary card
  it('shows a ⚠️ perishable badge on the meal detail header when any matched item has use_by_warning', () => {
    const detailOverlayStart = source.indexOf('{selectedMealData && (');
    const detailOverlayEnd = source.indexOf('{selectedItem && selectedProductInfo && (');
    const detailOverlaySource = source.slice(detailOverlayStart, detailOverlayEnd);

    // The badge text from the spec: "⚠️ Use today" or "Use today"
    expect(detailOverlaySource).toMatch(/⚠️\s*Use\s*today|use[-_]?by[-_]?warning/i);
  });

  // Spec 019 / FR-08 — four item states
  it('renders refunded items with a "£X refunded" red badge in the meal detail overlay', () => {
    const detailOverlayStart = source.indexOf('{selectedMealData && (');
    const detailOverlayEnd = source.indexOf('{selectedItem && selectedProductInfo && (');
    const detailOverlaySource = source.slice(detailOverlayStart, detailOverlayEnd);

    expect(detailOverlaySource).toContain('refunded');
    expect(detailOverlaySource).toMatch(/refundedItems|refunded_items/);
  });

  it('renders manual override items with a "✓ We have it" green/blue badge', () => {
    const detailOverlayStart = source.indexOf('{selectedMealData && (');
    const detailOverlayEnd = source.indexOf('{selectedItem && selectedProductInfo && (');
    const detailOverlaySource = source.slice(detailOverlayStart, detailOverlayEnd);

    // The badge text from the spec: "✓ We have it"
    expect(detailOverlaySource).toContain('We have it');
  });

  // Spec 019 / FR-07 / T061 — "I have this" button on unmatched items
  it('provides an "I have this" button for the dashboard override flow', () => {
    expect(source).toContain('I have this');
  });

  // Defensive guard for stale/missing coverage data: if `coverage.length === 0`,
  // the word-overlap heuristic can't classify anything and would otherwise
  // surface the "I have this" button on every receipt item — including
  // covered ones. Hide the button in that case and show a neutral "?"
  // classification icon.
  it('hides the "I have this" button when coverage data is missing', () => {
    // The button visibility is now driven by `canShowOverrideButton`,
    // which is `isUnmatched && coverage.length > 0`. The JSX must
    // reference both `canShowOverrideButton` (or its underlying
    // `coverage.length` check) and a visual signal for the unknown
    // state.
    expect(source).toContain('canShowOverrideButton');
    expect(source).toContain('classificationUnknown');
  });
});

describe('Manual override API route', () => {
  // The API route is created in Phase 7 of spec 019. Before the route
  // exists, the file is missing — vitest's readFileSync would throw, so
  // we read with a try/except and treat missing as a test-fail signal
  // (the assertions below will check the file's contents when present).
  let apiRoute = '';
  try {
    apiRoute = readFileSync(join(process.cwd(), 'app/api/manual-override/route.ts'), 'utf8');
  } catch {
    apiRoute = '';
  }

  it('exists and authenticates with the dashboard data secret', () => {
    expect(apiRoute).toContain('x-dashboard-secret');
    expect(apiRoute).toContain('MEALS_DASHBOARD_DATA_SECRET');
  });

  it('accepts meal_date, meal_name, item_name, quantity and forwards to apply_manual_override', () => {
    expect(apiRoute).toContain('meal_date');
    expect(apiRoute).toContain('meal_name');
    expect(apiRoute).toContain('item_name');
    expect(apiRoute).toContain('quantity');
    expect(apiRoute).toContain('apply_manual_override');
  });
});

describe('Durable manual override route (/api/overrides)', () => {
  // Spec 019 / FR-07 / T061 — the previous design spawned a Python
  // subprocess from the server action, which wrote to a path on the
  // serverless function's ephemeral disk. That file was wiped on the
  // next cold start, so the override never made it to a durable
  // location. The new /api/overrides route writes to the Vercel blob
  // directly, which is the durable source of truth.
  let routeSrc = '';
  try {
    routeSrc = readFileSync(join(process.cwd(), 'app/api/overrides/route.ts'), 'utf8');
  } catch {
    routeSrc = '';
  }

  it('exists and exposes GET + POST handlers', () => {
    expect(routeSrc).toContain('export async function GET');
    expect(routeSrc).toContain('export async function POST');
  });

  it('authenticates with the dashboard data secret', () => {
    expect(routeSrc).toContain('x-dashboard-secret');
    expect(routeSrc).toContain('MEALS_DASHBOARD_DATA_SECRET');
  });

  it('writes to a blob at overrides/manual.json (durable Vercel blob, not ephemeral disk)', () => {
    expect(routeSrc).toContain('overrides/manual.json');
    expect(routeSrc).toContain("import { put");
    // The route must NOT actually call spawn() (that's the bug we're
    // fixing). We match `spawn(` to exclude the docstring mentions.
    expect(routeSrc).not.toMatch(/\bspawn\s*\(/);
  });

  it('validates meal_date, meal_name, item_name are required on POST', () => {
    expect(routeSrc).toContain('isUpsertRequestBody');
    expect(routeSrc).toContain('meal_date, meal_name, item_name are required');
  });
});

describe('Manual override server action (durable flow)', () => {
  // The action now POSTs to /api/overrides via fetch rather than
  // spawning a Python subprocess. This keeps the secret server-side
  // and ensures the write hits a durable location.
  let actionSrc = '';
  try {
    actionSrc = readFileSync(join(process.cwd(), 'app/actions/manual-override-action.ts'), 'utf8');
  } catch {
    actionSrc = '';
  }

  it('does NOT spawn a Python subprocess (would write to ephemeral disk)', () => {
    // Match `spawn(` and `child_process` as code references, not
    // docstring mentions. The previous design used `import { spawn }
    // from 'node:child_process'` and called `spawn(...)`.
    expect(actionSrc).not.toMatch(/\bspawn\s*\(/);
    expect(actionSrc).not.toMatch(/from\s+['"]node:child_process['"]/);
  });

  it('POSTs to /api/overrides via fetch with the data secret', () => {
    expect(actionSrc).toContain('/api/overrides');
    expect(actionSrc).toContain('x-dashboard-secret');
    expect(actionSrc).toContain('MEALS_DASHBOARD_DATA_SECRET');
    expect(actionSrc).toContain('fetch(');
  });

  it('checks NextAuth session before forwarding the override', () => {
    expect(actionSrc).toContain('getServerSession');
    expect(actionSrc).toContain('authOptions');
  });
});
