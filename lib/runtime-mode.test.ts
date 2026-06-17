import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  BLOB_TOKEN_ENV,
  BLOB_STORE_ID_ENV,
  isBlobStorageConfigured,
  isDemoMode,
  runtimeModeStatus,
} from './runtime-mode';

describe('runtime-mode helper', () => {
  // Snapshot env state around each test so we don't leak across tests.
  let savedToken: string | undefined;
  let savedStoreId: string | undefined;
  let savedVercelEnv: string | undefined;

  beforeEach(() => {
    savedToken = process.env[BLOB_TOKEN_ENV];
    savedStoreId = process.env[BLOB_STORE_ID_ENV];
    savedVercelEnv = process.env.VERCEL_ENV;
    delete process.env[BLOB_TOKEN_ENV];
    delete process.env[BLOB_STORE_ID_ENV];
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env[BLOB_TOKEN_ENV];
    else process.env[BLOB_TOKEN_ENV] = savedToken;
    if (savedStoreId === undefined) delete process.env[BLOB_STORE_ID_ENV];
    else process.env[BLOB_STORE_ID_ENV] = savedStoreId;
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedVercelEnv;
    vi.restoreAllMocks();
  });

  describe('BLOB_TOKEN_ENV / BLOB_STORE_ID_ENV constants', () => {
    it('exposes the canonical env var names', () => {
      expect(BLOB_TOKEN_ENV).toBe('BLOB_READ_WRITE_TOKEN');
      expect(BLOB_STORE_ID_ENV).toBe('BLOB_STORE_ID');
    });
  });

  describe('isBlobStorageConfigured', () => {
    it('returns false when neither env var is set', () => {
      expect(isBlobStorageConfigured()).toBe(false);
    });

    it('returns false when only BLOB_READ_WRITE_TOKEN is set (fails closed per FR-023)', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      expect(isBlobStorageConfigured()).toBe(false);
    });

    it('returns false when only BLOB_STORE_ID is set (fails closed per FR-023)', () => {
      process.env[BLOB_STORE_ID_ENV] = 'store_demo_id';
      expect(isBlobStorageConfigured()).toBe(false);
    });

    it('returns true when both env vars are set', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      process.env[BLOB_STORE_ID_ENV] = 'store_demo_id';
      expect(isBlobStorageConfigured()).toBe(true);
    });

    it('treats empty string as unset (both)', () => {
      process.env[BLOB_TOKEN_ENV] = '';
      process.env[BLOB_STORE_ID_ENV] = '';
      expect(isBlobStorageConfigured()).toBe(false);
    });

    it('treats empty string as unset (token empty, store set)', () => {
      process.env[BLOB_TOKEN_ENV] = '';
      process.env[BLOB_STORE_ID_ENV] = 'store_demo_id';
      expect(isBlobStorageConfigured()).toBe(false);
    });

    it('treats empty string as unset (store empty, token set)', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      process.env[BLOB_STORE_ID_ENV] = '';
      expect(isBlobStorageConfigured()).toBe(false);
    });

    it('treats whitespace-only as unset', () => {
      process.env[BLOB_TOKEN_ENV] = '   ';
      process.env[BLOB_STORE_ID_ENV] = '   ';
      expect(isBlobStorageConfigured()).toBe(false);
    });
  });

  describe('isDemoMode', () => {
    it('returns true when no credentials are set', () => {
      expect(isDemoMode()).toBe(true);
    });

    it('returns true when only one credential is set (fails closed)', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      expect(isDemoMode()).toBe(true);
    });

    it('returns false when both credentials are set', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      process.env[BLOB_STORE_ID_ENV] = 'store_demo_id';
      expect(isDemoMode()).toBe(false);
    });

    it('is exactly the inverse of isBlobStorageConfigured', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      process.env[BLOB_STORE_ID_ENV] = 'store_demo_id';
      expect(isDemoMode()).toBe(!isBlobStorageConfigured());

      delete process.env[BLOB_TOKEN_ENV];
      expect(isDemoMode()).toBe(!isBlobStorageConfigured());
    });
  });

  describe('runtimeModeStatus', () => {
    it('returns the observability shape', () => {
      const status = runtimeModeStatus();
      expect(status).toEqual({ demoMode: true, blobConfigured: false });
      expect(Object.keys(status).sort()).toEqual(['blobConfigured', 'demoMode']);
    });

    it('reflects credential state', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      process.env[BLOB_STORE_ID_ENV] = 'store_demo_id';
      expect(runtimeModeStatus()).toEqual({ demoMode: false, blobConfigured: true });
    });

    it('reports demo mode when only one credential is set', () => {
      process.env[BLOB_TOKEN_ENV] = 'vercel_blob_rw_token_value';
      expect(runtimeModeStatus()).toEqual({ demoMode: true, blobConfigured: false });
    });
  });

  describe('production-misconfiguration warning (NFR-005)', () => {
    // The warning is emitted at module-init time (once per process).
    // We test it by spying on console.warn while importing the module
    // dynamically with `vi.resetModules()` so the init runs fresh
    // for each scenario. TypeScript's module resolver cannot handle
    // the query-string trick, so we use a runtime variable + the
    // `import` expression with `@vite-ignore` to bypass type
    // resolution; vitest still treats the dynamic import as a fresh
    // module instance because of `vi.resetModules()`.
    async function loadModuleFresh(): Promise<void> {
      vi.resetModules();
      const modulePath = './runtime-mode' + '?nonce=' + Date.now();
      // @ts-ignore -- vitest-specific dynamic import with query string
      await import(/* @vite-ignore */ modulePath);
    }

    it('logs a warning when VERCEL_ENV=production and demo mode is active', async () => {
      process.env[BLOB_TOKEN_ENV] = '';
      process.env[BLOB_STORE_ID_ENV] = '';
      process.env.VERCEL_ENV = 'production';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await loadModuleFresh();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEMO MODE active in production'));
    });

    it('does NOT log a warning when demo mode is active in non-production environment', async () => {
      process.env[BLOB_TOKEN_ENV] = '';
      process.env[BLOB_STORE_ID_ENV] = '';
      process.env.VERCEL_ENV = 'preview';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await loadModuleFresh();
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('DEMO MODE active in production'));
    });

    it('does NOT log a warning when both credentials are set (live mode)', async () => {
      process.env[BLOB_TOKEN_ENV] = 'tok';
      process.env[BLOB_STORE_ID_ENV] = 'store';
      process.env.VERCEL_ENV = 'production';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await loadModuleFresh();
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('DEMO MODE active in production'));
    });
  });
});