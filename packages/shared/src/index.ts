// WebSocket message types for Claude Bridge

// ==================== Client → Server ====================

export type PermissionMode = 'ask' | 'auto-edit' | 'plan';

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
  | UserBrowserRefreshMessage;

export interface CreateSessionMessage {
  type: 'create_session';
  name?: string;
  workingDir?: string;
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

export interface UserMessageMessage {
  type: 'user_message';
  sessionId: string;
  content: string;
  images?: ImageAttachment[];
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
  // Agent output
  | TextOutputMessage
  | ThinkingOutputMessage
  | ToolUseMessage
  | ToolResultMessage
  | ToolOutputMessage
  | ResultMessage
  // System info
  | SystemInfoMessage
  // System message (for logging)
  | SystemMessageMessage
  // Usage info
  | UsageInfoMessage
  // Global usage (from ccusage)
  | GlobalUsageMessage
  // Permission request
  | PermissionRequestMessage
  // AskUserQuestion
  | AskUserQuestionMessage
  // Screencast
  | ScreencastFrameMessage
  | ScreencastStatusMessage
  | ScreencastCursorMessage
  // Browser command result
  | BrowserCommandResultMessage
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
  }>;
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
  tools?: string[];
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
}

export interface PermissionRequestMessage {
  type: 'permission_request';
  sessionId: string;
  requestId: string;
  toolName: string;
  input: unknown;
}

export interface AskUserQuestionMessage {
  type: 'ask_user_question';
  sessionId: string;
  requestId: string;
  questions: QuestionItem[];
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
}

export type SessionStatus = 'running' | 'waiting_input' | 'waiting_permission' | 'idle';

export interface MessageItem {
  type: MessageItemType;
  content: unknown;
  timestamp: string;
}

export type MessageItemType = 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'tool_output' | 'bash_tool' | 'mcp_tool' | 'permission' | 'question' | 'system';

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
  | { behavior: 'allow'; updatedInput: unknown; allowForSession?: boolean; toolName?: string }
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
