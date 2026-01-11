import { useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';

export interface ModelInfo {
  id: string;
  name: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Sonnet' },
  { id: 'claude-opus-4-20250514', name: 'Opus' },
  { id: 'claude-haiku-3-5-20241022', name: 'Haiku' },
];

export interface ModelSelectorProps {
  currentModel: string;
  onSelectModel: (modelId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ModelSelector({
  currentModel,
  onSelectModel,
  isOpen,
  onClose,
}: ModelSelectorProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (modelId: string) => {
      onSelectModel(modelId);
      onClose();
    },
    [onSelectModel, onClose]
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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      role="listbox"
      className="absolute bottom-full left-0 mb-2 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden min-w-[200px] z-50"
    >
      {AVAILABLE_MODELS.map((model) => {
        const isSelected = currentModel === model.id || currentModel?.includes(model.name.toLowerCase());

        return (
          <button
            key={model.id}
            role="option"
            aria-selected={isSelected}
            aria-label={model.name}
            onClick={() => handleSelect(model.id)}
            className={clsx(
              'w-full px-4 py-3 text-left transition-colors flex flex-col',
              isSelected
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'hover:bg-bg-tertiary text-text-primary'
            )}
          >
            <span className="font-medium">{model.name}</span>
            <span className="text-xs text-text-secondary">{model.id}</span>
          </button>
        );
      })}
    </div>
  );
}
