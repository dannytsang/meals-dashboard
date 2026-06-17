/**
 * lib/user-chip.ts
 *
 * Spec 023 — Dashboard Logged-In User Chip.
 *
 * Pure helpers for resolving the signed-in user's display name for the
 * header chip. Server-only data; no React, no hooks, no `fetch`.
 *
 * FR-002: derivation order is name > email > USER_NAME_FALLBACK.
 * FR-010: trim whitespace, treat null/undefined/whitespace-only as empty.
 * FR-006: the chip's content is ONLY the name/email (never any other
 *         session claim like `sub`, `image`, `accessToken`).
 */

// The fallback used when the session has no name and no email.
// Spec 023 / FR-002: the literal string is part of the public contract.
export const USER_NAME_FALLBACK = 'authorised traveller' as const;

// Subset of NextAuth's `Session.user` that we actually use. The OIDC
// callback returns more fields (`sub`, `image`, etc.) but the chip
// must only read name/email (FR-006).
export interface SessionUser {
  name?: string | null;
  email?: string | null;
}

/**
 * Resolve the display name for the user chip.
 *
 * Pure: same input → same output. Safe to call from a server component
 * on every request (no caching needed; this is sub-microsecond work).
 *
 * @param user     The session.user object (or null/undefined if missing).
 * @param fallback Optional override of the default fallback string.
 *                 Defaults to `USER_NAME_FALLBACK` ('authorised traveller').
 * @returns The trimmed name, or trimmed email, or trimmed fallback.
 *          Never returns an empty string — the fallback is guaranteed.
 */
export function resolveUserChipName(
  user: SessionUser | null | undefined,
  fallback: string = USER_NAME_FALLBACK,
): string {
  if (user == null) {
    return fallback.trim();
  }
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (name.length > 0) return name;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email.length > 0) return email;
  return fallback.trim();
}