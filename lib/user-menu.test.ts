/**
 * lib/user-menu.test.ts
 *
 * Vitest unit tests for the pure helpers extracted per spec 026 / FR-016.
 * Each helper is tested in isolation — no React, no jsdom side effects
 * beyond the explicit `storage` / `doc` / `fetchImpl` stubs the helpers
 * accept for testability.
 */

import { describe, expect, it, vi } from 'vitest';
import { toggleDebug, toggleTheme, signOut } from './user-menu';

describe('toggleDebug', () => {
  it('POSTs { value: "0" } to /api/debug/toggle when currentEnabled is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await toggleDebug(true, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, newEnabled: false });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/debug/toggle',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ value: '0' }),
      })
    );
  });

  it('POSTs { value: "1" } when currentEnabled is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await toggleDebug(false, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, newEnabled: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/debug/toggle',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ value: '1' }),
      })
    );
  });

  it('resolves with ok: false and the original state on non-2xx HTTP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await toggleDebug(true, fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.newEnabled).toBe(true);
    expect(result.error).toContain('500');
  });

  it('resolves with ok: false on network error (fetch rejects)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'));
    const result = await toggleDebug(false, fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.newEnabled).toBe(false);
    expect(result.error).toBe('Network down');
  });

  it('uses application/json content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await toggleDebug(true, fetchMock as unknown as typeof fetch);
    const callArgs = fetchMock.mock.calls[0][1] as RequestInit;
    expect((callArgs.headers as Record<string, string>)['content-type']).toBe('application/json');
  });
});

describe('toggleTheme', () => {
  function makeStorageStub(): Storage {
    const data: Record<string, string> = {};
    return {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
      clear: () => {
        for (const k of Object.keys(data)) delete data[k];
      },
      key: (i: number) => Object.keys(data)[i] ?? null,
      get length() {
        return Object.keys(data).length;
      },
    } as Storage;
  }

  function makeDocStub() {
    const attrs: Record<string, string> = {};
    return {
      documentElement: {
        setAttribute: (k: string, v: string) => {
          attrs[k] = v;
        },
        getAttribute: (k: string) => attrs[k] ?? null,
      },
      get attrs() {
        return attrs;
      },
    } as unknown as Document;
  }

  it('flips dark → light and persists to the meals-dashboard-theme localStorage key', () => {
    const storage = makeStorageStub();
    const doc = makeDocStub();
    const next = toggleTheme('dark', storage, doc);
    expect(next).toBe('light');
    expect(storage.getItem('meals-dashboard-theme')).toBe('light');
  });

  it('flips light → dark and sets the data-theme attribute on <html>', () => {
    const storage = makeStorageStub();
    const doc = makeDocStub();
    const next = toggleTheme('light', storage, doc);
    expect(next).toBe('dark');
    expect(storage.getItem('meals-dashboard-theme')).toBe('dark');
    expect((doc as unknown as { attrs: Record<string, string> }).attrs['data-theme']).toBe('dark');
  });

  it('tolerates a null storage (SSR safety) and still returns the new theme', () => {
    const doc = makeDocStub();
    const next = toggleTheme('dark', null, doc);
    expect(next).toBe('light');
  });

  it('tolerates a null document and still returns the new theme', () => {
    const storage = makeStorageStub();
    const next = toggleTheme('light', storage, null);
    expect(next).toBe('dark');
    expect(storage.getItem('meals-dashboard-theme')).toBe('dark');
  });

  it('uses the localStorage key the inline <ThemeToggle /> writes today (parity with FR-006)', () => {
    // Spec 026 FR-006 said `'meals-theme'`; the actual key in
    // lib/theme.tsx is `'meals-dashboard-theme'`. The menu row must
    // mirror the live key so its write is read by <ThemeProvider /> on
    // the next mount. Pinning the key here prevents accidental
    // divergence.
    const storage = makeStorageStub();
    toggleTheme('dark', storage, null);
    expect(storage.getItem('meals-dashboard-theme')).toBe('light');
    expect(storage.getItem('meals-theme')).toBeNull();
  });
});

describe('signOut', () => {
  it('calls next-auth/react signOut with the canonical callbackUrl', () => {
    const signOutMock = vi.fn();
    signOut(signOutMock);
    expect(signOutMock).toHaveBeenCalledWith({
      callbackUrl: '/auth/signin?callbackUrl=/',
    });
  });

  it('returns void (not a promise) so callers do not need to await', () => {
    const signOutMock = vi.fn();
    const result = signOut(signOutMock);
    expect(result).toBeUndefined();
  });
});
