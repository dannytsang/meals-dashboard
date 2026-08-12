import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'app/actions/manual-override-action.ts'), 'utf8');

describe('submitManualOverrideAction hardening', () => {
  it('does not derive the override URL from request Host or X-Forwarded-Proto headers', () => {
    expect(source).not.toContain("from 'next/headers'");
    expect(source).not.toContain('headers()');
    expect(source).not.toContain("hdrs.get('host')");
    expect(source).not.toContain("hdrs.get('x-forwarded-proto')");
    expect(source).toContain('configuredAppOrigin()');
    expect(source).toContain('MEALS_DASHBOARD_APP_ORIGIN');
    expect(source).toContain('NEXTAUTH_URL');
  });

  it('returns generic external errors instead of raw exception or route response detail', () => {
    expect(source).toContain("error: 'Failed to apply manual override'");
    expect(source).not.toContain('Failed to call /api/overrides: ${message}');
    expect(source).not.toContain('Override route returned ${response.status}: ${detail}');
    expect(source).not.toContain('parsed.detail || parsed.error');
  });
});
