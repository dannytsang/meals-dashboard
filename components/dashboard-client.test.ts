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
    expect(detailOverlaySource).toContain('Coverage status');
    expect(detailOverlaySource).toContain('getCoverageStatusLabel(selectedMealData.status)');
    expect(detailOverlaySource).not.toContain('selectedMealData.coverageScore}%');
    expect(source).not.toContain('Green · covered');
    expect(source).not.toContain('Amber · partial');
    expect(source).not.toContain('Red · missing');
  });

  it('does not import generated private data into the client component', () => {
    expect(source).not.toContain("@/lib/real-data");
    expect(pageSource).toContain('getServerSession(authOptions)');
    expect(pageSource).toContain('getDashboardData()');
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

  it('styles Expected Items like Matched Items with one boxed row per item and matching row width', () => {
    expect(source).toContain('Expected Items</h4>');
    expect(source).toContain('missingExplanation.map((item, idx)');
    expect(source).toContain("backgroundColor: 'var(--accent-amber-bg)'");
    expect(source).toContain("border: 'none'");
    expect(source).toContain("width: '100%'");
    expect(source).toContain("boxSizing: 'border-box'");
    expect(source).not.toContain('{missingExplanation.join(\', \')}');
  });
});
