import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserChip } from './user-chip';

describe('UserChip', () => {
  it('renders the user name with the 👤 emoji and "Welcome, " prefix', () => {
    render(<UserChip userName="Danny Park" />);
    const chip = screen.getByTestId('user-chip');
    // jsdom textContent concatenates siblings without inserting whitespace,
    // so assert on the constituent parts rather than the full string.
    expect(chip.textContent).toContain('👤');
    expect(chip.textContent).toContain('Welcome,');
    expect(chip.textContent).toContain('Danny Park');
    // The whole greeting is in textContent (just without the inter-node space).
    expect(chip.textContent.replace(/\s+/g, '')).toBe('👤Welcome,DannyPark');
  });

  it('renders a <span> element (read-only, not a button)', () => {
    const { container } = render(<UserChip userName="Test User" />);
    const span = container.querySelector('span.session-user');
    expect(span).not.toBeNull();
    expect(span?.tagName).toBe('SPAN');
    expect(span?.querySelector('button')).toBeNull();
    expect(span?.querySelector('a')).toBeNull();
  });

  it('carries className="session-user" matching the trips-dashboard reference', () => {
    const { container } = render(<UserChip userName="Alice" />);
    const span = container.querySelector('span.session-user');
    expect(span).not.toBeNull();
  });

  it('exposes data-testid="user-chip" and data-user-chip-display for tests', () => {
    render(<UserChip userName="Bob Builder" />);
    const chip = screen.getByTestId('user-chip');
    expect(chip.getAttribute('data-user-chip-display')).toBe('Bob Builder');
  });

  it('has an aria-label describing who is signed in', () => {
    render(<UserChip userName="Carol Danvers" />);
    const chip = screen.getByTestId('user-chip');
    expect(chip.getAttribute('aria-label')).toBe('Signed in as Carol Danvers');
  });

  it('marks the 👤 emoji as aria-hidden (decorative, not announced)', () => {
    const { container } = render(<UserChip userName="Dave" />);
    const emojiSpan = container.querySelector('span[aria-hidden="true"]');
    expect(emojiSpan).not.toBeNull();
    expect(emojiSpan?.textContent).toBe('👤');
  });

  it('does NOT render any <img>, <a>, or fetch call from inside the chip', () => {
    const { container } = render(<UserChip userName="Eve" />);
    const chip = screen.getByTestId('user-chip');
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('a')).toBeNull();
    // No remote fetch / useEffect / useSWR — those are server-only and
    // server components don't ship hooks. Reading the source is a
    // belt-and-braces check.
    const src = UserChip.toString();
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toContain('useEffect');
    expect(src).not.toContain('useSWR');
  });

  it('truncates long names with text-overflow: ellipsis and a maxWidth', () => {
    const longName = 'A'.repeat(80); // > 48 chars
    render(<UserChip userName={longName} />);
    const chip = screen.getByTestId('user-chip');
    // jsdom exposes inline styles via the style object.
    expect(chip.style.textOverflow).toBe('ellipsis');
    expect(chip.style.overflow).toBe('hidden');
    expect(chip.style.whiteSpace).toBe('nowrap');
    expect(chip.style.maxWidth).not.toBe('');
    expect(chip.style.maxWidth.length).toBeGreaterThan(0);
  });

  it('exposes the full long name via the title attribute for hover-tooltip', () => {
    const longName = 'A very very very very very very very long traveller name';
    render(<UserChip userName={longName} />);
    const chip = screen.getByTestId('user-chip');
    expect(chip.getAttribute('title')).toBe(longName);
  });

  it('does NOT set title="" when the name is short (no truncation tooltip noise)', () => {
    render(<UserChip userName="Short" />);
    const chip = screen.getByTestId('user-chip');
    // Either null or the short name itself — both are acceptable; we
    // just don't want the long-name-only title attribute set.
    const title = chip.getAttribute('title');
    expect(title === null || title === 'Short').toBe(true);
  });

  it('uses var(--text-secondary) for the foreground colour (FR-008)', () => {
    render(<UserChip userName="Frank" />);
    const chip = screen.getByTestId('user-chip');
    expect(chip.style.color).toBe('var(--text-secondary)');
  });

  it('falls back to USER_NAME_FALLBACK when userName is an empty string', () => {
    // Spec FR-009: props.userName is always a non-empty string after
    // the page-level derivation, but the component must not crash if a
    // caller forgets. The component renders the constant fallback
    // ('authorised traveller') so the layout stays stable.
    render(<UserChip userName="" />);
    const chip = screen.getByTestId('user-chip');
    expect(chip.textContent).toContain('authorised traveller');
    expect(chip.getAttribute('data-user-chip-display')).toBe('authorised traveller');
  });

  it('does NOT use any other session claims (sub, idToken, etc.) in the rendered output', () => {
    // The component only receives userName as a prop — there is no
    // path from session claims to the rendered output. Assert this by
    // source: the function signature and body.
    const src = UserChip.toString();
    expect(src).not.toContain('session.');
    expect(src).not.toContain('.sub');
    expect(src).not.toContain('accessToken');
    expect(src).not.toContain('idToken');
    expect(src).not.toContain('image');
  });
});