import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const signOutComponentPath = join(process.cwd(), 'components/sign-out-button.tsx');
const dashboardClientPath = join(process.cwd(), 'components/dashboard-client.tsx');
const signInComponentPath = join(process.cwd(), 'components/auth-signin-page.tsx');

describe('dashboard sign-out button (User Story 4)', () => {
  it('defines a SignOutButton component that calls signOut and routes to /auth/signin', () => {
    const source = readFileSync(signOutComponentPath, 'utf8');
    // Spec 026 / FR-016: the inline <SignOutButton /> now delegates
    // sign-out to the `signOut()` pure helper in lib/user-menu.ts
    // (so the same callback is used by the <UserMenu />'s Sign out
    // row). The helper is the source of truth for the callbackUrl;
    // the component file just wires next-auth/react to the helper.
    expect(source).toContain('export function SignOutButton');
    expect(source).toContain("from 'next-auth/react'");
    expect(source).toContain("from '@/lib/user-menu'");
    expect(source).toContain('signOutHelper(nextAuthSignOut)');

    const helperSource = readFileSync(
      join(process.cwd(), 'lib/user-menu.ts'),
      'utf8'
    );
    expect(helperSource).toContain(
      "callbackUrl: '/auth/signin?callbackUrl=/'"
    );
  });

  it('is rendered inside the authenticated dashboard header alongside the theme toggle', () => {
    const source = readFileSync(dashboardClientPath, 'utf8');

    // Spec 026 / FR-022 / FR-023: the inline <SignOutButton /> is no
    // longer rendered in the header; it's invoked through <UserMenu />.
    // The SignOutButton component still exists for /debug and any
    // other surface that may want to render it standalone, but the
    // header does not render it directly. Theme toggling still works
    // because the <UserMenu />'s Theme row uses the same pure
    // `toggleTheme()` helper that the <ThemeProvider /> exposes.
    expect(source).toContain("import { UserMenu }");
    expect(source).toContain('<UserMenu userName={userName}');
    expect(source).toContain('debugOn={!!debugOn}');
    expect(source).not.toContain('<SignOutButton />');
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
