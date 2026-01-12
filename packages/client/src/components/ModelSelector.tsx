import { useEffect, useRef, useCallback, useState } from 'react';
import clsx from 'clsx';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'claude-opus-4-5-20250514', name: 'Default (recommended)', description: 'Opus 4.5 · Most capable for complex work', isDefault: true },
  { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet', description: 'Sonnet 4.5 · Best for everyday tasks' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' },
];

// Check if a model ID matches one of our preset options
function findMatchingOption(modelId: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((opt) => {
    // Exact match
    if (opt.id === modelId) return true;
    // Partial match (e.g., "claude-opus-4-5-20251101" matches "opus" option)
    const modelLower = modelId.toLowerCase();
    if (opt.name.toLowerCase().includes('opus') && modelLower.includes('opus')) return true;
    if (opt.name.toLowerCase() === 'sonnet' && modelLower.includes('sonnet')) return true;
    if (opt.name.toLowerCase() === 'haiku' && modelLower.includes('haiku')) return true;
    return false;
  });
}

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
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build options list: presets + custom model if not in presets
  const matchingOption = findMatchingOption(currentModel);
  const options: ModelOption[] = [...MODEL_OPTIONS];

  // Add current model as custom if it doesn't match any preset
  if (!matchingOption && currentModel) {
    options.push({
      id: currentModel,
      name: currentModel,
      description: 'Custom model',
    });
  }

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
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (options[selectedIndex]) {
            handleSelect(options[selectedIndex].id);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, options, selectedIndex, handleSelect]);

  // Reset selected index when opening
  useEffect(() => {
    if (isOpen) {
      // Find index of current model
      const currentIndex = options.findIndex((opt) => {
        if (opt.id === currentModel) return true;
        // Check partial match for the matching option
        if (matchingOption && opt.id === matchingOption.id) return true;
        return false;
      });
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentModel, matchingOption, options]);

  if (!isOpen) {
    return null;
  }

  // Check if current model matches an option
  const isModelSelected = (optionId: string): boolean => {
    if (optionId === currentModel) return true;
    const opt = MODEL_OPTIONS.find((o) => o.id === optionId);
    if (!opt) return false;
    // Check partial match
    const modelLower = currentModel.toLowerCase();
    if (opt.name.toLowerCase().includes('opus') || opt.isDefault) {
      return modelLower.includes('opus');
    }
    if (opt.name.toLowerCase() === 'sonnet') {
      return modelLower.includes('sonnet');
    }
    if (opt.name.toLowerCase() === 'haiku') {
      return modelLower.includes('haiku');
    }
    return false;
  };

  return (
    <div
      ref={popoverRef}
      role="listbox"
      className="absolute bottom-full left-0 mb-2 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden min-w-[320px] z-50"
    >
      <div className="px-3 py-2 text-xs text-text-secondary border-b border-border">
        Select a model
      </div>
      {options.map((option, index) => {
        const isSelected = isModelSelected(option.id);
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

// Re-export for backwards compatibility
export interface ModelInfo {
  id: string;
  name: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = MODEL_OPTIONS.map((opt) => ({
  id: opt.id,
  name: opt.name.replace(' (recommended)', ''),
}));
