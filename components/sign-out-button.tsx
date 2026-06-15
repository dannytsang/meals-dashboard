'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  return (
    <button
      type="button"
      data-testid="sign-out-button"
      onClick={() => signOut({ callbackUrl: '/auth/signin?callbackUrl=/' })}
      aria-label="Sign out of the meals dashboard"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.5rem 0.85rem',
        borderRadius: '0.5rem',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
        e.currentTarget.style.borderColor = 'var(--accent-rose, #f43f5e)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
        e.currentTarget.style.borderColor = 'var(--border-color)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = '2px solid var(--accent-emerald)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none';
      }}
    >
      <LogOut style={{ width: '14px', height: '14px' }} aria-hidden="true" />
      <span>Sign out</span>
    </button>
  );
}
