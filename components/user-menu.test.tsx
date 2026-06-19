/**
 * components/user-menu.test.tsx
 *
 * Vitest component tests for <UserMenu /> per spec 026 / FR-017.
 * Covers the trigger, the panel, the rows, focus management, click-outside
 * / Escape handling, and the conditional Debug row.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { UserMenu } from './user-menu';

// Stub `next-auth/react` so the Sign out row's click can be observed
// without pulling the real module (which depends on NextAuth context
// the unit test env doesn't provide).
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

// Stub `next/navigation` so `router.refresh()` is a no-op.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Stub the global `fetch` so Debug-row click tests can intercept the
// /api/debug/toggle POST without hitting the network.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserMenu — trigger', () => {
  it('renders a <button> with the spec 023 chip text and a chevron', () => {
    render(<UserMenu userName="Danny Park" />);
    const trigger = screen.getByTestId('user-menu-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('type')).toBe('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe('user-menu-panel');
    // The chip text is preserved inside the trigger.
    expect(trigger.textContent).toContain('Welcome,');
    expect(trigger.textContent).toContain('Danny Park');
  });

  it('starts with aria-expanded="false" and the panel absent from the DOM', () => {
    render(<UserMenu userName="Alice" />);
    expect(screen.getByTestId('user-menu-trigger').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('user-menu-panel')).toBeNull();
  });
});

describe('UserMenu — open/close', () => {
  it('opens on trigger click and flips aria-expanded to "true"', () => {
    render(<UserMenu userName="Bob" />);
    const trigger = screen.getByTestId('user-menu-trigger');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByTestId('user-menu-panel');
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.getAttribute('aria-labelledby')).toBe('user-menu-trigger');
  });

  it('renders the identity header row inside the panel with the user name', () => {
    render(<UserMenu userName="Carol Danvers" />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    const panel = screen.getByTestId('user-menu-panel');
    expect(panel.textContent).toContain('Signed in as');
    expect(panel.textContent).toContain('Carol Danvers');
  });

  it('renders the Theme row always and the Sign out row always', () => {
    render(<UserMenu userName="Dave" />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    expect(screen.getByTestId('user-menu-theme-row')).toBeTruthy();
    expect(screen.getByTestId('user-menu-signout-row')).toBeTruthy();
  });

  it('closes when the trigger is clicked again while open', () => {
    render(<UserMenu userName="Eve" />);
    const trigger = screen.getByTestId('user-menu-trigger');
    fireEvent.click(trigger);
    expect(screen.queryByTestId('user-menu-panel')).toBeTruthy();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('user-menu-panel')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<UserMenu userName="Frank" />);
    const trigger = screen.getByTestId('user-menu-trigger');
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on click outside (mousedown) the trigger and the panel, then returns focus to the trigger', () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <UserMenu userName="Gina" />
      </div>
    );
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    expect(screen.queryByTestId('user-menu-panel')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('user-menu-panel')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('user-menu-trigger'));
  });

  it('does NOT close when clicking inside the panel', () => {
    render(<UserMenu userName="Henry" />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    const themeRow = screen.getByTestId('user-menu-theme-row');
    fireEvent.mouseDown(themeRow);
    // The panel is still in the DOM — Theme row click handler runs
    // separately to flip theme + close.
    expect(screen.queryByTestId('user-menu-panel')).toBeTruthy();
  });
});

describe('UserMenu — Debug row gating (FR-005 Rev 2: always-visible)', () => {
  it('renders the Debug row when debugOn=false with aria-checked="false" (first-time-enablement affordance)', () => {
    render(<UserMenu userName="Ivy" debugOn={false} />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    const debugRow = screen.getByTestId('user-menu-debug-row');
    expect(debugRow).toBeTruthy();
    expect(debugRow.getAttribute('role')).toBe('menuitemcheckbox');
    expect(debugRow.getAttribute('aria-checked')).toBe('false');
    expect(debugRow.getAttribute('data-debug-state')).toBe('off');
  });

  it('clicking the Debug row when debugOn=false POSTs { value: "1" } to enable (first-time-enablement click)', async () => {
    render(<UserMenu userName="Ivy-clean-slate" debugOn={false} />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    const debugRow = screen.getByTestId('user-menu-debug-row');
    await act(async () => {
      fireEvent.click(debugRow);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/debug/toggle',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ value: '1' }),
      })
    );
  });

  it('renders the Debug row when debugOn=true and reflects aria-checked', () => {
    render(<UserMenu userName="Jack" debugOn={true} />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    const debugRow = screen.getByTestId('user-menu-debug-row');
    expect(debugRow.getAttribute('role')).toBe('menuitemcheckbox');
    expect(debugRow.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking the Debug row when debugOn=true POSTs { value: "0" } to disable', async () => {
    render(<UserMenu userName="Kim" debugOn={true} />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    const debugRow = screen.getByTestId('user-menu-debug-row');
    await act(async () => {
      fireEvent.click(debugRow);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/debug/toggle',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ value: '0' }),
      })
    );
  });
});

describe('UserMenu — Theme row', () => {
  it('clicking the Theme row flips data-theme on <html>, closes the menu, and returns focus to the trigger', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<UserMenu userName="Liam" />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    fireEvent.click(screen.getByTestId('user-menu-theme-row'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.queryByTestId('user-menu-panel')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('user-menu-trigger'));
  });
});

describe('UserMenu — Sign out row', () => {
  it('clicking the Sign out row calls next-auth/react signOut with the canonical callback', async () => {
    const { signOut } = await import('next-auth/react');
    render(<UserMenu userName="Mia" />);
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    fireEvent.click(screen.getByTestId('user-menu-signout-row'));
    expect(signOut).toHaveBeenCalledWith({
      callbackUrl: '/auth/signin?callbackUrl=/',
    });
  });
});
