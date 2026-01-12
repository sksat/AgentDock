import { useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';

export interface SlashCommand {
  name: string;
  label: string;
  value?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'model', label: 'Switch model...' },
];

export interface SlashCommandSuggestionsProps {
  query: string;
  currentModel?: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function SlashCommandSuggestions({
  query,
  currentModel,
  selectedIndex,
  onSelect,
  onClose,
  isOpen,
}: SlashCommandSuggestionsProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Filter commands based on query (without the leading /)
  const searchTerm = query.startsWith('/') ? query.slice(1).toLowerCase() : '';
  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(searchTerm)
  ).map((cmd) => ({
    ...cmd,
    value: cmd.name === 'model' ? currentModel : cmd.value,
  }));

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

  const handleSelect = useCallback(
    (command: SlashCommand) => {
      onSelect(command);
    },
    [onSelect]
  );

  if (!isOpen || filteredCommands.length === 0) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      role="listbox"
      className="absolute bottom-full left-0 mb-2 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden min-w-[300px] z-50"
    >
      <div className="px-3 py-2 text-xs text-text-secondary border-b border-border">
        Model
      </div>
      {filteredCommands.map((command, index) => {
        const isSelected = index === selectedIndex;

        return (
          <button
            key={command.name}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleSelect(command)}
            className={clsx(
              'w-full px-3 py-2.5 text-left transition-colors flex items-center justify-between',
              isSelected
                ? 'bg-accent-primary text-white'
                : 'hover:bg-bg-tertiary text-text-primary'
            )}
          >
            <span className="font-medium">{command.label}</span>
            {command.value && (
              <span className={clsx(
                'text-sm',
                isSelected ? 'text-white/70' : 'text-text-secondary'
              )}>
                {command.value}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function getFilteredCommands(query: string): SlashCommand[] {
  const searchTerm = query.startsWith('/') ? query.slice(1).toLowerCase() : '';
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(searchTerm)
  );
}
