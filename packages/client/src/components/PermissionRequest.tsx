import { useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { DiffView } from './DiffView';

export interface PermissionRequestProps {
  requestId: string;
  toolName: string;
  input: unknown;
  onAllow: (requestId: string, updatedInput: unknown) => void;
  onAllowForSession: (requestId: string, toolName: string, updatedInput: unknown) => void;
  onDeny: (requestId: string, message: string) => void;
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

// Component for displaying Read tool requests
function FileReadView({ filePath, offset, limit }: { filePath: string; offset?: number; limit?: number }) {
  const hasRange = offset !== undefined || limit !== undefined;

  return (
    <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-bg-tertiary border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded">
            Read
          </span>
          <span className="font-mono text-sm text-text-primary">{filePath}</span>
        </div>
        {hasRange && (
          <span className="px-2 py-0.5 text-xs font-medium bg-bg-secondary text-text-secondary rounded">
            {offset !== undefined && `offset: ${offset}`}
            {offset !== undefined && limit !== undefined && ', '}
            {limit !== undefined && `limit: ${limit}`}
          </span>
        )}
      </div>

      {/* Icon indicator */}
      <div className="p-4 flex items-center gap-3 text-text-secondary">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm">Reading file contents</span>
      </div>
    </div>
  );
}

// Component for displaying Bash tool requests with shell-like appearance
function BashCommandView({ command, description }: { command: string; description?: string }) {
  return (
    <div>
      {/* Title header with description */}
      {description && (
        <div className="text-sm text-text-secondary mb-2">{description}</div>
      )}

      {/* Shell-like command display */}
      <div className="font-mono text-sm">
        <div className="flex items-start gap-2">
          <span className="text-accent-success select-none shrink-0">$</span>
          <pre className="text-text-primary whitespace-pre-wrap break-all overflow-x-auto">{command}</pre>
        </div>
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
}: PermissionRequestProps) {
  const [responded, setResponded] = useState(false);

  const handleAllow = useCallback(() => {
    setResponded(true);
    onAllow(requestId, input);
  }, [requestId, input, onAllow]);

  const handleAllowForSession = useCallback(() => {
    setResponded(true);
    onAllowForSession(requestId, toolName, input);
  }, [requestId, toolName, input, onAllowForSession]);

  const handleDeny = useCallback(() => {
    setResponded(true);
    onDeny(requestId, 'User denied permission');
  }, [requestId, onDeny]);

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

  return (
    <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
      <div className="px-4 py-3 bg-bg-tertiary border-b border-border flex items-center gap-2">
        <span className="text-accent-primary font-mono font-medium">{toolName}</span>
        <span className="text-text-secondary text-sm">requests permission to run</span>
      </div>

      <div className="p-4">
        {diffViewData ? (
          <DiffView
            toolName={diffViewData.toolName}
            filePath={diffViewData.filePath}
            oldContent={diffViewData.oldContent}
            newContent={diffViewData.newContent}
          />
        ) : readViewData ? (
          <FileReadView
            filePath={readViewData.filePath}
            offset={readViewData.offset}
            limit={readViewData.limit}
          />
        ) : bashViewData ? (
          <BashCommandView
            command={bashViewData.command}
            description={bashViewData.description}
          />
        ) : (
          <pre className="p-3 rounded bg-bg-primary text-text-secondary text-sm overflow-x-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        )}
      </div>

      <div className="px-4 py-3 bg-bg-tertiary border-t border-border flex justify-end gap-3">
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
        <button
          onClick={handleAllowForSession}
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
          Allow for session
        </button>
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
    </div>
  );
}
