import { useEffect, useRef, useCallback, useState } from 'react';
import clsx from 'clsx';

export type PermissionMode = 'ask' | 'auto-edit' | 'plan';

export interface PermissionModeOption {
  id: PermissionMode;
  name: string;
  description: string;
}

export const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  { id: 'ask', name: 'Ask before edits', description: 'Confirm before making changes' },
  { id: 'auto-edit', name: 'Edit automatically', description: 'Apply changes without confirmation' },
  { id: 'plan', name: 'Plan mode', description: 'Plan changes before executing' },
];

export interface PermissionModeSelectorProps {
  currentMode: string;
  onSelectMode: (mode: PermissionMode) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function PermissionModeSelector({
  currentMode,
  onSelectMode,
  isOpen,
  onClose,
}: PermissionModeSelectorProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleSelect = useCallback(
    (mode: PermissionMode) => {
      onSelectMode(mode);
      onClose();
    },
    [onSelectMode, onClose]
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : PERMISSION_MODE_OPTIONS.length - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < PERMISSION_MODE_OPTIONS.length - 1 ? prev + 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (PERMISSION_MODE_OPTIONS[selectedIndex]) {
            handleSelect(PERMISSION_MODE_OPTIONS[selectedIndex].id);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, selectedIndex, handleSelect]);

  // Reset selected index when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = PERMISSION_MODE_OPTIONS.findIndex((opt) => opt.id === currentMode);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentMode]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      role="listbox"
      className="absolute bottom-full left-0 mb-2 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden min-w-[280px] z-50"
    >
      <div className="px-3 py-2 text-xs text-text-secondary border-b border-border">
        Select permission mode
      </div>
      {PERMISSION_MODE_OPTIONS.map((option, index) => {
        const isSelected = option.id === currentMode;
        const isHighlighted = index === selectedIndex;

        return (
          <button
            key={option.id}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleSelect(option.id)}
            className={clsx(
              'w-full px-3 py-2.5 text-left transition-colors flex items-center justify-between',
              isHighlighted
                ? 'bg-accent-primary text-white'
                : 'hover:bg-bg-tertiary text-text-primary'
            )}
          >
            <div className="flex flex-col">
              <span className="font-medium">{option.name}</span>
              <span className={clsx(
                'text-xs',
                isHighlighted ? 'text-white/70' : 'text-text-secondary'
              )}>
                {option.description}
              </span>
            </div>
            {isSelected && (
              <svg
                className={clsx(
                  'w-5 h-5 flex-shrink-0',
                  isHighlighted ? 'text-white' : 'text-text-secondary'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
