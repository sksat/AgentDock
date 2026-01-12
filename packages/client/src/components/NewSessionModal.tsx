import { useState, useCallback, type KeyboardEvent } from 'react';
import clsx from 'clsx';

export interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: (name?: string, workingDir?: string) => void;
}

export function NewSessionModal({
  isOpen,
  onClose,
  onCreateSession,
}: NewSessionModalProps) {
  const [name, setName] = useState('');
  const [workingDir, setWorkingDir] = useState('');

  const handleSubmit = useCallback(() => {
    onCreateSession(
      name.trim() || undefined,
      workingDir.trim() || undefined
    );
    setName('');
    setWorkingDir('');
    onClose();
  }, [name, workingDir, onCreateSession, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [handleSubmit, onClose]
  );

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        className={clsx(
          'bg-bg-secondary rounded-xl shadow-2xl border border-border',
          'w-full max-w-md p-6',
          'transform transition-all'
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-lg font-semibold mb-4">New Session</h2>

        {/* Session Name */}
        <div className="mb-4">
          <label htmlFor="session-name" className="block text-sm font-medium text-text-secondary mb-1">
            Name (optional)
          </label>
          <input
            id="session-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Session"
            autoFocus
            className={clsx(
              'w-full px-3 py-2 rounded-lg',
              'bg-bg-primary text-text-primary',
              'border border-border',
              'focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary',
              'placeholder:text-text-secondary/50'
            )}
          />
        </div>

        {/* Working Directory */}
        <div className="mb-6">
          <label htmlFor="working-dir" className="block text-sm font-medium text-text-secondary mb-1">
            Working Directory (optional)
          </label>
          <input
            id="working-dir"
            type="text"
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
            placeholder="Leave empty to auto-create"
            className={clsx(
              'w-full px-3 py-2 rounded-lg',
              'bg-bg-primary text-text-primary',
              'border border-border',
              'focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary',
              'placeholder:text-text-secondary/50',
              'font-mono text-sm'
            )}
          />
          <p className="mt-1 text-xs text-text-secondary">
            If not specified, a new directory will be created in ~/.agent-dock/sessions/
          </p>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className={clsx(
              'px-4 py-2 rounded-lg',
              'text-text-secondary hover:text-text-primary',
              'hover:bg-bg-tertiary',
              'transition-colors'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={clsx(
              'px-4 py-2 rounded-lg',
              'bg-accent-primary text-white',
              'hover:bg-accent-primary/90',
              'transition-colors'
            )}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
