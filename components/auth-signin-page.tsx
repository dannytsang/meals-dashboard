'use client';

import { signIn } from 'next-auth/react';
import { useTheme } from '@/lib/theme';

export function AuthSignInPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          theme === 'dark'
            ? 'radial-gradient(circle at top left, rgba(16, 185, 129, 0.16), transparent 34%), var(--bg-primary)'
            : 'radial-gradient(circle at top left, rgba(5, 150, 105, 0.12), transparent 34%), var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <section
        className="card"
        aria-labelledby="signin-heading"
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
          boxShadow: 'var(--shadow-lg)',
          padding: '2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Meals Dashboard
            </p>
            <h1 id="signin-heading" style={{ margin: '0.35rem 0 0', fontSize: '1.85rem', lineHeight: 1.1, color: 'var(--text-primary)' }}>
              Sign in for dinner intelligence
            </h1>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              borderRadius: '999px',
              padding: '0.45rem 0.75rem',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Private meal plans, Tesco order details, and coverage checks are protected by Authentik.
        </p>

        <button
          type="button"
          onClick={() => signIn('authentik', { callbackUrl: '/' })}
          style={{
            width: '100%',
            border: '1px solid var(--accent-emerald)',
            borderRadius: '0.85rem',
            backgroundColor: 'var(--accent-emerald)',
            color: 'white',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 800,
            padding: '0.9rem 1rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          Continue with Authentik
        </button>

        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', lineHeight: 1.5, margin: '1rem 0 0' }}>
          Theme preference is read from meals-dashboard-theme locally; no meal or order data is loaded on this sign-in page.
        </p>
      </section>
    </main>
  );
}
