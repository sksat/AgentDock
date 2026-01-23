import { useState, useCallback } from 'react';
import clsx from 'clsx';
import type { Repository, RepositoryType } from '@agent-dock/shared';

interface RepositoryCardProps {
  repository: Repository;
  onEdit: (repository: Repository) => void;
  onDelete: (id: string) => void;
}

function RepositoryTypeIcon({ type }: { type: RepositoryType }) {
  switch (type) {
    case 'local':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case 'local-git-worktree':
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0a12 12 0 100 24 12 12 0 000-24zm3.17 16.89c-.13.09-.42.05-.73-.12a4.3 4.3 0 01-.54-.36 7.73 7.73 0 01-1.72 1.06c-.62.27-1.26.4-1.92.4a3.3 3.3 0 01-1.18-.22 2.54 2.54 0 01-.97-.6 2.6 2.6 0 01-.64-.98 3.7 3.7 0 01-.2-1.25c0-.65.15-1.23.45-1.74a3.15 3.15 0 011.23-1.2 6.5 6.5 0 011.84-.73c.7-.16 1.45-.24 2.25-.24v-.28c0-.55-.13-.93-.38-1.14-.25-.21-.65-.32-1.2-.32-.4 0-.78.07-1.15.2-.37.13-.71.3-1.01.5l-.52-.97c.4-.26.86-.47 1.37-.63.51-.16 1.04-.24 1.59-.24.91 0 1.61.23 2.09.7.48.47.72 1.17.72 2.1v3.95c0 .27.06.46.17.57.11.11.28.17.5.17l-.06.97zm-1.75-1.72V13.4c-.63.02-1.2.1-1.71.26-.51.16-.9.4-1.19.7-.28.3-.42.69-.42 1.16 0 .48.13.85.4 1.1.27.25.63.38 1.08.38.5 0 .97-.13 1.4-.4.44-.26.77-.56 1-.9l-.56.47z"/>
        </svg>
      );
    case 'remote-git':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      );
  }
}

function RepositoryTypeLabel({ type }: { type: RepositoryType }) {
  switch (type) {
    case 'local':
      return <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Local</span>;
    case 'local-git-worktree':
      return <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">Git Worktree</span>;
    case 'remote-git':
      return <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Remote Git</span>;
  }
}

function RepositoryCard({ repository, onEdit, onDelete }: RepositoryCardProps) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4 hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="text-text-secondary mt-0.5">
            <RepositoryTypeIcon type={repository.type} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-medium text-text-primary truncate">{repository.name}</h3>
              <RepositoryTypeLabel type={repository.type} />
            </div>
            <p className="text-sm text-text-secondary truncate">
              {repository.type === 'remote-git' ? repository.remoteUrl : repository.path}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => onEdit(repository)}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(repository.id)}
            className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-bg-tertiary rounded transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface RepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RepositoryFormData) => void;
  initialData?: Repository;
  isEditing: boolean;
}

interface RepositoryFormData {
  name: string;
  path: string;
  repositoryType: RepositoryType;
  remoteUrl?: string;
  remoteBranch?: string;
}

const REPOSITORY_TYPE_OPTIONS: { id: RepositoryType; name: string; description: string }[] = [
  { id: 'local', name: 'Local Directory', description: 'Copy to tmpfs for isolation' },
  { id: 'local-git-worktree', name: 'Local Git Repository', description: 'Use git worktree for parallel development' },
  { id: 'remote-git', name: 'Remote Git Repository', description: 'Clone from GitHub/GitLab' },
];

function detectProvider(url: string): 'github' | 'gitlab' | 'bitbucket' | 'other' {
  if (url.includes('github.com')) return 'github';
  if (url.includes('gitlab.com')) return 'gitlab';
  if (url.includes('bitbucket.org')) return 'bitbucket';
  return 'other';
}

function extractRepoName(url: string): string {
  // Extract repository name from URL
  // https://github.com/owner/repo.git -> repo
  // git@github.com:owner/repo.git -> repo
  const match = url.match(/\/([^/]+?)(\.git)?$/) || url.match(/:([^/]+?)(\.git)?$/);
  if (match) {
    return match[1];
  }
  return '';
}

function RepositoryModal({ isOpen, onClose, onSubmit, initialData, isEditing }: RepositoryModalProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [nameManuallySet, setNameManuallySet] = useState(!!initialData?.name);
  const [path, setPath] = useState(initialData?.path ?? '');
  const [repositoryType, setRepositoryType] = useState<RepositoryType>(initialData?.type ?? 'local');
  const [remoteUrl, setRemoteUrl] = useState(initialData?.remoteUrl ?? '');
  const [remoteBranch, setRemoteBranch] = useState(initialData?.remoteBranch ?? '');

  const handleRemoteUrlChange = useCallback((url: string) => {
    setRemoteUrl(url);
    // Auto-fill name from URL if not manually set
    if (!nameManuallySet && repositoryType === 'remote-git') {
      const extracted = extractRepoName(url);
      if (extracted) {
        setName(extracted);
      }
    }
  }, [nameManuallySet, repositoryType]);

  const handleNameChange = useCallback((newName: string) => {
    setName(newName);
    setNameManuallySet(true);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      path: repositoryType === 'remote-git' ? '' : path,
      repositoryType,
      remoteUrl: repositoryType === 'remote-git' ? remoteUrl : undefined,
      remoteBranch: repositoryType === 'remote-git' && remoteBranch ? remoteBranch : undefined,
    });
  }, [name, path, repositoryType, remoteUrl, remoteBranch, onSubmit]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-primary border border-border rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            {isEditing ? 'Edit Repository' : 'Add Repository'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name - show after URL for remote-git */}
          {repositoryType !== 'remote-git' && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Project"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                required
              />
            </div>
          )}

          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Type</label>
            <div className="space-y-2">
              {REPOSITORY_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRepositoryType(option.id)}
                  className={clsx(
                    'w-full px-3 py-2.5 text-left rounded-lg transition-colors flex items-center justify-between',
                    repositoryType === option.id
                      ? 'bg-accent-primary/10 border border-accent-primary/30'
                      : 'bg-bg-tertiary hover:bg-bg-tertiary/80 border border-transparent'
                  )}
                >
                  <div className="flex flex-col">
                    <span className={clsx(
                      'font-medium text-sm',
                      repositoryType === option.id ? 'text-accent-primary' : 'text-text-primary'
                    )}>
                      {option.name}
                    </span>
                    <span className="text-xs text-text-secondary">{option.description}</span>
                  </div>
                  {repositoryType === option.id && (
                    <svg className="w-5 h-5 text-accent-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Path (for local types) */}
          {repositoryType !== 'remote-git' && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Local Path</label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/home/user/projects/my-project"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                required
              />
              <p className="text-xs text-text-secondary mt-1">
                {repositoryType === 'local'
                  ? 'Directory will be copied to tmpfs for each session'
                  : 'Git repository where worktrees will be created'
                }
              </p>
            </div>
          )}

          {/* Remote URL (for remote-git) */}
          {repositoryType === 'remote-git' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Repository URL</label>
                <input
                  type="text"
                  value={remoteUrl}
                  onChange={(e) => handleRemoteUrlChange(e.target.value)}
                  placeholder="https://github.com/owner/repo.git"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  required
                />
                {remoteUrl && (
                  <p className="text-xs text-text-secondary mt-1">
                    Provider: {detectProvider(remoteUrl)}
                  </p>
                )}
              </div>
              {/* Name (auto-filled from URL) */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Name {name && !nameManuallySet && <span className="text-text-secondary">(auto-detected)</span>}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Repository name"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Branch <span className="text-text-secondary">(optional)</span>
                </label>
                <input
                  type="text"
                  value={remoteBranch}
                  onChange={(e) => setRemoteBranch(e.target.value)}
                  placeholder="main"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
            >
              {isEditing ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface RepositoriesPageProps {
  repositories: Repository[];
  onCreateRepository: (name: string, path: string, repositoryType: RepositoryType, remoteUrl?: string, remoteBranch?: string) => void;
  onUpdateRepository: (id: string, updates: { name?: string; path?: string; repositoryType?: RepositoryType; remoteUrl?: string; remoteBranch?: string }) => void;
  onDeleteRepository: (id: string) => void;
}

export function RepositoriesPage({
  repositories,
  onCreateRepository,
  onUpdateRepository,
  onDeleteRepository,
}: RepositoriesPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRepository, setEditingRepository] = useState<Repository | null>(null);

  const handleAdd = useCallback(() => {
    setEditingRepository(null);
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((repository: Repository) => {
    setEditingRepository(repository);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm('Are you sure you want to delete this repository?')) {
      onDeleteRepository(id);
    }
  }, [onDeleteRepository]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setEditingRepository(null);
  }, []);

  const handleModalSubmit = useCallback((data: RepositoryFormData) => {
    if (editingRepository) {
      onUpdateRepository(editingRepository.id, data);
    } else {
      onCreateRepository(data.name, data.path, data.repositoryType, data.remoteUrl, data.remoteBranch);
    }
    handleModalClose();
  }, [editingRepository, onCreateRepository, onUpdateRepository, handleModalClose]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold text-text-primary">Repositories</h1>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-3 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Repository
          </button>
        </div>
        <p className="text-text-secondary mb-8">
          Register repositories for quick access when starting sessions
        </p>

        {repositories.length === 0 ? (
          <div className="bg-bg-secondary border border-border rounded-lg p-8 text-center">
            <div className="text-text-secondary mb-4">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p>No repositories registered yet</p>
            </div>
            <button
              onClick={handleAdd}
              className="text-accent-primary hover:underline"
            >
              Add your first repository
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {repositories.map((repo) => (
              <RepositoryCard
                key={repo.id}
                repository={repo}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <RepositoryModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        initialData={editingRepository ?? undefined}
        isEditing={!!editingRepository}
      />
    </div>
  );
}
