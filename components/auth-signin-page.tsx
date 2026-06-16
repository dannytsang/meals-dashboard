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
            title="Toggle theme"
            style={{
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              borderRadius: '999px',
              padding: '0.45rem 0.75rem',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            )}
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          The meals dashboard shows your upcoming meal plans alongside your next Tesco delivery — letting you see at a glance whether the items you've ordered will cover the meals you're planning to cook. It tracks delivery dates, highlights missing or refunded items, and shows which meals are fully covered, partially covered, or still need attention.
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
        </p>
      </section>
    </main>
  );
}
