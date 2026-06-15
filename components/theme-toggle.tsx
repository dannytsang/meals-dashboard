'use client';

import { useTheme } from '@/lib/theme';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 hover:border-slate-500 bg-slate-800 hover:bg-slate-700 transition-all"
      aria-label="Toggle theme"
      title="Toggle theme"
      data-theme={theme}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
      )}
    </button>
  );
}