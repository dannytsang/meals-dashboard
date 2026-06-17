/**
 * lib/debug-cookie.ts
 *
 * Per-user signed cookie that gates the dashboard's debug surface.
 * The cookie value is a single byte (`0` or `1`) followed by a
 * HMAC-SHA-256 signature keyed on `NEXTAUTH_SECRET`, so a user
 * cannot bypass the gate by setting the cookie in devtools
 * without the server's signature.
 *
 * Spec 022 / FR-012, NFR-006. The single source of truth for
 * "is the per-user debug cookie set?" across the dashboard.
 * The single source of truth for signing/verifying the cookie.
 *
 * Cookie format: `<value>.<base64url-hmac-sha256>` where the
 * HMAC is over `<value>` only (not including the dot).
 *
 * Example: `1.kZ7...` (value=1, signature=base64url HMAC of `1`).
 *
 * This module is `server-only` — it reads `NEXTAUTH_SECRET`
 * and uses Node `crypto`. It is never bundled into client code.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEBUG_COOKIE_NAME = 'meals_debug_mode';
export const DEBUG_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type DebugCookieValue = '0' | '1';

/**
 * The decoded payload of the signed cookie.
 * `null` means the cookie is unset, malformed, tampered with, or
 * has an invalid signature. Callers should treat `null` as "off".
 */
export type VerifiedDebugCookie = { value: DebugCookieValue } | null;

/**
 * Build the signing key. `NEXTAUTH_SECRET` is required by spec
 * 015 (OIDC authentication) and is always present in any
 * deployment that can serve the dashboard. In tests where the
 * env is not set, we fall back to a deterministic string so the
 * helper does not throw on a missing secret — this keeps the
 * helper pure and testable in isolation.
 */
function getSigningKey(): string {
  return process.env.NEXTAUTH_SECRET || 'test-only-debug-cookie-signing-key';
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(s: string): Buffer | null {
  // Re-pad: base64url may have stripped padding
  const padded = s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

function sign(value: DebugCookieValue): string {
  const hmac = createHmac('sha256', getSigningKey());
  hmac.update(value, 'utf8');
  return base64UrlEncode(hmac.digest());
}

/**
 * Build a signed cookie payload. The result is what gets written
 * to the `meals_debug_mode` cookie. Format: `<value>.<sig>`.
 */
export function signDebugCookie(value: DebugCookieValue): string {
  return `${value}.${sign(value)}`;
}

/**
 * Verify a raw cookie string (as read from the request). Returns
 * `{ value }` on success, `null` for unset, malformed, tampered,
 * or wrong-signature cookies. The function never throws — it is
 * safe to call on any input from a request header.
 */
export function verifyDebugCookie(raw: string | undefined | null): VerifiedDebugCookie {
  if (!raw || typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot < 1 || dot >= raw.length - 1) return null;

  const value = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (value !== '0' && value !== '1') return null;

  const sigBytes = base64UrlDecode(sig);
  if (!sigBytes) return null;

  const expected = createHmac('sha256', getSigningKey()).update(value, 'utf8').digest();
  if (sigBytes.length !== expected.length) return null;
  if (!timingSafeEqual(sigBytes, expected)) return null;

  return { value };
}

/**
 * `true` iff the cookie decodes to `{ value: '1' }`. Treats
 * malformed/tampered/missing as `false`. Convenience for callers
 * that just want a boolean.
 */
export function isDebugCookieOn(raw: string | undefined | null): boolean {
  return verifyDebugCookie(raw)?.value === '1';
}
