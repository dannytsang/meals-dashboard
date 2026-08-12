import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const config = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8');

describe('security headers configuration', () => {
  it('sets baseline browser hardening headers for every route', () => {
    for (const expected of [
      'Content-Security-Policy',
      "frame-ancestors 'none'",
      'X-Content-Type-Options',
      'nosniff',
      'Referrer-Policy',
      'strict-origin-when-cross-origin',
      'Permissions-Policy',
      'X-Frame-Options',
      'DENY',
      "source: '/:path*'",
    ]) {
      expect(config).toContain(expected);
    }
  });
});
