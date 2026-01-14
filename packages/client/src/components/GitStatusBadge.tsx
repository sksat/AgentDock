import type { GitStatus } from '@agent-dock/shared';

export interface GitStatusBadgeProps {
  status: GitStatus | null;
  isGitRepo: boolean;
  error?: string;
}

/**
 * GitStatusBadge displays the current git repository status.
 * Shows branch name, commit hash, and changed files count.
 */
export function GitStatusBadge({ status, isGitRepo, error }: GitStatusBadgeProps) {
  // Don't show anything if not a git repo
  if (!isGitRepo) {
    return null;
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center gap-1 text-xs text-accent-warning" title={error}>
        <GitBranchIcon className="w-3.5 h-3.5" />
        <span>Git error</span>
      </div>
    );
  }

  // Show loading state
  if (!status) {
    return (
      <div className="flex items-center gap-1 text-xs text-text-secondary">
        <GitBranchIcon className="w-3.5 h-3.5" />
        <span>Loading...</span>
      </div>
    );
  }

  // Build tooltip with details
  const tooltipLines = [
    `Branch: ${status.branch}`,
    `Commit: ${status.commitHash}`,
  ];
  if (status.staged !== undefined) tooltipLines.push(`Staged: ${status.staged}`);
  if (status.unstaged !== undefined) tooltipLines.push(`Unstaged: ${status.unstaged}`);
  if (status.untracked !== undefined) tooltipLines.push(`Untracked: ${status.untracked}`);
  const tooltip = tooltipLines.join('\n');

  return (
    <div className="flex items-center gap-1.5 text-xs" title={tooltip}>
      <GitBranchIcon className="w-3.5 h-3.5 text-text-secondary" />
      <span className="text-text-primary font-medium">{status.branch}</span>
      <span className="text-text-secondary">@</span>
      <span className="font-mono text-text-secondary">{status.commitHash}</span>
      {status.changedFilesCount > 0 && (
        <span className={status.isDirty ? 'text-accent-warning' : 'text-text-secondary'}>
          ({status.changedFilesCount} file{status.changedFilesCount !== 1 ? 's' : ''})
        </span>
      )}
    </div>
  );
}

// Git branch icon (from Heroicons)
function GitBranchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  );
}
