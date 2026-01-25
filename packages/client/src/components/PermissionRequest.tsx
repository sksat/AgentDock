import { useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { DiffView } from './DiffView';

export interface PermissionRequestProps {
  requestId: string;
  toolName: string;
  input: unknown;
  onAllow: (requestId: string, updatedInput: unknown) => void;
  /** @param pattern - Permission pattern like "Bash(git:*)" or tool name for tool-wide permission */
  onAllowForSession: (requestId: string, pattern: string, updatedInput: unknown) => void;
  onDeny: (requestId: string, message: string) => void;
  /** Current working directory for the session (e.g., /home/user/project) */
  workingDir?: string;
  /** User's home directory (e.g., /home/user) */
  homeDir?: string;
}

// Type guards for file operation tools
interface WriteInput {
  file_path: string;
  content: string;
}

interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

interface BashInput {
  command: string;
  description?: string;
}

function isWriteInput(input: unknown): input is WriteInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'file_path' in input &&
    'content' in input &&
    typeof (input as WriteInput).file_path === 'string' &&
    typeof (input as WriteInput).content === 'string'
  );
}

function isEditInput(input: unknown): input is EditInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'file_path' in input &&
    'old_string' in input &&
    'new_string' in input &&
    typeof (input as EditInput).file_path === 'string' &&
    typeof (input as EditInput).old_string === 'string' &&
    typeof (input as EditInput).new_string === 'string'
  );
}

function isReadInput(input: unknown): input is ReadInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'file_path' in input &&
    typeof (input as ReadInput).file_path === 'string'
  );
}

function isBashInput(input: unknown): input is BashInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'command' in input &&
    typeof (input as BashInput).command === 'string'
  );
}

/**
 * Format a file path for display.
 * - Paths under workingDir are shown as relative (./path)
 * - Paths under homeDir are shown with ~/ prefix
 * - Other paths are shown as-is
 *
 * @param filePath The absolute file path
 * @param workingDir The session's working directory
 * @param homeDir The user's home directory
 */
function formatFilePath(filePath: string, workingDir?: string, homeDir?: string): string {
  // Normalize paths (remove trailing slashes)
  const normalizedPath = filePath.replace(/\/+$/, '');
  const normalizedWorkingDir = workingDir?.replace(/\/+$/, '');
  const normalizedHomeDir = homeDir?.replace(/\/+$/, '');

  // Check workingDir first (more specific)
  if (normalizedWorkingDir && normalizedPath.startsWith(normalizedWorkingDir + '/')) {
    return './' + normalizedPath.slice(normalizedWorkingDir.length + 1);
  }
  // Exact match with workingDir
  if (normalizedWorkingDir && normalizedPath === normalizedWorkingDir) {
    return '.';
  }

  // Check homeDir
  if (normalizedHomeDir && normalizedPath.startsWith(normalizedHomeDir + '/')) {
    return '~/' + normalizedPath.slice(normalizedHomeDir.length + 1);
  }
  // Exact match with homeDir
  if (normalizedHomeDir && normalizedPath === normalizedHomeDir) {
    return '~';
  }

  // Return as-is
  return filePath;
}

/**
 * Suggest a permission pattern based on a tool invocation.
 * This matches the server-side suggestPattern function.
 *
 * Examples:
 * - Bash with { command: "git status" } -> "Bash(git:*)"
 * - Write with { file_path: "./src/app.ts" } -> "Write(./src/**)"
 *
 * @param workingDir Optional working directory for relative path formatting
 * @param homeDir Optional home directory for ~/ path formatting
 */
function suggestPattern(toolName: string, input: unknown, workingDir?: string, homeDir?: string): string {
  if (input === null || input === undefined || typeof input !== 'object') {
    return toolName;
  }

  const inputObj = input as Record<string, unknown>;

  switch (toolName) {
    case 'Bash': {
      const command = inputObj.command;
      if (typeof command !== 'string' || command === '') {
        return toolName;
      }
      // Extract first word (command name)
      const firstWord = command.split(' ')[0];
      return `Bash(${firstWord}:*)`;
    }

    case 'Read':
    case 'Write':
    case 'Edit': {
      const filePath = inputObj.file_path;
      if (typeof filePath !== 'string' || filePath === '') {
        return toolName;
      }
      // Extract directory
      const lastSlash = filePath.lastIndexOf('/');
      const dir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '.';
      // Format the directory for display
      const formattedDir = formatFilePath(dir, workingDir, homeDir);
      return `${toolName}(${formattedDir}/**)`;
    }

    default:
      return toolName;
  }
}

// Component for displaying Read tool requests (content only, header handled by PermissionRequest)
function FileReadView() {
  return (
    <div className="flex items-center gap-3 text-text-secondary">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="text-sm">Reading file contents</span>
    </div>
  );
}

// Component for displaying Bash tool requests (content only, header handled by PermissionRequest)
function BashCommandView({ command }: { command: string }) {
  return (
    <div
      data-testid="bash-command-container"
      className="font-mono text-sm max-h-[400px] overflow-y-auto"
    >
      <div className="flex items-start gap-2">
        <span className="text-accent-success select-none shrink-0">$</span>
        <pre className="text-text-primary whitespace-pre-wrap break-all overflow-x-auto">{command}</pre>
      </div>
    </div>
  );
}

export function PermissionRequest({
  requestId,
  toolName,
  input,
  onAllow,
  onAllowForSession,
  onDeny,
  workingDir,
  homeDir,
}: PermissionRequestProps) {
  const [responded, setResponded] = useState(false);
  const [showSessionOptions, setShowSessionOptions] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Generate suggested pattern based on tool and input
  const suggestedPattern = useMemo(() => suggestPattern(toolName, input, workingDir, homeDir), [toolName, input, workingDir, homeDir]);
  const [customPattern, setCustomPattern] = useState(suggestedPattern);

  const handleAllow = useCallback(() => {
    setResponded(true);
    onAllow(requestId, input);
  }, [requestId, input, onAllow]);

  const handleAllowForSession = useCallback(() => {
    setResponded(true);
    // Use the custom pattern if user has edited it, otherwise use the suggested pattern
    onAllowForSession(requestId, customPattern, input);
  }, [requestId, customPattern, input, onAllowForSession]);

  const handleAllowToolForSession = useCallback(() => {
    setResponded(true);
    // Allow the entire tool (dangerous for Bash)
    onAllowForSession(requestId, toolName, input);
  }, [requestId, toolName, input, onAllowForSession]);

  const handleDeny = useCallback(() => {
    setResponded(true);
    onDeny(requestId, 'User denied permission');
  }, [requestId, onDeny]);

  // Check if we have a specific pattern (not just tool name)
  const hasPattern = suggestedPattern !== toolName;

  // Determine if this is a file operation that should show a diff
  const diffViewData = useMemo(() => {
    if (toolName === 'Write' && isWriteInput(input)) {
      return {
        toolName: 'Write' as const,
        filePath: input.file_path,
        newContent: input.content,
        oldContent: undefined,
      };
    }
    if (toolName === 'Edit' && isEditInput(input)) {
      return {
        toolName: 'Edit' as const,
        filePath: input.file_path,
        oldContent: input.old_string,
        newContent: input.new_string,
      };
    }
    return null;
  }, [toolName, input]);

  // Determine if this is a Read operation
  const readViewData = useMemo(() => {
    if (toolName === 'Read' && isReadInput(input)) {
      return {
        filePath: input.file_path,
        offset: input.offset,
        limit: input.limit,
      };
    }
    return null;
  }, [toolName, input]);

  // Determine if this is a Bash operation
  const bashViewData = useMemo(() => {
    if (toolName === 'Bash' && isBashInput(input)) {
      return {
        command: input.command,
        description: input.description,
      };
    }
    return null;
  }, [toolName, input]);

  // Unified header info for all tool types
  const headerInfo = useMemo(() => {
    if (diffViewData) {
      const lineCount = diffViewData.newContent.split('\n').length;
      const isNewFile = !diffViewData.oldContent;
      return {
        filePath: formatFilePath(diffViewData.filePath, workingDir, homeDir),
        lineCount,
        isNewFile,
      };
    }
    if (readViewData) {
      const rangeInfo = [
        readViewData.offset !== undefined ? `offset: ${readViewData.offset}` : null,
        readViewData.limit !== undefined ? `limit: ${readViewData.limit}` : null,
      ].filter(Boolean).join(', ');
      return {
        filePath: formatFilePath(readViewData.filePath, workingDir, homeDir),
        rangeInfo: rangeInfo || undefined,
      };
    }
    if (bashViewData) {
      return {
        description: bashViewData.description,
      };
    }
    return null;
  }, [diffViewData, readViewData, bashViewData, workingDir, homeDir]);

  return (
    <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden max-h-[70vh] flex flex-col">
      {/* Unified header */}
      <div className="px-4 py-3 bg-bg-tertiary border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="px-2 py-0.5 text-xs font-medium bg-accent-primary/20 text-accent-primary rounded shrink-0">
            {toolName}
          </span>
          {headerInfo?.filePath && (
            <span className="font-mono text-sm text-text-primary truncate">{headerInfo.filePath}</span>
          )}
          {headerInfo?.description && (
            <span className="text-sm text-text-secondary truncate">{headerInfo.description}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerInfo?.lineCount && (
            <span className="text-xs text-text-secondary">{headerInfo.lineCount} lines</span>
          )}
          {headerInfo?.rangeInfo && (
            <span className="px-2 py-0.5 text-xs font-medium bg-bg-secondary text-text-secondary rounded">
              {headerInfo.rangeInfo}
            </span>
          )}
          {headerInfo?.isNewFile && (
            <span className="px-2 py-0.5 text-xs font-medium bg-accent-success/20 text-accent-success rounded">
              New file
            </span>
          )}
        </div>
      </div>

      <div className="p-4 overflow-y-auto flex-1 min-h-0">
        {diffViewData ? (
          <DiffView
            toolName={diffViewData.toolName}
            filePath={diffViewData.filePath}
            oldContent={diffViewData.oldContent}
            newContent={diffViewData.newContent}
            hideHeader
          />
        ) : readViewData ? (
          <FileReadView />
        ) : bashViewData ? (
          <BashCommandView command={bashViewData.command} />
        ) : (
          <pre className="p-3 rounded bg-bg-primary text-text-secondary text-sm overflow-x-auto max-h-[400px] overflow-y-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        )}
      </div>

      <div className="px-4 py-3 bg-bg-tertiary border-t border-border flex flex-wrap items-center justify-end gap-3 shrink-0">
        <button
          onClick={handleDeny}
          disabled={responded}
          className={clsx(
            'px-4 py-2 rounded-lg font-medium',
            'bg-accent-danger text-white',
            'hover:bg-accent-danger/90',
            'focus:outline-none focus:ring-2 focus:ring-accent-danger/50',
            'transition-colors',
            responded && 'opacity-50 cursor-not-allowed'
          )}
        >
          Deny
        </button>

        {/* Allow for session - dropdown with options */}
        <div className="relative">
          <div className="flex items-stretch">
            <button
              onClick={handleAllowForSession}
              disabled={responded}
              className={clsx(
                'px-4 py-2 rounded-l-lg font-medium',
                'bg-accent-primary text-white',
                'hover:bg-accent-primary/90',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
                'transition-colors',
                responded && 'opacity-50 cursor-not-allowed'
              )}
              title={hasPattern ? `Allow ${customPattern} for this session` : `Allow all ${toolName} for this session`}
            >
              {hasPattern ? (
                <>Allow <code className="font-mono text-xs bg-white/20 px-1 rounded">{customPattern}</code></>
              ) : (
                'Allow for session'
              )}
            </button>
            <button
              onClick={() => setShowSessionOptions(!showSessionOptions)}
              disabled={responded}
              className={clsx(
                'px-2 rounded-r-lg border-l border-white/20 flex items-center',
                'bg-accent-primary text-white',
                'hover:bg-accent-primary/90',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
                'transition-colors',
                responded && 'opacity-50 cursor-not-allowed'
              )}
              title="More options"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Dropdown menu */}
          {showSessionOptions && !responded && (
            <div className="absolute right-0 bottom-full mb-1 w-72 bg-bg-secondary border border-border rounded-lg shadow-lg z-10">
              {hasPattern && (
                <>
                  <button
                    onClick={() => {
                      handleAllowForSession();
                      setShowSessionOptions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors rounded-t-lg"
                  >
                    <div className="font-medium text-text-primary">Allow pattern</div>
                    <code className="text-xs text-text-secondary font-mono">{customPattern}</code>
                  </button>
                  <button
                    onClick={() => {
                      handleAllowToolForSession();
                      setShowSessionOptions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors border-t border-border"
                  >
                    <div className="font-medium text-text-primary">Allow all {toolName}</div>
                    <span className="text-xs text-text-secondary">Allow any {toolName} operation</span>
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setShowCustomInput(!showCustomInput);
                  setShowSessionOptions(false);
                }}
                className={clsx(
                  'w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary transition-colors',
                  hasPattern ? 'border-t border-border rounded-b-lg' : 'rounded-lg'
                )}
              >
                <div className="font-medium text-text-primary">Custom pattern...</div>
                <span className="text-xs text-text-secondary">Edit the permission pattern</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleAllow}
          disabled={responded}
          className={clsx(
            'px-4 py-2 rounded-lg font-medium',
            'bg-accent-success text-white',
            'hover:bg-accent-success/90',
            'focus:outline-none focus:ring-2 focus:ring-accent-success/50',
            'transition-colors',
            responded && 'opacity-50 cursor-not-allowed'
          )}
        >
          Allow
        </button>
      </div>

      {/* Custom pattern input section */}
      {showCustomInput && (
        <div className="px-4 py-3 bg-bg-tertiary border-t border-border">
          <label className="block text-xs text-text-secondary mb-1">Permission pattern:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customPattern}
              onChange={(e) => setCustomPattern(e.target.value)}
              className="flex-1 px-3 py-2 rounded bg-bg-primary border border-border text-text-primary font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
              placeholder={suggestedPattern}
            />
            <button
              onClick={() => {
                handleAllowForSession();
                setShowCustomInput(false);
              }}
              disabled={responded}
              className={clsx(
                'px-4 py-2 rounded-lg font-medium',
                'bg-accent-primary text-white',
                'hover:bg-accent-primary/90',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
                'transition-colors',
                responded && 'opacity-50 cursor-not-allowed'
              )}
            >
              Apply
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Use <code className="bg-bg-primary px-1 rounded">:*</code> for prefix matching (e.g., <code className="bg-bg-primary px-1 rounded">git:*</code> matches <code className="bg-bg-primary px-1 rounded">git status</code> but not <code className="bg-bg-primary px-1 rounded">gitk</code>)
          </p>
        </div>
      )}
    </div>
  );
}
