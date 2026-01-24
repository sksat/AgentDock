import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type {
  ServerMessage,
  SessionInfo,
  ClientMessage,
  QuestionItem,
  PermissionMode,
  PermissionResult,
  DailyUsage,
  UsageTotals,
  BlockUsage,
  ScreencastMetadata,
  TodoItem,
  GlobalSettings,
  GitStatus,
  RunnerBackend,
  Repository,
  RepositoryType,
  SelectedProject,
} from '@agent-dock/shared';
import type { MessageStreamItem, ToolContent, SystemMessageContent, ImageAttachment, UserMessageContent, QuestionMessageContent } from '../components/MessageStream';

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
  /** User's home directory (e.g., /home/user) */
  homeDir?: string;
  tools?: string[];
}

export interface UsageInfo {
  /** Current context input tokens (session cumulative, reflects compaction) */
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  /** Total input tokens for the entire task (never decreases, for task size tracking) */
  totalInputTokens?: number;
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
  contextWindow?: number;
}

export interface ScreencastState {
  active: boolean;
  browserUrl?: string;
  browserTitle?: string;
  cursor?: string;
  frame?: {
    data: string;
    metadata: ScreencastMetadata;
  };
}

export interface TodoHistoryEntry {
  id: string;
  timestamp: string;
  todos: TodoItem[];
}

export interface TodoState {
  current: TodoItem[];
  history: TodoHistoryEntry[];
}

export interface GitStatusState {
  status: GitStatus | null;
  isGitRepo: boolean;
  error?: string;
}

export interface MachineProcessInfo {
  pid: number;
  command: string;
  commandShort: string;
  ports: { port: number; protocol: 'tcp' | 'udp'; address: string; state: string }[];
  parentPid: number | null;
  children: MachineProcessInfo[];
}

export interface MachineState {
  /** Whether monitoring is currently active */
  isMonitoring: boolean;
  /** List of all listening ports */
  ports: number[];
  /** Process tree with port information */
  processTree: MachineProcessInfo | null;
  /** Error message if monitoring failed */
  error?: string;
}

export interface UseSessionReturn {
  // Session list
  sessions: SessionInfo[];
  activeSessionId: string | null;
  session: SessionInfo | null;
  sessionsLoaded: boolean;

  // Repository list
  repositories: Repository[];

  // Active session state
  messages: MessageStreamItem[];
  pendingPermission: PendingPermission | null;
  pendingQuestion: PendingQuestion | null;
  isLoading: boolean;
  loadingReason: 'compact' | null;
  error: string | null;
  pendingMessage: string | null;
  clearPendingMessage: () => void;
  systemInfo: SystemInfo | null;
  usageInfo: UsageInfo | null;
  modelUsage: ModelUsage[] | null;
  globalUsage: GlobalUsage | null;
  screencast: ScreencastState | null;
  todoState: TodoState;
  gitStatus: GitStatusState | null;
  machineState: MachineState;

  // Session management
  listSessions: () => void;
  createSession: (name?: string, workingDir?: string, runnerBackend?: RunnerBackend, browserInContainer?: boolean, repositoryId?: string, worktreeName?: string) => void;
  selectSession: (sessionId: string) => void;
  deselectSession: () => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;

  // Repository management
  listRepositories: () => void;
  createRepository: (name: string, path: string, repositoryType: RepositoryType, remoteUrl?: string, remoteBranch?: string) => void;
  updateRepository: (id: string, updates: { name?: string; path?: string; repositoryType?: RepositoryType; remoteUrl?: string; remoteBranch?: string }) => void;
  deleteRepository: (id: string) => void;

  // Message handling
  sendMessage: (content: string, images?: ImageAttachment[], selectedProject?: SelectedProject | null, thinkingEnabled?: boolean, runnerBackend?: RunnerBackend) => void;
  clearMessages: () => void;
  addSystemMessage: (content: SystemMessageContent) => void;
  compactSession: () => void;
  respondToPermission: (
    requestId: string,
    response: PermissionResult
  ) => void;
  respondToQuestion: (requestId: string, answers: Record<string, string>) => void;
  interrupt: () => void;
  sendStreamInput: (content: string) => void;

  // Settings
  setPermissionMode: (mode: PermissionMode) => void;
  setModel: (model: string) => void;

  // Browser/Screencast
  startScreencast: () => void;
  stopScreencast: () => void;
  sendBrowserClick: (x: number, y: number) => void;
  sendBrowserKeyPress: (key: string) => void;
  sendBrowserScroll: (deltaX: number, deltaY: number) => void;
  sendBrowserMouseMove: (x: number, y: number) => void;
  sendBrowserNavigate: (url: string) => void;
  sendBrowserBack: () => void;
  sendBrowserForward: () => void;
  sendBrowserRefresh: () => void;

  // Machine monitor
  startMachineMonitor: () => void;
  stopMachineMonitor: () => void;

  // WebSocket integration
  handleServerMessage: (message: ServerMessage) => void;
  setSend: (send: (message: ClientMessage) => void) => void;

  // Global settings
  globalSettings: GlobalSettings | null;
  getSettings: () => void;
  updateSettings: (settings: Partial<GlobalSettings>) => void;
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

// Store todo state per session
type SessionTodoState = Map<string, TodoState>;

// Store git status per session
type SessionGitStatus = Map<string, GitStatusState>;

// Store machine state per session
type SessionMachineState = Map<string, MachineState>;

// Types for server-side message items
interface ServerMessageItem {
  type: string;
  content: unknown;
  timestamp: string;
}

interface ToolUseContent {
  toolName: string;
  toolUseId: string;
  input: unknown;
}

interface ToolResultContent {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * Convert server-side history to client display format
 * Merges all tool_use + tool_result into unified 'tool' type
 */
function convertHistoryForDisplay(history: ServerMessageItem[]): MessageStreamItem[] {
  // Collect tool_result by toolUseId
  const toolResults = new Map<string, ToolResultContent>();
  for (const item of history) {
    if (item.type === 'tool_result') {
      const content = item.content as ToolResultContent;
      toolResults.set(content.toolUseId, content);
    }
  }

  // Convert and merge
  const result: MessageStreamItem[] = [];
  const processedToolUseIds = new Set<string>();

  for (const item of history) {
    if (item.type === 'tool_use') {
      const content = item.content as ToolUseContent;
      const toolResult = toolResults.get(content.toolUseId);

      // All tools are merged into unified 'tool' type
      processedToolUseIds.add(content.toolUseId);
      result.push({
        type: 'tool',
        content: {
          toolUseId: content.toolUseId,
          toolName: content.toolName,
          input: content.input,
          output: toolResult?.content ?? '',
          isComplete: !!toolResult,
          isError: toolResult?.isError ?? false,
        } as ToolContent,
        timestamp: item.timestamp,
      });
    } else if (item.type === 'tool_result') {
      // Skip - already merged into 'tool'
      const content = item.content as ToolResultContent;
      if (!processedToolUseIds.has(content.toolUseId)) {
        // Orphan tool_result without corresponding tool_use - shouldn't happen but handle gracefully
        processedToolUseIds.add(content.toolUseId);
      }
    } else {
      // Pass through other message types
      result.push({
        type: item.type as MessageStreamItem['type'],
        content: item.content,
        timestamp: item.timestamp,
      });
    }
  }

  return result;
}

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

  // Repository list
  const [repositories, setRepositories] = useState<Repository[]>([]);

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

  // Todo state stored per session
  const [sessionTodoState, setSessionTodoState] = useState<SessionTodoState>(new Map());

  // Git status stored per session
  const [sessionGitStatus, setSessionGitStatus] = useState<SessionGitStatus>(new Map());

  // Machine state stored per session
  const [sessionMachineState, setSessionMachineState] = useState<SessionMachineState>(new Map());

  // Active session state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingReason, setLoadingReason] = useState<'compact' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [globalUsage, setGlobalUsage] = useState<GlobalUsage | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);

  // Pending message to send after session creation
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Track if we're waiting for a session we created (to auto-select it)
  const [pendingSessionCreate, setPendingSessionCreate] = useState(false);

  // Send pending message when session is created
  useEffect(() => {
    if (activeSessionId && pendingMessage) {
      // Add user message to the session
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Computed values - memoized to prevent unnecessary re-renders
  const session = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );
  const messages = useMemo(
    () => (activeSessionId ? (sessionMessages.get(activeSessionId) ?? []) : []),
    [activeSessionId, sessionMessages]
  );
  const usageInfo = useMemo(
    () => (activeSessionId ? (sessionUsageInfo.get(activeSessionId) ?? null) : null),
    [activeSessionId, sessionUsageInfo]
  );
  const modelUsage = useMemo(
    () => (activeSessionId ? (sessionModelUsage.get(activeSessionId) ?? null) : null),
    [activeSessionId, sessionModelUsage]
  );
  const pendingPermission = useMemo(
    () => (activeSessionId ? (sessionPendingPermission.get(activeSessionId) ?? null) : null),
    [activeSessionId, sessionPendingPermission]
  );
  const pendingQuestion = useMemo(
    () => (activeSessionId ? (sessionPendingQuestion.get(activeSessionId) ?? null) : null),
    [activeSessionId, sessionPendingQuestion]
  );
  const screencast = useMemo(
    () => (activeSessionId ? (sessionScreencast.get(activeSessionId) ?? null) : null),
    [activeSessionId, sessionScreencast]
  );
  const todoState = useMemo(
    () =>
      activeSessionId
        ? (sessionTodoState.get(activeSessionId) ?? { current: [], history: [] })
        : { current: [], history: [] },
    [activeSessionId, sessionTodoState]
  );
  const gitStatus = useMemo(
    () => (activeSessionId ? sessionGitStatus.get(activeSessionId) ?? null : null),
    [activeSessionId, sessionGitStatus]
  );
  const machineState = useMemo(
    () =>
      activeSessionId
        ? (sessionMachineState.get(activeSessionId) ?? { isMonitoring: false, ports: [], processTree: null })
        : { isMonitoring: false, ports: [], processTree: null },
    [activeSessionId, sessionMachineState]
  );

  // Helper to update messages for a specific session
  const updateSessionMessages = useCallback(
    (sessionId: string, updater: (prev: MessageStreamItem[]) => MessageStreamItem[]) => {
      setSessionMessages((prev) => {
        const current = prev.get(sessionId) ?? [];
        const updated = updater(current);

        // Avoid unnecessary re-renders if no actual change
        if (updated === current) return prev;

        const newMap = new Map(prev);
        newMap.set(sessionId, updated);
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
    (name?: string, workingDir?: string, runnerBackend?: RunnerBackend, browserInContainer?: boolean, repositoryId?: string, worktreeName?: string) => {
      setPendingSessionCreate(true);
      send({ type: 'create_session', name, workingDir, runnerBackend, browserInContainer, repositoryId, worktreeName });
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
        // Always attach to session to receive real-time updates
        // (Server handles duplicate attaches gracefully by using a Set)
        send({ type: 'attach_session', sessionId });
      }
    },
    [sessions, send]
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

  // Repository management
  const listRepositories = useCallback(() => {
    send({ type: 'list_repositories' });
  }, [send]);

  const createRepository = useCallback(
    (name: string, path: string, repositoryType: RepositoryType, remoteUrl?: string, remoteBranch?: string) => {
      send({ type: 'create_repository', name, path, repositoryType, remoteUrl, remoteBranch });
    },
    [send]
  );

  const updateRepository = useCallback(
    (id: string, updates: { name?: string; path?: string; repositoryType?: RepositoryType; remoteUrl?: string; remoteBranch?: string }) => {
      send({ type: 'update_repository', id, ...updates });
    },
    [send]
  );

  const deleteRepository = useCallback(
    (id: string) => {
      send({ type: 'delete_repository', id });
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
    (content: string, images?: ImageAttachment[], selectedProject?: SelectedProject | null, thinkingEnabled?: boolean, runnerBackend?: RunnerBackend) => {
      if (!activeSessionId) {
        // No session yet - create one and store the message to send after creation
        // TODO: Store images with pending message
        setPendingMessage(content);
        setPendingSessionCreate(true);
        setIsLoading(true);
        const sessionName = generateSessionName(content);
        // Extract workingDir and repositoryId from selectedProject
        let workingDir: string | undefined;
        let repositoryId: string | undefined;
        if (selectedProject) {
          switch (selectedProject.type) {
            case 'repository':
              repositoryId = selectedProject.repositoryId;
              break;
            case 'recent':
              workingDir = selectedProject.path;
              repositoryId = selectedProject.repositoryId;
              break;
            case 'custom':
              workingDir = selectedProject.path;
              break;
          }
        }
        send({ type: 'create_session', name: sessionName, workingDir, runnerBackend, repositoryId });
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
        thinkingEnabled,
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

  /**
   * Send additional input to a running session (stream input during execution)
   */
  const sendStreamInput = useCallback(
    (content: string) => {
      if (!activeSessionId) return;

      send({
        type: 'stream_input',
        sessionId: activeSessionId,
        content,
      });
    },
    [activeSessionId, send]
  );

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

  // Global settings
  const getSettings = useCallback(() => {
    send({ type: 'get_settings' });
  }, [send]);

  const updateSettings = useCallback((settings: Partial<GlobalSettings>) => {
    send({ type: 'update_settings', settings });
  }, [send]);

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

  const startMachineMonitor = useCallback(() => {
    if (activeSessionId) {
      // Update local state to show monitoring is starting
      setSessionMachineState((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(activeSessionId) ?? { isMonitoring: false, ports: [], processTree: null };
        newMap.set(activeSessionId, { ...current, isMonitoring: true });
        return newMap;
      });
      send({
        type: 'start_machine_monitor',
        sessionId: activeSessionId,
      });
    }
  }, [activeSessionId, send]);

  const stopMachineMonitor = useCallback(() => {
    if (activeSessionId) {
      setSessionMachineState((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(activeSessionId) ?? { isMonitoring: false, ports: [], processTree: null };
        newMap.set(activeSessionId, { ...current, isMonitoring: false });
        return newMap;
      });
      send({
        type: 'stop_machine_monitor',
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

  const sendBrowserScroll = useCallback((deltaX: number, deltaY: number) => {
    if (activeSessionId) {
      send({
        type: 'user_browser_scroll',
        sessionId: activeSessionId,
        deltaX,
        deltaY,
      });
    }
  }, [activeSessionId, send]);

  const sendBrowserMouseMove = useCallback((x: number, y: number) => {
    if (activeSessionId) {
      send({
        type: 'user_browser_mouse_move',
        sessionId: activeSessionId,
        x,
        y,
      });
    }
  }, [activeSessionId, send]);

  const sendBrowserNavigate = useCallback((url: string) => {
    if (activeSessionId) {
      send({
        type: 'user_browser_navigate',
        sessionId: activeSessionId,
        url,
      });
    }
  }, [activeSessionId, send]);

  const sendBrowserBack = useCallback(() => {
    if (activeSessionId) {
      send({
        type: 'user_browser_back',
        sessionId: activeSessionId,
      });
    }
  }, [activeSessionId, send]);

  const sendBrowserForward = useCallback(() => {
    if (activeSessionId) {
      send({
        type: 'user_browser_forward',
        sessionId: activeSessionId,
      });
    }
  }, [activeSessionId, send]);

  const sendBrowserRefresh = useCallback(() => {
    if (activeSessionId) {
      send({
        type: 'user_browser_refresh',
        sessionId: activeSessionId,
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
          // Only auto-select if we created this session (not from another client like Slack)
          if (pendingSessionCreate) {
            setPendingSessionCreate(false);
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
            // Reset isLoading only if creating empty session (not when sending message with new session)
            // pendingMessage is set when creating session via sendMessage
            if (!pendingMessage) {
              setIsLoading(false);
              setLoadingReason(null);
            }
          }
          break;
        }

        case 'session_attached': {
          // Convert MessageItem[] from server to MessageStreamItem[]
          // Also merge tool_use/tool_result into bash_tool/mcp_tool for better display
          const history = convertHistoryForDisplay(message.history);
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
          // Restore pending permission if there was one
          if (message.pendingPermission) {
            setSessionPendingPermission((prev) => {
              const newMap = new Map(prev);
              newMap.set(message.sessionId, {
                sessionId: message.sessionId,
                ...message.pendingPermission!,
              });
              return newMap;
            });
          }
          // Restore permission mode if available
          if (message.permissionMode) {
            setSystemInfo((prev) => ({
              ...prev,
              permissionMode: message.permissionMode,
            }));
          }
          // Restore model from session data (for contextWindow lookup after reload)
          if (message.model) {
            setSystemInfo((prev) => ({
              ...prev,
              model: message.model,
            }));
          }
          // Auto-start screencast if a browser session exists
          // Don't set active=true immediately - wait for server to confirm via screencast_status
          // This prevents showing "Loading" state when browser session is actually stale
          if (message.hasBrowserSession) {
            send({ type: 'start_screencast', sessionId: message.sessionId });
          }
          // Restore todo state from history
          const todoHistory: TodoHistoryEntry[] = [];
          let latestTodos: TodoItem[] = [];
          for (const item of message.history) {
            if (item.type === 'todo_update') {
              const content = item.content as { toolUseId: string; todos: TodoItem[] };
              todoHistory.push({
                id: content.toolUseId,
                timestamp: item.timestamp,
                todos: content.todos,
              });
              latestTodos = content.todos;
            }
          }
          if (todoHistory.length > 0) {
            setSessionTodoState((prev) => {
              const newMap = new Map(prev);
              newMap.set(message.sessionId, {
                current: latestTodos,
                history: todoHistory,
              });
              return newMap;
            });
          }
          // Restore isLoading state based on whether session is running
          if (message.isRunning) {
            setIsLoading(true);
          } else {
            setIsLoading(false);
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
          // Update isLoading based on status (for queued input processing)
          if (message.sessionId === activeSessionId) {
            if (message.status === 'running') {
              setIsLoading(true);
            } else if (message.status === 'idle') {
              setIsLoading(false);
              setLoadingReason(null);
            }
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
          // Debug: uncomment for thinking streaming investigation
          // console.log('[useSession] thinking_output received:', { sessionId, length: message.thinking.length });
          updateSessionMessages(sessionId, (prev) => {
            // Find the last thinking message (may not be the very last message
            // because text_output can interleave with thinking_output)
            const lastThinkingIndex = prev.findLastIndex((m) => m.type === 'thinking');
            // Debug: uncomment for thinking streaming investigation
            // console.log('[useSession] Last thinking index:', lastThinkingIndex, 'total:', prev.length);

            if (lastThinkingIndex >= 0) {
              // Check if there's a user message after the last thinking (new turn)
              const hasUserAfter = prev.slice(lastThinkingIndex + 1).some((m) => m.type === 'user');
              if (!hasUserAfter) {
                // Append to existing thinking message
                const thinkingMessage = prev[lastThinkingIndex];
                if (typeof thinkingMessage.content === 'string') {
                  const newContent = thinkingMessage.content + message.thinking;
                  // Debug: uncomment for thinking streaming investigation
                  // console.log('[useSession] Appending to thinking at index', lastThinkingIndex, 'new length:', newContent.length);
                  return [
                    ...prev.slice(0, lastThinkingIndex),
                    { ...thinkingMessage, content: newContent },
                    ...prev.slice(lastThinkingIndex + 1),
                  ];
                }
              }
            }
            // Create new thinking message
            // Debug: uncomment for thinking streaming investigation
            // console.log('[useSession] Creating new thinking message');
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

          // All tools use unified 'tool' type
          updateSessionMessages(sessionId, (prev) => [
            ...prev,
            {
              type: 'tool',
              content: {
                toolUseId,
                toolName,
                input,
                output: '',
                isComplete: false,
              } as ToolContent,
              timestamp: new Date().toISOString(),
            },
          ]);
          break;
        }

        case 'tool_output': {
          const sessionId = message.sessionId;
          const { toolUseId, output } = message;
          updateSessionMessages(sessionId, (prev) =>
            prev.map((m) => {
              if (m.type === 'tool' &&
                  (m.content as ToolContent).toolUseId === toolUseId) {
                const content = m.content as ToolContent;
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
            // Find the tool message to update
            const toolIndex = prev.findIndex(
              (m) => m.type === 'tool' &&
                     (m.content as ToolContent).toolUseId === toolUseId
            );

            if (toolIndex !== -1) {
              // Update existing tool message to complete state
              return prev.map((m, i) => {
                if (i === toolIndex) {
                  const toolContent = m.content as ToolContent;
                  return {
                    ...m,
                    content: {
                      ...toolContent,
                      output: toolContent.output || content, // Use content if no streaming output
                      isComplete: true,
                      isError: isError ?? false,
                    },
                  };
                }
                return m;
              });
            }

            // Tool not found - shouldn't happen but return unchanged
            return prev;
          });
          break;
        }

        case 'result':
          // Only update isLoading for the active session
          if (message.sessionId === activeSessionId) {
            setIsLoading(false);
            setLoadingReason(null);
          }
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

        case 'permission_cleared': {
          // Permission was resolved (allow/deny) - clear popup for all clients
          const sessionId = message.sessionId;
          setSessionPendingPermission((prev) => {
            const current = prev.get(sessionId);
            // Only clear if the requestId matches (safety check)
            if (current && current.requestId === message.requestId) {
              const newMap = new Map(prev);
              newMap.delete(sessionId);
              return newMap;
            }
            return prev;
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

        case 'todo_update': {
          const sessionId = message.sessionId;
          const { toolUseId, todos } = message;
          // Update todo state for sidebar panel
          setSessionTodoState((prev) => {
            const newMap = new Map(prev);
            const current = newMap.get(sessionId) ?? { current: [], history: [] };
            newMap.set(sessionId, {
              current: todos,
              history: [
                ...current.history,
                { id: toolUseId, timestamp: new Date().toISOString(), todos },
              ],
            });
            return newMap;
          });
          // Also add to message stream
          updateSessionMessages(sessionId, (prev) => [
            ...prev,
            {
              type: 'todo_update',
              content: { toolUseId, todos },
              timestamp: new Date().toISOString(),
            },
          ]);
          break;
        }

        case 'system_info':
          // Only update systemInfo for the active session
          if (message.sessionId === activeSessionId) {
            setSystemInfo({
              model: message.model,
              permissionMode: message.permissionMode,
              cwd: message.cwd,
              homeDir: message.homeDir,
              tools: message.tools,
            });
          }
          break;

        case 'git_status': {
          const sessionId = message.sessionId;
          setSessionGitStatus((prev) => {
            const newMap = new Map(prev);
            newMap.set(sessionId, {
              status: message.status,
              isGitRepo: message.isGitRepo,
              error: message.error,
            });
            return newMap;
          });
          break;
        }

        case 'machine_ports': {
          const sessionId = message.sessionId;
          setSessionMachineState((prev) => {
            const newMap = new Map(prev);
            const current = newMap.get(sessionId) ?? { isMonitoring: false, ports: [], processTree: null };
            newMap.set(sessionId, {
              ...current,
              isMonitoring: true,
              ports: message.summary.portList,
              processTree: message.processTree as MachineProcessInfo | null,
              error: message.error,
            });
            return newMap;
          });
          break;
        }

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
            const current = newMap.get(sessionId) ?? { inputTokens: 0, outputTokens: 0, totalInputTokens: 0 };

            if (message.isCumulative) {
              // Cumulative values from CLI modelUsage - overwrite (reflects compaction)
              // But always accumulate totalInputTokens for task size tracking
              const inputDelta = Math.max(0, message.inputTokens - current.inputTokens);
              newMap.set(sessionId, {
                inputTokens: message.inputTokens,
                outputTokens: message.outputTokens,
                cacheCreationInputTokens: message.cacheCreationInputTokens ?? 0,
                cacheReadInputTokens: message.cacheReadInputTokens ?? 0,
                totalInputTokens: (current.totalInputTokens ?? 0) + inputDelta,
              });
            } else {
              // Per-turn delta (legacy behavior) - accumulate
              newMap.set(sessionId, {
                inputTokens: current.inputTokens + message.inputTokens,
                outputTokens: current.outputTokens + message.outputTokens,
                cacheCreationInputTokens: (current.cacheCreationInputTokens ?? 0) + (message.cacheCreationInputTokens ?? 0),
                cacheReadInputTokens: (current.cacheReadInputTokens ?? 0) + (message.cacheReadInputTokens ?? 0),
                totalInputTokens: (current.totalInputTokens ?? 0) + message.inputTokens,
              });
            }
            return newMap;
          });

          // Update sessionModelUsage if contextWindow is provided
          if (message.contextWindow !== undefined && message.modelName) {
            setSessionModelUsage((prev) => {
              const newMap = new Map(prev);
              const currentUsage = newMap.get(sessionId) ?? [];
              const existingIndex = currentUsage.findIndex(m => m.modelName === message.modelName);

              if (existingIndex >= 0) {
                // Update existing entry
                const updated = [...currentUsage];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  contextWindow: message.contextWindow,
                };
                newMap.set(sessionId, updated);
              } else {
                // Create new entry
                newMap.set(sessionId, [
                  ...currentUsage,
                  {
                    modelName: message.modelName!,
                    inputTokens: message.inputTokens,
                    outputTokens: message.outputTokens,
                    cacheCreationTokens: message.cacheCreationInputTokens ?? 0,
                    cacheReadTokens: message.cacheReadInputTokens ?? 0,
                    contextWindow: message.contextWindow,
                  },
                ]);
              }
              return newMap;
            });
          }
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

        case 'settings':
          setGlobalSettings(message.settings);
          break;

        case 'error':
          // Handle errors without sessionId (e.g., session creation errors) or for active session
          if (!message.sessionId || message.sessionId === activeSessionId) {
            setError(message.message);
            setIsLoading(false);
            setLoadingReason(null);
          }
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
              browserTitle: message.browserTitle,
              // Clear frame when browser becomes inactive
              ...(message.active === false ? { frame: undefined } : {}),
            });
            return newMap;
          });
          break;
        }

        case 'screencast_cursor': {
          const sessionId = message.sessionId;
          setSessionScreencast((prev) => {
            const newMap = new Map(prev);
            const current = newMap.get(sessionId) ?? { active: false };
            newMap.set(sessionId, {
              ...current,
              cursor: message.cursor,
            });
            return newMap;
          });
          break;
        }

        case 'user_input': {
          // Add user input from another client (e.g., Slack) to messages
          const sessionId = message.sessionId;
          updateSessionMessages(sessionId, (prev) => [
            ...prev,
            {
              type: 'user',
              content: {
                text: message.content,
                source: message.source,
              },
              timestamp: message.timestamp,
            },
          ]);
          break;
        }

        // Repository management
        case 'repository_list':
          setRepositories(message.repositories);
          break;

        case 'repository_created':
          setRepositories((prev) => [...prev, message.repository]);
          break;

        case 'repository_updated':
          setRepositories((prev) =>
            prev.map((r) => (r.id === message.repository.id ? message.repository : r))
          );
          break;

        case 'repository_deleted':
          setRepositories((prev) => prev.filter((r) => r.id !== message.id));
          break;
      }
    },
    [activeSessionId, updateSessionMessages, send, pendingSessionCreate, pendingMessage]
  );

  return {
    sessions,
    activeSessionId,
    session,
    sessionsLoaded,
    repositories,
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
    todoState,
    gitStatus,
    machineState,
    listSessions,
    createSession,
    selectSession,
    deselectSession,
    deleteSession,
    renameSession,
    listRepositories,
    createRepository,
    updateRepository,
    deleteRepository,
    sendMessage,
    clearMessages,
    addSystemMessage,
    compactSession,
    respondToPermission,
    respondToQuestion,
    interrupt,
    sendStreamInput,
    setPermissionMode,
    setModel,
    startScreencast,
    stopScreencast,
    sendBrowserClick,
    sendBrowserKeyPress,
    sendBrowserScroll,
    sendBrowserMouseMove,
    sendBrowserNavigate,
    sendBrowserBack,
    sendBrowserForward,
    sendBrowserRefresh,
    startMachineMonitor,
    stopMachineMonitor,
    handleServerMessage,
    setSend,
    globalSettings,
    getSettings,
    updateSettings,
    // Pending message for error recovery
    pendingMessage,
    clearPendingMessage: useCallback(() => setPendingMessage(null), []),
  };
}
