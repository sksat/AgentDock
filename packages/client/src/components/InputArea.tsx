import { useState, useCallback, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import clsx from 'clsx';
import { ModelSelector } from './ModelSelector';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type PermissionMode = 'ask' | 'auto-edit' | 'plan';

export interface InputAreaProps {
  onSend: (message: string) => void;
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
  thinkingEnabled?: boolean;
  onToggleThinking?: () => void;
}

export function InputArea({
  onSend,
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
  thinkingEnabled = false,
  onToggleThinking,
}: InputAreaProps) {
  const [value, setValue] = useState('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (value.trim() === '/model') {
      setValue('');
    }
  }, [onModelChange, value]);

  // Handle input change - detect /model command
  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Detect /model command
    if (newValue.trim() === '/model' && onModelChange) {
      setShowModelSelector(true);
    }
  }, [onModelChange]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !disabled && !isLoading) {
      onSend(trimmed);
      setValue('');
    }
  }, [value, onSend, disabled, isLoading]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Shift+Tab to cycle permission mode
      if (e.key === 'Tab' && e.shiftKey && onPermissionModeChange) {
        e.preventDefault();
        cyclePermissionMode();
      }
      // Tab (without Shift) to toggle thinking mode
      if (e.key === 'Tab' && !e.shiftKey && onToggleThinking) {
        e.preventDefault();
        onToggleThinking();
      }
    },
    [handleSend, onToggleThinking, onPermissionModeChange, cyclePermissionMode]
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

  return (
    <div className="border-t border-border bg-bg-secondary px-8">
      {/* Input container with rounded border */}
      <div className={clsx(
        'my-3 rounded-lg border bg-bg-tertiary overflow-hidden transition-colors',
        getModeBorderColor(permissionMode)
      )}>
        {/* Text input area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={clsx(
            'w-full resize-none px-4 py-3',
            'bg-transparent text-text-primary placeholder:text-text-secondary',
            'focus:outline-none',
            'min-h-[44px] max-h-[200px]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 text-xs text-text-secondary">
          {/* Left side - status info */}
          <div className="flex items-center gap-4">
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
            {model && (
              <div className="relative">
                {onModelChange ? (
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
                )}
                <ModelSelector
                  currentModel={model}
                  onSelectModel={handleModelSelect}
                  isOpen={showModelSelector}
                  onClose={() => setShowModelSelector(false)}
                />
              </div>
            )}

            {/* Token usage */}
            {tokenUsage && (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2a6 6 0 100 12A6 6 0 008 2zM0 8a8 8 0 1116 0A8 8 0 010 8z" />
                  <path d="M8 4v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{(tokenUsage.inputTokens + tokenUsage.outputTokens).toLocaleString()} tokens</span>
              </div>
            )}

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
            {/* Attachment button (placeholder) */}
            <button
              className="p-1.5 rounded hover:bg-bg-secondary transition-colors"
              title="Attach file"
              disabled
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

            {/* Slash command button (placeholder) */}
            <button
              className="p-1.5 rounded hover:bg-bg-secondary transition-colors text-lg font-light"
              title="Slash commands"
              disabled
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
                disabled={disabled || !value.trim()}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  value.trim() && !disabled
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
  );
}
