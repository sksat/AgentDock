import { useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSession } from './hooks/useSession';
import { MessageStream, InputArea, PermissionRequest } from './components';
import './App.css';

const WS_URL = import.meta.env.DEV ? '/ws' : `ws://${window.location.host}/ws`;

function App() {
  const {
    session,
    messages,
    pendingPermission,
    isLoading,
    error,
    createSession,
    sendMessage,
    respondToPermission,
    handleServerMessage,
    setSend,
  } = useSession();

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

  // Create a session on first connect if none exists
  useEffect(() => {
    if (isConnected && !session) {
      createSession('New Session');
    }
  }, [isConnected, session, createSession]);

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

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 bg-bg-secondary border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-semibold">Claude Bridge</h1>
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

        {/* Loading indicator */}
        {isLoading && !pendingPermission && (
          <div className="px-4 py-2 border-t border-border">
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="animate-pulse">●</span>
              <span>処理中...</span>
            </div>
          </div>
        )}

        {/* Input area */}
        <InputArea
          onSend={sendMessage}
          disabled={!isConnected || !session || isLoading}
        />
      </main>
    </div>
  );
}

export default App;
