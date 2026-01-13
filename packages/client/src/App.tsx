import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSession } from './hooks/useSession';
import { useNavigation } from './hooks/useNavigation';
import { AskUserQuestion, LoadingIndicator, MessageStream, InputArea, NewSessionModal, PermissionRequest, Sidebar, Toast, WelcomePage, NavRail, SettingsPage, UsagePage } from './components';
import { BrowserView } from './components/BrowserView';
import { ViewToggle, type SessionView } from './components/ViewToggle';
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

// Shorten model name for display
function shortModelName(modelName: string): string {
  if (modelName.includes('opus')) return 'opus';
  if (modelName.includes('sonnet')) return 'sonnet';
  if (modelName.includes('haiku')) return 'haiku';
  return modelName.split('-')[0];
}

function App() {
  const { currentView, navigate } = useNavigation();
  const {
    sessions,
    activeSessionId,
    session,
    messages,
    pendingPermission,
    pendingQuestion,
    isLoading,
    loadingReason,
    error,
    systemInfo,
    usageInfo,
    modelUsage,
    globalUsage,
    screencast,
    listSessions,
    createSession,
    selectSession,
    deselectSession,
    deleteSession,
    renameSession,
    sendMessage,
    clearMessages,
    compactSession,
    respondToPermission,
    respondToQuestion,
    interrupt,
    setPermissionMode,
    setModel,
    startScreencast,
    stopScreencast,
    handleServerMessage,
    setSend,
  } = useSession();

  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const [sessionView, setSessionView] = useState<SessionView>('stream');

  const showToast = useCallback((title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ title, message, type });
  }, []);

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

  // Request session list on connect
  useEffect(() => {
    if (isConnected) {
      listSessions();
    }
  }, [isConnected, listSessions]);

  // Show toast when error occurs
  useEffect(() => {
    if (error) {
      showToast('Error', error, 'error');
    }
  }, [error, showToast]);

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

  // Handle model change (server handles logging)
  const handleModelChange = useCallback((newModel: string) => {
    setModel(newModel);
  }, [setModel]);

  // Convert SessionInfo to SidebarSession
  const sidebarSessions: SidebarSession[] = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    createdAt: s.createdAt,
    usage: s.usage,
  }));

  // Get page title based on current view and session
  const pageTitle = currentView === 'settings'
    ? 'Settings'
    : currentView === 'usage'
      ? 'Usage'
      : activeSessionId && session
        ? session.name
        : 'Home';

  return (
    <div className="h-screen flex flex-col">
      {/* Global Header */}
      <header className="h-12 px-4 bg-bg-secondary border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              navigate('sessions');
              deselectSession();
            }}
            className="text-base font-semibold text-text-primary hover:text-accent-primary transition-colors"
          >
            AgentDock
          </button>
          <span className="text-text-secondary">/</span>
          <span className="text-sm text-text-secondary">{pageTitle}</span>
        </div>
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
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* New Session Modal */}
        <NewSessionModal
          isOpen={isNewSessionModalOpen}
          onClose={() => setIsNewSessionModalOpen(false)}
          onCreateSession={createSession}
        />

        {/* Navigation Rail - always visible */}
        <NavRail activeView={currentView} onNavigate={navigate} />

        {/* Sidebar - only visible in sessions view */}
        {currentView === 'sessions' && (
          <Sidebar
            sessions={sidebarSessions}
            activeSessionId={activeSessionId}
            globalUsage={globalUsage}
            onSelectSession={selectSession}
            onCreateSession={() => setIsNewSessionModalOpen(true)}
            onDeleteSession={deleteSession}
            onRenameSession={renameSession}
          />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Settings page */}
          {currentView === 'settings' && <SettingsPage />}

          {/* Usage page */}
          {currentView === 'usage' && <UsagePage globalUsage={globalUsage} />}

          {/* Sessions view */}
          {currentView === 'sessions' && (
            activeSessionId === null ? (
              /* Welcome page when no session is selected */
              <WelcomePage
                sessions={sessions}
                globalUsage={globalUsage}
                isConnected={isConnected}
                onSendMessage={sendMessage}
                onSelectSession={selectSession}
              />
            ) : (
          <>
            {/* Session usage bar with view toggle */}
            <div className="px-4 py-2 bg-bg-secondary/50 border-b border-border flex items-center justify-between gap-4 text-xs text-text-secondary">
              <ViewToggle
                currentView={sessionView}
                onToggle={setSessionView}
                browserActive={screencast?.active ?? false}
                onStartBrowser={startScreencast}
                onStopBrowser={stopScreencast}
              />
              {usageInfo && (
              <div className="flex items-center gap-4">
                <span className="font-medium text-accent-primary" title="Session total cost">
                  {formatCost(calculateCost(
                    systemInfo?.model,
                    usageInfo.inputTokens,
                    usageInfo.outputTokens,
                    usageInfo.cacheReadInputTokens,
                    usageInfo.cacheCreationInputTokens
                  ))}
                </span>
                {modelUsage && modelUsage.length > 0 && (
                  <span title="Cost by model">
                    ({modelUsage.map((m, i) => (
                      <span key={m.modelName}>
                        {i > 0 && ' / '}
                        {shortModelName(m.modelName)}: {formatCost(calculateCost(
                          m.modelName,
                          m.inputTokens,
                          m.outputTokens,
                          m.cacheReadTokens,
                          m.cacheCreationTokens
                        ))}
                      </span>
                    ))})
                  </span>
                )}
                <span title="Input tokens">↓{formatTokens(usageInfo.inputTokens + (usageInfo.cacheReadInputTokens ?? 0))}</span>
                <span title="Output tokens">↑{formatTokens(usageInfo.outputTokens)}</span>
              </div>
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div className="px-4 py-2 bg-accent-danger/10 border-b border-accent-danger text-accent-danger">
                {error}
              </div>
            )}

            {/* Main content */}
            <main className="flex-1 flex flex-col overflow-hidden">
              {/* Messages or Browser view based on sessionView */}
              {sessionView === 'stream' ? (
                <MessageStream messages={messages} />
              ) : (
                <BrowserView
                  frame={screencast?.frame ?? null}
                  isActive={screencast?.active ?? false}
                  browserUrl={screencast?.browserUrl}
                  onMouseClick={(pos) => {
                    // TODO: Send browser_click to server
                    console.log('Browser click:', pos);
                  }}
                  onKeyPress={(key) => {
                    // TODO: Send browser_key_press to server
                    console.log('Browser key press:', key);
                  }}
                />
              )}

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
                <LoadingIndicator
                  message={loadingReason === 'compact' ? 'Compacting...' : undefined}
                />
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
                onModelChange={handleModelChange}
                sessionId={session?.claudeSessionId}
                tokenUsage={usageInfo ? { inputTokens: usageInfo.inputTokens, outputTokens: usageInfo.outputTokens } : undefined}
                thinkingEnabled={thinkingEnabled}
                onToggleThinking={handleToggleThinking}
                onNewSession={() => setIsNewSessionModalOpen(true)}
                onClearMessages={clearMessages}
                onCompact={compactSession}
                onShowContext={() => {
                  const usage = usageInfo;
                  if (usage) {
                    showToast('Context Usage', `Input: ${usage.inputTokens.toLocaleString()} tokens\nOutput: ${usage.outputTokens.toLocaleString()} tokens\nTotal: ${(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens`, 'info');
                  } else {
                    showToast('Context Usage', 'No usage data available', 'warning');
                  }
                }}
                onShowCost={() => {
                  const usage = usageInfo;
                  if (usage) {
                    // Rough cost estimate (prices may vary)
                    const inputCost = (usage.inputTokens / 1000000) * 15; // $15/M for Opus input
                    const outputCost = (usage.outputTokens / 1000000) * 75; // $75/M for Opus output
                    showToast('Session Cost (estimated)', `Input: $${inputCost.toFixed(4)}\nOutput: $${outputCost.toFixed(4)}\nTotal: $${(inputCost + outputCost).toFixed(4)}`, 'info');
                  } else {
                    showToast('Session Cost', 'No usage data available', 'warning');
                  }
                }}
                onShowConfig={() => {
                  // TODO: Open settings dialog
                  showToast('Configuration', 'Settings dialog not implemented yet.', 'warning');
                }}
                onShowHelp={() => {
                  showToast('Available Commands', '/new - Create new session\n/clear - Clear messages\n/compact - Compact history\n/model - Switch model\n/context - Show context usage\n/cost - Show cost\n/permission - Change permission mode\n/config - Configuration\n/help - Show this help', 'info');
                }}
              />
            </main>
          </>
          )
        )}
        </div>
      </div>

      {/* Toast notification */}
      <Toast
        title={toast?.title ?? ''}
        message={toast?.message ?? ''}
        type={toast?.type ?? 'info'}
        isOpen={toast !== null}
        onClose={() => setToast(null)}
        duration={6000}
      />
    </div>
  );
}

export default App;
