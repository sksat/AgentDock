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
  | McpPermissionRequestMessage;

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

// ==================== Server → Client ====================

export type ServerMessage =
  // Session management
  | SessionCreatedMessage
  | SessionAttachedMessage
  | SessionListMessage
  | SessionDeletedMessage
  // Agent output
  | TextOutputMessage
  | ThinkingOutputMessage
  | ToolUseMessage
  | ToolResultMessage
  | ToolOutputMessage
  | ResultMessage
  // System info
  | SystemInfoMessage
  // Usage info
  | UsageInfoMessage
  // Global usage (from ccusage)
  | GlobalUsageMessage
  // Permission request
  | PermissionRequestMessage
  // AskUserQuestion
  | AskUserQuestionMessage
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
}

export type SessionStatus = 'running' | 'waiting_input' | 'waiting_permission' | 'idle';

export interface MessageItem {
  type: MessageItemType;
  content: unknown;
  timestamp: string;
}

export type MessageItemType = 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'tool_output' | 'bash_tool' | 'mcp_tool' | 'permission' | 'question';

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
  | { behavior: 'allow'; updatedInput: unknown }
  | { behavior: 'deny'; message: string };

// ==================== Global Usage (from ccusage) ====================

export interface GlobalUsageMessage {
  type: 'global_usage';
  today: DailyUsage | null;
  totals: UsageTotals;
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
}
