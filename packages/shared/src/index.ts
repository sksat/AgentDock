// WebSocket message types for Claude Bridge

// ==================== Client → Server ====================

export type PermissionMode = 'ask' | 'auto-edit' | 'plan';

/** Runner backend type - how Claude Code is executed */
export type RunnerBackend = 'native' | 'podman';

/** Check if a runner backend is container-based */
export function isContainerBackend(backend: RunnerBackend | undefined): boolean {
  return backend === 'podman';
}

// ==================== Repository Types ====================

/** Repository type - how the repository is managed */
export type RepositoryType = 'local' | 'local-git-worktree' | 'remote-git';

/** Remote Git provider (for remote-git repositories) */
export type RemoteGitProvider = 'github' | 'gitlab' | 'bitbucket' | 'other';

/** Repository information */
export interface Repository {
  id: string;
  name: string;
  /** local/local-git-worktree: local path, remote-git: will be set after clone */
  path: string;
  type: RepositoryType;
  createdAt: string;
  updatedAt: string;
  // remote-git specific fields
  remoteProvider?: RemoteGitProvider;
  remoteUrl?: string;
  remoteBranch?: string;
}

// ==================== Project Selection Types ====================

/**
 * Selected project for session creation.
 * User selects a "Project", and the actual working directory is determined automatically.
 */
export type SelectedProject =
  | { type: 'repository'; repositoryId: string }
  | { type: 'recent'; path: string; repositoryId?: string }
  | { type: 'custom'; path: string; useGitWorktree?: boolean };

/**
 * Recent project extracted from session history.
 * Used to show recently used projects in the project selector.
 */
export interface RecentProject {
  /** Working directory path */
  path: string;
  /** Associated repository ID (if any) */
  repositoryId?: string;
  /** Repository name for display (if associated with a repository) */
  repositoryName?: string;
  /** Last used timestamp (ISO string) */
  lastUsed: string;
}

// ==================== AgentDock Tool Name Formatting ====================

/**
 * Check if a tool name is an AgentDock integrated MCP tool (mcp__bridge__*)
 */
export function isAgentDockTool(toolName: string): boolean {
  return /^mcp__bridge__/.test(toolName);
}

/**
 * Format AgentDock integrated MCP tool names for display.
 *
 * AgentDock tools use the naming convention `mcp__bridge__<category>_<action>`.
 * This function converts them to human-readable display names.
 *
 * Examples:
 *   - mcp__bridge__browser_navigate -> "browser: navigate"
 *   - mcp__bridge__browser_click -> "browser: click"
 *   - mcp__bridge__port_monitor -> "port monitor"
 *   - mcp__bridge__permission_prompt -> "permission prompt"
 *
 * @param toolName The raw tool name
 * @returns Formatted display name, or original name if not an AgentDock tool
 */
export function formatAgentDockToolName(toolName: string): string {
  if (!isAgentDockTool(toolName)) {
    return toolName;
  }

  // Extract the part after mcp__bridge__
  const name = toolName.replace(/^mcp__bridge__/, '');

  // Handle browser tools specially: browser_navigate -> "browser: navigate"
  if (name.startsWith('browser_')) {
    const action = name.replace(/^browser_/, '').replace(/_/g, ' ');
    return `browser: ${action}`;
  }

  // For other tools: port_monitor -> "port monitor"
  return name.replace(/_/g, ' ');
}

/**
 * Get a short display name for any MCP tool.
 * Handles both AgentDock tools and external MCP tools.
 *
 * @param toolName The raw tool name
 * @returns Short display name suitable for UI
 */
export function getToolDisplayName(toolName: string): string {
  // AgentDock integrated tools
  if (isAgentDockTool(toolName)) {
    return formatAgentDockToolName(toolName);
  }

  // External MCP tools: mcp__plugin_xxx__tool_name -> "tool name"
  // Use greedy match to capture everything after the LAST "__"
  const externalMatch = toolName.match(/^mcp__.*__(.+)$/);
  if (externalMatch) {
    return externalMatch[1].replace(/_/g, ' ');
  }

  // Standard Claude Code tools or unknown
  return toolName;
}

export type ClientMessage =
  // Session management
  | CreateSessionMessage
  | AttachSessionMessage
  | DetachSessionMessage
  | DeleteSessionMessage
  | RenameSessionMessage
  | ListSessionsMessage
  | CompactSessionMessage
  // User input
  | UserMessageMessage
  | StreamInputMessage
  | InterruptMessage
  // Settings
  | SetPermissionModeMessage
  | SetModelMessage
  // Permission response (from frontend)
  | PermissionResponseMessage
  // AskUserQuestion response
  | QuestionResponseMessage
  // Permission request (from MCP server)
  | McpPermissionRequestMessage
  // Screencast control
  | StartScreencastMessage
  | StopScreencastMessage
  // Browser commands (from MCP server)
  | BrowserCommandMessage
  // User browser interaction (from client UI)
  | UserBrowserClickMessage
  | UserBrowserKeyPressMessage
  | UserBrowserScrollMessage
  | UserBrowserMouseMoveMessage
  | UserBrowserNavigateMessage
  | UserBrowserBackMessage
  | UserBrowserForwardMessage
  | UserBrowserRefreshMessage
  // Thread binding management (for Slack persistence)
  | SaveThreadBindingMessage
  | LoadThreadBindingsMessage
  // Global settings
  | GetSettingsMessage
  | UpdateSettingsMessage
  // Machine monitor (port monitoring)
  | StartMachineMonitorMessage
  | StopMachineMonitorMessage
  // Repository management
  | ListRepositoriesMessage
  | CreateRepositoryMessage
  | UpdateRepositoryMessage
  | DeleteRepositoryMessage;

export interface CreateSessionMessage {
  type: 'create_session';
  name?: string;
  workingDir?: string;
  /** Runner backend to use for this session */
  runnerBackend?: RunnerBackend;
  /** Whether to run browser in container (default: true when runnerBackend is 'podman') */
  browserInContainer?: boolean;
  /** Repository ID to use for this session (alternative to workingDir) */
  repositoryId?: string;
  /** Custom worktree name for git repositories (default: agentdock-{sessionId}) */
  worktreeName?: string;
}

export interface AttachSessionMessage {
  type: 'attach_session';
  sessionId: string;
}

export interface DetachSessionMessage {
  type: 'detach_session';
  sessionId: string;
}

export interface DeleteSessionMessage {
  type: 'delete_session';
  sessionId: string;
}

export interface RenameSessionMessage {
  type: 'rename_session';
  sessionId: string;
  name: string;
}

export interface ListSessionsMessage {
  type: 'list_sessions';
}

export interface CompactSessionMessage {
  type: 'compact_session';
  sessionId: string;
}

export interface ImageAttachment {
  type: 'image';
  data: string; // base64 encoded image data
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  name?: string;
}

export type InputSource = 'web' | 'slack';

export interface SlackContext {
  channelId: string;
  threadTs: string;
  userId: string;
}

export interface UserMessageMessage {
  type: 'user_message';
  sessionId: string;
  content: string;
  images?: ImageAttachment[];
  /** Source of the input (web UI or Slack) */
  source?: InputSource;
  /** Slack context when source is 'slack' */
  slackContext?: SlackContext;
  /** Enable extended thinking mode for this message */
  thinkingEnabled?: boolean;
}

/** Send additional input to a running session (stream input during execution) */
export interface StreamInputMessage {
  type: 'stream_input';
  sessionId: string;
  content: string;
}

export interface InterruptMessage {
  type: 'interrupt';
  sessionId: string;
}

export interface SetPermissionModeMessage {
  type: 'set_permission_mode';
  sessionId: string;
  mode: PermissionMode;
}

export interface SetModelMessage {
  type: 'set_model';
  sessionId: string;
  model: string;
  /** Previous model (for logging the change) */
  oldModel?: string;
}

export interface PermissionResponseMessage {
  type: 'permission_response';
  sessionId: string;
  requestId: string;
  response: PermissionResult;
}

export interface QuestionResponseMessage {
  type: 'question_response';
  sessionId: string;
  requestId: string;
  answers: Record<string, string>;
}

// MCP Server → Bridge Server (permission request from claude CLI)
export interface McpPermissionRequestMessage {
  type: 'permission_request';
  sessionId: string;
  requestId: string;
  toolName: string;
  input: unknown;
}

// Screencast control messages
export interface StartScreencastMessage {
  type: 'start_screencast';
  sessionId: string;
}

export interface StopScreencastMessage {
  type: 'stop_screencast';
  sessionId: string;
}

// User browser interaction (from client UI)
export interface UserBrowserClickMessage {
  type: 'user_browser_click';
  sessionId: string;
  x: number;
  y: number;
}

export interface UserBrowserKeyPressMessage {
  type: 'user_browser_key_press';
  sessionId: string;
  key: string;
}

export interface UserBrowserScrollMessage {
  type: 'user_browser_scroll';
  sessionId: string;
  deltaX: number;
  deltaY: number;
}

export interface UserBrowserMouseMoveMessage {
  type: 'user_browser_mouse_move';
  sessionId: string;
  x: number;
  y: number;
}

export interface UserBrowserNavigateMessage {
  type: 'user_browser_navigate';
  sessionId: string;
  url: string;
}

export interface UserBrowserBackMessage {
  type: 'user_browser_back';
  sessionId: string;
}

export interface UserBrowserForwardMessage {
  type: 'user_browser_forward';
  sessionId: string;
}

export interface UserBrowserRefreshMessage {
  type: 'user_browser_refresh';
  sessionId: string;
}

// Browser command messages (MCP Server → AgentDock Server)
export interface BrowserCommandMessage {
  type: 'browser_command';
  sessionId: string;
  requestId: string;
  command: BrowserCommand;
}

// Browser command types
export type BrowserCommand =
  | BrowserNavigateCommand
  | BrowserNavigateBackCommand
  | BrowserClickCommand
  | BrowserHoverCommand
  | BrowserTypeCommand
  | BrowserPressKeyCommand
  | BrowserSelectOptionCommand
  | BrowserDragCommand
  | BrowserFillFormCommand
  | BrowserSnapshotCommand
  | BrowserScreenshotCommand
  | BrowserConsoleMessagesCommand
  | BrowserNetworkRequestsCommand
  | BrowserEvaluateCommand
  | BrowserWaitForCommand
  | BrowserHandleDialogCommand
  | BrowserResizeCommand
  | BrowserTabsCommand
  | BrowserCloseCommand;

export interface BrowserNavigateCommand {
  name: 'browser_navigate';
  url: string;
}

export interface BrowserNavigateBackCommand {
  name: 'browser_navigate_back';
}

export interface BrowserClickCommand {
  name: 'browser_click';
  element: string;
  ref: string;
  button?: 'left' | 'right' | 'middle';
  modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
  doubleClick?: boolean;
}

export interface BrowserHoverCommand {
  name: 'browser_hover';
  element: string;
  ref: string;
}

export interface BrowserTypeCommand {
  name: 'browser_type';
  element: string;
  ref: string;
  text: string;
  slowly?: boolean;
  submit?: boolean;
}

export interface BrowserPressKeyCommand {
  name: 'browser_press_key';
  key: string;
}

export interface BrowserSelectOptionCommand {
  name: 'browser_select_option';
  element: string;
  ref: string;
  values: string[];
}

export interface BrowserDragCommand {
  name: 'browser_drag';
  startElement: string;
  startRef: string;
  endElement: string;
  endRef: string;
}

export interface BrowserFormField {
  name: string;
  type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
  ref: string;
  value: string;
}

export interface BrowserFillFormCommand {
  name: 'browser_fill_form';
  fields: BrowserFormField[];
}

export interface BrowserSnapshotCommand {
  name: 'browser_snapshot';
}

export interface BrowserScreenshotCommand {
  name: 'browser_take_screenshot';
  element?: string;
  ref?: string;
  fullPage?: boolean;
}

export interface BrowserConsoleMessagesCommand {
  name: 'browser_console_messages';
  level?: 'error' | 'warning' | 'info' | 'debug';
}

export interface BrowserNetworkRequestsCommand {
  name: 'browser_network_requests';
  includeStatic?: boolean;
}

export interface BrowserEvaluateCommand {
  name: 'browser_evaluate';
  function: string;
  element?: string;
  ref?: string;
}

export interface BrowserWaitForCommand {
  name: 'browser_wait_for';
  text?: string;
  textGone?: string;
  time?: number;
}

export interface BrowserHandleDialogCommand {
  name: 'browser_handle_dialog';
  accept: boolean;
  promptText?: string;
}

export interface BrowserResizeCommand {
  name: 'browser_resize';
  width: number;
  height: number;
}

export interface BrowserTabsCommand {
  name: 'browser_tabs';
  action: 'list' | 'new' | 'close' | 'select';
  index?: number;
}

export interface BrowserCloseCommand {
  name: 'browser_close';
}

// ==================== Server → Client ====================

export type ServerMessage =
  // Session management
  | SessionCreatedMessage
  | SessionAttachedMessage
  | SessionListMessage
  | SessionDeletedMessage
  | SessionStatusChangedMessage
  // User input (broadcast to other clients)
  | UserInputMessage
  // Agent output
  | TextOutputMessage
  | ThinkingOutputMessage
  | ToolUseMessage
  | ToolResultMessage
  | ToolOutputMessage
  | ResultMessage
  // System info
  | SystemInfoMessage
  // Git status
  | GitStatusMessage
  // System message (for logging)
  | SystemMessageMessage
  // Usage info
  | UsageInfoMessage
  // Global usage (from ccusage)
  | GlobalUsageMessage
  // Permission request
  | PermissionRequestMessage
  // Permission cleared (sync across clients)
  | PermissionClearedMessage
  // AskUserQuestion
  | AskUserQuestionMessage
  // TodoWrite
  | TodoUpdateMessage
  // Screencast
  | ScreencastFrameMessage
  | ScreencastStatusMessage
  | ScreencastCursorMessage
  // Browser command result
  | BrowserCommandResultMessage
  // Thread binding responses (for Slack persistence)
  | ThreadBindingsListMessage
  | ThreadBindingSavedMessage
  // Global settings
  | SettingsMessage
  // Machine monitor (port monitoring)
  | MachinePortsMessage
  // Repository management
  | RepositoryListMessage
  | RepositoryCreatedMessage
  | RepositoryUpdatedMessage
  | RepositoryDeletedMessage
  // Error
  | ErrorMessage;

export interface SessionCreatedMessage {
  type: 'session_created';
  session: SessionInfo;
}

export interface SessionAttachedMessage {
  type: 'session_attached';
  sessionId: string;
  history: MessageItem[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
  modelUsage?: Array<{
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    contextWindow?: number;
  }>;
  /** Pending permission request that needs user response */
  pendingPermission?: {
    requestId: string;
    toolName: string;
    input: unknown;
  };
  /** Whether a browser session exists for this session */
  hasBrowserSession?: boolean;
  /** Whether the session is currently running (Claude CLI is executing) */
  isRunning?: boolean;
  /** Current permission mode for the session */
  permissionMode?: PermissionMode;
}

export interface SessionListMessage {
  type: 'session_list';
  sessions: SessionInfo[];
}

export interface SessionDeletedMessage {
  type: 'session_deleted';
  sessionId: string;
}

export interface SessionStatusChangedMessage {
  type: 'session_status_changed';
  sessionId: string;
  status: SessionStatus;
}

/** User input broadcast to all clients attached to a session */
export interface UserInputMessage {
  type: 'user_input';
  sessionId: string;
  content: string;
  /** Source of the input (web UI or Slack) */
  source: InputSource;
  /** Slack context when source is 'slack' */
  slackContext?: SlackContext;
  /** Timestamp when the input was received */
  timestamp: string;
}

export interface TextOutputMessage {
  type: 'text_output';
  sessionId: string;
  text: string;
}

export interface ThinkingOutputMessage {
  type: 'thinking_output';
  sessionId: string;
  thinking: string;
}

export interface ToolUseMessage {
  type: 'tool_use';
  sessionId: string;
  toolName: string;
  toolUseId: string;
  input: unknown;
}

export interface ToolResultMessage {
  type: 'tool_result';
  sessionId: string;
  toolUseId: string;
  content: string;
  isError?: boolean;
  /** Filename of the screenshot if this was a screenshot tool result */
  screenshotFilename?: string;
}

export interface ToolOutputMessage {
  type: 'tool_output';
  sessionId: string;
  toolUseId: string;
  output: string;
}

export interface ResultMessage {
  type: 'result';
  sessionId: string;
  result: string;
}

export interface SystemInfoMessage {
  type: 'system_info';
  sessionId: string;
  model?: string;
  permissionMode?: string;
  cwd?: string;
  /** User's home directory (e.g., /home/user) */
  homeDir?: string;
  tools?: string[];
}

// ==================== Git Status Messages ====================

/** Git repository status information */
export interface GitStatus {
  /** Current branch name (e.g., "main", "feat/setup-ci") */
  branch: string;
  /** Short commit hash (7 chars, e.g., "c85e95b") */
  commitHash: string;
  /** Number of changed files (staged + unstaged + untracked) */
  changedFilesCount: number;
  /** Whether there are uncommitted changes */
  isDirty: boolean;
  /** Number of staged files */
  staged?: number;
  /** Number of unstaged files */
  unstaged?: number;
  /** Number of untracked files */
  untracked?: number;
}

/** Git status message sent periodically from server */
export interface GitStatusMessage {
  type: 'git_status';
  sessionId: string;
  /** Git status data, null if not a git repo or error */
  status: GitStatus | null;
  /** Whether the working directory is a git repository */
  isGitRepo: boolean;
  /** Error message if git command failed */
  error?: string;
}

export interface SystemMessageMessage {
  type: 'system_message';
  sessionId: string;
  content: {
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error';
  };
}

export interface UsageInfoMessage {
  type: 'usage_info';
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  /**
   * If true, values are session cumulative (from CLI modelUsage).
   * If false/undefined, values are per-turn delta (legacy behavior).
   * Cumulative values should overwrite, delta values should accumulate.
   */
  isCumulative?: boolean;
  /**
   * Context window size from CLI result.
   * Used to calculate context occupancy percentage.
   */
  contextWindow?: number;
  /**
   * Model name this usage applies to.
   * Required when contextWindow is provided for modelUsage updates.
   */
  modelName?: string;
}

export interface PermissionRequestMessage {
  type: 'permission_request';
  sessionId: string;
  requestId: string;
  toolName: string;
  input: unknown;
}

/** Broadcast when a permission request has been resolved (allow/deny) */
export interface PermissionClearedMessage {
  type: 'permission_cleared';
  sessionId: string;
  requestId: string;
}

export interface AskUserQuestionMessage {
  type: 'ask_user_question';
  sessionId: string;
  requestId: string;
  questions: QuestionItem[];
}

// ==================== TodoWrite Messages ====================

/** Individual todo item from TodoWrite tool */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/** Todo update message sent when Claude uses TodoWrite */
export interface TodoUpdateMessage {
  type: 'todo_update';
  sessionId: string;
  toolUseId: string;
  todos: TodoItem[];
}

// ==================== Screencast Messages ====================

export interface ScreencastMetadata {
  /** Device width in pixels */
  deviceWidth: number;
  /** Device height in pixels */
  deviceHeight: number;
  /** Timestamp when the frame was captured */
  timestamp: number;
}

export interface ScreencastFrameMessage {
  type: 'screencast_frame';
  sessionId: string;
  /** Base64 encoded image data */
  data: string;
  /** Frame metadata */
  metadata: ScreencastMetadata;
}

export interface ScreencastStatusMessage {
  type: 'screencast_status';
  sessionId: string;
  /** Whether screencast is currently active */
  active: boolean;
  /** Current browser URL */
  browserUrl?: string;
  /** Current page title */
  browserTitle?: string;
}

export interface ScreencastCursorMessage {
  type: 'screencast_cursor';
  sessionId: string;
  /** CSS cursor value (e.g., 'pointer', 'text', 'default') */
  cursor: string;
}

// Browser command result (Server → MCP Server)
export interface BrowserCommandResultMessage {
  type: 'browser_command_result';
  sessionId: string;
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface ErrorMessage {
  type: 'error';
  sessionId?: string;
  message: string;
}

// ==================== Common Types ====================

export interface SessionInfo {
  id: string;
  name: string;
  createdAt: string;
  workingDir: string;
  status: SessionStatus;
  claudeSessionId?: string; // Claude CLI's session ID for --resume
  permissionMode?: PermissionMode;
  model?: string;
  /** Usage data from ccusage (optional, may not be available) */
  usage?: SessionUsageInfo;
  /** Runner backend used for this session */
  runnerBackend?: RunnerBackend;
  /** Whether browser runs in container (only relevant when runnerBackend is 'podman') */
  browserInContainer?: boolean;
  /** Session-level override for auto-allowing WebFetch/WebSearch (null = use global setting) */
  autoAllowWebTools?: boolean | null;
}

export type SessionStatus = 'running' | 'waiting_input' | 'waiting_permission' | 'idle';

export interface MessageItem {
  type: MessageItemType;
  content: unknown;
  timestamp: string;
}

export type MessageItemType = 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'tool_output' | 'bash_tool' | 'mcp_tool' | 'permission' | 'question' | 'system' | 'todo_update';

export interface QuestionItem {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface QuestionOption {
  label: string;
  description: string;
}

// Permission result types (matches Claude Code's expected format)
export type PermissionResult =
  | {
      behavior: 'allow';
      updatedInput: unknown;
      allowForSession?: boolean;
      toolName?: string;
      /** Permission pattern for session-wide allowance, e.g., "Bash(git:*)" */
      pattern?: string;
    }
  | { behavior: 'deny'; message: string };

// ==================== Global Usage (from ccusage) ====================

export interface GlobalUsageMessage {
  type: 'global_usage';
  today: DailyUsage | null;
  totals: UsageTotals;
  /** Daily usage history (sorted by date ascending) */
  daily: DailyUsage[];
  /** Block usage history for finer granularity (sorted by startTime ascending) */
  blocks: BlockUsage[];
}

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  totalTokens: number;
  modelBreakdowns?: ModelBreakdown[];
}

/** Usage data for a 5-hour block (from ccusage blocks) */
export interface BlockUsage {
  /** Block ID (ISO timestamp of start time) */
  id: string;
  /** Block start time (ISO 8601) */
  startTime: string;
  /** Block end time (ISO 8601) */
  endTime: string;
  /** Whether this block is currently active */
  isActive: boolean;
  /** Whether this is a gap between blocks (no activity) */
  isGap: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
}

/** Usage data for a session (from ccusage or internal tracking) */
export interface SessionUsageInfo {
  /** ccusage session ID (derived from working directory path, optional for internal data) */
  ccusageSessionId?: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** Last activity timestamp (ISO 8601 or date string), optional for internal data */
  lastActivity?: string;
  modelsUsed: string[];
}

// ==================== Slack Integration Types ====================

/** Binding between a Slack thread and an AgentDock session */
export interface SlackThreadBinding {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  agentDockSessionId: string;
  createdAt: string;
}

// ==================== Thread Binding Messages (for Slack persistence) ====================

/** Client -> Server: Request to save a thread binding */
export interface SaveThreadBindingMessage {
  type: 'save_thread_binding';
  binding: SlackThreadBinding;
}

/** Client -> Server: Request to load all thread bindings */
export interface LoadThreadBindingsMessage {
  type: 'load_thread_bindings';
}

// ==================== Global Settings Messages ====================

/** Global application settings */
export interface GlobalSettings {
  defaultThinkingEnabled: boolean;
  defaultModel: string;
  defaultPermissionMode: string;
  /** Default runner backend for new sessions */
  defaultRunnerBackend: RunnerBackend;
  /** Default browser in container setting (default: true, follows runnerBackend by default) */
  defaultBrowserInContainer: boolean;
  /** Auto-allow WebFetch/WebSearch tools without permission (default: false) */
  autoAllowWebTools: boolean;
  /** Base path for tmpfs copies (for local repository type) */
  tmpfsBasePath: string;
  /** Cache directory path (for remote-git repository clones) */
  cacheDir: string;
}

/** Client -> Server: Request to get current settings */
export interface GetSettingsMessage {
  type: 'get_settings';
}

/** Client -> Server: Request to update settings */
export interface UpdateSettingsMessage {
  type: 'update_settings';
  settings: Partial<GlobalSettings>;
}

/** Server -> Client: Current settings */
export interface SettingsMessage {
  type: 'settings';
  settings: GlobalSettings;
}

/** Server -> Client: Response with all thread bindings */
export interface ThreadBindingsListMessage {
  type: 'thread_bindings_list';
  bindings: SlackThreadBinding[];
}

/** Server -> Client: Confirmation of saved binding */
export interface ThreadBindingSavedMessage {
  type: 'thread_binding_saved';
  binding: SlackThreadBinding;
}

// ==================== Machine Monitor Messages (Port Monitoring) ====================

/** Port information for a listening socket */
export interface MachinePortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  address: string;
  state: string;
}

/** Process information with port data */
export interface MachineProcessInfo {
  pid: number;
  command: string;
  commandShort: string;
  ports: MachinePortInfo[];
  parentPid: number | null;
  children: MachineProcessInfo[];
}

/** Client -> Server: Start monitoring ports for a session */
export interface StartMachineMonitorMessage {
  type: 'start_machine_monitor';
  sessionId: string;
}

/** Client -> Server: Stop monitoring ports for a session */
export interface StopMachineMonitorMessage {
  type: 'stop_machine_monitor';
  sessionId: string;
}

/** Server -> Client: Port monitoring data */
export interface MachinePortsMessage {
  type: 'machine_ports';
  sessionId: string;
  /** Process tree with port information */
  processTree: MachineProcessInfo | null;
  /** Summary of all listening ports */
  summary: {
    totalProcesses: number;
    totalListeningPorts: number;
    portList: number[];
  };
  /** Error message if monitoring failed */
  error?: string;
}

// ==================== Repository Messages ====================

/** Client -> Server: Request to list all repositories */
export interface ListRepositoriesMessage {
  type: 'list_repositories';
}

/** Client -> Server: Request to create a repository */
export interface CreateRepositoryMessage {
  type: 'create_repository';
  name: string;
  path: string;
  repositoryType: RepositoryType;
  // remote-git specific
  remoteUrl?: string;
  remoteBranch?: string;
}

/** Client -> Server: Request to update a repository */
export interface UpdateRepositoryMessage {
  type: 'update_repository';
  id: string;
  name?: string;
  path?: string;
  repositoryType?: RepositoryType;
  remoteUrl?: string;
  remoteBranch?: string;
}

/** Client -> Server: Request to delete a repository */
export interface DeleteRepositoryMessage {
  type: 'delete_repository';
  id: string;
}

/** Server -> Client: List of repositories */
export interface RepositoryListMessage {
  type: 'repository_list';
  repositories: Repository[];
}

/** Server -> Client: Repository created */
export interface RepositoryCreatedMessage {
  type: 'repository_created';
  repository: Repository;
}

/** Server -> Client: Repository updated */
export interface RepositoryUpdatedMessage {
  type: 'repository_updated';
  repository: Repository;
}

/** Server -> Client: Repository deleted */
export interface RepositoryDeletedMessage {
  type: 'repository_deleted';
  id: string;
}

// ==================== Model Limits ====================
export * from './model-limits.js';
