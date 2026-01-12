import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useThinkingPreference } from '../hooks/useThinkingPreference';

export interface MessageStreamItem {
  type: 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'bash_tool' | 'mcp_tool' | 'system';
  content: unknown;
  timestamp: string;
}

export interface SystemMessageContent {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export interface BashToolContent {
  toolUseId: string;
  command: string;
  description?: string;
  output: string;
  isComplete: boolean;
  isError?: boolean;
}

export interface McpToolContent {
  toolUseId: string;
  toolName: string;
  input: unknown;
  output: string;
  isComplete: boolean;
  isError?: boolean;
}

export interface ImageAttachment {
  type: 'image';
  data: string; // base64 encoded image data
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  name?: string;
}

export interface UserMessageContent {
  text: string;
  images?: ImageAttachment[];
}

export interface MessageStreamProps {
  messages: MessageStreamItem[];
}

export function MessageStream({ messages }: MessageStreamProps) {
  const { isExpanded: thinkingExpanded, toggleExpanded: toggleThinkingExpanded } = useThinkingPreference();
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevMessagesLengthRef = useRef(messages.length);

  // Scroll to bottom when messages change and autoScroll is enabled
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Reset autoScroll when user posts (detect new user message)
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.type === 'user') {
        setAutoScroll(true);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Consider "at bottom" if within 10px threshold
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;

    setAutoScroll(isAtBottom);
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No messages yet
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-4"
    >
      {messages.map((message, index) => (
        <MessageItem
          key={index}
          message={message}
          thinkingExpanded={thinkingExpanded}
          onToggleThinking={toggleThinkingExpanded}
        />
      ))}
    </div>
  );
}

interface MessageItemProps {
  message: MessageStreamItem;
  thinkingExpanded: boolean;
  onToggleThinking: () => void;
}

function MessageItem({ message, thinkingExpanded, onToggleThinking }: MessageItemProps) {
  switch (message.type) {
    case 'user':
      // Support both old string format and new object format with images
      if (typeof message.content === 'string') {
        return <UserMessage content={{ text: message.content }} />;
      }
      return <UserMessage content={message.content as UserMessageContent} />;
    case 'assistant':
      return <AssistantMessage content={message.content as string} />;
    case 'thinking':
      return <ThinkingMessage content={message.content as string} isExpanded={thinkingExpanded} onToggle={onToggleThinking} />;
    case 'bash_tool':
      return <BashToolMessage content={message.content as BashToolContent} />;
    case 'mcp_tool':
      return <McpToolMessage content={message.content as McpToolContent} />;
    case 'tool_use':
      return <ToolUseMessage content={message.content as ToolUseContent} />;
    case 'tool_result':
      return <ToolResultMessage content={message.content as ToolResultContent} />;
    case 'system':
      return <SystemMessage content={message.content as SystemMessageContent} />;
    default:
      return null;
  }
}

function UserMessage({ content }: { content: UserMessageContent }) {
  const hasImages = content.images && content.images.length > 0;

  return (
    <div data-testid="message-item" className="flex justify-end">
      <div className="max-w-[80%] flex flex-col gap-2 items-end">
        {/* Images */}
        {hasImages && (
          <div className="flex flex-wrap gap-2 justify-end">
            {content.images!.map((img, idx) => (
              <div
                key={idx}
                className="relative rounded-lg overflow-hidden border border-border bg-bg-secondary"
              >
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name ?? `Attached image ${idx + 1}`}
                  className="max-w-[300px] max-h-[200px] object-contain"
                />
              </div>
            ))}
          </div>
        )}
        {/* Text content */}
        {content.text && (
          <div className="px-4 py-3 rounded-lg bg-accent-primary text-white">
            {content.text}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="max-w-[80%] px-4 py-3 rounded-lg bg-bg-tertiary text-text-primary whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

interface ThinkingMessageProps {
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function ThinkingMessage({ content, isExpanded, onToggle }: ThinkingMessageProps) {
  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="max-w-[90%] rounded-lg border border-border/50 overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full px-4 py-2 bg-bg-secondary/50 border-b border-border/50 text-sm
                     flex items-center gap-2 text-text-secondary hover:bg-bg-secondary transition-colors"
        >
          <span className={clsx(
            'transition-transform',
            isExpanded ? 'rotate-90' : 'rotate-0'
          )}>
            ▶
          </span>
          <span className="italic">Thinking</span>
        </button>
        {isExpanded && (
          <div className="p-4 bg-bg-secondary/30 text-text-secondary text-sm whitespace-pre-wrap italic">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}

function BashToolMessage({ content }: { content: BashToolContent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Generate compact description from command
  const compactDescription = content.description || content.command.split('\n')[0].slice(0, 60) + (content.command.length > 60 ? '...' : '');

  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="rounded-lg overflow-hidden">
        {/* Compact header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary/50 rounded-lg transition-colors"
        >
          <span className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            content.isComplete
              ? content.isError ? 'bg-accent-danger' : 'bg-accent-success'
              : 'bg-accent-warning animate-pulse'
          )}></span>
          <span className="text-text-primary font-medium">Bash</span>
          <span className="text-text-secondary text-sm">{compactDescription}</span>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden">
            {/* IN Section: Command */}
            <div className="border-b border-border">
              <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium">
                IN
              </div>
              <pre className="px-3 py-2 bg-bg-secondary text-text-primary text-sm font-mono overflow-x-auto">
                {content.command}
              </pre>
            </div>

            {/* OUT Section: Output */}
            <div>
              <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium flex items-center gap-2">
                OUT
                {!content.isComplete && (
                  <span className="text-accent-warning">...</span>
                )}
              </div>
              <pre
                className={clsx(
                  'px-3 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto',
                  content.isError
                    ? 'bg-accent-danger/10 text-accent-danger'
                    : 'bg-bg-secondary text-text-secondary'
                )}
              >
                {content.output || (content.isComplete ? '(no output)' : 'Running...')}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function McpToolMessage({ content }: { content: McpToolContent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Generate compact description from input
  const inputStr = JSON.stringify(content.input);
  const compactDescription = inputStr.length > 60 ? inputStr.slice(0, 60) + '...' : inputStr;

  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="rounded-lg overflow-hidden">
        {/* Compact header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary/50 rounded-lg transition-colors"
        >
          <span className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            content.isComplete
              ? content.isError ? 'bg-accent-danger' : 'bg-accent-success'
              : 'bg-accent-warning animate-pulse'
          )}></span>
          <span className="text-text-primary font-medium">{content.toolName}</span>
          <span className="text-text-secondary text-sm">{compactDescription}</span>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden">
            {/* IN Section: Input */}
            <div className="border-b border-border">
              <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium">
                IN
              </div>
              <pre className="px-3 py-2 bg-bg-secondary text-text-primary text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(content.input, null, 2)}
              </pre>
            </div>

            {/* OUT Section: Output */}
            <div>
              <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium flex items-center gap-2">
                OUT
                {!content.isComplete && (
                  <span className="text-accent-warning">...</span>
                )}
              </div>
              <pre
                className={clsx(
                  'px-3 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto',
                  content.isError
                    ? 'bg-accent-danger/10 text-accent-danger'
                    : 'bg-bg-secondary text-text-secondary'
                )}
              >
                {content.output || (content.isComplete ? '(no output)' : 'Running...')}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolUseContent {
  toolName: string;
  toolUseId: string;
  input: unknown;
}

function ToolUseMessage({ content }: { content: ToolUseContent }) {
  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="max-w-[90%] rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2 bg-bg-tertiary border-b border-border font-mono text-sm">
          {content.toolName}
        </div>
        <pre className="p-4 bg-bg-secondary text-text-secondary text-sm overflow-x-auto">
          {JSON.stringify(content.input, null, 2)}
        </pre>
      </div>
    </div>
  );
}

interface ToolResultContent {
  toolUseId: string;
  content: string;
  isError: boolean;
}

function ToolResultMessage({ content }: { content: ToolResultContent }) {
  return (
    <div data-testid="message-item" className="flex justify-start">
      <div
        data-error={content.isError || undefined}
        className={clsx(
          'max-w-[90%] rounded-lg border overflow-hidden',
          content.isError ? 'border-accent-danger' : 'border-border'
        )}
      >
        <pre
          className={clsx(
            'p-4 text-sm overflow-x-auto whitespace-pre-wrap',
            content.isError ? 'bg-accent-danger/10 text-accent-danger' : 'bg-bg-secondary text-text-secondary'
          )}
        >
          {content.content}
        </pre>
      </div>
    </div>
  );
}

function SystemMessage({ content }: { content: SystemMessageContent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const dotColors = {
    info: 'bg-accent-primary',
    success: 'bg-accent-success',
    warning: 'bg-accent-warning',
    error: 'bg-accent-danger',
  };

  // Get first line for compact view, rest for expanded
  const lines = content.message.split('\n');
  const firstLine = lines[0];
  const hasMore = lines.length > 1;

  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="rounded-lg overflow-hidden">
        {/* Compact header - always visible */}
        <button
          onClick={() => hasMore && setIsExpanded(!isExpanded)}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-left',
            hasMore && 'hover:bg-bg-tertiary/50 cursor-pointer'
          )}
        >
          <span className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            dotColors[content.type ?? 'info']
          )}></span>
          <span className="text-text-primary font-medium">{content.title}</span>
          <span className="text-text-secondary text-sm">{firstLine}</span>
        </button>

        {/* Expanded content */}
        {isExpanded && hasMore && (
          <div className="ml-7 px-3 py-2 text-text-secondary text-sm whitespace-pre-wrap">
            {lines.slice(1).join('\n')}
          </div>
        )}
      </div>
    </div>
  );
}
