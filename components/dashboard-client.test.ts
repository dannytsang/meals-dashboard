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

  it('renders the live-load warning panel beneath the header when the loader reports an error', () => {
    expect(source).toContain('DashboardDataErrorPanel');
    expect(source).toContain('data.loadError && <DashboardDataErrorPanel error={data.loadError} />');
    const headerEnd = source.indexOf('</header>');
    const panelIdx = source.indexOf('data.loadError && <DashboardDataErrorPanel error={data.loadError} />');
    const mainIdx = source.indexOf('<main style={{ maxWidth: \'1400px\'');
    expect(headerEnd).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(headerEnd);
    expect(panelIdx).toBeLessThan(mainIdx);
  });

  it('keeps the data loader on the server and out of the client bundle', () => {
    expect(source).not.toContain("@/lib/real-data");
    expect(pageSource).toContain('getServerSession(authOptions)');
    expect(pageSource).toContain('buildCoverageWindowDates(today, endDate)');
    expect(pageSource).toMatch(/import\s*\{[^}]*\bgetDashboardData\b[^}]*\}\s*from/);
    expect(source).not.toMatch(/import\s*\{[^}]*\bgetDashboardData\b[^}]*\}\s*from/);
    expect(source).not.toMatch(/getDashboardData\s*\(/);
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
    expect(source).not.toContain('{missingExplanation.join(\', \')}');
  });

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

  it('uses a 3-tuple for the (meal_date, meal_name, item_name) key, not the comma operator', () => {
    // Regression: the previous code used
    //   const triple = (body.meal_date, body.meal_name, body.item_name);
    // which is the JavaScript comma operator — it returns ONLY the
    // last value, so triple[0] / triple[1] were undefined or the first
    // character of one of the strings. The fix wraps the three values
    // in an array literal.
    expect(routeSrc).toMatch(/\[body\.meal_date\s*,\s*body\.meal_name\s*,\s*body\.item_name\s*\]/);
    expect(routeSrc).not.toMatch(/triple\s*=\s*\(body\.meal_date\s*,\s*body\.meal_name\s*,\s*body\.item_name\)/);
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

/**
 * Spec 023 / FR-001, FR-016 — historical (pre-spec 026): the user
 * chip was a standalone read-only `<span>` wired directly into the
 * DashboardClient action row, sitting between `<DemoModeChip />` and
 * the inline `<DebugToggle />`. Spec 026 / FR-022 collapsed the four
 * inline controls (UserChip + DebugToggle + ThemeToggle + SignOutButton)
 * into a single `<UserMenu />` that owns the dropdown. The chip
 * text and demo-mode placement are preserved; the standalone chip and
 * the three inline controls are gone from the header.
 *
 * Spec 026 / FR-022 / FR-023: the inline components still exist in
 * the codebase (they are reusable row-level units) but are no longer
 * rendered in the main dashboard's top-right header — they are
 * invoked through `<UserMenu />` only.
 */
describe('DashboardClient user menu (Spec 026)', () => {
  const userMenuComponentPath = join(process.cwd(), 'components/user-menu.tsx');
  const userChipComponentPath = join(process.cwd(), 'components/user-chip.tsx');
  const signInComponentPath = join(process.cwd(), 'components/auth-signin-page.tsx');

  it('imports <UserMenu /> from the spec 026 module', () => {
    expect(source).toContain("import { UserMenu }");
    expect(source).toContain("from '@/components/user-menu'");
  });

  it('renders <UserMenu userName={userName} debugOn={!!debugOn} /> in the action row', () => {
    expect(source).toMatch(/<UserMenu\s+userName=\{userName\}\s+debugOn=\{!!debugOn\}\s*\/>/);
  });

  it('does NOT render the standalone <UserChip />, <DebugToggle />, <ThemeToggle />, or <SignOutButton /> in the header (FR-022)', () => {
    expect(source).not.toMatch(/<UserChip\s/);
    expect(source).not.toMatch(/<DebugToggle\s/);
    expect(source).not.toMatch(/<ThemeToggle\s/);
    expect(source).not.toMatch(/<SignOutButton\s/);
  });

  it('keeps <DemoModeChip /> as a separate sibling of <UserMenu /> (FR-014)', () => {
    const demoIdx = source.indexOf('<DemoModeChip ');
    const userMenuIdx = source.indexOf('<UserMenu ');
    expect(demoIdx).toBeGreaterThan(-1);
    expect(userMenuIdx).toBeGreaterThan(-1);
    expect(demoIdx).toBeLessThan(userMenuIdx);
  });

  it('declares userName: string in the DashboardClient props interface', () => {
    expect(source).toMatch(/interface\s+DashboardClientProps[\s\S]*?\buserName:\s*string/);
  });

  it('destructures userName from the function args', () => {
    expect(source).toMatch(
      /export\s+function\s+DashboardClient\(\s*\{[^}]*\buserName\b[^}]*\}/
    );
  });

  it('app/page.tsx derives userName via resolveUserChipName', () => {
    expect(pageSource).toContain("import { resolveUserChipName }");
    expect(pageSource).toMatch(
      /const\s+userName\s*=\s*resolveUserChipName\(\s*session\.user\s*\)/
    );
    expect(pageSource).toContain('userName={userName}');
  });

  it('the UserChip module is a server component (no "use client" directive)', () => {
    const userChipSource = readFileSync(userChipComponentPath, 'utf8');
    // Match the literal 'use client' directive on its own line, not the
    // surrounding string in comments. The docstring of user-chip.tsx
    // contains the literal text `'use client'` while explaining that
    // the module is server-rendered, so a naive substring match would
    // false-positive.
    expect(userChipSource).not.toMatch(/^['"]use client['"];?\s*$/m);
  });

  it('the UserMenu module is a client component ("use client" directive present)', () => {
    const userMenuSource = readFileSync(userMenuComponentPath, 'utf8');
    // Same strictness as the UserChip test — match the literal
    // directive on its own line.
    expect(userMenuSource).toMatch(/^['"]use client['"];?\s*$/m);
  });

  it('the unauthenticated sign-in component does NOT render the user menu or chip', () => {
    const signInSource = readFileSync(signInComponentPath, 'utf8');
    expect(signInSource).not.toContain('UserMenu');
    expect(signInSource).not.toContain('UserChip');
    expect(signInSource).not.toContain('user-chip');
  });
});
