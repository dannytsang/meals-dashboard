import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const signInPagePath = join(process.cwd(), 'app/auth/signin/page.tsx');
const signInComponentPath = join(process.cwd(), 'components/auth-signin-page.tsx');

describe('themed dashboard login page', () => {
  it('provides a custom sign-in page route instead of the default auth screen', () => {
    const authSource = readFileSync(join(process.cwd(), 'lib/auth.ts'), 'utf8');
    const middlewareSource = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');
    expect(existsSync(signInPagePath)).toBe(true);
    expect(readFileSync(signInPagePath, 'utf8')).toContain('AuthSignInPage');
    expect(authSource).toContain("signIn: '/auth/signin'");
    expect(middlewareSource).toContain("signIn: '/auth/signin'");
  });

  it('uses the meals dashboard theme variables for dark and light login styling without private data imports', () => {
    expect(existsSync(signInComponentPath)).toBe(true);
    const source = readFileSync(signInComponentPath, 'utf8');
    const themeSource = readFileSync(join(process.cwd(), 'lib/theme.tsx'), 'utf8');

    expect(source).toContain('useTheme()');
    expect(source).toContain('var(--bg-primary)');
    expect(source).toContain('var(--bg-secondary)');
    expect(source).toContain('var(--text-primary)');
    expect(source).toContain('var(--accent-emerald)');
    expect(themeSource).toContain('meals-dashboard-theme');
    expect(source).not.toContain('@/lib/real-data');
    expect(source).not.toContain('AUTHENTIK_CLIENT_SECRET');
    expect(source).not.toContain('NEXTAUTH_SECRET');
  });
});
