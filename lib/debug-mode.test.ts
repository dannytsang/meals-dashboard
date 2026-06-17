/**
 * lib/debug-mode.test.ts
 *
 * Spec 022 / FR-014: exercises truthy/falsy parsing, unset case,
 * warning log on unknown values, and the debugModeStatus shape.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { isDebugModeEnabled, debugModeStatus } from './debug-mode';

const ORIGINAL_ENV = { ...process.env };

describe('isDebugModeEnabled', () => {
  beforeEach(() => {
    delete process.env.MEALS_DEBUG_MODE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns false when MEALS_DEBUG_MODE is unset', () => {
    expect(isDebugModeEnabled()).toBe(false);
  });

  it('returns true for "1"', () => {
    process.env.MEALS_DEBUG_MODE = '1';
    expect(isDebugModeEnabled()).toBe(true);
  });

  it('returns true for "true" (case-insensitive)', () => {
    process.env.MEALS_DEBUG_MODE = 'TRUE';
    expect(isDebugModeEnabled()).toBe(true);
  });

  it('returns true for "yes" (case-insensitive)', () => {
    process.env.MEALS_DEBUG_MODE = 'Yes';
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

  it('returns false for an empty string', () => {
    process.env.MEALS_DEBUG_MODE = '';
    expect(isDebugModeEnabled()).toBe(false);
  });

  it('returns false for an unknown value and logs a warning', () => {
    process.env.MEALS_DEBUG_MODE = 'maybe';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isDebugModeEnabled()).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('MEALS_DEBUG_MODE');
    expect(message).toContain('maybe');
    warnSpy.mockRestore();
  });

  it('does not double-warn for the same unknown value', () => {
    process.env.MEALS_DEBUG_MODE = 'whatever';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    isDebugModeEnabled();
    isDebugModeEnabled();
    isDebugModeEnabled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe('debugModeStatus', () => {
  beforeEach(() => {
    delete process.env.MEALS_DEBUG_MODE;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns the expected shape when unset', () => {
    const status = debugModeStatus();
    expect(status).toEqual({
      enabled: false,
      raw: '',
      deploymentId: null,
    });
  });

  it('reports enabled=true and raw value when set to "1"', () => {
    process.env.MEALS_DEBUG_MODE = '1';
    const status = debugModeStatus();
    expect(status.enabled).toBe(true);
    expect(status.raw).toBe('1');
    expect(status.deploymentId).toBeNull();
  });

  it('propagates VERCEL_DEPLOYMENT_ID when set', () => {
    process.env.MEALS_DEBUG_MODE = '1';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_abc123';
    const status = debugModeStatus();
    expect(status.deploymentId).toBe('dpl_abc123');
  });
});
