import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Repository } from '@anthropic/agent-dock-shared';

export interface WorkspaceResult {
  /** The working directory path for the session */
  workingDir: string;
  /** Optional cleanup function to remove workspace when session ends */
  cleanup?: () => Promise<void>;
}

export interface WorkspaceSetupOptions {
  repository: Repository;
  sessionId: string;
  tmpfsBasePath: string;
  cacheDir: string;
  worktreeName?: string;
  isContainerMode: boolean;
}

/**
 * Utility class for setting up workspace directories based on repository type.
 */
export class WorkspaceSetup {
  /**
   * Set up a workspace for a session based on repository type.
   *
   * - local: Copy to tmpfs (skip in container mode)
   * - local-git-worktree: Create worktree in repository (skip in container mode)
   * - remote-git: Clone to cache, then create worktree (skip worktree in container mode)
   */
  static async setup(options: WorkspaceSetupOptions): Promise<WorkspaceResult> {
    const { repository, isContainerMode } = options;

    switch (repository.type) {
      case 'local':
        return this.setupLocalWorkspace(options);
      case 'local-git-worktree':
        return this.setupLocalGitWorktree(options);
      case 'remote-git':
        return this.setupRemoteGitWorktree(options);
      default:
        throw new Error(`Unknown repository type: ${repository.type}`);
    }
  }

  /**
   * Set up a local directory workspace.
   * Copies the directory to tmpfs unless in container mode.
   */
  private static async setupLocalWorkspace(
    options: WorkspaceSetupOptions
  ): Promise<WorkspaceResult> {
    const { repository, sessionId, tmpfsBasePath, isContainerMode } = options;

    // In container mode, overlay mount provides isolation
    if (isContainerMode) {
      return { workingDir: repository.path };
    }

    // Copy to tmpfs
    const targetDir = path.join(tmpfsBasePath, sessionId);
    await this.copyDirectory(repository.path, targetDir);

    return {
      workingDir: targetDir,
      cleanup: async () => {
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
      },
    };
  }

  /**
   * Set up a local git worktree workspace.
   * Creates a worktree in the repository's .worktree directory.
   */
  private static async setupLocalGitWorktree(
    options: WorkspaceSetupOptions
  ): Promise<WorkspaceResult> {
    const { repository, sessionId, worktreeName, isContainerMode } = options;

    // In container mode, overlay mount provides isolation
    if (isContainerMode) {
      return { workingDir: repository.path };
    }

    const worktreeDir = path.join(repository.path, '.worktree');
    const name = worktreeName ?? `agentdock-${sessionId}`;
    const worktreePath = path.join(worktreeDir, name);

    // Ensure .worktree directory exists
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    // Create worktree
    execSync(`git worktree add "${worktreePath}" HEAD`, {
      cwd: repository.path,
      stdio: 'pipe',
    });

    return {
      workingDir: worktreePath,
      cleanup: async () => {
        try {
          execSync(`git worktree remove "${worktreePath}" --force`, {
            cwd: repository.path,
            stdio: 'pipe',
          });
        } catch {
          // Worktree may already be removed
          if (fs.existsSync(worktreePath)) {
            fs.rmSync(worktreePath, { recursive: true, force: true });
          }
        }
      },
    };
  }

  /**
   * Set up a remote git worktree workspace.
   * Clones to cache (or fetches if exists), then creates a worktree.
   */
  private static async setupRemoteGitWorktree(
    options: WorkspaceSetupOptions
  ): Promise<WorkspaceResult> {
    const { repository, sessionId, cacheDir, worktreeName, isContainerMode } = options;

    const reposDir = path.join(cacheDir, 'repos');
    const cacheRepoDir = path.join(reposDir, repository.id);

    // Check if cache exists
    const cacheExists = fs.existsSync(path.join(cacheRepoDir, '.git'));

    if (!cacheExists) {
      // Clone repository to cache
      if (!fs.existsSync(reposDir)) {
        fs.mkdirSync(reposDir, { recursive: true });
      }

      execSync(`git clone "${repository.remoteUrl}" "${cacheRepoDir}"`, {
        cwd: reposDir,
        stdio: 'pipe',
      });
    } else {
      // Fetch latest changes
      execSync('git fetch --all', {
        cwd: cacheRepoDir,
        stdio: 'pipe',
      });
    }

    // In container mode, return cache directory directly
    if (isContainerMode) {
      return { workingDir: cacheRepoDir };
    }

    // Create worktree in cache
    const worktreeDir = path.join(cacheRepoDir, '.worktree');
    const name = worktreeName ?? `agentdock-${sessionId}`;
    const worktreePath = path.join(worktreeDir, name);

    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    execSync(`git worktree add "${worktreePath}" HEAD`, {
      cwd: cacheRepoDir,
      stdio: 'pipe',
    });

    return {
      workingDir: worktreePath,
      cleanup: async () => {
        try {
          execSync(`git worktree remove "${worktreePath}" --force`, {
            cwd: cacheRepoDir,
            stdio: 'pipe',
          });
        } catch {
          if (fs.existsSync(worktreePath)) {
            fs.rmSync(worktreePath, { recursive: true, force: true });
          }
        }
      },
    };
  }

  /**
   * Copy a directory recursively.
   */
  private static async copyDirectory(src: string, dest: string): Promise<void> {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
