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
