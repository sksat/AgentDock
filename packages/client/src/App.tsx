import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSession } from './hooks/useSession';
import { AskUserQuestion, LoadingIndicator, MessageStream, InputArea, PermissionRequest, Sidebar } from './components';
import type { SidebarSession } from './components';
import './App.css';

const WS_URL = import.meta.env.DEV ? 'ws://localhost:3001/ws' : `ws://${window.location.host}/ws`;

function App() {
  const {
    sessions,
    activeSessionId,
    session,
    messages,
    pendingPermission,
    pendingQuestion,
    isLoading,
    error,
    systemInfo,
    listSessions,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    sendMessage,
    respondToPermission,
    respondToQuestion,
    interrupt,
    handleServerMessage,
    setSend,
  } = useSession();

  const [thinkingEnabled, setThinkingEnabled] = useState(false);

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

  // Create a session after getting the list if no sessions exist
  useEffect(() => {
    if (isConnected && sessions.length === 0 && activeSessionId === null) {
      createSession('New Session');
    }
  }, [isConnected, sessions.length, activeSessionId, createSession]);

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
      {/* Sidebar */}
      <Sidebar
        sessions={sidebarSessions}
        activeSessionId={activeSessionId}
        onSelectSession={selectSession}
        onCreateSession={() => createSession()}
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
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-accent-success' : 'bg-accent-danger'
              }`}
            />
            <span className="text-sm text-text-secondary">
              {isConnected ? '接続中' : '切断'}
            </span>
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
            disabled={!isConnected || !session}
            isLoading={isLoading}
            permissionMode={systemInfo?.permissionMode}
            model={systemInfo?.model}
            sessionId={session?.claudeSessionId}
            thinkingEnabled={thinkingEnabled}
            onToggleThinking={handleToggleThinking}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
