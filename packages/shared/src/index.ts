// WebSocket message types for Claude Bridge

// ==================== Client → Server ====================

export type ClientMessage =
  // Session management
  | CreateSessionMessage
  | AttachSessionMessage
  | DetachSessionMessage
  | DeleteSessionMessage
  | RenameSessionMessage
  | ListSessionsMessage
  // User input
  | UserMessageMessage
  | InterruptMessage
  // Permission response
  | PermissionResponseMessage
  // AskUserQuestion response
  | QuestionResponseMessage;

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

export interface UserMessageMessage {
  type: 'user_message';
  sessionId: string;
  content: string;
}

export interface InterruptMessage {
  type: 'interrupt';
  sessionId: string;
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

// ==================== Server → Client ====================

export type ServerMessage =
  // Session management
  | SessionCreatedMessage
  | SessionAttachedMessage
  | SessionListMessage
  | SessionDeletedMessage
  // Agent output
  | TextOutputMessage
  | ToolUseMessage
  | ToolResultMessage
  | ResultMessage
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

export interface ResultMessage {
  type: 'result';
  sessionId: string;
  result: string;
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
}

export type SessionStatus = 'running' | 'waiting_input' | 'waiting_permission' | 'idle';

export interface MessageItem {
  type: MessageItemType;
  content: unknown;
  timestamp: string;
}

export type MessageItemType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'permission' | 'question';

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
