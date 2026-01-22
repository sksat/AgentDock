import { useState, useCallback, useMemo } from 'react';
import { UsageChart } from './UsageChart';
import { InputArea, type PermissionMode } from './InputArea';
import type { GlobalUsageData } from './UsageDisplay';
import type { SessionInfo, RunnerBackend, ImageAttachment } from '@agent-dock/shared';

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

export interface WelcomePageProps {
  sessions: SessionInfo[];
  globalUsage: GlobalUsageData | null;
  isConnected: boolean;
  onSendMessage: (message: string, images?: ImageAttachment[], workingDir?: string, runnerBackend?: RunnerBackend) => void;
  onSelectSession: (sessionId: string) => void;
  /** Whether Podman is available on the server */
  podmanAvailable?: boolean;
  /** Default runner backend (from global settings) */
  defaultRunnerBackend?: RunnerBackend;
  /** Default model from global settings */
  defaultModel?: string;
  /** Callback when model is changed */
  onModelChange?: (model: string) => void;
  /** Current permission mode */
  permissionMode?: PermissionMode;
  /** Callback when permission mode is changed */
  onPermissionModeChange?: (mode: PermissionMode) => void;
  /** Thinking mode enabled */
  thinkingEnabled?: boolean;
  /** Callback when thinking is toggled */
  onToggleThinking?: () => void;
}

/**
 * META-SPECIFICATION: Session Start UI Parity
 * ==========================================
 * Session start UI MUST have full feature parity with active session UI.
 * WelcomePage uses InputArea in session-start mode to ensure this parity.
 * Any feature added to InputArea should be automatically available here.
 */
export function WelcomePage({
  sessions,
  globalUsage,
  isConnected,
  onSendMessage,
  podmanAvailable = false,
  defaultRunnerBackend = 'native',
  defaultModel,
  onModelChange,
  permissionMode = 'ask',
  onPermissionModeChange,
  thinkingEnabled = false,
  onToggleThinking,
}: WelcomePageProps) {
  const [workingDir, setWorkingDir] = useState('');
  const [runnerBackend, setRunnerBackend] = useState<RunnerBackend>(defaultRunnerBackend);

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

  // Handle send message from InputArea
  const handleSend = useCallback(
    (message: string, images?: ImageAttachment[]) => {
      if (message && isConnected) {
        const expandedDir = workingDir ? expandPath(workingDir) : undefined;
        onSendMessage(message, images, expandedDir || undefined, podmanAvailable ? runnerBackend : undefined);
      }
    },
    [isConnected, onSendMessage, workingDir, expandPath, podmanAvailable, runnerBackend]
  );

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

          {/* InputArea in session-start mode */}
          <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden shadow-sm">
            <InputArea
              mode="session-start"
              onSend={handleSend}
              disabled={!isConnected}
              placeholder="Describe your task..."
              workingDir={workingDir}
              onWorkingDirChange={setWorkingDir}
              recentDirectories={recentDirectories}
              runnerBackend={runnerBackend}
              onRunnerBackendChange={setRunnerBackend}
              podmanAvailable={podmanAvailable}
              model={defaultModel}
              onModelChange={onModelChange}
              permissionMode={permissionMode}
              onPermissionModeChange={onPermissionModeChange}
              thinkingEnabled={thinkingEnabled}
              onToggleThinking={onToggleThinking}
            />
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
