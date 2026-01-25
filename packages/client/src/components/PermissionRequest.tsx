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

  // Unified header info for all tool types
  const headerInfo = useMemo(() => {
    if (diffViewData) {
      const lineCount = diffViewData.newContent.split('\n').length;
      const isNewFile = !diffViewData.oldContent;
      return {
        filePath: diffViewData.filePath,
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
        filePath: readViewData.filePath,
        rangeInfo: rangeInfo || undefined,
      };
    }
    if (bashViewData) {
      return {
        description: bashViewData.description,
      };
    }
    return null;
  }, [diffViewData, readViewData, bashViewData]);

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

      <div className="px-4 py-3 bg-bg-tertiary border-t border-border flex justify-end gap-3 shrink-0">
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
