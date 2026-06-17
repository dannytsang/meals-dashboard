/**
 * components/demo-mode-chip.tsx
 *
 * Spec 024 / FR-017 — secondary header chip for demo mode.
 *
 * Rendered in the top-right header (`components/dashboard-client.tsx`)
 * between the user chip and the theme toggle when `demoMode` is true.
 * When false, the component returns null.
 *
 * Design contract (spec 024 / US-006 / FR-017):
 *   - Amber background matching the banner
 *   - Text: "Demo"
 *   - Server-rendered `<span>` (no client-side hooks)
 *   - `data-testid="demo-mode-chip"` and `data-demo-mode="true"`
 *   - `aria-label="Demo mode is active"`
 */
export function DemoModeChip({ demoMode }: { demoMode: boolean }) {
  if (!demoMode) return null;

  return (
    <span
      data-testid="demo-mode-chip"
      data-demo-mode="true"
      aria-label="Demo mode is active"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.3rem 0.5rem',
        borderRadius: '4px',
        backgroundColor: 'rgba(245, 158, 11, 0.15)', // amber-500 at 15%
        color: '#b45309',                              // amber-700
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        border: '1px solid rgba(245, 158, 11, 0.4)',
      }}
    >
      <span aria-hidden="true">⚠️</span>
      Demo
    </span>
  );
}
