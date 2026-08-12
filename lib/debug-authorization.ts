import 'server-only';

import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { DEBUG_COOKIE_NAME, verifyDebugCookie } from '@/lib/debug-cookie';

/**
 * Debug data is protected by both the authenticated NextAuth session and the
 * server-signed per-user debug cookie. Missing or invalid credentials are
 * deliberately indistinguishable from a missing route to callers.
 */
export async function hasDebugAuthorization(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (!session) return false;

  const raw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
  return verifyDebugCookie(raw)?.value === '1';
}

export async function hasAuthenticatedSession(): Promise<boolean> {
  return Boolean(await getServerSession(authOptions));
}
