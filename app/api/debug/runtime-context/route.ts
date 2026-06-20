import 'server-only';

import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { DEBUG_COOKIE_NAME, verifyDebugCookie } from '@/lib/debug-cookie';
import { buildRuntimeContextDebugPayload } from '@/lib/debug-observability';
import { runtimeModeStatus } from '@/lib/runtime-mode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieRaw = (await cookies()).get(DEBUG_COOKIE_NAME)?.value;
  const cookieVerification = verifyDebugCookie(cookieRaw);
  if (cookieVerification?.value !== '1') {
    return NOT_FOUND;
  }

  const session = await getServerSession(authOptions);
  const now = new Date();

  let deploymentId: string | null = process.env.VERCEL_DEPLOYMENT_ID ?? null;
  let vercelEnv: string | null = process.env.VERCEL_ENV ?? null;
  let region: string | null = process.env.VERCEL_REGION ?? null;
  try {
    const h = await headers();
    deploymentId = h.get('x-vercel-id') ?? deploymentId;
    vercelEnv = h.get('x-vercel-env') ?? vercelEnv;
    region = h.get('x-vercel-region') ?? region;
  } catch {
    // Outside request scope during tests/builds: fall back to env vars.
  }

  const requestUrl = new URL(request.url);
  const mode = runtimeModeStatus();
  const runtimePayload = buildRuntimeContextDebugPayload({
    now: now.toISOString(),
    cookieRaw,
    blobConfigured: mode.blobConfigured,
    sessionUser: session?.user ?? null,
    path: requestUrl.pathname,
    origin: requestUrl.origin,
    deploymentId,
    vercelEnv,
    region,
  });

  return NextResponse.json(runtimePayload);
}
