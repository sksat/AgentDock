import { useState, useCallback, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { RunnerBackend } from '@agent-dock/shared';

export interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: (name?: string, workingDir?: string, runnerBackend?: RunnerBackend, browserInContainer?: boolean) => void;
  /** Whether Podman is available on the server */
  podmanAvailable?: boolean;
  /** Default runner backend (from global settings) */
  defaultRunnerBackend?: RunnerBackend;
  /** Default browser in container setting (from global settings) */
  defaultBrowserInContainer?: boolean;
}

export function NewSessionModal({
  isOpen,
  onClose,
  onCreateSession,
  podmanAvailable = false,
  defaultRunnerBackend = 'native',
  defaultBrowserInContainer = true,
}: NewSessionModalProps) {
  const [name, setName] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [runnerBackend, setRunnerBackend] = useState<RunnerBackend>(defaultRunnerBackend);
  const [browserInContainer, setBrowserInContainer] = useState(defaultBrowserInContainer);

  const handleSubmit = useCallback(() => {
    // Only pass browserInContainer if using podman
    const effectiveBrowserInContainer = runnerBackend === 'podman' ? browserInContainer : undefined;
    onCreateSession(
      name.trim() || undefined,
      workingDir.trim() || undefined,
      podmanAvailable ? runnerBackend : undefined,
      effectiveBrowserInContainer
    );
    setName('');
    setWorkingDir('');
    setRunnerBackend(defaultRunnerBackend);
    setBrowserInContainer(defaultBrowserInContainer);
    onClose();
  }, [name, workingDir, runnerBackend, browserInContainer, podmanAvailable, defaultRunnerBackend, defaultBrowserInContainer, onCreateSession, onClose]);

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

        {/* Runner Backend */}
        {podmanAvailable && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setRunnerBackend(runnerBackend === 'native' ? 'podman' : 'native')}
              className="w-full px-3 py-2.5 text-left rounded-lg transition-colors flex items-center justify-between bg-bg-tertiary hover:bg-bg-tertiary/80"
            >
              <div className="flex flex-col">
                <span className="font-medium text-text-primary">Run with Podman</span>
                <span className="text-xs text-text-secondary">Isolate this session in a Podman container</span>
              </div>
              <div
                className={clsx(
                  'w-11 h-6 rounded-full p-0.5 transition-colors',
                  runnerBackend === 'podman' ? 'bg-accent-primary' : 'bg-gray-600'
                )}
              >
                <div
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                    runnerBackend === 'podman' ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </div>
            </button>
          </div>
        )}

        {/* Browser in Container (only shown when Podman is selected) */}
        {podmanAvailable && runnerBackend === 'podman' && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setBrowserInContainer(!browserInContainer)}
              className="w-full px-3 py-2.5 text-left rounded-lg transition-colors flex items-center justify-between bg-bg-tertiary hover:bg-bg-tertiary/80"
            >
              <div className="flex flex-col">
                <span className="font-medium text-text-primary">Browser in Container</span>
                <span className="text-xs text-text-secondary">Run browser inside the container (recommended)</span>
              </div>
              <div
                className={clsx(
                  'w-11 h-6 rounded-full p-0.5 transition-colors',
                  browserInContainer ? 'bg-accent-primary' : 'bg-gray-600'
                )}
              >
                <div
                  className={clsx(
                    'w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                    browserInContainer ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </div>
            </button>
          </div>
        )}

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
