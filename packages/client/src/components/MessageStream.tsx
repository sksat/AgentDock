import clsx from 'clsx';

export interface MessageStreamItem {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: unknown;
  timestamp: string;
}

export interface MessageStreamProps {
  messages: MessageStreamItem[];
}

export function MessageStream({ messages }: MessageStreamProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        メッセージはまだありません
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => (
        <MessageItem key={index} message={message} />
      ))}
    </div>
  );
}

interface MessageItemProps {
  message: MessageStreamItem;
}

function MessageItem({ message }: MessageItemProps) {
  switch (message.type) {
    case 'user':
      return <UserMessage content={message.content as string} />;
    case 'assistant':
      return <AssistantMessage content={message.content as string} />;
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
