// Types for Claude Code stream-json output (NDJSON format)

export interface TextBlock {
  type: 'text';
  text: string;
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

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
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

export interface ResultEvent {
  type: 'result';
  result: string;
  session_id?: string;
}

export interface SystemEvent {
  type: 'system';
  subtype?: string;
  session_id?: string;
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
