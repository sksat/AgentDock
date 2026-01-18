import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { UsageChart } from './UsageChart';
import type { GlobalUsageData } from './UsageDisplay';
import type { SessionInfo, RunnerBackend } from '@agent-dock/shared';

// Detect home directory from paths (e.g., /home/user or /Users/user)
function detectHomeDir(paths: string[]): string | null {
  for (const path of paths) {
    // Linux: /home/<user>/...
    const linuxMatch = path.match(/^(\/home\/[^/]+)/);
    if (linuxMatch) return linuxMatch[1];
    // macOS: /Users/<user>/...
    const macMatch = path.match(/^(\/Users\/[^/]+)/);
    if (macMatch) return macMatch[1];
  }
  return null;
}

// Format path for display (replace home dir with ~)
function formatPathDisplay(path: string, homeDir: string | null): string {
  if (!homeDir) return path;
  if (path.startsWith(homeDir)) {
    return '~' + path.slice(homeDir.length);
  }
  return path;
}

export interface WelcomePageProps {
  sessions: SessionInfo[];
  globalUsage: GlobalUsageData | null;
  isConnected: boolean;
  onSendMessage: (message: string, images?: undefined, workingDir?: string, runnerBackend?: RunnerBackend) => void;
  onSelectSession: (sessionId: string) => void;
  /** Whether Podman is available on the server */
  podmanAvailable?: boolean;
  /** Default runner backend (from global settings) */
  defaultRunnerBackend?: RunnerBackend;
}

export function WelcomePage({
  sessions,
  globalUsage,
  isConnected,
  onSendMessage,
  podmanAvailable = false,
  defaultRunnerBackend = 'native',
}: WelcomePageProps) {
  const [inputValue, setInputValue] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [runnerBackend, setRunnerBackend] = useState<RunnerBackend>(defaultRunnerBackend);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extract unique recent directories from sessions
  const recentDirectories = useMemo(() => {
    const dirs = new Map<string, string>(); // path -> most recent createdAt
    for (const session of sessions) {
      const existing = dirs.get(session.workingDir);
      if (!existing || session.createdAt > existing) {
        dirs.set(session.workingDir, session.createdAt);
      }
    }
    // Sort by most recent usage
    return Array.from(dirs.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([path]) => path)
      .slice(0, 10);
  }, [sessions]);

  // Detect home directory from recent directories
  const homeDir = useMemo(() => detectHomeDir(recentDirectories), [recentDirectories]);

  // Expand ~ to home directory in path
  const expandPath = useCallback(
    (path: string): string => {
      if (!homeDir) return path;
      if (path.startsWith('~/')) {
        return homeDir + path.slice(1);
      }
      if (path === '~') {
        return homeDir;
      }
      return path;
    },
    [homeDir]
  );

  // Handle send message
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed && isConnected) {
      const expandedDir = workingDir ? expandPath(workingDir) : undefined;
      onSendMessage(trimmed, undefined, expandedDir || undefined, podmanAvailable ? runnerBackend : undefined);
      setInputValue('');
    }
  }, [inputValue, isConnected, onSendMessage, workingDir, expandPath, podmanAvailable, runnerBackend]);

  // Handle key events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle directory selection from dropdown
  const handleSelectDir = useCallback((dir: string) => {
    setWorkingDir(dir);
    setIsDropdownOpen(false);
  }, []);

  return (
    <div className="flex-1 bg-bg-primary overflow-auto">
      {/* Main content - simple centered layout */}
      <div className="min-h-full flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Headline */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-text-primary">What do you want to get done?</h1>
            <p className="text-text-secondary">Enter a message to start a new session</p>
          </div>

          {/* Working directory and container mode row */}
          <div className="flex items-end gap-4">
            {/* Working directory selector */}
            <div className="relative flex-1" ref={dropdownRef}>
              <label className="text-sm font-medium text-text-secondary block mb-1.5">
                Working directory
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Default (new directory)"
                  className={clsx(
                    'w-full px-4 py-2 pr-10 rounded-lg',
                    'bg-bg-tertiary text-text-primary placeholder:text-text-secondary',
                    'border border-border',
                    'focus:outline-none focus:ring-2 focus:ring-accent-primary/50'
                  )}
                />
                {/* Dropdown arrow */}
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {/* Dropdown menu */}
              {isDropdownOpen && recentDirectories.length > 0 && (
                <div className="absolute z-10 w-full mt-1 py-1 bg-bg-secondary border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {recentDirectories.map((dir) => (
                    <button
                      key={dir}
                      onClick={() => handleSelectDir(dir)}
                      title={dir}
                      className={clsx(
                        'w-full px-4 py-2 text-left text-sm',
                        'hover:bg-bg-tertiary transition-colors',
                        workingDir === dir ? 'text-accent-primary' : 'text-text-primary'
                      )}
                    >
                      {formatPathDisplay(dir, homeDir)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Runner Backend Toggle */}
            {podmanAvailable && (
              <button
                type="button"
                onClick={() => setRunnerBackend(runnerBackend === 'native' ? 'podman' : 'native')}
                title={runnerBackend === 'podman' ? 'Running with Podman' : 'Running natively'}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-tertiary border border-border hover:bg-bg-tertiary/80 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">{runnerBackend}</span>
                </div>
                <div
                  className={clsx(
                    'w-9 h-5 rounded-full p-0.5 transition-colors',
                    runnerBackend === 'podman' ? 'bg-accent-primary' : 'bg-gray-600'
                  )}
                >
                  <div
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                      runnerBackend === 'podman' ? 'translate-x-4' : 'translate-x-0'
                    )}
                  />
                </div>
              </button>
            )}
          </div>

          {/* Large input area */}
          <div className="rounded-xl border border-border bg-bg-tertiary overflow-hidden shadow-sm">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your task..."
              disabled={!isConnected}
              rows={3}
              className={clsx(
                'w-full resize-none px-6 py-4',
                'bg-transparent text-text-primary placeholder:text-text-secondary',
                'focus:outline-none',
                'min-h-[80px] max-h-[200px]',
                'text-lg',
                !isConnected && 'opacity-50 cursor-not-allowed'
              )}
            />
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-bg-secondary/30">
              <span className="text-xs text-text-secondary">
                {isConnected ? 'Press Enter to send' : 'Connecting...'}
              </span>
              <button
                onClick={handleSend}
                disabled={!isConnected || !inputValue.trim()}
                className={clsx(
                  'px-4 py-2 rounded-lg transition-colors font-medium',
                  inputValue.trim() && isConnected
                    ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
                    : 'bg-bg-secondary text-text-secondary cursor-not-allowed'
                )}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Usage chart - with more separation */}
        {globalUsage && globalUsage.daily.length > 0 && (
          <div className="w-full max-w-4xl mt-12 pt-6 border-t border-border/30">
            <div className="text-xs text-text-secondary mb-2">Usage</div>
            <UsageChart daily={globalUsage.daily} blocks={globalUsage.blocks} height={150} />
          </div>
        )}
      </div>
    </div>
  );
}
