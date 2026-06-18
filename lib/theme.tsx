'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toggleTheme as pureToggleTheme, type Theme } from '@/lib/user-menu';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Load from localStorage if available
    const stored = localStorage.getItem('meals-dashboard-theme');
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      document.documentElement.setAttribute('data-theme', stored);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  // Spec 026 / FR-016: delegate the localStorage + data-theme write to
  // the pure helper so the inline <ThemeToggle /> and the <UserMenu />'s
  // Theme row write through the same code path. The pure helper returns
  // the new theme; we just setState to mirror it in context.
  const toggleTheme = () => {
    const next = pureToggleTheme(theme);
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}