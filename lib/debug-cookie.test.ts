import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEBUG_COOKIE_NAME,
  DEBUG_COOKIE_MAX_AGE_SECONDS,
  signDebugCookie,
  verifyDebugCookie,
  isDebugCookieOn,
} from './debug-cookie';

describe('debug-cookie', () => {
  beforeEach(() => {
    // Use a deterministic test secret so signatures are stable across runs.
    process.env.NEXTAUTH_SECRET = 'test-secret-for-debug-cookie-vitest';
  });

  describe('signDebugCookie', () => {
    it('produces a value.signature string for 0', () => {
      const signed = signDebugCookie('0');
      expect(signed).toMatch(/^0\.[A-Za-z0-9_-]+$/);
    });

    it('produces a value.signature string for 1', () => {
      const signed = signDebugCookie('1');
      expect(signed).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    });

    it('produces different signatures for 0 and 1', () => {
      expect(signDebugCookie('0')).not.toBe(signDebugCookie('1'));
    });

    it('produces deterministic output for the same value and secret', () => {
      expect(signDebugCookie('1')).toBe(signDebugCookie('1'));
    });
  });

  describe('verifyDebugCookie', () => {
    it('round-trips a value of "1"', () => {
      const signed = signDebugCookie('1');
      expect(verifyDebugCookie(signed)).toEqual({ value: '1' });
    });

    it('round-trips a value of "0"', () => {
      const signed = signDebugCookie('0');
      expect(verifyDebugCookie(signed)).toEqual({ value: '0' });
    });

    it('returns null for undefined', () => {
      expect(verifyDebugCookie(undefined)).toBeNull();
    });

    it('returns null for null', () => {
      expect(verifyDebugCookie(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(verifyDebugCookie('')).toBeNull();
    });

    it('returns null for non-string types', () => {
      // Force a non-string through; verifyDebugCookie must not throw.
      expect(verifyDebugCookie(123 as unknown as string)).toBeNull();
      expect(verifyDebugCookie({} as unknown as string)).toBeNull();
      expect(verifyDebugCookie([] as unknown as string)).toBeNull();
    });

    it('returns null for a cookie with no signature', () => {
      expect(verifyDebugCookie('1')).toBeNull();
      expect(verifyDebugCookie('0')).toBeNull();
    });

    it('returns null for a cookie with no value', () => {
      expect(verifyDebugCookie('.abcd')).toBeNull();
    });

    it('returns null for a value that is not 0 or 1', () => {
      // Try to bypass by setting value to something other than 0/1
      // and signing it correctly. The helper MUST reject.
      // We can't sign arbitrary values via signDebugCookie, so
      // construct a tampered cookie by hand.
      const fakeSig = signDebugCookie('1').split('.')[1]; // signature for "1"
      expect(verifyDebugCookie(`2.${fakeSig}`)).toBeNull();
    });

    it('returns null for a tampered value (signature was for a different value)', () => {
      // User has a signed "0" cookie. They flip the value to "1" in devtools
      // but keep the original signature. The signature was computed over "0",
      // so verifying "1.<sig-for-0>" must fail.
      const signed0 = signDebugCookie('0');
      const sig0 = signed0.split('.')[1];
      expect(verifyDebugCookie(`1.${sig0}`)).toBeNull();
    });

    it('returns null for a tampered signature', () => {
      const signed1 = signDebugCookie('1');
      const [value, sig] = signed1.split('.');
      const tampered = sig.slice(0, -2) + (sig.endsWith('A') ? 'B' : 'A');
      expect(verifyDebugCookie(`${value}.${tampered}`)).toBeNull();
    });

    it('returns null for a signature of the wrong length', () => {
      expect(verifyDebugCookie('1.abc')).toBeNull();
    });

    it('returns null for a signature that is not valid base64url', () => {
      expect(verifyDebugCookie('1.!!!not-base64!!!')).toBeNull();
    });

    it('returns null when NEXTAUTH_SECRET changes after signing', () => {
      const signed = signDebugCookie('1');
      process.env.NEXTAUTH_SECRET = 'a-different-secret';
      expect(verifyDebugCookie(signed)).toBeNull();
    });

    it('does not throw on weird inputs', () => {
      const weird = [
        '1',
        '.',
        '..',
        '1.',
        '.x',
        '1.x',
        '0.' + 'A'.repeat(1000),
        '\x00\x01\x02',
        '1\n',
      ];
      for (const w of weird) {
        expect(() => verifyDebugCookie(w)).not.toThrow();
      }
    });
  });

  describe('isDebugCookieOn', () => {
    it('is true for a signed "1" cookie', () => {
      expect(isDebugCookieOn(signDebugCookie('1'))).toBe(true);
    });

    it('is false for a signed "0" cookie', () => {
      expect(isDebugCookieOn(signDebugCookie('0'))).toBe(false);
    });

    it('is false for unset', () => {
      expect(isDebugCookieOn(undefined)).toBe(false);
      expect(isDebugCookieOn(null)).toBe(false);
      expect(isDebugCookieOn('')).toBe(false);
    });

    it('is false for a tampered cookie', () => {
      const signed0 = signDebugCookie('0');
      const sig0 = signed0.split('.')[1];
      expect(isDebugCookieOn(`1.${sig0}`)).toBe(false);
    });
  });

  describe('exports', () => {
    it('exposes the canonical cookie name', () => {
      expect(DEBUG_COOKIE_NAME).toBe('meals_debug_mode');
    });

    it('exposes a 30-day max age in seconds', () => {
      expect(DEBUG_COOKIE_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    });
  });
});
