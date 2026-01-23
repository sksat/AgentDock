import type Database from 'better-sqlite3';
import type { Repository, RepositoryType, RemoteGitProvider } from '@anthropic/agent-dock-shared';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface RepositoryManagerOptions {
  db: Database.Database;
}

export interface CreateRepositoryOptions {
  name: string;
  path: string;
  type: RepositoryType;
  remoteProvider?: RemoteGitProvider;
  remoteUrl?: string;
  remoteBranch?: string;
}

export interface UpdateRepositoryOptions {
  name?: string;
  path?: string;
  type?: RepositoryType;
  remoteProvider?: RemoteGitProvider;
  remoteUrl?: string;
  remoteBranch?: string;
}

export interface PathValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Manages repository registration in the database.
 */
export class RepositoryManager {
  private db: Database.Database;
  private stmts: {
    insert: Database.Statement;
    get: Database.Statement;
    list: Database.Statement;
    update: Database.Statement;
    delete: Database.Statement;
  };

  constructor(options: RepositoryManagerOptions) {
    this.db = options.db;

    // Prepare statements
    this.stmts = {
      insert: this.db.prepare(`
        INSERT INTO repositories (id, name, path, type, created_at, updated_at, remote_provider, remote_url, remote_branch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      get: this.db.prepare(`
        SELECT id, name, path, type, created_at, updated_at, remote_provider, remote_url, remote_branch
        FROM repositories
        WHERE id = ?
      `),
      list: this.db.prepare(`
        SELECT id, name, path, type, created_at, updated_at, remote_provider, remote_url, remote_branch
        FROM repositories
        ORDER BY name ASC
      `),
      update: this.db.prepare(`
        UPDATE repositories
        SET name = ?, path = ?, type = ?, updated_at = ?, remote_provider = ?, remote_url = ?, remote_branch = ?
        WHERE id = ?
      `),
      delete: this.db.prepare(`
        DELETE FROM repositories WHERE id = ?
      `),
    };
  }

  /**
   * Create a new repository.
   */
  create(options: CreateRepositoryOptions): Repository {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.stmts.insert.run(
      id,
      options.name,
      options.path,
      options.type,
      now,
      now,
      options.remoteProvider ?? null,
      options.remoteUrl ?? null,
      options.remoteBranch ?? null
    );

    return {
      id,
      name: options.name,
      path: options.path,
      type: options.type,
      createdAt: now,
      updatedAt: now,
      remoteProvider: options.remoteProvider,
      remoteUrl: options.remoteUrl,
      remoteBranch: options.remoteBranch,
    };
  }

  /**
   * Get a repository by ID.
   */
  get(id: string): Repository | undefined {
    const row = this.stmts.get.get(id) as DbRow | undefined;
    if (!row) return undefined;
    return this.rowToRepository(row);
  }

  /**
   * List all repositories, sorted by name.
   */
  list(): Repository[] {
    const rows = this.stmts.list.all() as DbRow[];
    return rows.map((row) => this.rowToRepository(row));
  }

  /**
   * Update a repository.
   */
  update(id: string, updates: UpdateRepositoryOptions): Repository | null {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = {
      name: updates.name ?? existing.name,
      path: updates.path ?? existing.path,
      type: updates.type ?? existing.type,
      remoteProvider: updates.remoteProvider ?? existing.remoteProvider,
      remoteUrl: updates.remoteUrl ?? existing.remoteUrl,
      remoteBranch: updates.remoteBranch ?? existing.remoteBranch,
    };

    this.stmts.update.run(
      updated.name,
      updated.path,
      updated.type,
      now,
      updated.remoteProvider ?? null,
      updated.remoteUrl ?? null,
      updated.remoteBranch ?? null,
      id
    );

    return {
      id,
      ...updated,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  /**
   * Delete a repository.
   */
  delete(id: string): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  /**
   * Validate a path for the given repository type.
   */
  validatePath(pathToValidate: string, type: RepositoryType): PathValidationResult {
    // Skip validation for remote-git (path will be set after clone)
    if (type === 'remote-git') {
      return { valid: true };
    }

    // Check if path exists
    if (!fs.existsSync(pathToValidate)) {
      return { valid: false, error: `Path does not exist: ${pathToValidate}` };
    }

    // Check if path is a directory
    const stat = fs.statSync(pathToValidate);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${pathToValidate}` };
    }

    // For local-git-worktree, check if it's a git repository
    if (type === 'local-git-worktree') {
      const gitPath = path.join(pathToValidate, '.git');
      if (!fs.existsSync(gitPath)) {
        return { valid: false, error: `Path is not a Git repository: ${pathToValidate}` };
      }
    }

    return { valid: true };
  }

  private rowToRepository(row: DbRow): Repository {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      type: row.type as RepositoryType,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      remoteProvider: row.remote_provider as RemoteGitProvider | undefined,
      remoteUrl: row.remote_url ?? undefined,
      remoteBranch: row.remote_branch ?? undefined,
    };
  }
}

interface DbRow {
  id: string;
  name: string;
  path: string;
  type: string;
  created_at: string;
  updated_at: string;
  remote_provider: string | null;
  remote_url: string | null;
  remote_branch: string | null;
}
