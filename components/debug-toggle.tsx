/**
 * components/debug-toggle.tsx
 *
 * Spec 022 / Rev 3 / FR-008, US2: the in-header UI control that
 * flips the per-user `meals_debug_mode` cookie. The cookie is
 * HMAC-signed and is the ONLY gate — there is no env-var kill
 * switch. The server (app/page.tsx) reads the cookie and decides
 * whether to render this component at all (cookie unset → 404 on
 * /debug, toggle chip hidden in the header).
 *
 * The component is a thin client wrapper: it does not read the
 * cookie itself (the server has already decided what to send).
 * On click, it POSTs `{ value: <flipped> }` to /api/debug/toggle;
 * the server sets the signed cookie, returns 200 with the new
 * effective state, and a `router.refresh()` is used to pick up
 * the new server-rendered state (including the inline debug chips
 * on the main dashboard, which the server only renders when the
 * cookie is set).
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bug } from 'lucide-react';

interface DebugToggleProps {
  /** Server-rendered initial state from the cookie. */
  initialEnabled: boolean;
}

export function DebugToggle({ initialEnabled }: DebugToggleProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    const next = !enabled;
    // Optimistic update; revert on error.
    setEnabled(next);
    startTransition(async () => {
      try {
        const res = await fetch('/api/debug/toggle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: next ? '1' : '0' }),
        });
        if (!res.ok) {
          // Revert on failure.
          setEnabled(!next);
          setError(`Toggle failed (HTTP ${res.status})`);
          return;
        }
        // Pick up the new server-rendered state (toggle + chips).
        router.refresh();
      } catch (e) {
        setEnabled(!next);
        setError(e instanceof Error ? e.message : 'Network error');
      }
    });
  };

  const label = enabled ? 'Debug mode is on — click to turn off' : 'Debug mode is off — click to turn on';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      data-testid="debug-toggle"
      data-debug-state={enabled ? 'on' : 'off'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        padding: '0.4rem 0.55rem',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        backgroundColor: enabled
          ? 'var(--accent-amber-bg, rgba(245, 158, 11, 0.15))'
          : 'var(--bg-tertiary)',
        color: enabled
          ? 'var(--accent-amber, #f59e0b)'
          : 'var(--text-secondary)',
        cursor: pending ? 'not-allowed' : 'pointer',
        fontSize: '0.8rem',
        fontWeight: 600,
        transition: 'background-color 120ms, color 120ms, opacity 120ms',
      }}
    >
      <Bug style={{ width: '14px', height: '14px' }} aria-hidden="true" />
      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {pending ? '…' : 'Debug'}
      </span>
      {error && (
        <span
          role="alert"
          data-testid="debug-toggle-error"
          style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--accent-rose, #f43f5e)' }}
        >
          {error}
        </span>
      )}
    </button>
  );
}
