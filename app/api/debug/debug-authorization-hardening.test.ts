import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rawManifest = fs.readFileSync(path.join(process.cwd(), 'app/api/debug/raw-manifest/route.ts'), 'utf8');
const publicDiagnostic = fs.readFileSync(path.join(process.cwd(), 'app/api/debug/public-diagnostic/route.ts'), 'utf8');
const toggle = fs.readFileSync(path.join(process.cwd(), 'app/api/debug/toggle/route.ts'), 'utf8');

describe('debug endpoint route-level authorization', () => {
  it('protects diagnostic data routes with server-side debug authorization', () => {
    for (const source of [rawManifest, publicDiagnostic]) {
      expect(source).toContain('hasDebugAuthorization');
      expect(source).toContain("{ error: 'not_found' }, { status: 404 }");
    }
  });

  it('protects debug toggle with an authenticated session check', () => {
    expect(toggle).toContain('hasAuthenticatedSession');
    expect(toggle).toContain("{ error: 'Unauthorized' }, { status: 401 }");
  });
});
