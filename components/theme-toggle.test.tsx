import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ThemeProvider } from '../lib/theme';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  it('renders an icon-only button with a generic accessible name', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /toggle theme/i });
    expect(button).toBeTruthy();
    expect(button.textContent ?? '').not.toMatch(/Light|Dark/);
  });
});
