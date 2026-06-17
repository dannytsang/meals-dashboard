/**
 * components/user-chip.tsx
 *
 * Spec 023 — Dashboard Logged-In User Chip.
 *
 * A small, read-only header chip showing the signed-in user's display
 * name. Mirrors the trips-dashboard's `<span class="session-user">`
 * (see /home/hermes/workspace/trips-dashboard/components/
 * dashboard-session-surface.jsx:181-194).
 *
 * Design contract:
 *   - Server-rendered `<span>`. NO `'use client'`, no hooks.
 *   - Read-only: no onClick, no href, not focusable.
 *   - Content is ONLY the 👤 emoji + "Welcome, " + display name.
 *     No other session claims are read or rendered (FR-006).
 *   - Long names (> 48 chars) get a CSS text-overflow ellipsis and
 *     the full value is exposed via the `title` attribute (FR-012).
 *   - Inline styles, matching the existing chip aesthetic in
 *     `components/demo-mode-chip.tsx` / `components/sign-out-button.tsx`.
 */

import { USER_NAME_FALLBACK } from '@/lib/user-chip';

export interface UserChipProps {
  /** The display name to show (already resolved via resolveUserChipName). */
  userName: string;
}

// Inline style block. Matches the existing chip aesthetic — subtle
// border + bg, `var(--text-secondary)` text, no Tailwind classes.
// FR-008: same colour family as <SignOutButton />.
// NFR-002: ~few-hundred-bytes; no new deps; renders server-side.
//
// `maxWidth: '48ch'` keeps the header tidy for names up to ~48 chars
// (the spec's "default 48 characters" cap). Names longer than that
// get `text-overflow: ellipsis` and a `title=` for hover-tooltip.
const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.3rem 0.6rem',
  borderRadius: '4px',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
  fontWeight: 500,
  border: '1px solid var(--border-color)',
  maxWidth: '48ch', // Spec 023 / FR-012 default cap
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  cursor: 'default', // FR-004: not interactive
} as const;

export function UserChip({ userName }: UserChipProps) {
  // Defensive: the page-level call guarantees a non-empty string, but
  // an empty input here would render `Welcome, ` with a hanging comma.
  // Render the module-level fallback to keep the layout stable.
  const display = userName && userName.length > 0 ? userName : USER_NAME_FALLBACK;
  const title = display.length > 48 ? display : undefined;

  return (
    <span
      data-testid="user-chip"
      data-user-chip-display={display}
      className="session-user"
      aria-label={`Signed in as ${display}`}
      title={title}
      style={chipStyle}
    >
      <span aria-hidden="true">👤</span>
      Welcome, {display}
    </span>
  );
}