import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookiesGet = vi.fn();
const mockHeaders = vi.fn();
const mockGetServerSession = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => mockCookiesGet(name) }),
  headers: async () => ({ get: (name: string) => mockHeaders(name) }),
}));

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

import { GET } from './route';
import { DEBUG_COOKIE_NAME, signDebugCookie } from '@/lib/debug-cookie';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  mockCookiesGet.mockReturnValue(undefined);
  mockHeaders.mockImplementation((name: string) => {
    if (name === 'host') return 'meals.example.test';
    if (name === 'x-forwarded-proto') return 'https';
    if (name === 'x-vercel-id') return 'dpl_12345';
    if (name === 'x-vercel-env') return 'preview';
    if (name === 'x-vercel-region') return 'cdg1';
    return null;
  });
  mockGetServerSession.mockResolvedValue({ user: { name: 'Danny Park', email: 'danny@example.com' } });
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_REGION;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/debug/runtime-context', () => {
  it('returns 404 when the signed debug cookie is missing', async () => {
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns the runtime, request and user provenance when the cookie is signed on', async () => {
    mockCookiesGet.mockReturnValue({ value: signDebugCookie('1') });
    process.env.BLOB_READ_WRITE_TOKEN = 'token';
    process.env.BLOB_STORE_ID = 'store';
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cookie.state).toBe('verified_on');
    expect(body.cookie.value).toBe('1');
    expect(body.cookie.effectiveDebugMode).toBe(true);
    expect(body.runtime).toEqual(expect.objectContaining({ mode: 'live', blobConfigured: true, activeReader: 'vercel_blob' }));
    expect(body.user).toEqual({ displayName: 'Danny Park', source: 'name' });
    expect(body.request).toEqual(expect.objectContaining({
      origin: 'https://meals.example.test',
      deploymentId: 'dpl_12345',
      vercelEnv: 'preview',
      region: 'cdg1',
    }));
    expect(mockGetServerSession).toHaveBeenCalled();
    expect(mockCookiesGet).toHaveBeenCalledWith(DEBUG_COOKIE_NAME);
  });
});
