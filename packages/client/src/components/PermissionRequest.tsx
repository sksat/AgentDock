import { useState, useCallback } from 'react';
import clsx from 'clsx';

export interface PermissionRequestProps {
  requestId: string;
  toolName: string;
  input: unknown;
  onAllow: (requestId: string, updatedInput: unknown) => void;
  onDeny: (requestId: string, message: string) => void;
}

export function PermissionRequest({
  requestId,
  toolName,
  input,
  onAllow,
  onDeny,
}: PermissionRequestProps) {
  const [responded, setResponded] = useState(false);

  const handleAllow = useCallback(() => {
    setResponded(true);
    onAllow(requestId, input);
  }, [requestId, input, onAllow]);

  const handleDeny = useCallback(() => {
    setResponded(true);
    onDeny(requestId, 'User denied permission');
  }, [requestId, onDeny]);

  return (
    <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
      <div className="px-4 py-3 bg-bg-tertiary border-b border-border flex items-center gap-2">
        <span className="text-accent-primary font-mono font-medium">{toolName}</span>
        <span className="text-text-secondary text-sm">の実行を許可しますか？</span>
      </div>

      <div className="p-4">
        <pre className="p-3 rounded bg-bg-primary text-text-secondary text-sm overflow-x-auto">
          {JSON.stringify(input, null, 2)}
        </pre>
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
          拒否
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
          許可
        </button>
      </div>
    </div>
  );
}
