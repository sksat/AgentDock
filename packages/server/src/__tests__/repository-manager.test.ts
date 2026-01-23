import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { RepositoryManager } from '../repository-manager';
import { initDatabase } from '../database';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('RepositoryManager', () => {
  let db: Database.Database;
  let manager: RepositoryManager;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    // Create temp directory for test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-manager-test-'));
    dbPath = path.join(tempDir, 'test.db');
    db = initDatabase(dbPath);
    manager = new RepositoryManager({ db });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a local repository', () => {
      const repo = manager.create({
        name: 'Test Repo',
        path: '/home/user/projects/test',
        type: 'local',
      });

      expect(repo.id).toBeDefined();
      expect(repo.name).toBe('Test Repo');
      expect(repo.path).toBe('/home/user/projects/test');
      expect(repo.type).toBe('local');
      expect(repo.createdAt).toBeDefined();
      expect(repo.updatedAt).toBeDefined();
    });

    it('should create a local-git-worktree repository', () => {
      const repo = manager.create({
        name: 'Git Repo',
        path: '/home/user/projects/git-project',
        type: 'local-git-worktree',
      });

      expect(repo.type).toBe('local-git-worktree');
    });

    it('should create a remote-git repository with URL', () => {
      const repo = manager.create({
        name: 'GitHub Repo',
        path: '',
        type: 'remote-git',
        remoteUrl: 'https://github.com/user/repo.git',
        remoteProvider: 'github',
        remoteBranch: 'main',
      });

      expect(repo.type).toBe('remote-git');
      expect(repo.remoteUrl).toBe('https://github.com/user/repo.git');
      expect(repo.remoteProvider).toBe('github');
      expect(repo.remoteBranch).toBe('main');
    });

    it('should generate unique IDs for each repository', () => {
      const repo1 = manager.create({
        name: 'Repo 1',
        path: '/path/1',
        type: 'local',
      });
      const repo2 = manager.create({
        name: 'Repo 2',
        path: '/path/2',
        type: 'local',
      });

      expect(repo1.id).not.toBe(repo2.id);
    });
  });

  describe('get', () => {
    it('should retrieve a repository by ID', () => {
      const created = manager.create({
        name: 'Test Repo',
        path: '/test/path',
        type: 'local',
      });

      const retrieved = manager.get(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Repo');
    });

    it('should return undefined for non-existent ID', () => {
      const result = manager.get('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should return empty array when no repositories exist', () => {
      const repos = manager.list();
      expect(repos).toEqual([]);
    });

    it('should return all repositories', () => {
      manager.create({ name: 'Repo 1', path: '/path/1', type: 'local' });
      manager.create({ name: 'Repo 2', path: '/path/2', type: 'local-git-worktree' });
      manager.create({ name: 'Repo 3', path: '', type: 'remote-git', remoteUrl: 'https://github.com/user/repo' });

      const repos = manager.list();

      expect(repos).toHaveLength(3);
      expect(repos.map(r => r.name)).toContain('Repo 1');
      expect(repos.map(r => r.name)).toContain('Repo 2');
      expect(repos.map(r => r.name)).toContain('Repo 3');
    });

    it('should return repositories sorted by name', () => {
      manager.create({ name: 'Zebra', path: '/path/z', type: 'local' });
      manager.create({ name: 'Apple', path: '/path/a', type: 'local' });
      manager.create({ name: 'Mango', path: '/path/m', type: 'local' });

      const repos = manager.list();

      expect(repos[0].name).toBe('Apple');
      expect(repos[1].name).toBe('Mango');
      expect(repos[2].name).toBe('Zebra');
    });
  });

  describe('update', () => {
    it('should update repository name', () => {
      const repo = manager.create({
        name: 'Old Name',
        path: '/test/path',
        type: 'local',
      });

      const updated = manager.update(repo.id, { name: 'New Name' });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('New Name');
      expect(updated?.path).toBe('/test/path');
    });

    it('should update repository path', () => {
      const repo = manager.create({
        name: 'Test',
        path: '/old/path',
        type: 'local',
      });

      const updated = manager.update(repo.id, { path: '/new/path' });

      expect(updated?.path).toBe('/new/path');
    });

    it('should update updatedAt timestamp', async () => {
      const repo = manager.create({
        name: 'Test',
        path: '/test/path',
        type: 'local',
      });

      const originalUpdatedAt = repo.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = manager.update(repo.id, { name: 'Updated' });

      expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should return null for non-existent ID', () => {
      const result = manager.update('non-existent-id', { name: 'New Name' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a repository', () => {
      const repo = manager.create({
        name: 'To Delete',
        path: '/delete/me',
        type: 'local',
      });

      const result = manager.delete(repo.id);

      expect(result).toBe(true);
      expect(manager.get(repo.id)).toBeUndefined();
    });

    it('should return false for non-existent ID', () => {
      const result = manager.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should validate existing directory for local type', () => {
      const result = manager.validatePath(tempDir, 'local');
      expect(result.valid).toBe(true);
    });

    it('should fail for non-existent path for local type', () => {
      const result = manager.validatePath('/non/existent/path', 'local');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should validate git repository for local-git-worktree type', () => {
      // Create a fake .git directory
      const gitDir = path.join(tempDir, '.git');
      fs.mkdirSync(gitDir);

      const result = manager.validatePath(tempDir, 'local-git-worktree');
      expect(result.valid).toBe(true);
    });

    it('should fail for non-git directory for local-git-worktree type', () => {
      const result = manager.validatePath(tempDir, 'local-git-worktree');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a Git repository');
    });

    it('should skip path validation for remote-git type', () => {
      const result = manager.validatePath('', 'remote-git');
      expect(result.valid).toBe(true);
    });
  });
});
