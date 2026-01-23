import { useState, useCallback, useMemo } from 'react';
import { InputArea, type PermissionMode } from './InputArea';
import type { SessionInfo, RunnerBackend, ImageAttachment, Repository, SelectedProject, RecentProject } from '@agent-dock/shared';

export interface WelcomePageProps {
  sessions: SessionInfo[];
  isConnected: boolean;
  onSendMessage: (message: string, images?: ImageAttachment[], selectedProject?: SelectedProject | null, runnerBackend?: RunnerBackend) => void;
  onSelectSession: (sessionId: string) => void;
  /** Registered repositories for project selection */
  repositories?: Repository[];
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
  isConnected,
  onSendMessage,
  repositories = [],
  podmanAvailable = false,
  defaultRunnerBackend = 'native',
  defaultModel,
  onModelChange,
  permissionMode = 'ask',
  onPermissionModeChange,
  thinkingEnabled = false,
  onToggleThinking,
}: WelcomePageProps) {
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [runnerBackend, setRunnerBackend] = useState<RunnerBackend>(defaultRunnerBackend);

  // Extract recent projects from sessions
  const recentProjects = useMemo((): RecentProject[] => {
    const projectMap = new Map<string, RecentProject>();
    for (const session of sessions) {
      if (!session.workingDir) continue;
      const existing = projectMap.get(session.workingDir);
      if (!existing || session.createdAt > existing.lastUsed) {
        // Find associated repository if any
        const repo = repositories.find((r) => r.path === session.workingDir);
        projectMap.set(session.workingDir, {
          path: session.workingDir,
          repositoryId: repo?.id,
          repositoryName: repo?.name,
          lastUsed: session.createdAt,
        });
      }
    }
    // Sort by most recent usage
    return Array.from(projectMap.values())
      .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
      .slice(0, 10);
  }, [sessions, repositories]);

  // Handle send message from InputArea
  const handleSend = useCallback(
    (message: string, images?: ImageAttachment[]) => {
      if (message && isConnected) {
        onSendMessage(message, images, selectedProject, podmanAvailable ? runnerBackend : undefined);
      }
    },
    [isConnected, onSendMessage, selectedProject, podmanAvailable, runnerBackend]
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
              selectedProject={selectedProject}
              onProjectChange={setSelectedProject}
              repositories={repositories}
              recentProjects={recentProjects}
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
      </div>
    </div>
  );
}
