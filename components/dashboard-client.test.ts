import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'components/dashboard-client.tsx'), 'utf8');

describe('DashboardClient meal card/detail contract', () => {
  it('keeps targeted missing explanations out of compact Week Meals cards and in the detail overlay', () => {
    const compactCardStart = source.indexOf('{dayMeals.map((meal, idx) => {');
    const compactCardEnd = source.indexOf('{selectedMealData && (');
    const compactCardSource = source.slice(compactCardStart, compactCardEnd);
    const detailOverlaySource = source.slice(compactCardEnd);

    expect(compactCardSource).not.toContain('Missing for 100%');
    expect(detailOverlaySource).toContain('Missing for 100%');
  });

  it('prefixes visible Week Meals labels with the label emoji', () => {
    expect(source).toContain('>🏷️ {meal.meal.labels.join');
  });
});
