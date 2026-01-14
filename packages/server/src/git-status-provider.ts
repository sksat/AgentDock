import { spawn } from 'node:child_process';
import { EventEmitter } from 'events';
import type { GitStatus } from '@agent-dock/shared';

export interface GitStatusResult {
  status: GitStatus | null;
  isGitRepo: boolean;
  error?: string;
}

export interface GitStatusProviderOptions {
  /** Polling interval in ms (default: 5000) */
  interval?: number;
}

export class GitStatusProvider extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private sessions = new Map<string, string>(); // sessionId -> workingDir
  private readonly interval: number;

  constructor(options: GitStatusProviderOptions = {}) {
    super();
    this.interval = options.interval ?? 5000;
  }

  /** Register a session to track git status for */
  registerSession(sessionId: string, workingDir: string): void {
    this.sessions.set(sessionId, workingDir);
    // Immediately fetch status for new session
    this.fetchStatusForSession(sessionId, workingDir);
  }

  /** Unregister a session */
  unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Start polling */
  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.pollAllSessions(), this.interval);
  }

  /** Stop polling */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async pollAllSessions(): Promise<void> {
    for (const [sessionId, workingDir] of this.sessions) {
      await this.fetchStatusForSession(sessionId, workingDir);
    }
  }

  private async fetchStatusForSession(sessionId: string, workingDir: string): Promise<void> {
    try {
      const result = await this.getGitStatus(workingDir);
      this.emit('status', sessionId, result);
    } catch (error) {
      this.emit('error', sessionId, error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getGitStatus(workingDir: string): Promise<GitStatusResult> {
    // Check if directory is a git repo
    const isGitRepo = await this.isGitRepository(workingDir);
    if (!isGitRepo) {
      return { status: null, isGitRepo: false };
    }

    try {
      // Run git commands in parallel for efficiency
      const [branch, commitHash, statusOutput] = await Promise.all([
        this.runGitCommand(workingDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
        this.runGitCommand(workingDir, ['rev-parse', '--short', 'HEAD']),
        this.runGitCommand(workingDir, ['status', '--porcelain']),
      ]);

      // Parse status output
      const { staged, unstaged, untracked } = this.parseStatusOutput(statusOutput);
      const changedFilesCount = staged + unstaged + untracked;

      return {
        status: {
          branch: branch.trim(),
          commitHash: commitHash.trim(),
          changedFilesCount,
          isDirty: changedFilesCount > 0,
          staged,
          unstaged,
          untracked,
        },
        isGitRepo: true,
      };
    } catch (error) {
      return {
        status: null,
        isGitRepo: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async isGitRepository(workingDir: string): Promise<boolean> {
    try {
      await this.runGitCommand(workingDir, ['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  private parseStatusOutput(output: string): { staged: number; unstaged: number; untracked: number } {
    const lines = output.split('\n').filter((l) => l.trim());
    let staged = 0;
    let unstaged = 0;
    let untracked = 0;

    for (const line of lines) {
      const index = line[0];
      const worktree = line[1];

      if (line.startsWith('??')) {
        untracked++;
      } else {
        if (index !== ' ' && index !== '?') staged++;
        if (worktree !== ' ' && worktree !== '?') unstaged++;
      }
    }

    return { staged, unstaged, untracked };
  }

  private runGitCommand(workingDir: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
      proc.stderr.on('data', (data: Buffer) => (stderr += data.toString()));

      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `git exited with code ${code}`));
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error('git command timeout'));
      }, 5000);
    });
  }
}
