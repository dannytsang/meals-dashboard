'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export function CollapsibleSection({ title, children, defaultOpen = true, onToggle }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const toggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(newState);
  };
  
  return (
    <div className="card overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-fast"
        style={{ borderBottom: isOpen ? '1px solid var(--border-color)' : 'none' }}
      >
        <span className="text-sm font-medium text-[var(--text-primary)]">{title}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>
      {isOpen && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}

interface ToggleSectionProps {
  title: string;
  children: ReactNode;
  isVisible: boolean;
  onToggle: () => void;
}

export function ToggleSection({ title, children, isVisible, onToggle }: ToggleSectionProps) {
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-2 rounded-lg transition-fast"
        style={{ 
          backgroundColor: isVisible ? 'var(--accent-emerald-bg)' : 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)'
        }}
      >
        {isVisible ? (
          <Eye className="w-4 h-4" style={{ color: 'var(--accent-emerald)' }} />
        ) : (
          <EyeOff className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        )}
        <span className="text-sm" style={{ color: isVisible ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {title}
        </span>
      </button>
      {isVisible && children}
    </>
  );
}