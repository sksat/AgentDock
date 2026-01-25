import { useState, useCallback, useRef, useEffect, type KeyboardEvent, type ChangeEvent, type ClipboardEvent } from 'react';
import clsx from 'clsx';
import { ModelSelector } from './ModelSelector';
import { PermissionModeSelector } from './PermissionModeSelector';
import { SlashCommandSuggestions, getFilteredCommands, type SlashCommand } from './SlashCommandSuggestions';
import { ProjectSelector } from './ProjectSelector';
import { RunnerBackendToggle } from './RunnerBackendToggle';
import type { ImageAttachment } from './MessageStream';
import type { RunnerBackend, Repository, SelectedProject, RecentProject } from '@agent-dock/shared';
import { calculateOccupancyRate } from '@agent-dock/shared';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type PermissionMode = 'ask' | 'auto-edit' | 'plan';

/**
 * META-SPECIFICATION: Session Start UI Parity
 * ==========================================
 * Session start mode UI MUST have full feature parity with active session UI.
 * Any feature added to InputArea for active sessions should be available in
 * session start mode, and vice versa. This ensures users have a consistent
 * experience regardless of whether they're starting a new session or
 * interacting with an existing one.
 */
export type InputAreaMode = 'default' | 'session-start';

export interface InputAreaProps {
  onSend: (message: string, images?: ImageAttachment[]) => void;
  onStreamInput?: (content: string) => void;
  onInterrupt?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  // Status bar info
  permissionMode?: string;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  model?: string;
  onModelChange?: (model: string) => void;
  sessionId?: string;
  tokenUsage?: TokenUsage;
  /** Context window size for the current model (from CLI result or fallback) */
  contextWindow?: number;
  thinkingEnabled?: boolean;
  onToggleThinking?: () => void;
  // Slash command callbacks
  onNewSession?: () => void;
  onClearMessages?: () => void;
  onCompact?: () => void;
  onShowContext?: () => void;
  onShowCost?: () => void;
  onShowConfig?: () => void;
  onShowHelp?: () => void;
  // Session start mode
  mode?: InputAreaMode;
  /** Selected project for session creation */
  selectedProject?: SelectedProject | null;
  /** Callback when project selection changes */
  onProjectChange?: (project: SelectedProject | null) => void;
  /** Registered repositories for project selection */
  repositories?: Repository[];
  /** Recent projects from session history */
  recentProjects?: RecentProject[];
  runnerBackend?: RunnerBackend;
  onRunnerBackendChange?: (backend: RunnerBackend) => void;
  podmanAvailable?: boolean;
  /** Default value for the input (used to restore input on error) */
  defaultValue?: string;
  /** Callback when input value changes */
  onValueChange?: (value: string) => void;
}

export function InputArea({
  onSend,
  onStreamInput,
  onInterrupt,
  disabled = false,
  isLoading = false,
  placeholder = 'Type a message...',
  permissionMode = 'ask',
  onPermissionModeChange,
  model,
  onModelChange,
  sessionId,
  tokenUsage,
  contextWindow: contextWindowProp,
  thinkingEnabled = false,
  onToggleThinking,
  onNewSession,
  onClearMessages,
  onCompact,
  onShowContext,
  onShowCost,
  onShowConfig,
  onShowHelp,
  // Session start mode props
  mode = 'default',
  selectedProject = null,
  onProjectChange,
  repositories = [],
  recentProjects = [],
  runnerBackend = 'native',
  onRunnerBackendChange,
  podmanAvailable = false,
  defaultValue,
  onValueChange,
}: InputAreaProps) {
  // Use defaultValue as initial value; to reset with new defaultValue, use key prop on InputArea
  const [value, setValue] = useState(defaultValue ?? '');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showPermissionModeSelector, setShowPermissionModeSelector] = useState(false);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Permission mode cycling: ask -> auto-edit -> plan -> ask
  const cyclePermissionMode = useCallback(() => {
    if (!onPermissionModeChange) return;
    const modes: PermissionMode[] = ['ask', 'auto-edit', 'plan'];
    const currentIndex = modes.indexOf(permissionMode as PermissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    onPermissionModeChange(modes[nextIndex]);
  }, [permissionMode, onPermissionModeChange]);

  // Handle model selection
  const handleModelSelect = useCallback((modelId: string) => {
    if (onModelChange) {
      onModelChange(modelId);
    }
    setShowModelSelector(false);
    // Clear /model command if it was used
    if (value.trim().startsWith('/')) {
      setValue('');
    }
  }, [onModelChange, value]);

  // Handle permission mode selection
  const handlePermissionModeSelect = useCallback((mode: PermissionMode) => {
    if (onPermissionModeChange) {
      onPermissionModeChange(mode);
    }
    setShowPermissionModeSelector(false);
  }, [onPermissionModeChange]);

  // Handle slash command selection - execute command or insert into input
  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    setShowSlashCommands(false);

    // Commands that should execute immediately on selection (UI pickers or toggles)
    // Note: 'compact' is excluded - user should confirm before compacting
    const immediateCommands = ['model', 'permission', 'thinking'];

    if (immediateCommands.includes(command.name)) {
      // Execute the command immediately (show UI picker or toggle)
      setValue('');
      switch (command.name) {
        case 'model':
          setTimeout(() => setShowModelSelector(true), 0);
          break;
        case 'permission':
          setTimeout(() => setShowPermissionModeSelector(true), 0);
          break;
        case 'thinking':
          onToggleThinking?.();
          break;
      }
    } else {
      // For other commands, insert into input with trailing space
      const fullCommand = command.prefix ? `/${command.prefix}:${command.name} ` : `/${command.name} `;
      setValue(fullCommand);
      textareaRef.current?.focus();
    }
  }, [onToggleThinking]);

  // Execute slash command
  const executeSlashCommand = useCallback((commandText: string) => {
    const trimmed = commandText.trim().toLowerCase();
    if (!trimmed.startsWith('/')) return false;

    const commandName = trimmed.slice(1); // Remove leading /

    switch (commandName) {
      case 'model':
        setValue('');
        setTimeout(() => setShowModelSelector(true), 0);
        return true;
      case 'permission':
        setValue('');
        setTimeout(() => setShowPermissionModeSelector(true), 0);
        return true;
      case 'new':
        setValue('');
        onNewSession?.();
        return true;
      case 'clear':
        setValue('');
        onClearMessages?.();
        return true;
      case 'compact':
        setValue('');
        onCompact?.();
        return true;
      case 'context':
        setValue('');
        onShowContext?.();
        return true;
      case 'cost':
        setValue('');
        onShowCost?.();
        return true;
      case 'config':
        setValue('');
        onShowConfig?.();
        return true;
      case 'help':
        setValue('');
        onShowHelp?.();
        return true;
      case 'thinking':
        setValue('');
        onToggleThinking?.();
        return true;
      default:
        return false;
    }
  }, [onNewSession, onClearMessages, onCompact, onShowContext, onShowCost, onShowConfig, onShowHelp, onToggleThinking]);

  // Handle input change - detect slash commands
  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onValueChange?.(newValue);

    // Detect slash command at the start
    if (newValue.startsWith('/') && !newValue.includes(' ')) {
      const filteredCommands = getFilteredCommands(newValue);
      if (filteredCommands.length > 0) {
        setShowSlashCommands(true);
        setSlashCommandIndex(0);
      } else {
        setShowSlashCommands(false);
      }
    } else {
      setShowSlashCommands(false);
    }
  }, [onValueChange]);

  // Handle image file processing
  const processImageFile = useCallback((file: File): Promise<ImageAttachment | null> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Extract base64 data (remove data:image/xxx;base64, prefix)
        const base64Data = result.split(',')[1];
        const mediaType = file.type as ImageAttachment['mediaType'];

        resolve({
          type: 'image',
          data: base64Data,
          mediaType,
          name: file.name,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  // Handle paste event for images
  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const imageAttachment = await processImageFile(file);
          if (imageAttachment) {
            setAttachedImages((prev) => [...prev, imageAttachment]);
          }
        }
        break;
      }
    }
  }, [processImageFile]);

  // Handle file input change
  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of files) {
      const imageAttachment = await processImageFile(file);
      if (imageAttachment) {
        setAttachedImages((prev) => [...prev, imageAttachment]);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processImageFile]);

  // Remove attached image
  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    const hasContent = trimmed || attachedImages.length > 0;

    if (hasContent && !disabled && !isLoading) {
      // Don't send slash commands as messages
      if (trimmed.startsWith('/')) {
        return;
      }
      onSend(trimmed, attachedImages.length > 0 ? attachedImages : undefined);
      setValue('');
      setAttachedImages([]);
    }
  }, [value, attachedImages, onSend, disabled, isLoading]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle slash command navigation (suggestions are open)
      if (showSlashCommands) {
        const filteredCommands = getFilteredCommands(value);
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashCommandIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashCommandIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (filteredCommands[slashCommandIndex]) {
            handleSlashCommandSelect({
              ...filteredCommands[slashCommandIndex],
              value: filteredCommands[slashCommandIndex].name === 'model' ? model : undefined,
            });
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowSlashCommands(false);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          // Tab also selects the current suggestion (like Enter)
          if (filteredCommands[slashCommandIndex]) {
            handleSlashCommandSelect({
              ...filteredCommands[slashCommandIndex],
              value: filteredCommands[slashCommandIndex].name === 'model' ? model : undefined,
            });
          }
          return;
        }
      }

      // Enter to send or execute slash command, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Check if it's a slash command (no suggestions open = complete command)
        if (value.trim().startsWith('/')) {
          executeSlashCommand(value);
        } else if (isLoading && onStreamInput && value.trim() && attachedImages.length === 0) {
          // During streaming, send additional input (only text, no images - PTY mode only)
          onStreamInput(value.trim());
          setValue('');
        } else {
          handleSend();
        }
      }
      // Shift+Tab to cycle permission mode
      if (e.key === 'Tab' && e.shiftKey && onPermissionModeChange) {
        e.preventDefault();
        cyclePermissionMode();
      }
    },
    [handleSend, executeSlashCommand, onPermissionModeChange, cyclePermissionMode, showSlashCommands, value, slashCommandIndex, handleSlashCommandSelect, model, isLoading, onStreamInput, attachedImages]
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Format permission mode for display
  const formatPermissionMode = (mode: string) => {
    switch (mode) {
      case 'ask':
      case 'default':
        return 'Ask before edits';
      case 'auto-edit':
        return 'Edit automatically';
      case 'plan':
        return 'Plan mode';
      case 'full-auto':
        return 'Full auto';
      default:
        return mode;
    }
  };

  // Get icon for permission mode
  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'ask':
      case 'default':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        );
      case 'auto-edit':
        return <span className="text-sm font-bold">▶▶</span>;
      case 'plan':
        return <span className="text-sm font-bold">⏸</span>;
      case 'full-auto':
        return <span className="text-sm font-bold">⚡</span>;
      default:
        return <span className="text-sm">▶</span>;
    }
  };

  // Get border color class for permission mode
  const getModeBorderColor = (mode: string) => {
    switch (mode) {
      case 'ask':
      case 'default':
        return 'border-orange-400/70';
      case 'auto-edit':
        return 'border-yellow-500/70';
      case 'plan':
        return 'border-accent-primary/70';
      case 'full-auto':
        return 'border-accent-success/70';
      default:
        return 'border-border';
    }
  };

  // Get icon color class for permission mode
  const getModeIconColor = (mode: string) => {
    switch (mode) {
      case 'ask':
      case 'default':
        return 'text-orange-400';
      case 'auto-edit':
        return 'text-yellow-500';
      case 'plan':
        return 'text-accent-primary';
      case 'full-auto':
        return 'text-accent-success';
      default:
        return 'text-text-secondary';
    }
  };

  // Format model name for display
  const formatModel = (modelName?: string) => {
    if (!modelName) return null;
    // Extract short name from model ID
    if (modelName.includes('opus')) return 'opus';
    if (modelName.includes('sonnet')) return 'sonnet';
    if (modelName.includes('haiku')) return 'haiku';
    return modelName.split('-').slice(0, 2).join('-');
  };

  // Format session ID for display (first 8 chars)
  const formatSessionId = (id?: string) => {
    if (!id) return null;
    return id.substring(0, 8);
  };

  // Handle slash button click
  const handleSlashButtonClick = useCallback(() => {
    if (!value.startsWith('/')) {
      setValue('/');
      setShowSlashCommands(true);
      setSlashCommandIndex(0);
      textareaRef.current?.focus();
    }
  }, [value]);

  return (
    <div className={clsx(
      'border-t border-border bg-bg-secondary',
      mode === 'session-start' ? 'px-4' : 'px-8'
    )}>
      {/* Input container with rounded border */}
      <div className={clsx(
        'my-3 rounded-lg border bg-bg-tertiary transition-colors relative',
        getModeBorderColor(permissionMode)
      )}>
        {/* Slash command suggestions */}
        <SlashCommandSuggestions
          query={value}
          currentModel={model}
          permissionMode={permissionMode}
          thinkingEnabled={thinkingEnabled}
          selectedIndex={slashCommandIndex}
          onSelect={handleSlashCommandSelect}
          onClose={() => setShowSlashCommands(false)}
          onToggleThinking={onToggleThinking}
          isOpen={showSlashCommands}
        />

        {/* Permission mode selector (triggered by /permission) */}
        {showPermissionModeSelector && (
          <div className="absolute bottom-full left-0 mb-2 z-50">
            <PermissionModeSelector
              currentMode={permissionMode}
              onSelectMode={handlePermissionModeSelect}
              isOpen={showPermissionModeSelector}
              onClose={() => setShowPermissionModeSelector(false)}
            />
          </div>
        )}

        {/* Attached images preview */}
        {attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachedImages.map((img, idx) => (
              <div
                key={idx}
                className="relative group rounded-lg overflow-hidden border border-border bg-bg-secondary"
              >
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name ?? `Attached image ${idx + 1}`}
                  className="w-16 h-16 object-cover"
                />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-bg-primary/80 text-text-secondary hover:text-text-primary hover:bg-bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text input area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={mode === 'session-start' ? 6 : 1}
          className={clsx(
            'w-full resize-none px-4 py-3',
            'bg-transparent text-text-primary placeholder:text-text-secondary',
            'focus:outline-none',
            mode === 'session-start' ? 'min-h-[160px] max-h-[400px]' : 'min-h-[44px] max-h-[200px]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />

        {/* Status bar - two rows in session-start mode */}
        <div className="border-t border-border/50 text-xs text-text-secondary">
          {/* Row 1: Session-start only items (project selector, runner backend) */}
          {mode === 'session-start' && (
            <div className="flex items-center gap-3 px-3 pt-1.5 pb-0.5">
              {/* Project selector */}
              <div className="relative">
                <ProjectSelector
                  selectedProject={selectedProject ?? null}
                  onChange={onProjectChange ?? (() => {})}
                  repositories={repositories}
                  recentProjects={recentProjects}
                  disabled={disabled}
                  className="min-w-[180px]"
                />
              </div>

              {/* Runner backend toggle */}
              {podmanAvailable && (
                <RunnerBackendToggle
                  value={runnerBackend}
                  onChange={onRunnerBackendChange ?? (() => {})}
                  podmanAvailable={podmanAvailable}
                  disabled={disabled}
                />
              )}
            </div>
          )}

          {/* Row 2: Always-needed items */}
          <div className={`flex items-center justify-between px-3 ${mode === 'session-start' ? 'pt-0.5 pb-1.5' : 'py-2'}`}>
            {/* Left side - status info */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Attachment button */}
              <button
                className="p-1.5 rounded hover:bg-bg-secondary transition-colors"
                title="Attach image"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
              </button>

              {/* Permission mode */}
              {onPermissionModeChange ? (
                <button
                  onClick={cyclePermissionMode}
                  className="flex items-center gap-1.5 hover:bg-bg-tertiary px-2 py-1 -mx-2 -my-1 rounded transition-colors"
                  aria-label={formatPermissionMode(permissionMode)}
                >
                  <span className={getModeIconColor(permissionMode)}>{getModeIcon(permissionMode)}</span>
                  <span>{formatPermissionMode(permissionMode)}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className={getModeIconColor(permissionMode)}>{getModeIcon(permissionMode)}</span>
                  <span>{formatPermissionMode(permissionMode)}</span>
                </div>
              )}

              {/* Model info */}
              <div className="relative">
                {model ? (
                  onModelChange ? (
                    <button
                      onClick={() => setShowModelSelector(!showModelSelector)}
                      className="flex items-center gap-1.5 hover:bg-bg-tertiary px-2 py-1 -mx-2 -my-1 rounded transition-colors"
                      aria-label={formatModel(model) ?? model}
                    >
                      <span className="text-text-secondary">&lt;/&gt;</span>
                      <span>
                        {formatModel(model)}
                        {sessionId && ` (${formatSessionId(sessionId)})`}
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-secondary">&lt;/&gt;</span>
                      <span>
                        {formatModel(model)}
                        {sessionId && ` (${formatSessionId(sessionId)})`}
                      </span>
                    </div>
                  )
                ) : onModelChange ? (
                  <button
                    onClick={() => setShowModelSelector(!showModelSelector)}
                    className="flex items-center gap-1.5 hover:bg-bg-tertiary px-2 py-1 -mx-2 -my-1 rounded transition-colors"
                    aria-label="Select model"
                  >
                    <span className="text-text-secondary">&lt;/&gt;</span>
                    <span>Select model</span>
                  </button>
                ) : null}
                {onModelChange && (
                  <ModelSelector
                    currentModel={model ?? ''}
                    onSelectModel={handleModelSelect}
                    isOpen={showModelSelector}
                    onClose={() => setShowModelSelector(false)}
                  />
                )}
              </div>

              {/* Context window usage */}
              {tokenUsage && (() => {
                const occupancy = calculateOccupancyRate(
                  tokenUsage.inputTokens,
                  model,
                  contextWindowProp
                );

                // Unknown model: simple token display without percentage
                if (occupancy === null) {
                  return (
                    <div className="flex items-center gap-1.5">
                      <span>{tokenUsage.inputTokens.toLocaleString()} tokens</span>
                    </div>
                  );
                }

                // Color based on occupancy level
                const colorClass = occupancy >= 80
                  ? 'text-accent-danger'
                  : occupancy >= 60
                    ? 'text-accent-warning'
                    : 'text-text-secondary';

                // SVG pie chart calculation
                const radius = 6;
                const circumference = 2 * Math.PI * radius;
                const fillLength = (occupancy / 100) * circumference;
                const emptyLength = circumference - fillLength;

                return (
                  <div className={clsx("flex items-center gap-1.5", colorClass)}>
                    <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
                      {/* Background circle */}
                      <circle
                        cx="8"
                        cy="8"
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        opacity="0.2"
                      />
                      {/* Filled portion */}
                      <circle
                        cx="8"
                        cy="8"
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${fillLength} ${emptyLength}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>{Math.round(occupancy)}% | {tokenUsage.inputTokens.toLocaleString()} tokens</span>
                  </div>
                );
              })()}

              {/* Thinking mode indicator */}
              {thinkingEnabled && (
                <div className="flex items-center gap-1.5 text-accent-warning">
                  <span>💭</span>
                  <span>Thinking</span>
                </div>
              )}
            </div>

            {/* Right side - action buttons */}
            <div className="flex items-center gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Slash command button */}
              <button
                className="p-1.5 rounded hover:bg-bg-secondary transition-colors text-lg font-light"
                title="Slash commands"
                onClick={handleSlashButtonClick}
              >
                /
              </button>

              {/* Send/Stop button */}
              {isLoading ? (
                <button
                  onClick={onInterrupt}
                  className="p-1.5 rounded bg-accent-danger/20 text-accent-danger hover:bg-accent-danger/30 transition-colors"
                  title="Stop"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={disabled || (!value.trim() && attachedImages.length === 0) || value.trim().startsWith('/')}
                  className={clsx(
                    'p-1.5 rounded transition-colors',
                    (value.trim() || attachedImages.length > 0) && !disabled && !value.trim().startsWith('/')
                      ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
                      : 'bg-bg-secondary text-text-secondary'
                  )}
                  title="Send (Enter)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19V5m0 0l-7 7m7-7l7 7"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
