import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Grocy pantry badge', () => {
  const source = readFileSync(join(process.cwd(), 'components/meal-list.tsx'), 'utf8');

  it('renders the pantry badge only for Grocy-sourced matches', () => {
    expect(source).toContain("matched.source === 'grocy'");
    expect(source).toContain('🏠');
  });
});
