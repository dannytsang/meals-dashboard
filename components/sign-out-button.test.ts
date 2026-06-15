import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const signOutComponentPath = join(process.cwd(), 'components/sign-out-button.tsx');
const dashboardClientPath = join(process.cwd(), 'components/dashboard-client.tsx');
const signInComponentPath = join(process.cwd(), 'components/auth-signin-page.tsx');

describe('dashboard sign-out button (User Story 4)', () => {
  it('defines a SignOutButton component that calls signOut and routes to /auth/signin', () => {
    const source = readFileSync(signOutComponentPath, 'utf8');

    expect(source).toContain('export function SignOutButton');
    expect(source).toContain("from 'next-auth/react'");
    expect(source).toContain('signOut(');
    expect(source).toContain("callbackUrl: '/auth/signin?callbackUrl=/'");
  });

  it('is rendered inside the authenticated dashboard header alongside the theme toggle', () => {
    const source = readFileSync(dashboardClientPath, 'utf8');

    expect(source).toContain("import { SignOutButton }");
    expect(source).toContain('<SignOutButton />');
    expect(source).toContain('<ThemeToggle />');
  });

  it('is not rendered by the unauthenticated sign-in component', () => {
    const source = readFileSync(signInComponentPath, 'utf8');

    expect(source).not.toContain('<SignOutButton');
    expect(source).not.toContain('SignOutButton');
    expect(source).not.toContain('signOut(');
  });

  it('uses accessible labelling, dashboard theme tokens, and exposes no secrets or private data', () => {
    const source = readFileSync(signOutComponentPath, 'utf8');

    expect(source).toContain('aria-label="Sign out of the meals dashboard"');
    expect(source).toContain('data-testid="sign-out-button"');
    expect(source).toContain('var(--bg-tertiary)');
    expect(source).toContain('var(--text-secondary)');
    expect(source).toContain('var(--border-color)');

    expect(source).not.toContain('@/lib/real-data');
    expect(source).not.toContain('AUTHENTIK_CLIENT_SECRET');
    expect(source).not.toContain('NEXTAUTH_SECRET');
    expect(source).not.toContain('AUTHENTIK_ISSUER');
    expect(source).not.toContain('session.token');
    expect(source).not.toContain('access_token');
  });
});
