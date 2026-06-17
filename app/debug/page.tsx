/**
 * app/debug/page.tsx
 *
 * Spec 022 / FR-002, FR-003, FR-008: the /debug server component. With
 * MEALS_DEBUG_MODE off, it calls notFound() to render Next.js's 404.
 * With debug on, it renders the DebugShell client component.
 *
 * NFR-005: this route inherits the OIDC gate via the middleware
 * matcher (see middleware.ts). With debug off, the route is
 * functionally non-existent.
 */
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';

import { isDebugModeEnabled, debugModeStatus } from '@/lib/debug-mode';
import { DebugShell } from '@/components/debug-shell';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DebugPage() {
  if (!isDebugModeEnabled()) {
    notFound();
  }

  const status = debugModeStatus();

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

  return <DebugShell status={status} origin={origin} />;
}
