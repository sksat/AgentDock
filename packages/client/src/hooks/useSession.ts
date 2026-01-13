import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ServerMessage,
  SessionInfo,
  ClientMessage,
  QuestionItem,
  PermissionMode,
  DailyUsage,
  UsageTotals,
  BlockUsage,
  ScreencastMetadata,
} from '@agent-dock/shared';
import type { MessageStreamItem, BashToolContent, McpToolContent, SystemMessageContent, ImageAttachment, UserMessageContent, QuestionMessageContent } from '../components/MessageStream';

export interface PendingPermission {
  sessionId: string;
  requestId: string;
  toolName: string;
  input: unknown;
}

export interface PendingQuestion {
  sessionId: string;
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

export interface GlobalUsage {
  today: DailyUsage | null;
  totals: UsageTotals;
  /** Daily usage history (sorted by date ascending) */
  daily: DailyUsage[];
  /** Block usage history for finer granularity (sorted by startTime ascending) */
  blocks: BlockUsage[];
}

export interface ModelUsage {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ScreencastState {
  active: boolean;
  browserUrl?: string;
  frame?: {
    data: string;
    metadata: ScreencastMetadata;
  };
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
  loadingReason: 'compact' | null;
  error: string | null;
  systemInfo: SystemInfo | null;
  usageInfo: UsageInfo | null;
  modelUsage: ModelUsage[] | null;
  globalUsage: GlobalUsage | null;
  screencast: ScreencastState | null;

  // Session management
  listSessions: () => void;
  createSession: (name?: string, workingDir?: string) => void;
  selectSession: (sessionId: string) => void;
  deselectSession: () => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;

  // Message handling
  sendMessage: (content: string, images?: ImageAttachment[], workingDir?: string) => void;
  clearMessages: () => void;
  addSystemMessage: (content: SystemMessageContent) => void;
  compactSession: () => void;
  respondToPermission: (
    requestId: string,
    response: { behavior: 'allow'; updatedInput: unknown } | { behavior: 'deny'; message: string }
  ) => void;
  respondToQuestion: (requestId: string, answers: Record<string, string>) => void;
  interrupt: () => void;

  // Settings
  setPermissionMode: (mode: PermissionMode) => void;
  setModel: (model: string) => void;

  // Browser/Screencast
  startScreencast: () => void;
  stopScreencast: () => void;
  sendBrowserClick: (x: number, y: number) => void;
  sendBrowserKeyPress: (key: string) => void;

  // WebSocket integration
  handleServerMessage: (message: ServerMessage) => void;
  setSend: (send: (message: ClientMessage) => void) => void;
}

// Store messages per session
type SessionMessages = Map<string, MessageStreamItem[]>;

// Store usage info per session
type SessionUsageInfo = Map<string, UsageInfo>;

// Store model usage per session
type SessionModelUsage = Map<string, ModelUsage[]>;

// Store pending permissions per session
type SessionPendingPermission = Map<string, PendingPermission>;

// Store pending questions per session
type SessionPendingQuestion = Map<string, PendingQuestion>;

// Store screencast state per session
type SessionScreencast = Map<string, ScreencastState>;

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

  // Usage info stored per session
  const [sessionUsageInfo, setSessionUsageInfo] = useState<SessionUsageInfo>(new Map());

  // Model usage stored per session
  const [sessionModelUsage, setSessionModelUsage] = useState<SessionModelUsage>(new Map());

  // Pending permissions and questions stored per session
  const [sessionPendingPermission, setSessionPendingPermission] = useState<SessionPendingPermission>(new Map());
  const [sessionPendingQuestion, setSessionPendingQuestion] = useState<SessionPendingQuestion>(new Map());

  // Screencast state stored per session
  const [sessionScreencast, setSessionScreencast] = useState<SessionScreencast>(new Map());

  // Active session state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingReason, setLoadingReason] = useState<'compact' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [globalUsage, setGlobalUsage] = useState<GlobalUsage | null>(null);

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

  // Helper to extract session ID from URL
  const getSessionIdFromUrl = useCallback((): string | null => {
    const match = window.location.pathname.match(/^\/session\/(.+)$/);
    return match ? match[1] : null;
  }, []);

  // Read session ID from URL on initial load (after sessions are loaded)
  useEffect(() => {
    if (!sessionsLoaded || sessions.length === 0) return;

    const sessionId = getSessionIdFromUrl();
    if (sessionId) {
      const sessionExists = sessions.some((s) => s.id === sessionId);
      if (sessionExists && activeSessionId !== sessionId) {
        setActiveSessionId(sessionId);
        setError(null);
        // Request session history if not already loaded
        if (!sessionMessages.has(sessionId)) {
          sendRef.current?.({ type: 'attach_session', sessionId });
        }
      }
    }
  }, [sessionsLoaded, sessions, getSessionIdFromUrl, activeSessionId, sessionMessages]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const sessionId = getSessionIdFromUrl();
      if (sessionId) {
        const sessionExists = sessions.some((s) => s.id === sessionId);
        if (sessionExists) {
          setActiveSessionId(sessionId);
          setError(null);
          if (!sessionMessages.has(sessionId)) {
            sendRef.current?.({ type: 'attach_session', sessionId });
          }
        } else {
          // Session doesn't exist, go to home
          setActiveSessionId(null);
        }
      } else {
        // Home page
        setActiveSessionId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [sessions, getSessionIdFromUrl, sessionMessages]);

  // Computed values
  const session = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSessionId ? (sessionMessages.get(activeSessionId) ?? []) : [];
  const usageInfo = activeSessionId ? (sessionUsageInfo.get(activeSessionId) ?? null) : null;
  const modelUsage = activeSessionId ? (sessionModelUsage.get(activeSessionId) ?? null) : null;
  const pendingPermission = activeSessionId ? (sessionPendingPermission.get(activeSessionId) ?? null) : null;
  const pendingQuestion = activeSessionId ? (sessionPendingQuestion.get(activeSessionId) ?? null) : null;
  const screencast = activeSessionId ? (sessionScreencast.get(activeSessionId) ?? null) : null;

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
        // Update URL
        window.history.pushState({ sessionId }, '', `/session/${sessionId}`);
        // Note: pendingPermission and pendingQuestion are per-session, no need to clear
        // Request session history if not already loaded
        if (!sessionMessages.has(sessionId)) {
          send({ type: 'attach_session', sessionId });
        }
      }
    },
    [sessions, sessionMessages, send]
  );

  const deselectSession = useCallback(() => {
    setActiveSessionId(null);
    setError(null);
    // Update URL to home
    window.history.pushState({}, '', '/');
  }, []);

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
    (content: string, images?: ImageAttachment[], workingDir?: string) => {
      if (!activeSessionId) {
        // No session yet - create one and store the message to send after creation
        // TODO: Store images with pending message
        setPendingMessage(content);
        setIsLoading(true);
        const sessionName = generateSessionName(content);
        send({ type: 'create_session', name: sessionName, workingDir });
        return;
      }

      // Create message content with optional images
      const messageContent: UserMessageContent = {
        text: content,
        images,
      };

      updateSessionMessages(activeSessionId, (prev) => [
        ...prev,
        {
          type: 'user',
          content: messageContent,
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsLoading(true);
      // Send message with images to server
      send({
        type: 'user_message',
        sessionId: activeSessionId,
        content,
        images: images && images.length > 0 ? images : undefined,
      });
    },
    [activeSessionId, send, updateSessionMessages]
  );

  const clearMessages = useCallback(() => {
    if (!activeSessionId) return;
    setSessionMessages((prev) => {
      const newMap = new Map(prev);
      newMap.set(activeSessionId, []);
      return newMap;
    });
    // Also clear usage info for this session
    setSessionUsageInfo((prev) => {
      const newMap = new Map(prev);
      newMap.delete(activeSessionId);
      return newMap;
    });
    setSessionModelUsage((prev) => {
      const newMap = new Map(prev);
      newMap.delete(activeSessionId);
      return newMap;
    });
  }, [activeSessionId]);

  const addSystemMessage = useCallback(
    (content: SystemMessageContent) => {
      if (!activeSessionId) return;
      updateSessionMessages(activeSessionId, (prev) => [
        ...prev,
        {
          type: 'system',
          content,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    [activeSessionId, updateSessionMessages]
  );

  const compactSession = useCallback(() => {
    if (!activeSessionId) return;
    // Add /compact command to local messages
    updateSessionMessages(activeSessionId, (prev) => [
      ...prev,
      {
        type: 'user',
        content: '/compact',
        timestamp: new Date().toISOString(),
      },
    ]);
    setIsLoading(true);
    setLoadingReason('compact');
    send({
      type: 'compact_session',
      sessionId: activeSessionId,
    });
  }, [activeSessionId, send, updateSessionMessages]);

  const respondToPermission = useCallback(
    (
      requestId: string,
      response: { behavior: 'allow'; updatedInput: unknown } | { behavior: 'deny'; message: string }
    ) => {
      if (!activeSessionId) return;

      // Get the stored sessionId from the pending permission
      const pending = sessionPendingPermission.get(activeSessionId);
      const sessionId = pending?.sessionId ?? activeSessionId;

      send({
        type: 'permission_response',
        sessionId,
        requestId,
        response,
      });
      // Clear from Map
      setSessionPendingPermission((prev) => {
        const newMap = new Map(prev);
        newMap.delete(activeSessionId);
        return newMap;
      });
    },
    [activeSessionId, sessionPendingPermission, send]
  );

  const respondToQuestion = useCallback(
    (requestId: string, answers: Record<string, string>) => {
      if (!activeSessionId) return;

      // Get the stored sessionId from the pending question
      const pending = sessionPendingQuestion.get(activeSessionId);
      const sessionId = pending?.sessionId ?? activeSessionId;

      // Add question response message to stream
      if (pending) {
        const questionContent: QuestionMessageContent = {
          answers: pending.questions.map((q) => ({
            question: q.question,
            answer: answers[q.header] ?? '',
          })),
        };
        updateSessionMessages(sessionId, (prev) => [
          ...prev,
          {
            type: 'question',
            content: questionContent,
            timestamp: new Date().toISOString(),
          },
        ]);
      }

      send({
        type: 'question_response',
        sessionId,
        requestId,
        answers,
      });
      // Clear from Map
      setSessionPendingQuestion((prev) => {
        const newMap = new Map(prev);
        newMap.delete(activeSessionId);
        return newMap;
      });
    },
    [activeSessionId, sessionPendingQuestion, send, updateSessionMessages]
  );

  const interrupt = useCallback(() => {
    if (!activeSessionId) return;

    send({
      type: 'interrupt',
      sessionId: activeSessionId,
    });
    setIsLoading(false);
    setLoadingReason(null);
    // Clear pending items for this session
    setSessionPendingPermission((prev) => {
      const newMap = new Map(prev);
      newMap.delete(activeSessionId);
      return newMap;
    });
    setSessionPendingQuestion((prev) => {
      const newMap = new Map(prev);
      newMap.delete(activeSessionId);
      return newMap;
    });
  }, [activeSessionId, send]);

  const setPermissionMode = useCallback((mode: PermissionMode) => {
    // Update local systemInfo immediately for responsive UI
    setSystemInfo((prev) => prev ? { ...prev, permissionMode: mode } : { permissionMode: mode });

    // Send to server if session exists
    if (activeSessionId) {
      send({
        type: 'set_permission_mode',
        sessionId: activeSessionId,
        mode,
      });
    }
  }, [activeSessionId, send]);

  const setModel = useCallback((model: string) => {
    // Capture old model before updating local state
    const oldModel = systemInfo?.model;

    // Update local systemInfo immediately for responsive UI
    setSystemInfo((prev) => prev ? { ...prev, model } : { model });

    // Send to server if session exists
    if (activeSessionId) {
      send({
        type: 'set_model',
        sessionId: activeSessionId,
        model,
        oldModel,
      });
    }
  }, [activeSessionId, send, systemInfo?.model]);

  const startScreencast = useCallback(() => {
    if (activeSessionId) {
      send({
        type: 'start_screencast',
        sessionId: activeSessionId,
      });
    }
  }, [activeSessionId, send]);

  const stopScreencast = useCallback(() => {
    if (activeSessionId) {
      send({
        type: 'stop_screencast',
        sessionId: activeSessionId,
      });
    }
  }, [activeSessionId, send]);

  const sendBrowserClick = useCallback((x: number, y: number) => {
    if (activeSessionId) {
      send({
        type: 'user_browser_click',
        sessionId: activeSessionId,
        x,
        y,
      });
    }
  }, [activeSessionId, send]);

  const sendBrowserKeyPress = useCallback((key: string) => {
    if (activeSessionId) {
      send({
        type: 'user_browser_key_press',
        sessionId: activeSessionId,
        key,
      });
    }
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
            return [newSession, ...prev];
          });
          // Automatically select the new session
          setActiveSessionId(newSession.id);
          // Update URL
          window.history.pushState({ sessionId: newSession.id }, '', `/session/${newSession.id}`);
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
          // Restore usage from DB if available
          if (message.usage) {
            setSessionUsageInfo((prev) => {
              const newMap = new Map(prev);
              newMap.set(message.sessionId, {
                inputTokens: message.usage!.inputTokens,
                outputTokens: message.usage!.outputTokens,
                cacheCreationInputTokens: message.usage!.cacheCreationTokens,
                cacheReadInputTokens: message.usage!.cacheReadTokens,
              });
              return newMap;
            });
          }
          // Restore model usage from DB if available
          if (message.modelUsage) {
            setSessionModelUsage((prev) => {
              const newMap = new Map(prev);
              newMap.set(message.sessionId, message.modelUsage!);
              return newMap;
            });
          }
          break;
        }

        case 'session_deleted': {
          setSessions((prev) => prev.filter((s) => s.id !== message.sessionId));
          setSessionMessages((prev) => {
            const newMap = new Map(prev);
            newMap.delete(message.sessionId);
            return newMap;
          });
          // If deleted session was active, go to home
          if (activeSessionId === message.sessionId) {
            setActiveSessionId(null);
            window.history.pushState({}, '', '/');
          }
          break;
        }

        case 'session_status_changed': {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === message.sessionId ? { ...s, status: message.status } : s
            )
          );
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
          const { toolName, toolUseId, input } = message;

          if (toolName === 'Bash') {
            // Create combined Bash tool message
            const bashInput = input as { command: string; description?: string };
            updateSessionMessages(sessionId, (prev) => [
              ...prev,
              {
                type: 'bash_tool',
                content: {
                  toolUseId,
                  command: bashInput.command,
                  description: bashInput.description,
                  output: '',
                  isComplete: false,
                } as BashToolContent,
                timestamp: new Date().toISOString(),
              },
            ]);
          } else if (toolName.startsWith('mcp__')) {
            // Create combined MCP tool message
            updateSessionMessages(sessionId, (prev) => [
              ...prev,
              {
                type: 'mcp_tool',
                content: {
                  toolUseId,
                  toolName,
                  input,
                  output: '',
                  isComplete: false,
                } as McpToolContent,
                timestamp: new Date().toISOString(),
              },
            ]);
          } else {
            // Other tools use existing display
            updateSessionMessages(sessionId, (prev) => [
              ...prev,
              {
                type: 'tool_use',
                content: {
                  toolName,
                  toolUseId,
                  input,
                },
                timestamp: new Date().toISOString(),
              },
            ]);
          }
          break;
        }

        case 'tool_output': {
          const sessionId = message.sessionId;
          const { toolUseId, output } = message;
          updateSessionMessages(sessionId, (prev) =>
            prev.map((m) => {
              if (m.type === 'bash_tool' &&
                  (m.content as BashToolContent).toolUseId === toolUseId) {
                const content = m.content as BashToolContent;
                return {
                  ...m,
                  content: { ...content, output: content.output + output },
                };
              }
              if (m.type === 'mcp_tool' &&
                  (m.content as McpToolContent).toolUseId === toolUseId) {
                const content = m.content as McpToolContent;
                return {
                  ...m,
                  content: { ...content, output: content.output + output },
                };
              }
              return m;
            })
          );
          break;
        }

        case 'tool_result': {
          const sessionId = message.sessionId;
          const { toolUseId, content, isError } = message;

          updateSessionMessages(sessionId, (prev) => {
            // Check if this is for a Bash tool
            const bashIndex = prev.findIndex(
              (m) => m.type === 'bash_tool' &&
                     (m.content as BashToolContent).toolUseId === toolUseId
            );

            if (bashIndex !== -1) {
              // Update existing Bash tool message to complete state
              return prev.map((m, i) => {
                if (i === bashIndex) {
                  const bashContent = m.content as BashToolContent;
                  return {
                    ...m,
                    content: {
                      ...bashContent,
                      output: bashContent.output || content, // Use content if no streaming output
                      isComplete: true,
                      isError: isError ?? false,
                    },
                  };
                }
                return m;
              });
            }

            // Check if this is for an MCP tool
            const mcpIndex = prev.findIndex(
              (m) => m.type === 'mcp_tool' &&
                     (m.content as McpToolContent).toolUseId === toolUseId
            );

            if (mcpIndex !== -1) {
              // Update existing MCP tool message to complete state
              return prev.map((m, i) => {
                if (i === mcpIndex) {
                  const mcpContent = m.content as McpToolContent;
                  return {
                    ...m,
                    content: {
                      ...mcpContent,
                      output: mcpContent.output || content, // Use content if no streaming output
                      isComplete: true,
                      isError: isError ?? false,
                    },
                  };
                }
                return m;
              });
            }

            // Not a Bash or MCP tool, add as separate tool_result message
            return [
              ...prev,
              {
                type: 'tool_result',
                content: {
                  toolUseId,
                  content,
                  isError: isError ?? false,
                },
                timestamp: new Date().toISOString(),
              },
            ];
          });
          break;
        }

        case 'result':
          setIsLoading(false);
          setLoadingReason(null);
          break;

        case 'permission_request': {
          const sessionId = message.sessionId;
          setSessionPendingPermission((prev) => {
            const newMap = new Map(prev);
            newMap.set(sessionId, {
              sessionId,
              requestId: message.requestId,
              toolName: message.toolName,
              input: message.input,
            });
            return newMap;
          });
          break;
        }

        case 'ask_user_question': {
          const sessionId = message.sessionId;
          setSessionPendingQuestion((prev) => {
            const newMap = new Map(prev);
            newMap.set(sessionId, {
              sessionId,
              requestId: message.requestId,
              questions: message.questions,
            });
            return newMap;
          });
          break;
        }

        case 'system_info':
          setSystemInfo({
            model: message.model,
            permissionMode: message.permissionMode,
            cwd: message.cwd,
            tools: message.tools,
          });
          break;

        case 'system_message': {
          const sessionId = message.sessionId;
          updateSessionMessages(sessionId, (prev) => [
            ...prev,
            {
              type: 'system',
              content: message.content,
              timestamp: new Date().toISOString(),
            },
          ]);
          break;
        }

        case 'usage_info': {
          const sessionId = message.sessionId;
          setSessionUsageInfo((prev) => {
            const newMap = new Map(prev);
            const current = newMap.get(sessionId) ?? { inputTokens: 0, outputTokens: 0 };
            // Accumulate usage
            newMap.set(sessionId, {
              inputTokens: current.inputTokens + message.inputTokens,
              outputTokens: current.outputTokens + message.outputTokens,
              cacheCreationInputTokens: (current.cacheCreationInputTokens ?? 0) + (message.cacheCreationInputTokens ?? 0),
              cacheReadInputTokens: (current.cacheReadInputTokens ?? 0) + (message.cacheReadInputTokens ?? 0),
            });
            return newMap;
          });
          break;
        }

        case 'global_usage':
          setGlobalUsage({
            today: message.today,
            totals: message.totals,
            daily: message.daily,
            blocks: message.blocks,
          });
          break;

        case 'error':
          setError(message.message);
          setIsLoading(false);
          setLoadingReason(null);
          break;

        case 'screencast_frame': {
          const sessionId = message.sessionId;
          setSessionScreencast((prev) => {
            const newMap = new Map(prev);
            const current = newMap.get(sessionId) ?? { active: false };
            newMap.set(sessionId, {
              ...current,
              frame: {
                data: message.data,
                metadata: message.metadata,
              },
            });
            return newMap;
          });
          break;
        }

        case 'screencast_status': {
          const sessionId = message.sessionId;
          setSessionScreencast((prev) => {
            const newMap = new Map(prev);
            const current = newMap.get(sessionId) ?? {};
            newMap.set(sessionId, {
              ...current,
              active: message.active,
              browserUrl: message.browserUrl,
            });
            return newMap;
          });
          break;
        }
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
    addSystemMessage,
    compactSession,
    respondToPermission,
    respondToQuestion,
    interrupt,
    setPermissionMode,
    setModel,
    startScreencast,
    stopScreencast,
    sendBrowserClick,
    sendBrowserKeyPress,
    handleServerMessage,
    setSend,
  };
}
