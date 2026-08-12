/**
 * app/api/debug/toggle/route.ts
 *
 * POST /api/debug/toggle — flip the per-user `meals_debug_mode` cookie.
 *
 * Spec 022 / Rev 3 / FR-008. The toggle is what makes the per-user
 * switch work. The cookie is the only gate; the env-var is gone.
 *
 * Contract:
 *   - Request: POST with optional JSON body `{ "value": "0" | "1" }`.
 *     If the body is missing or empty, the toggle is treated as "flip"
 *     (current value XOR 1). The body shape is deliberately boring so
 *     the route handler is small and the wire format is obvious.
 *   - Response: 200 with `{ "enabled": boolean, "value": "0" | "1" }` for authenticated users.
 *     Unauthenticated requests return 401 before touching the cookie.
 *   - Side effect: sets or clears the `meals_debug_mode` cookie using
 *     `next/headers` `cookies()`. The cookie is signed, HttpOnly, and
 *     SameSite=Lax; Secure is set in production only.
 *
 * Security: the route does not trust the request body. The new value
 * is the body's `value` if present and valid, else the current
 * cookie's value XOR 1, else '1' (toggle-on default for a fresh user).
 * The signed payload is what the server returns; the client cannot
 * influence the effective mode by setting the cookie directly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  DEBUG_COOKIE_NAME,
  DEBUG_COOKIE_MAX_AGE_SECONDS,
  signDebugCookie,
  verifyDebugCookie,
  type DebugCookieValue,
} from '@/lib/debug-cookie';
import { hasAuthenticatedSession } from '@/lib/debug-authorization';

export const dynamic = 'force-dynamic';

interface ToggleBody {
  value?: unknown;
}

function isDebugCookieValue(v: unknown): v is DebugCookieValue {
  return v === '0' || v === '1';
}

function cookieOptions() {
  // `Secure` in production only — localhost over HTTP must work in dev.
  const secure = process.env.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    maxAge: DEBUG_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await hasAuthenticatedSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Read the current cookie so we can compute the flipped default.
  // Next.js 15 makes `cookies()` async; await it.
  const jar = await cookies();
  const current = verifyDebugCookie(jar.get(DEBUG_COOKIE_NAME)?.value);
  const currentValue: DebugCookieValue = current?.value ?? '0';

  // Parse the body if any. The body is OPTIONAL — the client can
  // just POST with no body to "flip", or POST `{ "value": "1" }` to
  // explicitly turn on.
  let nextValue: DebugCookieValue | null = null;
  try {
    const body = (await request.json()) as ToggleBody;
    if (isDebugCookieValue(body?.value)) {
      nextValue = body.value;
    }
  } catch {
    // No body / unparseable body — treat as "flip".
  }

  if (nextValue === null) {
    nextValue = currentValue === '1' ? '0' : '1';
  }

  const newEffective = nextValue === '1';

  // Set the cookie via Next.js's response cookies API. We have to use
  // the response (not the request) to set a cookie that the client
  // will receive.
  const res = NextResponse.json(
    { enabled: newEffective, value: nextValue },
    { status: 200 }
  );
  res.cookies.set(DEBUG_COOKIE_NAME, signDebugCookie(nextValue), cookieOptions());
  return res;
}
