// Types for Claude Code stream-json output (NDJSON format)

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface RedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ThinkingBlock | RedactedThinkingBlock | ToolUseBlock | ToolResultBlock;

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
  usage?: UsageInfo;
}

export interface UserMessage {
  role: 'user';
  content: string | ContentBlock[];
}

export interface AssistantEvent {
  type: 'assistant';
  message: AssistantMessage;
}

export interface UserEvent {
  type: 'user';
  message: UserMessage;
}

/**
 * Model usage from CLI result event.
 *
 * NOTE: `inputTokens` is the SESSION CUMULATIVE value, not per-turn delta.
 * This means:
 * - Turn 1: inputTokens = 10
 * - Turn 2: inputTokens = 30 (cumulative)
 * - After compact: inputTokens should reflect compacted context size
 *
 * Test script to verify CLI behavior:
 * ```bash
 * # Create session and check cumulative inputTokens
 * SESSION=$(timeout 30 claude --output-format stream-json --verbose -p "Say hello" 2>/dev/null \
 *   | grep '"type":"system"' | head -1 | jq -r '.session_id')
 *
 * # Turn 2 - inputTokens should increase
 * timeout 30 claude --output-format stream-json --verbose --resume "$SESSION" -p "Say hello again" 2>/dev/null \
 *   | grep '"type":"result"' | jq '.modelUsage | to_entries[] | {model: .key, inputTokens: .value.inputTokens}'
 *
 * # After /compact - inputTokens should decrease (TODO: verify this)
 * timeout 30 claude --output-format stream-json --verbose --resume "$SESSION" -p "/compact" 2>/dev/null \
 *   | grep '"type":"result"' | jq '.modelUsage'
 * ```
 */
export interface ResultModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface ResultEvent {
  type: 'result';
  result: string;
  session_id?: string;
  modelUsage?: Record<string, ResultModelUsage>;
}

export interface SystemEvent {
  type: 'system';
  subtype?: string;
  session_id?: string;
  tools?: string[];
  model?: string;
  permissionMode?: string;
  cwd?: string;
  [key: string]: unknown;
}

export type StreamEvent = AssistantEvent | UserEvent | ResultEvent | SystemEvent;

export class StreamJsonParser {
  /**
   * Parse a single line of NDJSON output from Claude CLI
   */
  parseLine(line: string): StreamEvent | undefined {
    if (!line || line.trim() === '') {
      return undefined;
    }

    try {
      const parsed = JSON.parse(line);
      return parsed as StreamEvent;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract text content from an assistant event
   */
  extractTextContent(event: StreamEvent): string {
    if (event.type !== 'assistant') {
      return '';
    }

    const textBlocks = event.message.content.filter(
      (block): block is TextBlock => block.type === 'text'
    );

    return textBlocks.map(block => block.text).join('');
  }

  /**
   * Extract tool use blocks from an assistant event
   */
  extractToolUse(event: StreamEvent): ToolUseBlock[] {
    if (event.type !== 'assistant') {
      return [];
    }

    return event.message.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );
  }

  /**
   * Extract tool result blocks from an assistant event
   */
  extractToolResult(event: StreamEvent): ToolResultBlock[] {
    if (event.type !== 'assistant') {
      return [];
    }

    return event.message.content.filter(
      (block): block is ToolResultBlock => block.type === 'tool_result'
    );
  }

  /**
   * Check if this is a result event (end of response)
   */
  isResultEvent(event: StreamEvent): event is ResultEvent {
    return event.type === 'result';
  }

  /**
   * Get session ID from event (if available)
   */
  getSessionId(event: StreamEvent): string | undefined {
    if ('session_id' in event) {
      return event.session_id as string;
    }
    return undefined;
  }
}
