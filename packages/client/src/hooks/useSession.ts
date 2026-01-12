import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ServerMessage,
  SessionInfo,
  ClientMessage,
  QuestionItem,
  PermissionMode,
} from '@claude-bridge/shared';
import type { MessageStreamItem } from '../components/MessageStream';

export interface PendingPermission {
  requestId: string;
  toolName: string;
  input: unknown;
}

export interface PendingQuestion {
  requestId: string;
  questions: QuestionItem[];
}

export interface SystemInfo {
  model?: string;
  permissionMode?: string;
  cwd?: string;
  tools?: string[];
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface UseSessionReturn {
  // Session list
  sessions: SessionInfo[];
  activeSessionId: string | null;
  session: SessionInfo | null;
  sessionsLoaded: boolean;

  // Active session state
  messages: MessageStreamItem[];
  pendingPermission: PendingPermission | null;
  pendingQuestion: PendingQuestion | null;
  isLoading: boolean;
  error: string | null;
  systemInfo: SystemInfo | null;
  usageInfo: UsageInfo | null;

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
  respondToQuestion: (requestId: string, answers: Record<string, string>) => void;
  interrupt: () => void;

  // Settings
  setPermissionMode: (mode: PermissionMode) => void;
  setModel: (model: string) => void;

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
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Messages stored per session
  const [sessionMessages, setSessionMessages] = useState<SessionMessages>(new Map());

  // Active session state
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);

  // Pending message to send after session creation
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Send pending message when session is created
  useEffect(() => {
    if (activeSessionId && pendingMessage) {
      // Add user message to the session
      setSessionMessages((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(activeSessionId) ?? [];
        newMap.set(activeSessionId, [
          ...current,
          {
            type: 'user',
            content: pendingMessage,
            timestamp: new Date().toISOString(),
          },
        ]);
        return newMap;
      });
      // Send the message
      sendRef.current?.({ type: 'user_message', sessionId: activeSessionId, content: pendingMessage });
      setPendingMessage(null);
    }
  }, [activeSessionId, pendingMessage]);

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
    setSessionsLoaded(false);
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
        setPendingQuestion(null);
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

  // Generate session name from first message content
  const generateSessionName = (content: string, maxLength = 40): string => {
    // Remove newlines and extra whitespace
    const cleaned = content.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    // Try to cut at a word boundary
    const truncated = cleaned.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
      return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
  };

  // Message sending
  const sendMessage = useCallback(
    (content: string) => {
      if (!activeSessionId) {
        // No session yet - create one and store the message to send after creation
        setPendingMessage(content);
        setIsLoading(true);
        const sessionName = generateSessionName(content);
        send({ type: 'create_session', name: sessionName });
        return;
      }

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

  const respondToQuestion = useCallback(
    (requestId: string, answers: Record<string, string>) => {
      if (!activeSessionId) return;

      send({
        type: 'question_response',
        sessionId: activeSessionId,
        requestId,
        answers,
      });
      setPendingQuestion(null);
    },
    [activeSessionId, send]
  );

  const interrupt = useCallback(() => {
    if (!activeSessionId) return;

    send({
      type: 'interrupt',
      sessionId: activeSessionId,
    });
    setIsLoading(false);
    setPendingPermission(null);
    setPendingQuestion(null);
  }, [activeSessionId, send]);

  const setPermissionMode = useCallback((mode: PermissionMode) => {
    if (!activeSessionId) return;

    send({
      type: 'set_permission_mode',
      sessionId: activeSessionId,
      mode,
    });

    // Update local systemInfo immediately for responsive UI
    setSystemInfo((prev) => prev ? { ...prev, permissionMode: mode } : { permissionMode: mode });
  }, [activeSessionId, send]);

  const setModel = useCallback((model: string) => {
    if (!activeSessionId) return;

    send({
      type: 'set_model',
      sessionId: activeSessionId,
      model,
    });

    // Update local systemInfo immediately for responsive UI
    setSystemInfo((prev) => prev ? { ...prev, model } : { model });
  }, [activeSessionId, send]);

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'session_list':
          setSessions(message.sessions);
          setSessionsLoaded(true);
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

        case 'thinking_output': {
          const sessionId = message.sessionId;
          updateSessionMessages(sessionId, (prev) => {
            // If last message is thinking, append to it
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.type === 'thinking' && typeof lastMessage.content === 'string') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: lastMessage.content + message.thinking,
                },
              ];
            }
            // Otherwise create new thinking message
            return [
              ...prev,
              {
                type: 'thinking',
                content: message.thinking,
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

        case 'ask_user_question':
          setPendingQuestion({
            requestId: message.requestId,
            questions: message.questions,
          });
          break;

        case 'system_info':
          setSystemInfo({
            model: message.model,
            permissionMode: message.permissionMode,
            cwd: message.cwd,
            tools: message.tools,
          });
          break;

        case 'usage_info':
          setUsageInfo({
            inputTokens: message.inputTokens,
            outputTokens: message.outputTokens,
            cacheCreationInputTokens: message.cacheCreationInputTokens,
            cacheReadInputTokens: message.cacheReadInputTokens,
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
    sessionsLoaded,
    messages,
    pendingPermission,
    pendingQuestion,
    isLoading,
    error,
    systemInfo,
    usageInfo,
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
  };
}
