import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type BridgeServer } from '../server.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock child_process for git commands
vi.mock('child_process', () => ({
  execSync: vi.fn(() => Buffer.from('')),
}));

import { execSync } from 'child_process';

describe('Workspace Setup Integration', () => {
  let server: BridgeServer;
  let tempDir: string;
  const TEST_PORT = 3098;

  beforeAll(async () => {
    // Create temp directory for test repositories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-integration-test-'));

    server = createServer({
      port: TEST_PORT,
      disableUsageMonitor: true,
      dbPath: ':memory:',
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to send WebSocket message and get response
  async function sendMessage(message: unknown): Promise<any> {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(message));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        ws.close();
        resolve(data);
      };
      ws.onerror = reject;
    });
  }

  // Helper to register a repository
  async function registerRepository(repo: {
    name: string;
    path: string;
    repositoryType: 'local' | 'local-git-worktree' | 'remote-git';
  }): Promise<string> {
    const response = await sendMessage({
      type: 'create_repository',
      name: repo.name,
      path: repo.path,
      repositoryType: repo.repositoryType,
    });
    expect(response.type).toBe('repository_created');
    return response.repository.id;
  }

  describe('create_session with repositoryId', () => {
    it('should create worktree when local-git-worktree repository is selected', async () => {
      // Create a mock git repository directory
      const repoDir = path.join(tempDir, 'test-git-repo');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.mkdirSync(path.join(repoDir, '.git'));

      // Register the repository
      const repositoryId = await registerRepository({
        name: 'Test Git Repo',
        path: repoDir,
        repositoryType: 'local-git-worktree',
      });

      // Create session with repositoryId
      const response = await sendMessage({
        type: 'create_session',
        name: 'Worktree Test Session',
        repositoryId,
      });

      expect(response.type).toBe('session_created');
      expect(response.session).toBeDefined();

      // Verify working directory is in .worktree
      expect(response.session.workingDir).toContain('.worktree');
      expect(response.session.workingDir).toContain('agentdock-');

      // Verify git worktree add was called
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git worktree add'),
        expect.any(Object)
      );
    });

    it('should return error when repository not found', async () => {
      const response = await sendMessage({
        type: 'create_session',
        name: 'Invalid Repo Session',
        repositoryId: 'non-existent-repo-id',
      });

      expect(response.type).toBe('error');
      expect(response.message).toContain('Repository not found');
    });

    it('should use workingDir directly when repositoryId is not provided (backwards compatibility)', async () => {
      const workingDir = path.join(tempDir, 'custom-dir');
      fs.mkdirSync(workingDir, { recursive: true });

      const response = await sendMessage({
        type: 'create_session',
        name: 'Direct WorkingDir Session',
        workingDir,
      });

      expect(response.type).toBe('session_created');
      expect(response.session.workingDir).toBe(workingDir);

      // git worktree should NOT be called
      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('delete_session cleanup', () => {
    it('should remove worktree when session is deleted', async () => {
      // Create a mock git repository directory
      const repoDir = path.join(tempDir, 'test-git-repo-cleanup');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.mkdirSync(path.join(repoDir, '.git'));

      // Register the repository
      const repositoryId = await registerRepository({
        name: 'Cleanup Test Repo',
        path: repoDir,
        repositoryType: 'local-git-worktree',
      });

      // Create session with repositoryId
      const createResponse = await sendMessage({
        type: 'create_session',
        name: 'Cleanup Test Session',
        repositoryId,
      });

      expect(createResponse.type).toBe('session_created');
      const sessionId = createResponse.session.id;

      // Clear mocks to track only cleanup calls
      vi.clearAllMocks();

      // Delete the session
      const deleteResponse = await sendMessage({
        type: 'delete_session',
        sessionId,
      });

      expect(deleteResponse.type).toBe('session_deleted');

      // Verify git worktree remove was called
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git worktree remove'),
        expect.any(Object)
      );
    });
  });

  describe('local repository type', () => {
    it('should copy to tmpfs when local repository is selected', async () => {
      // Create a source directory
      const sourceDir = path.join(tempDir, 'local-repo');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'test.txt'), 'test content');

      // Register the repository
      const repositoryId = await registerRepository({
        name: 'Local Repo',
        path: sourceDir,
        repositoryType: 'local',
      });

      // Create session with repositoryId
      const response = await sendMessage({
        type: 'create_session',
        name: 'Local Repo Session',
        repositoryId,
      });

      expect(response.type).toBe('session_created');

      // Working dir should be in tmpfs (different from source)
      expect(response.session.workingDir).not.toBe(sourceDir);
      expect(response.session.workingDir).toContain('.agent-dock');
    });
  });
});
