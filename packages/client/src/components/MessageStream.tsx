import clsx from 'clsx';
import { useThinkingPreference } from '../hooks/useThinkingPreference';

export interface MessageStreamItem {
  type: 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'bash_tool' | 'mcp_tool';
  content: unknown;
  timestamp: string;
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

export interface MessageStreamProps {
  messages: MessageStreamItem[];
}

export function MessageStream({ messages }: MessageStreamProps) {
  const { isExpanded: thinkingExpanded, toggleExpanded: toggleThinkingExpanded } = useThinkingPreference();

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No messages yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
      return <UserMessage content={message.content as string} />;
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
    default:
      return null;
  }
}

function UserMessage({ content }: { content: string }) {
  return (
    <div data-testid="message-item" className="flex justify-end">
      <div className="max-w-[80%] px-4 py-3 rounded-lg bg-accent-primary text-white">
        {content}
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
  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="max-w-[90%] rounded-lg border border-border overflow-hidden">
        {/* Header: Green dot + Bash label + description */}
        <div className="px-4 py-2 bg-bg-tertiary border-b border-border flex items-center gap-2">
          <span className={clsx(
            'w-2 h-2 rounded-full',
            content.isComplete
              ? content.isError ? 'bg-accent-danger' : 'bg-accent-success'
              : 'bg-accent-warning animate-pulse'
          )}></span>
          <span className="font-mono text-sm font-medium">Bash</span>
          {content.description && (
            <span className="text-sm text-text-secondary ml-2">
              {content.description}
            </span>
          )}
        </div>

        {/* IN Section: Command */}
        <div className="border-b border-border">
          <div className="px-4 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium">
            IN
          </div>
          <pre className="px-4 py-2 bg-bg-secondary text-text-primary text-sm font-mono overflow-x-auto">
            {content.command}
          </pre>
        </div>

        {/* OUT Section: Output */}
        <div>
          <div className="px-4 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium flex items-center gap-2">
            OUT
            {!content.isComplete && (
              <span className="text-accent-warning">...</span>
            )}
          </div>
          <pre
            className={clsx(
              'px-4 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto',
              content.isError
                ? 'bg-accent-danger/10 text-accent-danger'
                : 'bg-bg-secondary text-text-secondary'
            )}
          >
            {content.output || (content.isComplete ? '(no output)' : 'Running...')}
          </pre>
        </div>
      </div>
    </div>
  );
}

function McpToolMessage({ content }: { content: McpToolContent }) {
  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="max-w-[90%] rounded-lg border border-border overflow-hidden">
        {/* Header: Green dot + MCP tool name */}
        <div className="px-4 py-2 bg-bg-tertiary border-b border-border flex items-center gap-2">
          <span className={clsx(
            'w-2 h-2 rounded-full',
            content.isComplete
              ? content.isError ? 'bg-accent-danger' : 'bg-accent-success'
              : 'bg-accent-warning animate-pulse'
          )}></span>
          <span className="font-mono text-sm font-medium">{content.toolName}</span>
        </div>

        {/* IN Section: Input */}
        <div className="border-b border-border">
          <div className="px-4 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium">
            IN
          </div>
          <pre className="px-4 py-2 bg-bg-secondary text-text-primary text-sm font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(content.input, null, 2)}
          </pre>
        </div>

        {/* OUT Section: Output */}
        <div>
          <div className="px-4 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium flex items-center gap-2">
            OUT
            {!content.isComplete && (
              <span className="text-accent-warning">...</span>
            )}
          </div>
          <pre
            className={clsx(
              'px-4 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto',
              content.isError
                ? 'bg-accent-danger/10 text-accent-danger'
                : 'bg-bg-secondary text-text-secondary'
            )}
          >
            {content.output || (content.isComplete ? '(no output)' : 'Running...')}
          </pre>
        </div>
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
