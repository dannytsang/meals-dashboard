import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'app/api/manual-override/route.ts'), 'utf8');

describe('POST /api/manual-override bypass closure', () => {
  it('contains no subprocess, and returns only a generic denial', () => {
    expect(source).not.toContain('node:child_process');
    expect(source).toContain("{ error: 'Legacy override writer disabled' }");
    expect(source).not.toContain('detail:');
  });
});
