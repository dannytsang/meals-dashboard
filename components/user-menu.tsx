/**
 * components/user-menu.tsx
 *
 * Spec 026 — Dashboard User Menu. A click-to-open dropdown menu anchored
 * on the existing logged-in user chip (spec 023). The chip stays as the
 * at-a-glance identity confirmation from spec 023 but becomes an
 * interactive button when this menu wraps it. The menu contains:
 *
 *   1. Identity header row (decorative — chip text already carries the
 *      identity; this is a "Signed in as" label inside the panel).
 *   2. Debug menu row (always visible — reflects the current
 *      `meals_debug_mode` signed-cookie state and toggles it on click).
 *   3. Theme menu row (always present).
 *   4. Sign out menu row (always present).
 *
 * Click-outside and Escape close the menu; clicking a row fires its
 * underlying action and closes the menu. Focus management: on open,
 * focus moves to the first interactive row; on close, focus returns
 * to the trigger.
 *
 * The chip's text derivation and `data-testid="user-chip"` attribute
 * remain server-rendered via the existing <UserChip /> module. This
 * wrapper is the thin client component that owns open/close state
 * (FR-012).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Bug, Sun, Moon, LogOut } from 'lucide-react';
import { signOut as nextAuthSignOut } from 'next-auth/react';
import { UserChip } from '@/components/user-chip';
import { toggleDebug, toggleTheme, type Theme } from '@/lib/user-menu';

export interface UserMenuProps {
  /** Server-rendered display name from spec 023. */
  userName: string;
  /** Server-rendered effective debug state from spec 022 Rev 3.
   *  When falsy, the Debug menu row still renders in the off state. */
  debugOn?: boolean;
  /** Server-rendered initial theme; used as the menu's first-paint
   *  state for the Theme row's icon. Defaults to 'dark' to match the
   *  <ThemeProvider /> default. */
  initialTheme?: Theme;
}

// Spec 026 / FR-021: no new npm dependencies. Existing lucide-react
// icons only. The chip's emoji comes from the server-rendered
// <UserChip /> module — no new emoji usage here.

// Spec 026 / FR-004: panel position. The wrapper is `position: relative`
// so the absolutely-positioned panel anchors to the trigger.
const wrapperStyle = { position: 'relative' as const };

// Spec 026 / FR-002: chevron rotates 180° when open. The chevron is
// `aria-hidden="true"` (FR-002) — the trigger's accessible name
// already covers "menu".
const chevronStyle = (open: boolean) => ({
  width: '14px',
  height: '14px',
  color: 'var(--text-secondary)',
  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  transition: 'transform 120ms ease',
});

// Spec 026 / FR-019: trigger keeps the spec 023 wording. The button
// visual style is taken from the existing chip so the clickable
// affordance looks the same as the read-only one but gains the cursor
// pointer and focus ring.
const triggerStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  font: 'inherit',
  color: 'inherit',
  borderRadius: '4px',
};

// Spec 026 / FR-004 panel: absolute, top: calc(100% + 6px), right: 0,
// z-index 60, min-width 220px, theme-aware via tokens.
const panelStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: '220px',
  zIndex: 60,
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  padding: '0.4rem 0',
  display: 'flex',
  flexDirection: 'column' as const,
};

// Spec 026 / US3 / FR-003: identity header row is decorative.
const identityRowStyle = {
  padding: '0.4rem 0.85rem 0.5rem',
  borderBottom: '1px solid var(--border-color)',
  marginBottom: '0.25rem',
};

const identityLabelStyle = {
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color: 'var(--text-secondary)',
};

const identityValueStyle = {
  fontSize: '0.85rem',
  fontWeight: 500,
  color: 'var(--text-primary)',
  marginTop: '0.15rem',
  wordBreak: 'break-word' as const,
};

const menuRowBaseStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  padding: '0.55rem 0.85rem',
  background: 'none',
  border: 'none',
  font: 'inherit',
  fontSize: '0.85rem',
  textAlign: 'left' as const,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  transition: 'background-color 120ms ease',
};

const menuRowDisabledStyle = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

const stateBadgeStyle = (variant: 'on' | 'off') => ({
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  padding: '1px 5px',
  borderRadius: '3px',
  backgroundColor:
    variant === 'on'
      ? 'var(--accent-amber-bg, rgba(245, 158, 11, 0.15))'
      : 'var(--bg-tertiary)',
  color: variant === 'on' ? 'var(--accent-amber, #f59e0b)' : 'var(--text-secondary)',
});

export function UserMenu({ userName, debugOn, initialTheme = 'dark' }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [debugEnabled, setDebugEnabled] = useState(!!debugOn);
  const [debugPending, setDebugPending] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // First interactive row gets focus on open. We use a ref map so any
  // row can claim focus when the menu opens.
  const firstRowRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((options?: { returnFocus?: boolean }) => {
    setOpen(false);
    if (options?.returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  // Spec 026 / FR-008: click-outside closes the menu. Listener is
  // mounted only while the menu is open and removed on close / unmount.
  // We use mousedown so the close fires before the click event
  // propagates to the underlying page (the click would otherwise
  // trigger actions on the page below the menu — e.g. flipping a
  // filter on the dashboard grid).
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      close({ returnFocus: true });
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, close]);

  // Spec 026 / FR-009: Escape closes the menu and returns focus to the
  // trigger.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close({ returnFocus: true });
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, close]);

  // Spec 026 / FR-011: on open, focus moves to the first interactive
  // row. The first-row ref is conditionally set to the Debug row (if
  // rendered) or the Theme row.
  useEffect(() => {
    if (open) {
      // Defer to next frame so the panel is in the DOM before focus.
      const id = requestAnimationFrame(() => firstRowRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  const handleTrigger = () => {
    if (open) {
      close({ returnFocus: true });
      return;
    }
    setOpen(true);
  };

  const handleDebugClick = async () => {
    if (debugPending) return;
    setDebugError(null);
    setDebugPending(true);
    const next = !debugEnabled;
    setDebugEnabled(next); // optimistic
    const result = await toggleDebug(!next);
    if (!result.ok) {
      setDebugEnabled(!next); // revert
      setDebugError(result.error ?? 'Toggle failed');
      setDebugPending(false);
      return;
    }
    setDebugPending(false);
    close({ returnFocus: true });
    router.refresh();
  };

  const handleThemeClick = () => {
    const next = toggleTheme(theme);
    setTheme(next);
    close({ returnFocus: true });
  };

  const handleSignOutClick = () => {
    close({ returnFocus: true });
    nextAuthSignOut({ callbackUrl: '/auth/signin?callbackUrl=/' });
  };

  // Spec 026 / FR-003 / FR-005 Rev 2: the Debug menu row is always
  // rendered first in DOM order (regardless of the `debugOn` prop), so
  // it is the first-row focus target when the menu opens. The Theme
  // row's `firstRowRef` claim is no longer needed.
  // (FR-011 focus-on-open behaviour is unchanged.)

  return (
    <div style={wrapperStyle} data-testid="user-menu">
      <button
        ref={triggerRef}
        type="button"
        data-testid="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="user-menu-panel"
        onClick={handleTrigger}
        style={triggerStyle}
      >
        <UserChip userName={userName} />
        <ChevronDown style={chevronStyle(open)} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id="user-menu-panel"
          role="menu"
          aria-labelledby="user-menu-trigger"
          data-testid="user-menu-panel"
          style={panelStyle}
        >
          {/* Spec 026 / US3 / FR-003: identity header row. Non-interactive;
              the chip text already carries the identity for the trigger
              accessible name. */}
          <div aria-hidden="true" style={identityRowStyle}>
            <div style={identityLabelStyle}>Signed in as</div>
            <div style={identityValueStyle}>{userName}</div>
          </div>

          {/* Spec 026 / FR-005 Rev 2: Debug row is ALWAYS rendered (no
              `debugOn &&` guard). The row's `aria-checked` reflects the
              server-rendered `debugOn` prop, and clicking POSTs to
              /api/debug/toggle with the flipped value
              (`{ value: '1' }` when off, `{ value: '0' }` when on).
              This restores the first-time-enablement path the
              pre-spec-026 inline <DebugToggle initialEnabled={!!debugOn} />
              provided. Server-side cookie verification on each POST
              (spec 022 Rev 3) is preserved unchanged. */}
          <button
            ref={firstRowRef}
            type="button"
            role="menuitemcheckbox"
            aria-checked={debugEnabled ? 'true' : 'false'}
            data-testid="user-menu-debug-row"
            data-debug-state={debugEnabled ? 'on' : 'off'}
            onClick={handleDebugClick}
            disabled={debugPending}
            style={{
              ...menuRowBaseStyle,
              ...(debugPending ? menuRowDisabledStyle : {}),
            }}
          >
            <Bug
              style={{
                width: '14px',
                height: '14px',
                color: debugEnabled ? 'var(--accent-amber, #f59e0b)' : 'var(--text-secondary)',
              }}
              aria-hidden="true"
            />
            <span style={{ flex: 1 }}>Debug mode</span>
            <span style={stateBadgeStyle(debugEnabled ? 'on' : 'off')}>
              {debugPending ? '…' : debugEnabled ? 'on' : 'off'}
            </span>
            {debugError && (
              <span
                role="alert"
                data-testid="user-menu-debug-error"
                style={{
                  marginLeft: '0.5rem',
                  fontSize: '0.7rem',
                  color: 'var(--accent-rose, #f43f5e)',
                }}
              >
                {debugError}
              </span>
            )}
          </button>

          {/* Spec 026 / FR-006: Theme row always present. Icon switches
              between Sun and Moon reflecting the NEXT state (the
              current `theme` is the active state; clicking will flip
              to the icon's state). */}
          <button
            type="button"
            role="menuitem"
            data-testid="user-menu-theme-row"
            data-theme={theme}
            onClick={handleThemeClick}
            style={menuRowBaseStyle}
          >
            {theme === 'dark' ? (
              <Sun style={{ width: '14px', height: '14px', color: 'var(--accent-amber, #f59e0b)' }} aria-hidden="true" />
            ) : (
              <Moon style={{ width: '14px', height: '14px', color: 'var(--text-secondary)' }} aria-hidden="true" />
            )}
            <span style={{ flex: 1 }}>Theme</span>
            <span style={stateBadgeStyle(theme === 'dark' ? 'on' : 'off')}>
              {theme === 'dark' ? 'dark' : 'light'}
            </span>
          </button>

          {/* Spec 026 / FR-007: Sign out row always present. Closes the
              menu before navigation starts (FR-010). */}
          <button
            type="button"
            role="menuitem"
            data-testid="user-menu-signout-row"
            onClick={handleSignOutClick}
            style={menuRowBaseStyle}
          >
            <LogOut style={{ width: '14px', height: '14px', color: 'var(--text-secondary)' }} aria-hidden="true" />
            <span style={{ flex: 1 }}>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
