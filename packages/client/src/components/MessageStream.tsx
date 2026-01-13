import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useThinkingPreference } from '../hooks/useThinkingPreference';

export interface MessageStreamItem {
  type: 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'bash_tool' | 'mcp_tool' | 'system' | 'question';
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

export interface QuestionAnswer {
  question: string;
  answer: string;
}

export interface QuestionMessageContent {
  answers: QuestionAnswer[];
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
    case 'question':
      return <QuestionMessage content={message.content as QuestionMessageContent} />;
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

// Helper to format browser tool display
function formatBrowserTool(toolName: string, input: unknown): { prefix: string; shortName: string; description: string } | null {
  // Match AgentDock bridge browser tools (mcp__bridge__browser_*)
  const bridgeMatch = toolName.match(/^mcp__bridge__browser_(.+)$/);
  // Match external MCP Playwright browser tools (mcp__plugin_playwright_*__browser_*)
  const playwrightMatch = toolName.match(/^mcp__plugin_playwright_[^_]+__browser_(.+)$/);
  // Also match direct browser_ prefix
  const directMatch = toolName.match(/^browser_(.+)$/);

  const match = bridgeMatch || playwrightMatch || directMatch;
  if (!match) return null;

  // External Playwright MCP = "playwright:", AgentDock built-in/bridge = "browser:"
  const isExternalPlaywright = !!playwrightMatch;
  const action = match[1];
  const inp = input as Record<string, unknown>;

  // Generate human-readable description based on action type
  let description = '';
  switch (action) {
    case 'navigate':
      description = inp.url ? String(inp.url) : '';
      break;
    case 'navigate_back':
      description = 'Go back';
      break;
    case 'click':
      description = inp.element ? String(inp.element) : '';
      break;
    case 'hover':
      description = inp.element ? `Hover: ${inp.element}` : '';
      break;
    case 'type':
      description = inp.text ? `"${String(inp.text).slice(0, 30)}${String(inp.text).length > 30 ? '...' : ''}"` : '';
      break;
    case 'press_key':
      description = inp.key ? String(inp.key) : '';
      break;
    case 'fill_form':
      description = inp.fields ? `${(inp.fields as unknown[]).length} fields` : '';
      break;
    case 'select_option':
      description = inp.element ? String(inp.element) : '';
      break;
    case 'snapshot':
      description = 'Capture page state';
      break;
    case 'take_screenshot':
      description = inp.element ? String(inp.element) : 'Full page';
      break;
    case 'wait_for':
      if (inp.text) description = `Text: "${inp.text}"`;
      else if (inp.textGone) description = `Text gone: "${inp.textGone}"`;
      else if (inp.time) description = `${inp.time}s`;
      break;
    case 'resize':
      description = inp.width && inp.height ? `${inp.width}×${inp.height}` : '';
      break;
    case 'tabs':
      description = inp.action ? String(inp.action) : '';
      break;
    case 'close':
      description = 'Close browser';
      break;
    case 'install':
      description = 'Install browser';
      break;
    case 'console_messages':
      description = inp.level ? `Level: ${inp.level}` : 'All messages';
      break;
    case 'network_requests':
      description = 'Capture requests';
      break;
    case 'evaluate':
      description = 'Run JavaScript';
      break;
    case 'handle_dialog':
      description = inp.accept ? 'Accept dialog' : 'Dismiss dialog';
      break;
    case 'drag':
      description = inp.startElement && inp.endElement ? `${inp.startElement} → ${inp.endElement}` : '';
      break;
    default:
      description = '';
  }

  return {
    prefix: isExternalPlaywright ? 'playwright' : 'browser',
    shortName: action.replace(/_/g, ' '),
    description,
  };
}

function McpToolMessage({ content }: { content: McpToolContent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if this is a browser tool
  const browserInfo = formatBrowserTool(content.toolName, content.input);

  // Generate compact description from input (fallback for non-browser tools)
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

          {browserInfo ? (
            // Browser/Playwright tool: show simplified format
            <>
              <span className="text-text-secondary text-sm">{browserInfo.prefix}:</span>
              <span className="text-text-primary font-medium">{browserInfo.shortName}</span>
              {browserInfo.description && (
                <span className="text-text-secondary text-sm truncate max-w-[300px]">{browserInfo.description}</span>
              )}
            </>
          ) : (
            // Other MCP tools: show original format
            <>
              <span className="text-text-primary font-medium">{content.toolName}</span>
              <span className="text-text-secondary text-sm">{compactDescription}</span>
            </>
          )}
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

// Helper to format file tool display
function formatFileTool(toolName: string, input: unknown): { icon: string; description: string; filePath?: string } | null {
  const inp = input as Record<string, unknown>;

  switch (toolName) {
    case 'Read': {
      const filePath = inp.file_path as string | undefined;
      const offset = inp.offset as number | undefined;
      const limit = inp.limit as number | undefined;
      let desc = filePath || '';
      if (offset !== undefined || limit !== undefined) {
        const parts = [];
        if (offset !== undefined) parts.push(`offset: ${offset}`);
        if (limit !== undefined) parts.push(`limit: ${limit}`);
        desc += ` (${parts.join(', ')})`;
      }
      return { icon: '📖', description: desc, filePath };
    }
    case 'Write': {
      const filePath = inp.file_path as string | undefined;
      return { icon: '✏️', description: filePath || '', filePath };
    }
    case 'Edit': {
      const filePath = inp.file_path as string | undefined;
      return { icon: '🔧', description: filePath || '', filePath };
    }
    case 'Glob': {
      const pattern = inp.pattern as string | undefined;
      const path = inp.path as string | undefined;
      return { icon: '🔍', description: pattern ? `${pattern}${path ? ` in ${path}` : ''}` : '' };
    }
    case 'Grep': {
      const pattern = inp.pattern as string | undefined;
      const path = inp.path as string | undefined;
      return { icon: '🔎', description: pattern ? `"${pattern}"${path ? ` in ${path}` : ''}` : '' };
    }
    default:
      return null;
  }
}

// Helper to get content preview with line count info
function getContentPreview(content: string, maxLines: number = 5): { preview: string; totalLines: number; isLong: boolean } {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const isLong = totalLines > maxLines;
  const preview = isLong ? lines.slice(0, maxLines).join('\n') : content;
  return { preview, totalLines, isLong };
}

// Component for Write/Edit content display with collapse
function FileContentView({ toolName, input }: {
  toolName: 'Write' | 'Edit';
  input: unknown;
}) {
  const [showFull, setShowFull] = useState(false);
  const inp = input as Record<string, unknown>;
  const filePath = inp.file_path as string || '';

  if (toolName === 'Write') {
    const content = inp.content as string || '';
    const { preview, totalLines, isLong } = getContentPreview(content, 8);

    return (
      <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden max-w-[90%]">
        <div className="px-3 py-1.5 bg-bg-tertiary border-b border-border flex items-center justify-between">
          <span className="font-mono text-xs text-text-secondary truncate">{filePath}</span>
          <span className="text-xs text-text-secondary">{totalLines} lines</span>
        </div>
        <pre className="p-3 bg-bg-secondary text-text-secondary text-sm overflow-x-auto whitespace-pre-wrap">
          {showFull ? content : preview}
          {isLong && !showFull && (
            <span className="text-text-secondary/50">...</span>
          )}
        </pre>
        {isLong && (
          <button
            onClick={() => setShowFull(!showFull)}
            className="w-full px-3 py-1.5 bg-bg-tertiary border-t border-border text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {showFull ? '▲ Show less' : `▼ Show all ${totalLines} lines`}
          </button>
        )}
      </div>
    );
  }

  // Edit tool
  const oldString = inp.old_string as string || '';
  const newString = inp.new_string as string || '';
  const oldPreview = getContentPreview(oldString, 4);
  const newPreview = getContentPreview(newString, 4);
  const totalLines = Math.max(oldPreview.totalLines, newPreview.totalLines);
  const isLong = oldPreview.isLong || newPreview.isLong;

  return (
    <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden max-w-[90%]">
      <div className="px-3 py-1.5 bg-bg-tertiary border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs text-text-secondary truncate">{filePath}</span>
        <span className="text-xs text-text-secondary">{totalLines} lines</span>
      </div>
      <div className="p-3 bg-bg-secondary text-sm overflow-x-auto space-y-2">
        <div>
          <span className="text-accent-danger text-xs font-medium">- old</span>
          <pre className="mt-1 text-accent-danger/80 whitespace-pre-wrap">
            {showFull ? oldString : oldPreview.preview}
            {oldPreview.isLong && !showFull && <span className="text-text-secondary/50">...</span>}
          </pre>
        </div>
        <div>
          <span className="text-accent-success text-xs font-medium">+ new</span>
          <pre className="mt-1 text-accent-success/80 whitespace-pre-wrap">
            {showFull ? newString : newPreview.preview}
            {newPreview.isLong && !showFull && <span className="text-text-secondary/50">...</span>}
          </pre>
        </div>
      </div>
      {isLong && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="w-full px-3 py-1.5 bg-bg-tertiary border-t border-border text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {showFull ? '▲ Show less' : '▼ Show full content'}
        </button>
      )}
    </div>
  );
}

function ToolUseMessage({ content }: { content: ToolUseContent }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInfo = formatFileTool(content.toolName, content.input);

  if (fileInfo) {
    const isWriteOrEdit = content.toolName === 'Write' || content.toolName === 'Edit';

    // Compact display for file tools
    return (
      <div data-testid="message-item" className="flex justify-start">
        <div className="rounded-lg overflow-hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary/50 rounded-lg transition-colors"
          >
            <span className="text-base">{fileInfo.icon}</span>
            <span className="text-text-primary font-medium">{content.toolName}</span>
            <span className="text-text-secondary text-sm truncate max-w-[400px] font-mono">
              {fileInfo.description}
            </span>
            <svg
              className={clsx('w-4 h-4 text-text-secondary transition-transform', isExpanded && 'rotate-180')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isExpanded && (
            isWriteOrEdit ? (
              <FileContentView
                toolName={content.toolName as 'Write' | 'Edit'}
                input={content.input}
              />
            ) : (
              <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden">
                <pre className="p-3 bg-bg-secondary text-text-secondary text-sm overflow-x-auto">
                  {JSON.stringify(content.input, null, 2)}
                </pre>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  // Default display for other tools
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

function QuestionMessage({ content }: { content: QuestionMessageContent }) {
  // Guard against invalid content
  if (!content || !Array.isArray(content.answers)) {
    return (
      <div data-testid="message-item" className="flex justify-start">
        <div className="flex items-start gap-2 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-accent-success mt-1.5"></span>
          <div className="text-sm">
            <span className="text-text-primary font-medium">AskUserQuestion</span>
            <span className="text-text-secondary ml-2">User answered questions.</span>
          </div>
        </div>
      </div>
    );
  }

  // Format answers as: "question"="answer"
  const answersText = content.answers
    .map((a) => `"${a.question}"="${a.answer}"`)
    .join(', ');

  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="flex items-start gap-2 px-3 py-1.5 rounded-lg">
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-accent-success mt-1.5"></span>
        <div className="text-sm">
          <span className="text-text-primary font-medium">AskUserQuestion</span>
          <span className="text-text-secondary ml-2">
            User has answered your questions: {answersText}. You can now continue with the user&apos;s answers in mind.
          </span>
        </div>
      </div>
    </div>
  );
}
