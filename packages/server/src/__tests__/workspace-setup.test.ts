import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceSetup, type WorkspaceResult } from '../workspace-setup';
import type { Repository } from '@anthropic/agent-dock-shared';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';

describe('WorkspaceSetup', () => {
  let tempDir: string;
  let tmpfsBasePath: string;
  let cacheDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-setup-test-'));
    tmpfsBasePath = path.join(tempDir, 'tmpfs');
    cacheDir = path.join(tempDir, 'cache');
    fs.mkdirSync(tmpfsBasePath, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('local type', () => {
    it('should copy directory to tmpfs and return working directory', async () => {
      // Create source directory with files
      const sourceDir = path.join(tempDir, 'source-repo');
      fs.mkdirSync(sourceDir);
      fs.writeFileSync(path.join(sourceDir, 'file.txt'), 'content');

      const repo: Repository = {
        id: 'repo-123',
        name: 'Test Repo',
        path: sourceDir,
        type: 'local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: false,
      });

      // Should create directory in tmpfs
      expect(result.workingDir).toBe(path.join(tmpfsBasePath, 'session-456'));
      expect(fs.existsSync(result.workingDir)).toBe(true);
      expect(fs.existsSync(path.join(result.workingDir, 'file.txt'))).toBe(true);
    });

    it('should provide cleanup function that removes copied directory', async () => {
      const sourceDir = path.join(tempDir, 'source-repo');
      fs.mkdirSync(sourceDir);

      const repo: Repository = {
        id: 'repo-123',
        name: 'Test Repo',
        path: sourceDir,
        type: 'local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: false,
      });

      expect(result.cleanup).toBeDefined();
      expect(fs.existsSync(result.workingDir)).toBe(true);

      await result.cleanup!();
      expect(fs.existsSync(result.workingDir)).toBe(false);
    });

    it('should skip copy in container mode and return original path', async () => {
      const sourceDir = path.join(tempDir, 'source-repo');
      fs.mkdirSync(sourceDir);

      const repo: Repository = {
        id: 'repo-123',
        name: 'Test Repo',
        path: sourceDir,
        type: 'local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: true,
      });

      // Should return original path
      expect(result.workingDir).toBe(sourceDir);
      // No cleanup needed in container mode
      expect(result.cleanup).toBeUndefined();
    });
  });

  describe('local-git-worktree type', () => {
    it('should create worktree in repository .worktree directory', async () => {
      const repoDir = path.join(tempDir, 'git-repo');
      fs.mkdirSync(repoDir);
      fs.mkdirSync(path.join(repoDir, '.git'));

      const repo: Repository = {
        id: 'repo-123',
        name: 'Git Repo',
        path: repoDir,
        type: 'local-git-worktree',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(execSync).mockImplementation(() => Buffer.from(''));

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: false,
      });

      // Should be in .worktree directory
      expect(result.workingDir).toBe(path.join(repoDir, '.worktree', 'agentdock-session-456'));

      // Should have called git worktree add
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git worktree add'),
        expect.any(Object)
      );
    });

    it('should use custom worktree name when provided', async () => {
      const repoDir = path.join(tempDir, 'git-repo');
      fs.mkdirSync(repoDir);
      fs.mkdirSync(path.join(repoDir, '.git'));

      const repo: Repository = {
        id: 'repo-123',
        name: 'Git Repo',
        path: repoDir,
        type: 'local-git-worktree',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(execSync).mockImplementation(() => Buffer.from(''));

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        worktreeName: 'my-feature',
        isContainerMode: false,
      });

      expect(result.workingDir).toBe(path.join(repoDir, '.worktree', 'my-feature'));
    });

    it('should provide cleanup function that removes worktree', async () => {
      const repoDir = path.join(tempDir, 'git-repo');
      fs.mkdirSync(repoDir);
      fs.mkdirSync(path.join(repoDir, '.git'));

      const repo: Repository = {
        id: 'repo-123',
        name: 'Git Repo',
        path: repoDir,
        type: 'local-git-worktree',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(execSync).mockImplementation(() => Buffer.from(''));

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: false,
      });

      expect(result.cleanup).toBeDefined();

      await result.cleanup!();

      // Should have called git worktree remove
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git worktree remove'),
        expect.any(Object)
      );
    });

    it('should skip worktree in container mode and return original path', async () => {
      const repoDir = path.join(tempDir, 'git-repo');
      fs.mkdirSync(repoDir);
      fs.mkdirSync(path.join(repoDir, '.git'));

      const repo: Repository = {
        id: 'repo-123',
        name: 'Git Repo',
        path: repoDir,
        type: 'local-git-worktree',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: true,
      });

      expect(result.workingDir).toBe(repoDir);
      expect(result.cleanup).toBeUndefined();
    });
  });

  describe('remote-git type', () => {
    it('should clone repository to cache and create worktree', async () => {
      const repo: Repository = {
        id: 'repo-123',
        name: 'GitHub Repo',
        path: '',
        type: 'remote-git',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        remoteUrl: 'https://github.com/user/repo.git',
        remoteProvider: 'github',
      };

      // Mock execSync to create cache directory
      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('git clone')) {
          // Create cache repo directory
          const cacheRepoDir = path.join(cacheDir, 'repos', 'repo-123');
          fs.mkdirSync(cacheRepoDir, { recursive: true });
          fs.mkdirSync(path.join(cacheRepoDir, '.git'));
        }
        return Buffer.from('');
      });

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: false,
      });

      // Should clone first
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.any(Object)
      );

      // Worktree should be in cache
      expect(result.workingDir).toBe(
        path.join(cacheDir, 'repos', 'repo-123', '.worktree', 'agentdock-session-456')
      );
    });

    it('should fetch instead of clone if cache exists', async () => {
      // Pre-create cache
      const cacheRepoDir = path.join(cacheDir, 'repos', 'repo-123');
      fs.mkdirSync(cacheRepoDir, { recursive: true });
      fs.mkdirSync(path.join(cacheRepoDir, '.git'));

      const repo: Repository = {
        id: 'repo-123',
        name: 'GitHub Repo',
        path: '',
        type: 'remote-git',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        remoteUrl: 'https://github.com/user/repo.git',
        remoteProvider: 'github',
      };

      vi.mocked(execSync).mockImplementation(() => Buffer.from(''));

      await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: false,
      });

      // Should fetch, not clone
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git fetch'),
        expect.any(Object)
      );
      expect(execSync).not.toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.any(Object)
      );
    });

    it('should skip clone/worktree in container mode', async () => {
      const repo: Repository = {
        id: 'repo-123',
        name: 'GitHub Repo',
        path: '',
        type: 'remote-git',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        remoteUrl: 'https://github.com/user/repo.git',
        remoteProvider: 'github',
      };

      // Pre-create cache for container mode
      const cacheRepoDir = path.join(cacheDir, 'repos', 'repo-123');
      fs.mkdirSync(cacheRepoDir, { recursive: true });

      const result = await WorkspaceSetup.setup({
        repository: repo,
        sessionId: 'session-456',
        tmpfsBasePath,
        cacheDir,
        isContainerMode: true,
      });

      // Should return cache path directly
      expect(result.workingDir).toBe(cacheRepoDir);
      expect(result.cleanup).toBeUndefined();
    });
  });
});
