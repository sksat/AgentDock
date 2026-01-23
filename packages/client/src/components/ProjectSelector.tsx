import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import type { Repository, SelectedProject, RecentProject } from '@agent-dock/shared';

// Detect home directory from paths (e.g., /home/user or /Users/user)
function detectHomeDir(paths: string[]): string | null {
  for (const path of paths) {
    // Linux: /home/<user>/...
    const linuxMatch = path.match(/^(\/home\/[^/]+)/);
    if (linuxMatch) return linuxMatch[1];
    // macOS: /Users/<user>/...
    const macMatch = path.match(/^(\/Users\/[^/]+)/);
    if (macMatch) return macMatch[1];
  }
  return null;
}

// Format path for display (replace home dir with ~)
function formatPathDisplay(path: string, homeDir: string | null): string {
  if (!homeDir || !path) return path || '';
  if (path.startsWith(homeDir)) {
    return '~' + path.slice(homeDir.length);
  }
  return path;
}

// Get icon for repository type
function getRepositoryIcon(type: Repository['type']): React.ReactNode {
  switch (type) {
    case 'local':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case 'local-git-worktree':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'remote-git':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      );
    default:
      return null;
  }
}

export interface ProjectSelectorProps {
  /** Currently selected project */
  selectedProject: SelectedProject | null;
  /** Called when project selection changes */
  onChange: (project: SelectedProject | null) => void;
  /** List of registered repositories */
  repositories: Repository[];
  /** List of recent projects from session history */
  recentProjects: RecentProject[];
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ProjectSelector({
  selectedProject,
  onChange,
  repositories: rawRepositories,
  recentProjects: rawRecentProjects,
  disabled = false,
  className,
}: ProjectSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCustomPathMode, setIsCustomPathMode] = useState(false);
  const [customPathInput, setCustomPathInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Guard against null/undefined data
  const repositories = useMemo(() => {
    if (!Array.isArray(rawRepositories)) return [];
    return rawRepositories.filter((r): r is Repository => r != null && typeof r.id === 'string');
  }, [rawRepositories]);

  const recentProjects = useMemo(() => {
    if (!Array.isArray(rawRecentProjects)) return [];
    return rawRecentProjects.filter((r): r is RecentProject => r != null && typeof r.path === 'string');
  }, [rawRecentProjects]);

  // Detect home directory from all paths
  const homeDir = useMemo(() => {
    const allPaths = [
      ...repositories.map((r) => r.path).filter(Boolean),
      ...recentProjects.map((r) => r.path).filter(Boolean),
    ];
    return detectHomeDir(allPaths);
  }, [repositories, recentProjects]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setIsCustomPathMode(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when entering custom path mode
  useEffect(() => {
    if (isCustomPathMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCustomPathMode]);

  // Get display text for selected project
  const getSelectedDisplayText = useCallback((): string => {
    if (!selectedProject) return 'Select project...';

    switch (selectedProject.type) {
      case 'repository': {
        const repo = repositories.find((r) => r.id === selectedProject.repositoryId);
        return repo?.name ?? 'Unknown repository';
      }
      case 'recent': {
        const recent = recentProjects.find((r) => r.path === selectedProject.path);
        if (recent?.repositoryName) {
          return recent.repositoryName;
        }
        return formatPathDisplay(selectedProject.path, homeDir);
      }
      case 'custom':
        return formatPathDisplay(selectedProject.path, homeDir);
      default:
        return 'Select project...';
    }
  }, [selectedProject, repositories, recentProjects, homeDir]);

  // Handle repository selection
  const handleSelectRepository = useCallback(
    (repo: Repository) => {
      onChange({ type: 'repository', repositoryId: repo.id });
      setIsDropdownOpen(false);
    },
    [onChange]
  );

  // Handle recent project selection
  const handleSelectRecent = useCallback(
    (recent: RecentProject) => {
      const project: SelectedProject = recent.repositoryId
        ? { type: 'recent', path: recent.path, repositoryId: recent.repositoryId }
        : { type: 'recent', path: recent.path };
      onChange(project);
      setIsDropdownOpen(false);
    },
    [onChange]
  );

  // Handle custom path submission
  const handleCustomPathSubmit = useCallback(() => {
    if (customPathInput.trim()) {
      onChange({ type: 'custom', path: customPathInput.trim() });
    }
    setIsCustomPathMode(false);
    setCustomPathInput('');
    setIsDropdownOpen(false);
  }, [customPathInput, onChange]);

  // Handle custom path input key events
  const handleCustomPathKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCustomPathSubmit();
      } else if (e.key === 'Escape') {
        setIsCustomPathMode(false);
        setCustomPathInput('');
      }
    },
    [handleCustomPathSubmit]
  );

  // Toggle dropdown
  const handleToggleDropdown = useCallback(() => {
    if (!disabled) {
      setIsDropdownOpen((prev) => !prev);
      setIsCustomPathMode(false);
    }
  }, [disabled]);

  // Enter custom path mode
  const handleEnterCustomPathMode = useCallback(() => {
    setIsCustomPathMode(true);
  }, []);

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      {/* Main button / Custom path input */}
      {isCustomPathMode ? (
        <input
          ref={inputRef}
          type="text"
          value={customPathInput}
          onChange={(e) => setCustomPathInput(e.target.value)}
          onKeyDown={handleCustomPathKeyDown}
          placeholder="/path/to/project"
          className={clsx(
            'w-full px-2 py-1 rounded-lg text-xs',
            'bg-bg-tertiary text-text-primary placeholder:text-text-secondary',
            'border border-accent-primary',
            'focus:outline-none focus:ring-1 focus:ring-accent-primary/50'
          )}
        />
      ) : (
        <button
          type="button"
          onClick={handleToggleDropdown}
          disabled={disabled}
          className={clsx(
            'w-full px-2 py-1 rounded-lg text-xs text-left',
            'bg-bg-tertiary text-text-primary',
            'border border-border',
            'hover:border-border-hover transition-colors',
            'flex items-center justify-between gap-2',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span className="truncate">{getSelectedDisplayText()}</span>
          <svg className="w-3 h-3 flex-shrink-0 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Dropdown menu */}
      {isDropdownOpen && !isCustomPathMode && (
        <div
          role="listbox"
          className="absolute z-10 w-full min-w-[240px] mt-1 py-1 bg-bg-secondary border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {/* Repositories section */}
          {repositories.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                REPOSITORIES
              </div>
              {repositories.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => handleSelectRepository(repo)}
                  className={clsx(
                    'w-full px-3 py-1.5 text-left text-xs flex items-center gap-2',
                    'hover:bg-bg-tertiary transition-colors',
                    selectedProject?.type === 'repository' && selectedProject.repositoryId === repo.id
                      ? 'text-accent-primary'
                      : 'text-text-primary'
                  )}
                >
                  <span className="text-text-secondary">{getRepositoryIcon(repo.type)}</span>
                  <span className="truncate">{repo.name}</span>
                </button>
              ))}
            </>
          )}

          {/* Recent projects section */}
          {recentProjects.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                RECENT
              </div>
              {recentProjects.map((recent, index) => (
                <button
                  key={`${recent.path}-${index}`}
                  onClick={() => handleSelectRecent(recent)}
                  className={clsx(
                    'w-full px-3 py-1.5 text-left text-xs flex items-center gap-2',
                    'hover:bg-bg-tertiary transition-colors',
                    selectedProject?.type === 'recent' && selectedProject.path === recent.path
                      ? 'text-accent-primary'
                      : 'text-text-primary'
                  )}
                >
                  <span className="text-text-secondary">
                    {recent.repositoryId ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">
                    {recent.repositoryName ?? formatPathDisplay(recent.path, homeDir)}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* Separator */}
          {(repositories.length > 0 || recentProjects.length > 0) && (
            <div className="my-1 border-t border-border" />
          )}

          {/* Custom path option */}
          <button
            onClick={handleEnterCustomPathMode}
            className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-bg-tertiary transition-colors text-text-primary"
          >
            <span className="text-text-secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </span>
            <span>Custom path...</span>
          </button>
        </div>
      )}
    </div>
  );
}
