/**
 * lib/user-menu.ts
 *
 * Spec 026 — Dashboard User Menu (FR-016). Pure helpers shared by the
 * inline header surfaces (DebugToggle, ThemeToggle, SignOutButton) and
 * the new <UserMenu /> dropdown rows. Centralising the logic means the
 * menu rows and the inline surfaces call the same code — behaviour
 * parity is the FR-016 contract, not a nice-to-have.
 *
 * The helpers are intentionally framework-agnostic at the call site
 * (each takes a `fetch`-like function or reads from `window.localStorage`
 * when needed) so they can be unit-tested in isolation via Vitest. The
 * React components wrap these helpers in their own state/UI.
 */

/**
 * toggleDebug — POST to /api/debug/toggle with the flipped value.
 * Spec 022 / FR-005/008/013 contract. The server sets the HMAC-signed
 * `meals_debug_mode` cookie and returns 200 with the new effective
 * state.
 *
 * @param currentEnabled The current state, used to compute the flip.
 * @param fetchImpl  Optional fetch implementation (defaults to global
 *   fetch); pass a stub in tests.
 * @returns `{ ok, newEnabled, error? }`. `ok: false` on non-2xx or
 *   network failure; `error` is a short string suitable for inline
 *   error rendering next to the row label.
 */
export async function toggleDebug(
  currentEnabled: boolean,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; newEnabled: boolean; error?: string }> {
  const next = !currentEnabled;
  try {
    const res = await fetchImpl('/api/debug/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: next ? '1' : '0' }),
    });
    if (!res.ok) {
      return { ok: false, newEnabled: currentEnabled, error: `Toggle failed (HTTP ${res.status})` };
    }
    return { ok: true, newEnabled: next };
  } catch (e) {
    return {
      ok: false,
      newEnabled: currentEnabled,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * toggleTheme — flip the dashboard theme, persist to localStorage, and
 * sync the `<html data-theme>` attribute.
 *
 * The localStorage key is the actual key the inline <ThemeToggle />
 * uses today (`'meals-dashboard-theme'`, see lib/theme.tsx). Spec 026
 * FR-006 cited `'meals-theme'` but that was a paraphrase; the real
 * key lives in the existing <ThemeProvider /> and we must mirror it
 * so the menu row's write is read by the provider on the next mount.
 *
 * @param currentTheme  Either `'light'` or `'dark'`.
 * @param storage  Optional storage (defaults to global `localStorage`).
 * @param doc  Optional document (defaults to `globalThis.document`).
 * @returns The new theme.
 */
export type Theme = 'dark' | 'light';

export function toggleTheme(
  currentTheme: Theme,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  doc: Document | null = typeof document !== 'undefined' ? document : null
): Theme {
  const next: Theme = currentTheme === 'dark' ? 'light' : 'dark';
  if (storage) {
    storage.setItem('meals-dashboard-theme', next);
  }
  if (doc && doc.documentElement) {
    doc.documentElement.setAttribute('data-theme', next);
  }
  return next;
}

/**
 * signOut — end the NextAuth session and redirect to the sign-in page.
 * Spec 015 / spec 026 FR-007 contract. Mirrors the inline
 * <SignOutButton />'s `signOut({ callbackUrl: '/auth/signin?callbackUrl=/' })`
 * call exactly.
 *
 * The function delegates to `next-auth/react` at the call site; this
 * module is a thin wrapper to keep the menu row and the inline
 * <SignOutButton /> pointed at the same target. The dynamic import
 * shape keeps `next-auth/react` out of any module that just wants the
 * type — the actual `signOut` call happens inside the React component
 * layer.
 *
 * @param nextAuthSignOut  The `signOut` function from `next-auth/react`.
 *   Pass it explicitly so this helper is testable without pulling in
 *   `next-auth/react` in vitest's jsdom environment.
 */
export function signOut(
  nextAuthSignOut: (options?: { callbackUrl?: string }) => void | Promise<void>
): void {
  nextAuthSignOut({ callbackUrl: '/auth/signin?callbackUrl=/' });
}
