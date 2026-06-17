import { describe, expect, it } from 'vitest';
import {
  USER_NAME_FALLBACK,
  resolveUserChipName,
  type SessionUser,
} from './user-chip';

describe('user-chip / resolveUserChipName', () => {
  it('exports the spec-defined fallback literal', () => {
    expect(USER_NAME_FALLBACK).toBe('authorised traveller');
  });

  it('prefers user.name when present', () => {
    const user: SessionUser = { name: 'Danny Park', email: 'danny@example.com' };
    expect(resolveUserChipName(user)).toBe('Danny Park');
  });

  it('falls back to user.email when name is missing', () => {
    const user: SessionUser = { name: null, email: 'danny@example.com' };
    expect(resolveUserChipName(user)).toBe('danny@example.com');
  });

  it('falls back to user.email when name is empty string', () => {
    const user: SessionUser = { name: '', email: 'danny@example.com' };
    expect(resolveUserChipName(user)).toBe('danny@example.com');
  });

  it('falls back to user.email when name is whitespace only', () => {
    const user: SessionUser = { name: '   ', email: 'danny@example.com' };
    expect(resolveUserChipName(user)).toBe('danny@example.com');
  });

  it('falls back to USER_NAME_FALLBACK when name and email are both missing', () => {
    expect(resolveUserChipName({ name: null, email: null })).toBe(USER_NAME_FALLBACK);
    expect(resolveUserChipName({})).toBe(USER_NAME_FALLBACK);
  });

  it('falls back to USER_NAME_FALLBACK when name and email are both empty/whitespace', () => {
    expect(resolveUserChipName({ name: '', email: '' })).toBe(USER_NAME_FALLBACK);
    expect(resolveUserChipName({ name: '   ', email: '\t\n' })).toBe(USER_NAME_FALLBACK);
  });

  it('handles null user by returning the fallback', () => {
    expect(resolveUserChipName(null)).toBe(USER_NAME_FALLBACK);
  });

  it('handles undefined user by returning the fallback', () => {
    expect(resolveUserChipName(undefined)).toBe(USER_NAME_FALLBACK);
  });

  it('treats non-string name/email as missing', () => {
    // Defensive: the OIDC session shape should always give us strings,
    // but we don't want a runtime crash if a provider sends something odd.
    const user = { name: 42 as unknown as string | null, email: undefined };
    expect(resolveUserChipName(user)).toBe(USER_NAME_FALLBACK);
  });

  it('trims leading/trailing whitespace from chosen value', () => {
    const user: SessionUser = { name: '  Danny Park  ', email: 'danny@example.com' };
    expect(resolveUserChipName(user)).toBe('Danny Park');

    const user2: SessionUser = { name: null, email: '  danny@example.com  ' };
    expect(resolveUserChipName(user2)).toBe('danny@example.com');
  });

  it('respects a custom fallback argument', () => {
    expect(resolveUserChipName({ name: null, email: null }, 'Guest user')).toBe('Guest user');
    expect(resolveUserChipName(undefined, 'Guest user')).toBe('Guest user');
  });

  it('trims a custom fallback argument before returning it', () => {
    expect(resolveUserChipName({ name: null, email: null }, '  Guest user  ')).toBe('Guest user');
  });

  it('does NOT expose other session claims (sub, image, etc.) via the resolved name', () => {
    // The function only reads name/email; anything else in the input is ignored.
    // Cast through unknown so we can simulate a session that carries extra fields
    // (NextAuth's real Session.user type has `sub`, `image`, etc.).
    const user = {
      name: 'Danny Park',
      email: 'danny@example.com',
      sub: 'oidc-sub-123',
      image: 'https://example.com/avatar.png',
      accessToken: 'secret-token',
    } as unknown as SessionUser;
    expect(resolveUserChipName(user)).toBe('Danny Park');
  });
});