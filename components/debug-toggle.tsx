/**
 * components/debug-toggle.tsx
 *
 * Spec 022 / FR-008, US2: the in-header UI control that flips the
 * per-user `meals_debug_mode` cookie. Server-rendered with the
 * initial visual state (which depends on env-gate + cookie), and
 * client-side click handling that POSTs to /api/debug/toggle and
 * optimistically updates.
 *
 * The component is a thin client wrapper: it does not read the
 * cookie itself (the server has already decided what to send).
 * On click, it POSTs `{ value: <flipped> }` to /api/debug/toggle;
 * the server sets the signed cookie, returns 200 with the new
 * effective state, and a `router.refresh()` is used to pick up
 * the new server-rendered state (including the inline debug chips
 * on the main dashboard, which the server only renders when the
 * cookie is set).
 *
 * When the env-gate is off, the toggle is hidden entirely —
 * see `app/page.tsx` for the gate. The component itself does not
 * need to know about the env-gate (the server wouldn't render it).
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bug } from 'lucide-react';

interface DebugToggleProps {
  /** Server-rendered initial state from the cookie. */
  initialEnabled: boolean;
  /** Whether the env-gate is on. When false, the toggle is
   *  rendered as visibly disabled (greyed out + tooltip) rather
   *  than completely hidden — the operator can see why it's not
   *  working. The server still has to render it for this option
   *  to apply. */
  envEnabled: boolean;
}

export function DebugToggle({ initialEnabled, envEnabled }: DebugToggleProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (!envEnabled) return; // belt + braces; the server route is also gated
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
          setError(res.status === 404 ? 'Debug mode is disabled in this deployment.' : `Toggle failed (HTTP ${res.status})`);
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
  const envTooltip = envEnabled
    ? label
    : 'Debug mode is disabled in this deployment. Set MEALS_DEBUG_MODE=1 in the Vercel env to enable.';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!envEnabled || pending}
      aria-label={envTooltip}
      aria-pressed={enabled}
      title={envTooltip}
      data-testid="debug-toggle"
      data-debug-state={enabled ? 'on' : 'off'}
      data-env-state={envEnabled ? 'on' : 'off'}
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
          : envEnabled
            ? 'var(--text-secondary)'
            : 'var(--text-secondary)',
        opacity: envEnabled ? 1 : 0.45,
        cursor: envEnabled && !pending ? 'pointer' : 'not-allowed',
        fontSize: '0.8rem',
        fontWeight: 600,
        transition: 'background-color 120ms, color 120ms, opacity 120ms',
      }}
    >
      <Bug style={{ width: '14px', height: '14px' }} aria-hidden="true" />
      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {pending ? '…' : enabled ? 'Debug' : 'Debug'}
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
