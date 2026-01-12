import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSession } from './hooks/useSession';
import { AskUserQuestion, LoadingIndicator, MessageStream, InputArea, NewSessionModal, PermissionRequest, Sidebar } from './components';
import type { SidebarSession } from './components';
import './App.css';

const WS_URL = import.meta.env.DEV ? 'ws://localhost:3001/ws' : `ws://${window.location.host}/ws`;

// Format large numbers with K/M suffixes
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

// Pricing per million tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4-5-20251101': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  // Defaults for unknown models
  default: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

// Calculate estimated cost from usage
function calculateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheWriteTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model ?? ''] ?? MODEL_PRICING.default;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead;
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

// Format cost
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function App() {
  const {
    sessions,
    activeSessionId,
    session,
    sessionsLoaded,
    messages,
    pendingPermission,
    pendingQuestion,
    isLoading,
    error,
    systemInfo,
    usageInfo,
    globalUsage,
    listSessions,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    sendMessage,
    respondToPermission,
    respondToQuestion,
    interrupt,
    setPermissionMode,
    setModel,
    handleServerMessage,
    setSend,
  } = useSession();

  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);

  const { isConnected, send } = useWebSocket(WS_URL, {
    onMessage: handleServerMessage,
    onConnect: () => {
      console.log('Connected to server');
    },
    onDisconnect: () => {
      console.log('Disconnected from server');
    },
  });

  // Connect session send function to WebSocket
  useEffect(() => {
    setSend(send);
  }, [send, setSend]);

  // Request session list on connect, then create one if none exists
  useEffect(() => {
    if (isConnected) {
      listSessions();
    }
  }, [isConnected, listSessions]);

  // Auto-select first session if sessions exist (but don't auto-create)
  useEffect(() => {
    if (isConnected && sessionsLoaded && activeSessionId === null && sessions.length > 0) {
      selectSession(sessions[0].id);
    }
  }, [isConnected, sessionsLoaded, sessions, activeSessionId, selectSession]);

  const handleAllow = useCallback(
    (requestId: string, updatedInput: unknown) => {
      respondToPermission(requestId, { behavior: 'allow', updatedInput });
    },
    [respondToPermission]
  );

  const handleDeny = useCallback(
    (requestId: string, message: string) => {
      respondToPermission(requestId, { behavior: 'deny', message });
    },
    [respondToPermission]
  );

  const handleToggleThinking = useCallback(() => {
    setThinkingEnabled((prev) => !prev);
  }, []);

  // Convert SessionInfo to SidebarSession
  const sidebarSessions: SidebarSession[] = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    createdAt: s.createdAt,
  }));

  return (
    <div className="h-screen flex">
      {/* New Session Modal */}
      <NewSessionModal
        isOpen={isNewSessionModalOpen}
        onClose={() => setIsNewSessionModalOpen(false)}
        onCreateSession={createSession}
      />

      {/* Sidebar */}
      <Sidebar
        sessions={sidebarSessions}
        activeSessionId={activeSessionId}
        globalUsage={globalUsage}
        onSelectSession={selectSession}
        onCreateSession={() => setIsNewSessionModalOpen(true)}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="px-4 py-3 bg-bg-secondary border-b border-border flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            {session?.name ?? 'Claude Bridge'}
          </h1>
          <div className="flex items-center gap-4">
            {/* Session usage */}
            {usageInfo && (
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="font-medium text-accent-primary" title="Estimated cost">
                  {formatCost(calculateCost(
                    systemInfo?.model,
                    usageInfo.inputTokens,
                    usageInfo.outputTokens,
                    usageInfo.cacheReadInputTokens,
                    usageInfo.cacheCreationInputTokens
                  ))}
                </span>
                <span title="Input tokens">↓{formatTokens(usageInfo.inputTokens + (usageInfo.cacheReadInputTokens ?? 0))}</span>
                <span title="Output tokens">↑{formatTokens(usageInfo.outputTokens)}</span>
              </div>
            )}
            {/* Connection status */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-accent-success' : 'bg-accent-danger'
                }`}
              />
              <span className="text-sm text-text-secondary">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-accent-danger/10 border-b border-accent-danger text-accent-danger">
            {error}
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <MessageStream messages={messages} />

          {/* Pending permission request */}
          {pendingPermission && (
            <div className="p-4 border-t border-border">
              <PermissionRequest
                requestId={pendingPermission.requestId}
                toolName={pendingPermission.toolName}
                input={pendingPermission.input}
                onAllow={handleAllow}
                onDeny={handleDeny}
              />
            </div>
          )}

          {/* Pending question */}
          {pendingQuestion && (
            <div className="p-4 border-t border-border">
              <AskUserQuestion
                requestId={pendingQuestion.requestId}
                questions={pendingQuestion.questions}
                onSubmit={respondToQuestion}
              />
            </div>
          )}

          {/* Loading indicator with vibing message */}
          {isLoading && !pendingPermission && !pendingQuestion && (
            <LoadingIndicator />
          )}

          {/* Input area with status bar */}
          <InputArea
            onSend={sendMessage}
            onInterrupt={interrupt}
            disabled={!isConnected}
            isLoading={isLoading}
            permissionMode={systemInfo?.permissionMode ?? 'ask'}
            onPermissionModeChange={setPermissionMode}
            model={systemInfo?.model}
            onModelChange={setModel}
            sessionId={session?.claudeSessionId}
            tokenUsage={usageInfo ? { inputTokens: usageInfo.inputTokens, outputTokens: usageInfo.outputTokens } : undefined}
            thinkingEnabled={thinkingEnabled}
            onToggleThinking={handleToggleThinking}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
