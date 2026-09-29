import 'server-only';
import { SOURCE_NAMESPACE } from '@/lib/override-source-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!commit || !/^[a-f0-9]{40}$/.test(commit)) {
    return Response.json({ error: 'identity_unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'public, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  return Response.json({ commit, namespace: SOURCE_NAMESPACE, admissionSchema: 1 }, {
    headers: { 'Cache-Control': 'public, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
  });
}
