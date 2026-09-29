import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { SOURCE_NAMESPACE } from '@/lib/override-source-store';
import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

describe('runtime identity route', () => {
  it('fails closed without one canonical deployed commit', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    expect((await GET()).status).toBe(503);
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc');
    expect((await GET()).status).toBe(503);
  });

  it('returns exact commit and fixed namespace without caching', async () => {
    const commit = 'a'.repeat(40);
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', commit);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ commit, namespace: SOURCE_NAMESPACE, admissionSchema: 1 });
  });
});
