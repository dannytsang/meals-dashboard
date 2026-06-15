import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OrderStatusBadge } from './order-status-badge';

describe('OrderStatusBadge', () => {
  it('renders nothing for active orders', () => {
    const { container } = render(<OrderStatusBadge status="active" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is undefined', () => {
    const { container } = render(<OrderStatusBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a Cancelled badge with the rose accent', () => {
    render(<OrderStatusBadge status="cancelled" />);
    const badge = screen.getByTestId('order-status-badge');
    expect(badge.dataset.status).toBe('cancelled');
    expect(badge.textContent).toContain('Cancelled');
    expect(badge.textContent).toContain('❌');
    expect(badge.style.backgroundColor).toBe('var(--accent-rose-bg)');
    expect(badge.style.color).toBe('var(--accent-rose)');
  });

  it('renders a Moved badge with the amber accent', () => {
    render(<OrderStatusBadge status="superseded" />);
    const badge = screen.getByTestId('order-status-badge');
    expect(badge.dataset.status).toBe('superseded');
    expect(badge.textContent).toContain('Moved');
    expect(badge.textContent).toContain('↪️');
    expect(badge.style.backgroundColor).toBe('var(--accent-amber-bg)');
  });

  it('renders a Refunded badge with the blue accent', () => {
    render(<OrderStatusBadge status="refunded" />);
    const badge = screen.getByTestId('order-status-badge');
    expect(badge.dataset.status).toBe('refunded');
    expect(badge.textContent).toContain('Refunded');
    expect(badge.textContent).toContain('💸');
    expect(badge.style.backgroundColor).toBe('var(--accent-blue-bg)');
  });

  it('uses an existing CSS variable for the foreground color (no fabricated hex)', () => {
    render(<OrderStatusBadge status="cancelled" />);
    const badge = screen.getByTestId('order-status-badge');
    expect(badge.style.color).toMatch(/^var\(--accent-/);
  });
});
