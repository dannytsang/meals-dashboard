/**
 * components/demo-mode-banner.tsx
 *
 * Spec 024 / FR-016 — permanent site-wide demo-mode banner.
 *
 * Mounted in the root layout (`app/layout.tsx`) so the banner persists
 * across navigation. When `demoMode` is false, the component returns
 * null and renders nothing — there is no banner in production.
 *
 * Design contract (spec 024 / US-006):
 *   - Positioned at the very top of the page (above all other content)
 *   - Highest z-index (sticky, amber background)
 *   - Literal text: "⚠️ DEMO MODE — showing sample data. Live data unavailable."
 *   - NO dismiss button (no close button, no sessionStorage dismissal)
 *   - `role="status"` for screen-reader announcement
 *   - `aria-label="Demo mode — sample data, not real data"`
 *   - The prefix emoji (⚠️) is `aria-hidden="true"` so screen readers
 *     do not announce "warning sign" before the message
 *   - `data-testid="demo-mode-banner"` and `data-demo-mode="true"`
 *
 * Server-rendered (no `'use client'` directive). The banner is static
 * for the duration of the request.
 */
export function DemoModeBanner({ demoMode }: { demoMode: boolean }) {
  if (!demoMode) return null;

  return (
    <div
      role="status"
      aria-label="Demo mode — sample data, not real data"
      data-testid="demo-mode-banner"
      data-demo-mode="true"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        width: '100%',
        backgroundColor: '#f59e0b', // amber-500
        color: '#1f2937',           // gray-800
        padding: '0.6rem 1rem',
        fontSize: '0.95rem',
        fontWeight: 600,
        textAlign: 'center',
        borderBottom: '2px solid #b45309', // amber-700 for definition
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      }}
    >
      <span aria-hidden="true" style={{ marginRight: '0.5rem' }}>
        ⚠️
      </span>
      DEMO MODE — showing sample data. Live data unavailable.
    </div>
  );
}
