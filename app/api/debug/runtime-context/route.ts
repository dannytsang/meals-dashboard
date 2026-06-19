import 'server-only';

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { DEBUG_COOKIE_NAME, verifyDebugCookie } from '@/lib/debug-cookie';
import { buildRuntimeContextDebugPayload } from '@/lib/debug-observability';
import { runtimeModeStatus } from '@/lib/runtime-mode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function GET(): Promise<NextResponse> {
  const cookieRaw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
  const cookieVerification = verifyDebugCookie(cookieRaw);
  if (cookieVerification?.value !== '1') {
    return NOT_FOUND;
  }

  const session = await getServerSession(authOptions);

  let origin = '';
  let deploymentId: string | null = process.env.VERCEL_DEPLOYMENT_ID ?? null;
  let vercelEnv: string | null = process.env.VERCEL_ENV ?? null;
  let region: string | null = process.env.VERCEL_REGION ?? null;
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('host') ?? h.get('x-forwarded-host') ?? '';
    origin = host ? `${proto}://${host}` : '';
    deploymentId = h.get('x-vercel-id') ?? deploymentId;
    vercelEnv = h.get('x-vercel-env') ?? vercelEnv;
    region = h.get('x-vercel-region') ?? region;
  } catch {
    // Outside request scope during tests/builds: fall back to env vars.
  }

  const mode = runtimeModeStatus();
  const payload = buildRuntimeContextDebugPayload({
    now: new Date().toISOString(),
    cookieRaw,
    blobConfigured: mode.blobConfigured,
    sessionUser: session?.user ?? null,
    origin,
    deploymentId,
    vercelEnv,
    region,
  });

  return NextResponse.json(payload);
}
