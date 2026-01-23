import { useState, useCallback, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { RunnerBackend, Repository } from '@agent-dock/shared';

type WorkingDirMode = 'default' | 'custom' | 'repository';

export interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: (name?: string, workingDir?: string, runnerBackend?: RunnerBackend, browserInContainer?: boolean, repositoryId?: string, worktreeName?: string) => void;
  /** Whether Podman is available on the server */
  podmanAvailable?: boolean;
  /** Default runner backend (from global settings) */
  defaultRunnerBackend?: RunnerBackend;
  /** Default browser in container setting (from global settings) */
  defaultBrowserInContainer?: boolean;
  /** Available repositories */
  repositories?: Repository[];
}

export function NewSessionModal({
  isOpen,
  onClose,
  onCreateSession,
  podmanAvailable = false,
  defaultRunnerBackend = 'native',
  defaultBrowserInContainer = true,
  repositories = [],
}: NewSessionModalProps) {
  const [name, setName] = useState('');
  const [workingDirMode, setWorkingDirMode] = useState<WorkingDirMode>('default');
  const [workingDir, setWorkingDir] = useState('');
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string>('');
  const [worktreeName, setWorktreeName] = useState('');
  const [runnerBackend, setRunnerBackend] = useState<RunnerBackend>(defaultRunnerBackend);
  const [browserInContainer, setBrowserInContainer] = useState(defaultBrowserInContainer);

  const selectedRepository = repositories.find(r => r.id === selectedRepositoryId);

  const handleSubmit = useCallback(() => {
    // Only pass browserInContainer if using podman
    const effectiveBrowserInContainer = runnerBackend === 'podman' ? browserInContainer : undefined;

    if (workingDirMode === 'repository' && selectedRepositoryId) {
      // Using repository
      onCreateSession(
        name.trim() || undefined,
        undefined, // workingDir is determined by repository
        podmanAvailable ? runnerBackend : undefined,
        effectiveBrowserInContainer,
        selectedRepositoryId,
        worktreeName.trim() || undefined
      );
    } else {
      // Using default or custom path
      onCreateSession(
        name.trim() || undefined,
        workingDirMode === 'custom' ? workingDir.trim() || undefined : undefined,
        podmanAvailable ? runnerBackend : undefined,
        effectiveBrowserInContainer
      );
    }

    setName('');
    setWorkingDirMode('default');
    setWorkingDir('');
    setSelectedRepositoryId('');
    setWorktreeName('');
    setRunnerBackend(defaultRunnerBackend);
    setBrowserInContainer(defaultBrowserInContainer);
    onClose();
  }, [name, workingDirMode, workingDir, selectedRepositoryId, worktreeName, runnerBackend, browserInContainer, podmanAvailable, defaultRunnerBackend, defaultBrowserInContainer, onCreateSession, onClose]);

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
          <label className="block text-sm font-medium text-text-secondary mb-3">
            Working Directory
          </label>

          {/* Mode Selection - Card Style */}
          <div className="space-y-2">
            {/* Default Option */}
            <button
              type="button"
              onClick={() => setWorkingDirMode('default')}
              className={clsx(
                'w-full px-4 py-3 text-left rounded-lg transition-colors flex items-center gap-3',
                workingDirMode === 'default'
                  ? 'bg-accent-primary/10 border border-accent-primary/30'
                  : 'bg-bg-tertiary hover:bg-bg-tertiary/80 border border-transparent hover:border-border'
              )}
            >
              <div className={clsx(
                'flex-shrink-0',
                workingDirMode === 'default' ? 'text-accent-primary' : 'text-text-secondary'
              )}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className={clsx(
                  'font-medium text-sm block',
                  workingDirMode === 'default' ? 'text-accent-primary' : 'text-text-primary'
                )}>
                  Auto-create
                </span>
                <span className="text-xs text-text-secondary">New directory in ~/.agent-dock/sessions/</span>
              </div>
              {workingDirMode === 'default' && (
                <svg className="w-5 h-5 text-accent-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Custom Path Option */}
            <button
              type="button"
              onClick={() => setWorkingDirMode('custom')}
              className={clsx(
                'w-full px-4 py-3 text-left rounded-lg transition-colors flex items-center gap-3',
                workingDirMode === 'custom'
                  ? 'bg-accent-primary/10 border border-accent-primary/30'
                  : 'bg-bg-tertiary hover:bg-bg-tertiary/80 border border-transparent hover:border-border'
              )}
            >
              <div className={clsx(
                'flex-shrink-0',
                workingDirMode === 'custom' ? 'text-accent-primary' : 'text-text-secondary'
              )}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className={clsx(
                  'font-medium text-sm block',
                  workingDirMode === 'custom' ? 'text-accent-primary' : 'text-text-primary'
                )}>
                  Custom Path
                </span>
                <span className="text-xs text-text-secondary">Specify an existing directory</span>
              </div>
              {workingDirMode === 'custom' && (
                <svg className="w-5 h-5 text-accent-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Repository Option */}
            {repositories.length > 0 && (
              <button
                type="button"
                onClick={() => setWorkingDirMode('repository')}
                className={clsx(
                  'w-full px-4 py-3 text-left rounded-lg transition-colors flex items-center gap-3',
                  workingDirMode === 'repository'
                    ? 'bg-accent-primary/10 border border-accent-primary/30'
                    : 'bg-bg-tertiary hover:bg-bg-tertiary/80 border border-transparent hover:border-border'
                )}
              >
                <div className={clsx(
                  'flex-shrink-0',
                  workingDirMode === 'repository' ? 'text-accent-primary' : 'text-text-secondary'
                )}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <span className={clsx(
                    'font-medium text-sm block',
                    workingDirMode === 'repository' ? 'text-accent-primary' : 'text-text-primary'
                  )}>
                    From Repository
                  </span>
                  <span className="text-xs text-text-secondary">Use a registered repository</span>
                </div>
                {workingDirMode === 'repository' && (
                  <svg className="w-5 h-5 text-accent-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* Custom Path Input */}
          {workingDirMode === 'custom' && (
            <div className="mt-3">
              <input
                id="working-dir"
                type="text"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                placeholder="/path/to/directory"
                className={clsx(
                  'w-full px-3 py-2 rounded-lg',
                  'bg-bg-primary text-text-primary',
                  'border border-border',
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary',
                  'placeholder:text-text-secondary/50',
                  'font-mono text-sm'
                )}
              />
            </div>
          )}

          {/* Repository Selection */}
          {workingDirMode === 'repository' && (
            <div className="mt-3 space-y-3">
              <select
                value={selectedRepositoryId}
                onChange={(e) => setSelectedRepositoryId(e.target.value)}
                className={clsx(
                  'w-full px-3 py-2 rounded-lg',
                  'bg-bg-primary text-text-primary',
                  'border border-border',
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary'
                )}
              >
                <option value="">Select a repository...</option>
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.name} ({repo.type})
                  </option>
                ))}
              </select>

              {/* Repository Info */}
              {selectedRepository && (
                <div className="text-xs text-text-secondary bg-bg-tertiary rounded-lg p-3">
                  {selectedRepository.type === 'local' && (
                    <p>Directory will be copied to tmpfs for isolation.</p>
                  )}
                  {selectedRepository.type === 'local-git-worktree' && (
                    <>
                      <p className="mb-2">A git worktree will be created for this session.</p>
                      <input
                        type="text"
                        value={worktreeName}
                        onChange={(e) => setWorktreeName(e.target.value)}
                        placeholder="Worktree name (optional)"
                        className={clsx(
                          'w-full px-2 py-1.5 rounded',
                          'bg-bg-primary text-text-primary text-sm',
                          'border border-border',
                          'focus:outline-none focus:ring-1 focus:ring-accent-primary/50',
                          'placeholder:text-text-secondary/50'
                        )}
                      />
                    </>
                  )}
                  {selectedRepository.type === 'remote-git' && (
                    <>
                      <p className="mb-2">
                        Repository will be cloned/fetched and a worktree created.
                      </p>
                      <input
                        type="text"
                        value={worktreeName}
                        onChange={(e) => setWorktreeName(e.target.value)}
                        placeholder="Worktree name (optional)"
                        className={clsx(
                          'w-full px-2 py-1.5 rounded',
                          'bg-bg-primary text-text-primary text-sm',
                          'border border-border',
                          'focus:outline-none focus:ring-1 focus:ring-accent-primary/50',
                          'placeholder:text-text-secondary/50'
                        )}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
