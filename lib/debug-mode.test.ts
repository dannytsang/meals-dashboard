import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isDebugModeEnabled,
  debugModeStatus,
  effectiveDebugMode,
} from './debug-mode';
import { signDebugCookie } from './debug-cookie';

describe('debug-mode', () => {
  const originalEnv = process.env.MEALS_DEBUG_MODE;

  beforeEach(() => {
    delete process.env.MEALS_DEBUG_MODE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MEALS_DEBUG_MODE;
    } else {
      process.env.MEALS_DEBUG_MODE = originalEnv;
    }
  });

  describe('isDebugModeEnabled', () => {
    it('returns false when unset', () => {
      expect(isDebugModeEnabled()).toBe(false);
    });

    it('returns false for empty string', () => {
      process.env.MEALS_DEBUG_MODE = '';
      expect(isDebugModeEnabled()).toBe(false);
    });

    it('returns true for "1"', () => {
      process.env.MEALS_DEBUG_MODE = '1';
      expect(isDebugModeEnabled()).toBe(true);
    });

    it('returns true for "true"', () => {
      process.env.MEALS_DEBUG_MODE = 'true';
      expect(isDebugModeEnabled()).toBe(true);
    });

    it('returns true for "yes"', () => {
      process.env.MEALS_DEBUG_MODE = 'yes';
      expect(isDebugModeEnabled()).toBe(true);
    });

    it('returns true for "YES" (case-insensitive)', () => {
      process.env.MEALS_DEBUG_MODE = 'YES';
      expect(isDebugModeEnabled()).toBe(true);
    });

    it('returns true for "True" (case-insensitive)', () => {
      process.env.MEALS_DEBUG_MODE = 'True';
      expect(isDebugModeEnabled()).toBe(true);
    });

    it('returns false for "0"', () => {
      process.env.MEALS_DEBUG_MODE = '0';
      expect(isDebugModeEnabled()).toBe(false);
    });

    it('returns false for "false"', () => {
      process.env.MEALS_DEBUG_MODE = 'false';
      expect(isDebugModeEnabled()).toBe(false);
    });

    it('returns false for "no"', () => {
      process.env.MEALS_DEBUG_MODE = 'no';
      expect(isDebugModeEnabled()).toBe(false);
    });

    it('returns false and warns on unknown values', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        process.env.MEALS_DEBUG_MODE = 'maybe';
        expect(isDebugModeEnabled()).toBe(false);
        expect(warn).toHaveBeenCalled();
        const message = warn.mock.calls[0][0] as string;
        expect(message).toContain('MEALS_DEBUG_MODE');
        expect(message).toContain('maybe');
      } finally {
        warn.mockRestore();
      }
    });

    it('warns at most once per distinct unknown value', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        process.env.MEALS_DEBUG_MODE = 'perhaps';
        isDebugModeEnabled();
        isDebugModeEnabled();
        isDebugModeEnabled();
        const maybeCalls = warn.mock.calls.filter(
          (c) => typeof c[0] === 'string' && (c[0] as string).includes('perhaps')
        );
        expect(maybeCalls.length).toBe(1);
      } finally {
        warn.mockRestore();
      }
    });

    it('warns separately for different unknown values', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        process.env.MEALS_DEBUG_MODE = 'foo';
        isDebugModeEnabled();
        process.env.MEALS_DEBUG_MODE = 'bar';
        isDebugModeEnabled();
        const fooCalls = warn.mock.calls.filter(
          (c) => typeof c[0] === 'string' && (c[0] as string).includes('"foo"')
        );
        const barCalls = warn.mock.calls.filter(
          (c) => typeof c[0] === 'string' && (c[0] as string).includes('"bar"')
        );
        expect(fooCalls.length).toBe(1);
        expect(barCalls.length).toBe(1);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('debugModeStatus', () => {
    it('returns the deployment status shape', () => {
      delete process.env.VERCEL_DEPLOYMENT_ID;
      const status = debugModeStatus();
      expect(status).toEqual({
        enabled: false,
        raw: '',
        deploymentId: null,
      });
    });

    it('surfaces VERCEL_DEPLOYMENT_ID when set', () => {
      process.env.VERCEL_DEPLOYMENT_ID = 'dpl-abc123';
      const status = debugModeStatus();
      expect(status.deploymentId).toBe('dpl-abc123');
    });

    it('surfaces the raw env value', () => {
      process.env.MEALS_DEBUG_MODE = '1';
      const status = debugModeStatus();
      expect(status.raw).toBe('1');
      expect(status.enabled).toBe(true);
    });
  });

  describe('effectiveDebugMode', () => {
    it('is false when env is off regardless of cookie', () => {
      // env unset, cookie signed "1"
      expect(effectiveDebugMode(signDebugCookie('1'))).toBe(false);
    });

    it('is false when env is on but cookie is unset', () => {
      process.env.MEALS_DEBUG_MODE = '1';
      expect(effectiveDebugMode(undefined)).toBe(false);
      expect(effectiveDebugMode(null)).toBe(false);
      expect(effectiveDebugMode('')).toBe(false);
    });

    it('is false when env is on but cookie is signed "0"', () => {
      process.env.MEALS_DEBUG_MODE = '1';
      expect(effectiveDebugMode(signDebugCookie('0'))).toBe(false);
    });

    it('is true when env is on AND cookie is signed "1"', () => {
      process.env.MEALS_DEBUG_MODE = '1';
      expect(effectiveDebugMode(signDebugCookie('1'))).toBe(true);
    });

    it('is false when env is on but cookie is tampered', () => {
      process.env.MEALS_DEBUG_MODE = '1';
      const signed0 = signDebugCookie('0');
      const sig0 = signed0.split('.')[1];
      expect(effectiveDebugMode(`1.${sig0}`)).toBe(false);
    });

    it('is false when env is on but cookie is malformed', () => {
      process.env.MEALS_DEBUG_MODE = '1';
      expect(effectiveDebugMode('garbage')).toBe(false);
      expect(effectiveDebugMode('1')).toBe(false);
      expect(effectiveDebugMode('1.abc')).toBe(false);
    });

    it('env dominates: signed "1" cookie cannot enable debug when env is off', () => {
      // Already covered by the first case but worth restating.
      delete process.env.MEALS_DEBUG_MODE;
      expect(effectiveDebugMode(signDebugCookie('1'))).toBe(false);
    });
  });
});
