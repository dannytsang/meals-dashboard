/**
 * app/debug/page.tsx
 *
 * Spec 022 / Rev 3 / FR-002, FR-003, FR-008: the /debug server
 * component. Gated on the per-user signed cookie alone. With the
 * cookie unset/malformed, it calls notFound() to render Next.js's
 * 404. The middleware OIDC gate still runs first (unauthenticated
 * requests redirect to /auth/signin before this page renders).
 *
 * NFR-005: this route inherits the OIDC gate via the middleware
 * matcher (see middleware.ts). With the cookie unset, the route
 * is functionally non-existent.
 */
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';

import { effectiveDebugMode } from '@/lib/debug-mode';
import { DEBUG_COOKIE_NAME, verifyDebugCookie } from '@/lib/debug-cookie';
import { DebugShell } from '@/components/debug-shell';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DebugPage() {
  // Next.js 15 makes both `cookies()` and `headers()` async.
  const cookieRaw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
  if (!effectiveDebugMode(cookieRaw)) {
    notFound();
  }

  const verifiedCookie = verifyDebugCookie(cookieRaw);
  const cookieStatus = verifiedCookie ? verifiedCookie.value : 'unset';

  // Derive origin for the footer's curl example. headers() is the
  // Next.js 15+ way to read request headers in server components.
  let origin = '';
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('host') ?? h.get('x-forwarded-host') ?? '';
    origin = host ? `${proto}://${host}` : '';
  } catch {
    // headers() is not available outside a request scope (e.g. during
    // build). Leave origin empty; the curl line degrades gracefully.
  }

  return (
    <DebugShell
      cookieValue={cookieStatus}
      deploymentId={process.env.VERCEL_DEPLOYMENT_ID ?? null}
      origin={origin}
    />
  );
}
