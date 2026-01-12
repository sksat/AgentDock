import { useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';

export interface SlashCommand {
  name: string;
  label: string;
  description: string;
  category: 'model' | 'session' | 'settings';
  value?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'model', label: 'Switch model...', description: 'Change the AI model', category: 'model' },
  { name: 'new', label: 'New session', description: 'Create a new chat session', category: 'session' },
  { name: 'clear', label: 'Clear messages', description: 'Clear current session messages', category: 'session' },
  { name: 'permission', label: 'Permission mode...', description: 'Change permission mode', category: 'settings' },
];

export interface SlashCommandSuggestionsProps {
  query: string;
  currentModel?: string;
  permissionMode?: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function SlashCommandSuggestions({
  query,
  currentModel,
  permissionMode,
  selectedIndex,
  onSelect,
  onClose,
  isOpen,
}: SlashCommandSuggestionsProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Filter commands based on query (without the leading /)
  const searchTerm = query.startsWith('/') ? query.slice(1).toLowerCase() : '';
  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(searchTerm) ||
    cmd.label.toLowerCase().includes(searchTerm)
  ).map((cmd) => ({
    ...cmd,
    value: cmd.name === 'model' ? currentModel :
           cmd.name === 'permission' ? permissionMode :
           cmd.value,
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

  // Group commands by category
  const categories = ['model', 'session', 'settings'] as const;
  const categoryLabels: Record<string, string> = {
    model: 'Model',
    session: 'Session',
    settings: 'Settings',
  };

  // Calculate global index for each command
  let globalIndex = 0;
  const commandsWithIndex = filteredCommands.map((cmd) => ({
    ...cmd,
    globalIndex: globalIndex++,
  }));

  const groupedCommands = categories
    .map((category) => ({
      category,
      label: categoryLabels[category],
      commands: commandsWithIndex.filter((cmd) => cmd.category === category),
    }))
    .filter((group) => group.commands.length > 0);

  return (
    <div
      ref={popoverRef}
      role="listbox"
      className="absolute bottom-full left-0 mb-2 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden min-w-[320px] z-50"
    >
      {groupedCommands.map((group) => (
        <div key={group.category}>
          <div className="px-3 py-1.5 text-xs text-text-secondary border-b border-border bg-bg-tertiary/50">
            {group.label}
          </div>
          {group.commands.map((command) => {
            const isSelected = command.globalIndex === selectedIndex;

            return (
              <button
                key={command.name}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(command)}
                className={clsx(
                  'w-full px-3 py-2 text-left transition-colors flex items-center justify-between gap-2',
                  isSelected
                    ? 'bg-accent-primary text-white'
                    : 'hover:bg-bg-tertiary text-text-primary'
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium">{command.label}</span>
                  <span className={clsx(
                    'text-xs truncate',
                    isSelected ? 'text-white/70' : 'text-text-secondary'
                  )}>
                    {command.description}
                  </span>
                </div>
                {command.value && (
                  <span className={clsx(
                    'text-xs flex-shrink-0',
                    isSelected ? 'text-white/70' : 'text-text-secondary'
                  )}>
                    {command.value}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function getFilteredCommands(query: string): SlashCommand[] {
  const searchTerm = query.startsWith('/') ? query.slice(1).toLowerCase() : '';
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(searchTerm) ||
    cmd.label.toLowerCase().includes(searchTerm)
  );
}
