/**
 * app/api/debug/toggle/route.test.ts
 *
 * Spec 022 / FR-008, FR-015: integration test for the toggle route.
 * The route is server-only; we mock `isDebugModeEnabled` and
 * `next/headers` `cookies()` so the test runs in isolation.
 *
 * Coverage:
 *   - 404 when env-gate is off (toggle has no effect)
 *   - 200 + sets a signed Set-Cookie when env is on and body is empty (flip)
 *   - 200 + sets a signed Set-Cookie when body specifies an explicit value
 *   - The new cookie is HMAC-signed and decodes back to the requested value
 *   - The Set-Cookie attributes (HttpOnly / SameSite / Path / MaxAge) are correct
 *   - Secure is set in production only
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocks must be declared before importing the route module.
const mockIsDebugModeEnabled = vi.fn();
const mockGet = vi.fn();

const cookieJar: Record<string, { value: string } | undefined> = {};

vi.mock('@/lib/debug-mode', () => ({
  isDebugModeEnabled: () => mockIsDebugModeEnabled(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => mockGet(name),
  }),
}));

import { POST } from './route';
import {
  DEBUG_COOKIE_NAME,
  DEBUG_COOKIE_MAX_AGE_SECONDS,
  signDebugCookie,
  verifyDebugCookie,
} from '@/lib/debug-cookie';

const ORIGINAL_ENV = { ...process.env };

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/debug/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Read the value of the `Set-Cookie` header for `meals_debug_mode` from
 * the response. Returns `null` if no such header is present. The header
 * shape is `name=value; Path=/; HttpOnly; Max-Age=...; SameSite=Lax`
 * per the Next.js response cookies API.
 */
function getSetCookie(res: Response): { value: string; attrs: Record<string, string> } | null {
  // Headers#getSetCookie is the modern, multi-value accessor.
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? [res.headers.get('set-cookie')].filter(Boolean) as string[];
  for (const raw of all) {
    if (raw.startsWith(`${DEBUG_COOKIE_NAME}=`)) {
      const [pair, ...rest] = raw.split(';').map((s) => s.trim());
      const value = pair.split('=').slice(1).join('=');
      const attrs: Record<string, string> = {};
      for (const r of rest) {
        const [k, v] = r.split('=');
        attrs[k.toLowerCase()] = v ?? '';
      }
      return { value, attrs };
    }
  }
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
  mockGet.mockImplementation((name: string) => cookieJar[name]);
  delete process.env.MEALS_DEBUG_MODE;
  delete (process.env as Record<string, string | undefined>).NODE_ENV;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('POST /api/debug/toggle — gating', () => {
  it('returns 404 when env-gate is off', async () => {
    mockIsDebugModeEnabled.mockReturnValue(false);
    const res = await POST(makeRequest({ value: '1' }) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('debug-mode-disabled-in-deployment');
  });

  it('does not set a Set-Cookie when env-gate is off', async () => {
    mockIsDebugModeEnabled.mockReturnValue(false);
    const res = await POST(makeRequest({ value: '1' }) as unknown as import('next/server').NextRequest);
    expect(getSetCookie(res)).toBeNull();
  });
});

describe('POST /api/debug/toggle — happy path (env on)', () => {
  beforeEach(() => {
    mockIsDebugModeEnabled.mockReturnValue(true);
  });

  it('flips from unset to "1" with no body', async () => {
    const res = await POST(makeRequest(undefined) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: true, value: '1' });

    const sc = getSetCookie(res);
    expect(sc).not.toBeNull();
    expect(verifyDebugCookie(sc!.value)).toEqual({ value: '1' });
    expect(sc!.attrs.path).toBe('/');
    // HttpOnly is set as a flag with no value.
    expect('httponly' in sc!.attrs).toBe(true);
    expect(sc!.attrs.samesite?.toLowerCase()).toBe('lax');
    expect(sc!.attrs['max-age']).toBe(String(DEBUG_COOKIE_MAX_AGE_SECONDS));
    // Secure: not present in dev (NODE_ENV unset)
    expect('secure' in sc!.attrs).toBe(false);
  });

  it('sets Secure in production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const res = await POST(makeRequest(undefined) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const sc = getSetCookie(res);
    expect(sc).not.toBeNull();
    expect('secure' in sc!.attrs).toBe(true);
  });

  it('flips from "1" to "0" with no body when cookie is already on', async () => {
    cookieJar[DEBUG_COOKIE_NAME] = { value: signDebugCookie('1') };
    const res = await POST(makeRequest(undefined) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false, value: '0' });
    const sc = getSetCookie(res);
    expect(verifyDebugCookie(sc!.value)).toEqual({ value: '0' });
  });

  it('flips from "0" to "1" with no body when cookie is off', async () => {
    cookieJar[DEBUG_COOKIE_NAME] = { value: signDebugCookie('0') };
    const res = await POST(makeRequest(undefined) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: true, value: '1' });
  });

  it('honours explicit { value: "1" }', async () => {
    const res = await POST(makeRequest({ value: '1' }) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: true, value: '1' });
    const sc = getSetCookie(res);
    expect(verifyDebugCookie(sc!.value)).toEqual({ value: '1' });
  });

  it('honours explicit { value: "0" }', async () => {
    const res = await POST(makeRequest({ value: '0' }) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false, value: '0' });
    const sc = getSetCookie(res);
    expect(verifyDebugCookie(sc!.value)).toEqual({ value: '0' });
  });

  it('rejects invalid body values and falls back to flip', async () => {
    cookieJar[DEBUG_COOKIE_NAME] = { value: signDebugCookie('0') };
    const res = await POST(makeRequest({ value: 'maybe' }) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: true, value: '1' });
  });

  it('treats unparseable JSON as a flip', async () => {
    cookieJar[DEBUG_COOKIE_NAME] = { value: signDebugCookie('1') };
    const req = new Request('http://localhost/api/debug/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json{',
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false, value: '0' });
  });

  it('treats a tampered cookie as unset (so flip goes to "1")', async () => {
    cookieJar[DEBUG_COOKIE_NAME] = { value: '1.bogus' };
    const res = await POST(makeRequest(undefined) as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: true, value: '1' });
  });
});
