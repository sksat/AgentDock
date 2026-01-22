import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import clsx from 'clsx';
import { Streamdown } from 'streamdown';
import { useThinkingPreference } from '../hooks/useThinkingPreference';
import { TodoItem } from './TodoItem';
import { DiffView } from './DiffView';
import { getToolDisplayName, type TodoItem as TodoItemType } from '@agent-dock/shared';

export interface MessageStreamItem {
  id?: string;
  type: 'user' | 'assistant' | 'thinking' | 'tool' | 'system' | 'question' | 'todo_update';
  content: unknown;
  timestamp: string;
}

export interface SystemMessageContent {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

// Unified tool content - all tools use this structure
export interface ToolContent {
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

export interface TodoUpdateContent {
  toolUseId: string;
  todos: TodoItemType[];
}

export interface MessageStreamProps {
  messages: MessageStreamItem[];
  workingDir?: string;
}

/**
 * Format file path for display:
 * - If inside workingDir, show relative path
 * - If inside HOME, show ~/...
 * - Otherwise show absolute path
 */
function formatFilePath(filePath: string, workingDir?: string): string {
  if (!filePath) return filePath;

  // Try to extract home directory from workingDir (e.g., /home/user/... or /Users/user/...)
  let homeDir: string | null = null;
  if (workingDir) {
    const homeMatch = workingDir.match(/^(\/home\/[^/]+|\/Users\/[^/]+)/);
    if (homeMatch) {
      homeDir = homeMatch[1];
    }
  }

  // If inside workingDir, show relative path
  if (workingDir && filePath.startsWith(workingDir + '/')) {
    return filePath.slice(workingDir.length + 1);
  }

  // If exactly the workingDir
  if (workingDir && filePath === workingDir) {
    return '.';
  }

  // If inside HOME, show ~/...
  if (homeDir && filePath.startsWith(homeDir + '/')) {
    return '~' + filePath.slice(homeDir.length);
  }

  // If exactly the home directory
  if (homeDir && filePath === homeDir) {
    return '~';
  }

  // Otherwise show absolute path
  return filePath;
}

// Base64 prefixes for common image formats
const BASE64_PNG_PREFIX = 'iVBORw0KGgo';
const BASE64_JPEG_PREFIX = '/9j/';
const BASE64_GIF_PREFIX = 'R0lGOD';

/**
 * Extract base64 image data from tool output.
 * Handles both raw base64 and JSON format: [{"type":"text","text":"base64data..."}]
 */
function extractBase64Image(output: string): { data: string; mimeType: string } | null {
  if (!output) return null;

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed) && parsed.length > 0) {
      for (const item of parsed) {
        if (item.type === 'text' && typeof item.text === 'string') {
          const text = item.text;
          if (text.startsWith(BASE64_PNG_PREFIX)) {
            return { data: text, mimeType: 'image/png' };
          }
          if (text.startsWith(BASE64_JPEG_PREFIX)) {
            return { data: text, mimeType: 'image/jpeg' };
          }
          if (text.startsWith(BASE64_GIF_PREFIX)) {
            return { data: text, mimeType: 'image/gif' };
          }
        }
      }
    }
  } catch {
    // Not valid JSON, try raw base64
  }

  // Try raw base64
  if (output.startsWith(BASE64_PNG_PREFIX)) {
    return { data: output, mimeType: 'image/png' };
  }
  if (output.startsWith(BASE64_JPEG_PREFIX)) {
    return { data: output, mimeType: 'image/jpeg' };
  }
  if (output.startsWith(BASE64_GIF_PREFIX)) {
    return { data: output, mimeType: 'image/gif' };
  }

  return null;
}

/** Handle for imperative actions on MessageStream */
export interface MessageStreamHandle {
  /** Scroll to a specific todo update by its toolUseId */
  scrollToTodoUpdate: (toolUseId: string) => void;
}

export const MessageStream = forwardRef<MessageStreamHandle, MessageStreamProps>(function MessageStream({ messages, workingDir }, ref) {
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Expose scrollToTodoUpdate to parent components via ref
  // This is used by TodoPanel to scroll to a task's last update when clicked
  useImperativeHandle(ref, () => ({
    scrollToTodoUpdate: (toolUseId: string) => {
      if (!containerRef.current) return;

      const element = containerRef.current.querySelector(
        `[data-todo-update-id="${toolUseId}"]`
      );
      if (element) {
        // Disable auto-scroll to prevent jumping back to bottom
        setAutoScroll(false);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
  }), []);

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
          key={message.id ?? `${message.type}-${message.timestamp}-${index}`}
          message={message}
          thinkingExpanded={thinkingExpanded}
          onToggleThinking={toggleThinkingExpanded}
          workingDir={workingDir}
        />
      ))}
    </div>
  );
});

interface MessageItemProps {
  message: MessageStreamItem;
  thinkingExpanded: boolean;
  onToggleThinking: () => void;
  workingDir?: string;
}

const MessageItem = memo(
  function MessageItem({ message, thinkingExpanded, onToggleThinking, workingDir }: MessageItemProps) {
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
      case 'tool':
        return <ToolMessage content={message.content as ToolContent} workingDir={workingDir} />;
      case 'system':
        return <SystemMessage content={message.content as SystemMessageContent} />;
      case 'question':
        return <QuestionMessage content={message.content as QuestionMessageContent} />;
      case 'todo_update':
        return <TodoUpdateMessage content={message.content as TodoUpdateContent} />;
      default:
        return null;
    }
  },
  (prev, next) => {
    // Custom comparison: only re-render if relevant props actually changed
    return (
      prev.message === next.message &&
      prev.thinkingExpanded === next.thinkingExpanded &&
      prev.workingDir === next.workingDir
    );
  }
);

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
      <div className="max-w-[80%] px-4 py-3 rounded-lg bg-bg-tertiary text-text-primary prose prose-invert prose-sm max-w-none">
        <Streamdown mode="streaming">{content}</Streamdown>
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
      <div className=" rounded-lg border border-border/50 overflow-hidden">
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

// Unified ToolMessage component for all tools
function ToolMessage({ content, workingDir }: { content: ToolContent; workingDir?: string }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const inp = content.input as Record<string, unknown>;

  // Helper to format file paths
  const fmtPath = (path: string) => formatFilePath(path, workingDir);

  // Get tool display info based on toolName
  const getToolInfo = (): { icon: string; description: string } => {
    switch (content.toolName) {
      case 'Bash': {
        const command = inp.command as string || '';
        const description = inp.description as string || command.split('\n')[0].slice(0, 60) + (command.length > 60 ? '...' : '');
        return { icon: '💻', description };
      }
      case 'Read': {
        return { icon: '📖', description: fmtPath(inp.file_path as string || '') };
      }
      case 'Write': {
        return { icon: '✏️', description: fmtPath(inp.file_path as string || '') };
      }
      case 'Edit': {
        return { icon: '🔧', description: fmtPath(inp.file_path as string || '') };
      }
      case 'Glob': {
        const pattern = inp.pattern as string || '';
        const path = inp.path as string || '';
        return { icon: '🔍', description: pattern + (path ? ` in ${fmtPath(path)}` : '') };
      }
      case 'Grep': {
        const pattern = inp.pattern as string || '';
        const path = inp.path as string || '';
        return { icon: '🔎', description: `"${pattern}"` + (path ? ` in ${fmtPath(path)}` : '') };
      }
      case 'Task': {
        const taskDescription = inp.description as string || inp.prompt as string || '';
        return { icon: '🤖', description: taskDescription.slice(0, 60) + (taskDescription.length > 60 ? '...' : '') };
      }
      case 'WebFetch': {
        return { icon: '🌐', description: inp.url as string || '' };
      }
      case 'WebSearch': {
        return { icon: '🔍', description: inp.query as string || '' };
      }
      case 'TodoWrite': {
        return { icon: '📝', description: 'Update todo list' };
      }
      default: {
        // For MCP tools, extract a nicer name
        if (content.toolName.startsWith('mcp__')) {
          const browserInfo = formatBrowserTool(content.toolName, content.input);
          if (browserInfo) {
            return { icon: '🌐', description: `${browserInfo.prefix}:${browserInfo.shortName} ${browserInfo.description}` };
          }
          // Generic MCP tool
          const shortName = content.toolName.replace(/^mcp__[^_]+__/, '');
          return { icon: '🔌', description: shortName };
        }
        return { icon: '🔧', description: content.toolName };
      }
    }
  };

  const toolInfo = getToolInfo();

  // Render expanded content based on tool type
  const renderExpandedContent = () => {
    // Bash tool - show command and output
    if (content.toolName === 'Bash') {
      const command = inp.command as string || '';
      return (
        <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden ">
          <div className="border-b border-border">
            <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium">
              Command
            </div>
            <pre className="px-3 py-2 bg-bg-secondary text-text-primary text-sm font-mono overflow-x-auto">
              {command}
            </pre>
          </div>
          <div>
            <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium flex items-center gap-2">
              Output
              {!content.isComplete && <span className="text-accent-warning">...</span>}
            </div>
            <pre className={clsx(
              'px-3 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto',
              content.isError ? 'bg-accent-danger/10 text-accent-danger' : 'bg-bg-secondary text-text-secondary'
            )}>
              {content.output || (content.isComplete ? '(no output)' : 'Running...')}
            </pre>
          </div>
        </div>
      );
    }

    // Edit tool - show diff (error message only if failed)
    if (content.toolName === 'Edit') {
      const oldString = inp.old_string as string || '';
      const newString = inp.new_string as string || '';
      const filePath = inp.file_path as string || '';
      return (
        <div className="mt-1 ml-4 ">
          <DiffView toolName="Edit" filePath={fmtPath(filePath)} oldContent={oldString} newContent={newString} />
          {content.isError && content.output && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-accent-danger/10 text-accent-danger text-sm font-mono">
              {content.output}
            </div>
          )}
        </div>
      );
    }

    // Write tool - show new file content
    if (content.toolName === 'Write') {
      const fileContent = inp.content as string || '';
      const filePath = inp.file_path as string || '';
      return (
        <div className="mt-1 ml-4 ">
          <DiffView toolName="Write" filePath={fmtPath(filePath)} newContent={fileContent} />
          {content.output && (
            <div className="mt-2 border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium">Result</div>
              <pre className={clsx(
                'px-3 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto',
                content.isError ? 'bg-accent-danger/10 text-accent-danger' : 'bg-bg-secondary text-text-secondary'
              )}>{content.output}</pre>
            </div>
          )}
        </div>
      );
    }

    // Read tool - show output only (input info is already in header)
    if (content.toolName === 'Read') {
      return (
        <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden ">
          <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium flex items-center gap-2">
            Output
            {!content.isComplete && <span className="text-accent-warning">...</span>}
          </div>
          <pre className={clsx(
            'px-3 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto',
            content.isError ? 'bg-accent-danger/10 text-accent-danger' : 'bg-bg-secondary text-text-secondary'
          )}>
            {content.output || (content.isComplete ? '(no output)' : 'Running...')}
          </pre>
        </div>
      );
    }

    // Screenshot tool - show image
    if (content.toolName.includes('take_screenshot') || content.toolName.includes('browser_take_screenshot')) {
      const imageData = extractBase64Image(content.output);
      if (imageData) {
        return (
          <div className="mt-1 ml-4 rounded-lg border border-border overflow-hidden">
            <img
              src={`data:${imageData.mimeType};base64,${imageData.data}`}
              alt="Screenshot"
              className="max-w-full h-auto"
            />
          </div>
        );
      }
      // Fall through to default if no image data
    }

    // Default: show input and output
    return (
      <div className="mt-1 ml-4 border border-border rounded-lg overflow-hidden ">
        <div className="border-b border-border">
          <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium">Input</div>
          <pre className="px-3 py-2 bg-bg-secondary text-text-primary text-sm font-mono overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(content.input, null, 2)}
          </pre>
        </div>
        <div>
          <div className="px-3 py-1 bg-bg-secondary/50 text-xs text-text-secondary font-medium flex items-center gap-2">
            Output
            {!content.isComplete && <span className="text-accent-warning">...</span>}
          </div>
          <pre className={clsx(
            'px-3 py-2 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto',
            content.isError ? 'bg-accent-danger/10 text-accent-danger' : 'bg-bg-secondary text-text-secondary'
          )}>
            {content.output || (content.isComplete ? '(no output)' : 'Running...')}
          </pre>
        </div>
      </div>
    );
  };

  // Check if this is a screenshot tool with image data - render without expand/collapse
  const isScreenshotTool = content.toolName.includes('take_screenshot') || content.toolName.includes('browser_take_screenshot');
  const screenshotImageData = isScreenshotTool ? extractBase64Image(content.output) : null;

  if (isScreenshotTool && screenshotImageData) {
    return (
      <div data-testid="message-item" className="flex justify-start">
        <div className="rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className={clsx(
              'w-2 h-2 rounded-full flex-shrink-0',
              content.isComplete
                ? content.isError ? 'bg-accent-danger' : 'bg-accent-success'
                : 'bg-accent-warning animate-pulse'
            )}></span>
            <span className="text-base">{toolInfo.icon}</span>
            <span className="text-text-primary font-medium">{getToolDisplayName(content.toolName)}</span>
            <span className="text-text-secondary text-sm truncate max-w-[400px]">
              {toolInfo.description}
            </span>
          </div>
          <div className="mt-1 ml-4 rounded-lg border border-border overflow-hidden">
            <img
              src={`data:${screenshotImageData.mimeType};base64,${screenshotImageData.data}`}
              alt="Screenshot"
              className="max-w-full h-auto"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="message-item" className="flex justify-start">
      <div className="rounded-lg overflow-hidden">
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
          <span className="text-base">{toolInfo.icon}</span>
          <span className="text-text-primary font-medium">{getToolDisplayName(content.toolName)}</span>
          <span className="text-text-secondary text-sm truncate max-w-[400px]">
            {toolInfo.description}
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
        {isExpanded && renderExpandedContent()}
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

function TodoUpdateMessage({ content }: { content: TodoUpdateContent }) {
  // Guard against invalid content
  if (!content || !Array.isArray(content.todos)) {
    return (
      <div data-testid="message-item" className="flex justify-start">
        <div className="flex items-start gap-2 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-accent-primary mt-1.5"></span>
          <div className="text-sm">
            <span className="text-text-primary font-medium">TodoWrite</span>
            <span className="text-text-secondary ml-2">Updated task list.</span>
          </div>
        </div>
      </div>
    );
  }

  const completedCount = content.todos.filter((t) => t.status === 'completed').length;
  const totalCount = content.todos.length;

  return (
    // data-todo-update-id is used for scrolling from TodoPanel when a task is clicked
    <div data-testid="message-item" data-todo-update-id={content.toolUseId} className="flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-border overflow-hidden bg-bg-secondary">
        <div className="px-3 py-2 bg-bg-tertiary border-b border-border flex items-center gap-2">
          <span className="text-text-primary font-medium text-sm">ToDo</span>
          <span className="text-xs text-text-secondary bg-bg-secondary px-2 py-0.5 rounded">
            {completedCount}/{totalCount}
          </span>
        </div>
        <div className="p-2 space-y-0.5">
          {content.todos.map((todo, index) => (
            <TodoItem key={index} todo={todo} compact />
          ))}
        </div>
      </div>
    </div>
  );
}
