import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitStatusProvider } from '../git-status-provider';
import { spawn } from 'node:child_process';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('GitStatusProvider', () => {
  let provider: GitStatusProvider;
  const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

  // Helper to create mock process that triggers callbacks immediately
  function createMockProcess(stdout: string, exitCode = 0) {
    const mockProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            // Use setImmediate to ensure async behavior
            setImmediate(() => callback(Buffer.from(stdout)));
          }
        }),
      },
      stderr: {
        on: vi.fn((event, callback) => {
          if (event === 'data' && exitCode !== 0) {
            setImmediate(() => callback(Buffer.from('error')));
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // Trigger close after stdout/stderr
          setImmediate(() => setImmediate(() => callback(exitCode)));
        }
        if (event === 'error') {
          // Don't trigger error by default
        }
      }),
      kill: vi.fn(),
    };
    return mockProc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    provider?.stop();
  });

  describe('getGitStatus', () => {
    it('should return git status for a git repository', async () => {
      // Mock responses for: rev-parse --git-dir, rev-parse --abbrev-ref, rev-parse --short, status --porcelain
      mockSpawn
        .mockReturnValueOnce(createMockProcess('.git')) // --git-dir
        .mockReturnValueOnce(createMockProcess('feat/setup-ci\n')) // --abbrev-ref HEAD
        .mockReturnValueOnce(createMockProcess('c85e95b\n')) // --short HEAD
        .mockReturnValueOnce(createMockProcess('')); // status --porcelain (clean)

      provider = new GitStatusProvider();
      const result = await provider.getGitStatus('/home/user/project');

      expect(result.isGitRepo).toBe(true);
      expect(result.status).not.toBeNull();
      expect(result.status?.branch).toBe('feat/setup-ci');
      expect(result.status?.commitHash).toBe('c85e95b');
      expect(result.status?.changedFilesCount).toBe(0);
      expect(result.status?.isDirty).toBe(false);
    });

    it('should return isGitRepo false for non-git directory', async () => {
      // --git-dir fails
      mockSpawn.mockReturnValueOnce(createMockProcess('', 128));

      provider = new GitStatusProvider();
      const result = await provider.getGitStatus('/home/user/not-a-repo');

      expect(result.isGitRepo).toBe(false);
      expect(result.status).toBeNull();
    });

    it('should parse dirty status with staged, unstaged and untracked files', async () => {
      const porcelainOutput = [
        'M  staged-file.ts', // Staged modification
        ' M unstaged-file.ts', // Unstaged modification
        'MM both-file.ts', // Both staged and unstaged
        '?? untracked.ts', // Untracked
        'A  new-file.ts', // Staged new file
      ].join('\n');

      mockSpawn
        .mockReturnValueOnce(createMockProcess('.git'))
        .mockReturnValueOnce(createMockProcess('main\n'))
        .mockReturnValueOnce(createMockProcess('abc1234\n'))
        .mockReturnValueOnce(createMockProcess(porcelainOutput));

      provider = new GitStatusProvider();
      const result = await provider.getGitStatus('/home/user/project');

      expect(result.status?.isDirty).toBe(true);
      expect(result.status?.staged).toBe(3); // M, MM (index), A
      expect(result.status?.unstaged).toBe(2); // M (worktree), MM (worktree)
      expect(result.status?.untracked).toBe(1); // ??
      expect(result.status?.changedFilesCount).toBe(6); // staged + unstaged + untracked
    });

    it('should handle detached HEAD state', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess('.git'))
        .mockReturnValueOnce(createMockProcess('HEAD\n')) // Detached HEAD returns "HEAD"
        .mockReturnValueOnce(createMockProcess('abc1234\n'))
        .mockReturnValueOnce(createMockProcess(''));

      provider = new GitStatusProvider();
      const result = await provider.getGitStatus('/home/user/project');

      expect(result.status?.branch).toBe('HEAD');
    });

    it('should return error when git command fails', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess('.git'))
        .mockReturnValueOnce(createMockProcess('', 1)) // branch command fails
        .mockReturnValueOnce(createMockProcess('abc1234\n'))
        .mockReturnValueOnce(createMockProcess(''));

      provider = new GitStatusProvider();
      const result = await provider.getGitStatus('/home/user/project');

      expect(result.isGitRepo).toBe(true);
      expect(result.status).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('session registration', () => {
    it('should emit status event when session is registered', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess('.git'))
        .mockReturnValueOnce(createMockProcess('main\n'))
        .mockReturnValueOnce(createMockProcess('abc1234\n'))
        .mockReturnValueOnce(createMockProcess(''));

      provider = new GitStatusProvider();

      const statusPromise = new Promise<{ sessionId: string; result: unknown }>((resolve) => {
        provider.on('status', (sessionId, result) => {
          resolve({ sessionId, result });
        });
      });

      provider.registerSession('session-1', '/home/user/project');

      const { sessionId, result } = await statusPromise;

      expect(sessionId).toBe('session-1');
      expect(result).toHaveProperty('isGitRepo', true);
    });

    it('should unregister session', () => {
      provider = new GitStatusProvider();
      provider.registerSession('session-1', '/home/user/project');
      provider.unregisterSession('session-1');

      // Should not throw and session should be removed
      expect(() => provider.unregisterSession('session-1')).not.toThrow();
    });
  });

  describe('polling', () => {
    it('should start and stop without errors', () => {
      provider = new GitStatusProvider({ interval: 5000 });

      // Should not throw
      expect(() => provider.start()).not.toThrow();
      expect(() => provider.stop()).not.toThrow();

      // Should be idempotent
      expect(() => provider.start()).not.toThrow();
      expect(() => provider.start()).not.toThrow();
      expect(() => provider.stop()).not.toThrow();
      expect(() => provider.stop()).not.toThrow();
    });

    it('should poll registered sessions after interval', async () => {
      // Use a very short interval for testing
      provider = new GitStatusProvider({ interval: 50 });

      // First immediate fetch for session registration
      mockSpawn
        .mockReturnValueOnce(createMockProcess('.git'))
        .mockReturnValueOnce(createMockProcess('main\n'))
        .mockReturnValueOnce(createMockProcess('abc1234\n'))
        .mockReturnValueOnce(createMockProcess(''));

      // Second poll
      mockSpawn
        .mockReturnValueOnce(createMockProcess('.git'))
        .mockReturnValueOnce(createMockProcess('main\n'))
        .mockReturnValueOnce(createMockProcess('def5678\n'))
        .mockReturnValueOnce(createMockProcess('M  file.ts\n'));

      const statusEvents: unknown[] = [];
      provider.on('status', (_sessionId, result) => {
        statusEvents.push(result);
      });

      provider.registerSession('session-1', '/home/user/project');
      provider.start();

      // Wait for initial fetch
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);

      // Wait for polling interval
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(statusEvents.length).toBeGreaterThanOrEqual(2);

      provider.stop();
    });
  });
});
