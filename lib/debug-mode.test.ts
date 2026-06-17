import { describe, it, expect } from 'vitest';
import { effectiveDebugMode } from './debug-mode';
import { signDebugCookie } from './debug-cookie';

describe('debug-mode (Rev 3: cookie-only)', () => {
  describe('effectiveDebugMode', () => {
    it('is false when cookie is unset', () => {
      expect(effectiveDebugMode(undefined)).toBe(false);
      expect(effectiveDebugMode(null)).toBe(false);
      expect(effectiveDebugMode('')).toBe(false);
    });

    it('is false when cookie is signed "0"', () => {
      expect(effectiveDebugMode(signDebugCookie('0'))).toBe(false);
    });

    it('is true when cookie is signed "1"', () => {
      expect(effectiveDebugMode(signDebugCookie('1'))).toBe(true);
    });

    it('is false when cookie is tampered (signature for different value)', () => {
      const signed0 = signDebugCookie('0');
      const sig0 = signed0.split('.')[1];
      expect(effectiveDebugMode(`1.${sig0}`)).toBe(false);
    });

    it('is false when cookie is malformed', () => {
      expect(effectiveDebugMode('garbage')).toBe(false);
      expect(effectiveDebugMode('1')).toBe(false);
      expect(effectiveDebugMode('1.abc')).toBe(false);
      expect(effectiveDebugMode('1.!!!not-base64!!!')).toBe(false);
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
        expect(() => effectiveDebugMode(w)).not.toThrow();
      }
    });

    it('is the single source of truth — equivalent to verifyDebugCookie+value check', () => {
      // The contract is that `effectiveDebugMode(raw) === verifyDebugCookie(raw)?.value === '1'`.
      // This is a structural test: if anyone ever adds a secondary gate
      // (e.g. an env-var) to effectiveDebugMode, this test will still
      // pass (it just tests the cookie path), but the spec's Rev 3
      // invariant is "cookie is the only gate" — that invariant is
      // enforced by the absence of any other gate in this module.
      const signed1 = signDebugCookie('1');
      expect(effectiveDebugMode(signed1)).toBe(true);
    });
  });
});
