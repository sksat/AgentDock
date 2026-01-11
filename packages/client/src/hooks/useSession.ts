import { useState, useCallback, useRef } from 'react';
import type {
  ServerMessage,
  SessionInfo,
  ClientMessage,
} from '@claude-bridge/shared';
import type { MessageStreamItem } from '../components/MessageStream';

export interface PendingPermission {
  requestId: string;
  toolName: string;
  input: unknown;
}

export interface UseSessionReturn {
  // Session list
  sessions: SessionInfo[];
  activeSessionId: string | null;
  session: SessionInfo | null;

  // Active session state
  messages: MessageStreamItem[];
  pendingPermission: PendingPermission | null;
  isLoading: boolean;
  error: string | null;

  // Session management
  listSessions: () => void;
  createSession: (name?: string, workingDir?: string) => void;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;

  // Message handling
  sendMessage: (content: string) => void;
  respondToPermission: (
    requestId: string,
    response: { behavior: 'allow'; updatedInput: unknown } | { behavior: 'deny'; message: string }
  ) => void;

  // WebSocket integration
  handleServerMessage: (message: ServerMessage) => void;
  setSend: (send: (message: ClientMessage) => void) => void;
}

// Store messages per session
type SessionMessages = Map<string, MessageStreamItem[]>;

export function useSession(): UseSessionReturn {
  const sendRef = useRef<((message: ClientMessage) => void) | null>(null);

  const setSend = useCallback((send: (message: ClientMessage) => void) => {
    sendRef.current = send;
  }, []);

  const send = useCallback((message: ClientMessage) => {
    sendRef.current?.(message);
  }, []);

  // Session list and active session
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Messages stored per session
  const [sessionMessages, setSessionMessages] = useState<SessionMessages>(new Map());

  // Active session state
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed values
  const session = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSessionId ? (sessionMessages.get(activeSessionId) ?? []) : [];

  // Helper to update messages for a specific session
  const updateSessionMessages = useCallback(
    (sessionId: string, updater: (prev: MessageStreamItem[]) => MessageStreamItem[]) => {
      setSessionMessages((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(sessionId) ?? [];
        newMap.set(sessionId, updater(current));
        return newMap;
      });
    },
    []
  );

  // Session management
  const listSessions = useCallback(() => {
    send({ type: 'list_sessions' });
  }, [send]);

  const createSession = useCallback(
    (name?: string, workingDir?: string) => {
      send({ type: 'create_session', name, workingDir });
    },
    [send]
  );

  const selectSession = useCallback(
    (sessionId: string) => {
      const sessionExists = sessions.some((s) => s.id === sessionId);
      if (sessionExists) {
        setActiveSessionId(sessionId);
        setError(null);
        setPendingPermission(null);
        // Request session history if not already loaded
        if (!sessionMessages.has(sessionId)) {
          send({ type: 'attach_session', sessionId });
        }
      }
    },
    [sessions, sessionMessages, send]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      send({ type: 'delete_session', sessionId });
    },
    [send]
  );

  const renameSession = useCallback(
    (sessionId: string, name: string) => {
      send({ type: 'rename_session', sessionId, name });
    },
    [send]
  );

  // Message sending
  const sendMessage = useCallback(
    (content: string) => {
      if (!activeSessionId) return;

      updateSessionMessages(activeSessionId, (prev) => [
        ...prev,
        {
          type: 'user',
          content,
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsLoading(true);
      send({ type: 'user_message', sessionId: activeSessionId, content });
    },
    [activeSessionId, send, updateSessionMessages]
  );

  const respondToPermission = useCallback(
    (
      requestId: string,
      response: { behavior: 'allow'; updatedInput: unknown } | { behavior: 'deny'; message: string }
    ) => {
      if (!activeSessionId) return;

      send({
        type: 'permission_response',
        sessionId: activeSessionId,
        requestId,
        response,
      });
      setPendingPermission(null);
    },
    [activeSessionId, send]
  );

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'session_list':
          setSessions(message.sessions);
          break;

        case 'session_created': {
          const newSession = message.session;
          setSessions((prev) => {
            // Check if session already exists (update case)
            const exists = prev.some((s) => s.id === newSession.id);
            if (exists) {
              return prev.map((s) => (s.id === newSession.id ? newSession : s));
            }
            return [...prev, newSession];
          });
          // Automatically select the new session
          setActiveSessionId(newSession.id);
          // Initialize empty messages for new session
          setSessionMessages((prev) => {
            const newMap = new Map(prev);
            if (!newMap.has(newSession.id)) {
              newMap.set(newSession.id, []);
            }
            return newMap;
          });
          setError(null);
          break;
        }

        case 'session_attached': {
          // Convert MessageItem[] from server to MessageStreamItem[]
          const history: MessageStreamItem[] = message.history.map((item) => ({
            type: item.type as MessageStreamItem['type'],
            content: item.content,
            timestamp: item.timestamp,
          }));
          setSessionMessages((prev) => {
            const newMap = new Map(prev);
            newMap.set(message.sessionId, history);
            return newMap;
          });
          break;
        }

        case 'session_deleted': {
          setSessions((prev) => prev.filter((s) => s.id !== message.sessionId));
          setSessionMessages((prev) => {
            const newMap = new Map(prev);
            newMap.delete(message.sessionId);
            return newMap;
          });
          // If deleted session was active, select another one
          if (activeSessionId === message.sessionId) {
            setSessions((currentSessions) => {
              const remaining = currentSessions.filter((s) => s.id !== message.sessionId);
              setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
              return remaining;
            });
          }
          break;
        }

        case 'text_output': {
          const sessionId = message.sessionId;
          updateSessionMessages(sessionId, (prev) => {
            // If last message is assistant, append to it
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.type === 'assistant' && typeof lastMessage.content === 'string') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: lastMessage.content + message.text,
                },
              ];
            }
            // Otherwise create new assistant message
            return [
              ...prev,
              {
                type: 'assistant',
                content: message.text,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          break;
        }

        case 'tool_use': {
          const sessionId = message.sessionId;
          updateSessionMessages(sessionId, (prev) => [
            ...prev,
            {
              type: 'tool_use',
              content: {
                toolName: message.toolName,
                toolUseId: message.toolUseId,
                input: message.input,
              },
              timestamp: new Date().toISOString(),
            },
          ]);
          break;
        }

        case 'tool_result': {
          const sessionId = message.sessionId;
          updateSessionMessages(sessionId, (prev) => [
            ...prev,
            {
              type: 'tool_result',
              content: {
                toolUseId: message.toolUseId,
                content: message.content,
                isError: message.isError ?? false,
              },
              timestamp: new Date().toISOString(),
            },
          ]);
          break;
        }

        case 'result':
          setIsLoading(false);
          break;

        case 'permission_request':
          setPendingPermission({
            requestId: message.requestId,
            toolName: message.toolName,
            input: message.input,
          });
          break;

        case 'error':
          setError(message.message);
          setIsLoading(false);
          break;
      }
    },
    [activeSessionId, updateSessionMessages]
  );

  return {
    sessions,
    activeSessionId,
    session,
    messages,
    pendingPermission,
    isLoading,
    error,
    listSessions,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    sendMessage,
    respondToPermission,
    handleServerMessage,
    setSend,
  };
}
