import { useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';

export type SlashCommandCategory = 'session' | 'model' | 'context' | 'settings' | 'custom';

export interface SlashCommand {
  name: string;
  label: string;
  description: string;
  category: SlashCommandCategory;
  value?: string;
  prefix?: string; // For custom commands: 'project' or 'user'
}

// Built-in slash commands based on Claude Code CLI
const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  // Session management
  { name: 'new', label: 'New session', description: 'Create a new chat session', category: 'session' },
  { name: 'clear', label: 'Clear messages', description: 'Clear current session messages', category: 'session' },
  { name: 'compact', label: 'Compact history', description: 'Summarize conversation to save context', category: 'session' },

  // Model
  { name: 'model', label: 'Switch model...', description: 'Change the AI model', category: 'model' },

  // Context & Usage
  { name: 'context', label: 'Show context', description: 'Display token usage and context window', category: 'context' },
  { name: 'cost', label: 'Show cost', description: 'Display session cost and usage stats', category: 'context' },

  // Settings
  { name: 'permission', label: 'Permission mode...', description: 'Change permission mode', category: 'settings' },
  { name: 'thinking', label: 'Toggle thinking', description: 'Enable/disable extended thinking mode', category: 'settings' },
  { name: 'config', label: 'Configuration', description: 'View and edit settings', category: 'settings' },
  { name: 'help', label: 'Help', description: 'Show all available commands', category: 'settings' },
];

export interface SlashCommandSuggestionsProps {
  query: string;
  currentModel?: string;
  permissionMode?: string;
  thinkingEnabled?: boolean;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  isOpen: boolean;
  customCommands?: SlashCommand[]; // Custom commands from project or user
}

export function SlashCommandSuggestions({
  query,
  currentModel,
  permissionMode,
  thinkingEnabled,
  selectedIndex,
  onSelect,
  onClose,
  isOpen,
  customCommands = [],
}: SlashCommandSuggestionsProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Combine built-in and custom commands
  const allCommands = [...BUILTIN_SLASH_COMMANDS, ...customCommands];

  // Filter commands based on query (without the leading /)
  const searchTerm = query.startsWith('/') ? query.slice(1).toLowerCase() : '';
  const filteredCommands = allCommands.filter((cmd) => {
    // For custom commands with prefix, match with prefix (e.g., "project:fix")
    const fullName = cmd.prefix ? `${cmd.prefix}:${cmd.name}` : cmd.name;
    return fullName.toLowerCase().startsWith(searchTerm) ||
      cmd.name.toLowerCase().startsWith(searchTerm) ||
      cmd.label.toLowerCase().includes(searchTerm);
  }).map((cmd) => ({
    ...cmd,
    value: cmd.name === 'model' ? currentModel :
           cmd.name === 'permission' ? permissionMode :
           cmd.name === 'thinking' ? (thinkingEnabled ? 'ON' : 'OFF') :
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
  const categories: SlashCommandCategory[] = ['session', 'model', 'context', 'settings', 'custom'];
  const categoryLabels: Record<SlashCommandCategory, string> = {
    session: 'Session',
    model: 'Model',
    context: 'Context & Usage',
    settings: 'Settings',
    custom: 'Custom Commands',
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
                key={command.prefix ? `${command.prefix}:${command.name}` : command.name}
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
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{command.label}</span>
                    {command.prefix && (
                      <span className={clsx(
                        'text-xs px-1.5 py-0.5 rounded',
                        isSelected ? 'bg-white/20' : 'bg-bg-tertiary'
                      )}>
                        {command.prefix}
                      </span>
                    )}
                  </div>
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

export function getFilteredCommands(query: string, customCommands: SlashCommand[] = []): SlashCommand[] {
  const allCommands = [...BUILTIN_SLASH_COMMANDS, ...customCommands];
  const searchTerm = query.startsWith('/') ? query.slice(1).toLowerCase() : '';
  return allCommands.filter((cmd) => {
    const fullName = cmd.prefix ? `${cmd.prefix}:${cmd.name}` : cmd.name;
    return fullName.toLowerCase().startsWith(searchTerm) ||
      cmd.name.toLowerCase().startsWith(searchTerm) ||
      cmd.label.toLowerCase().includes(searchTerm);
  });
}

// Export built-in commands for external use
export const SLASH_COMMANDS = BUILTIN_SLASH_COMMANDS;
