import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'app/api/manual-override/route.ts'), 'utf8');

describe('POST /api/manual-override error hardening', () => {
  it('does not return raw subprocess stdout/stderr or exception detail to clients', () => {
    expect(source).toContain("{ error: 'Failed to apply override' }");
    expect(source).toContain("{ error: 'Failed to invoke override script' }");
    expect(source).not.toContain('detail: result.stderr || result.stdout');
    expect(source).not.toContain('detail: message');
    expect(source).not.toContain("Python script failed:', result.stderr");
  });
});
