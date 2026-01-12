import { nanoid } from 'nanoid';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import type { SessionInfo, SessionStatus, MessageItem, PermissionMode } from '@agent-dock/shared';
import { initDatabase } from './database.js';

export interface SessionManagerOptions {
  /** Database file path. Defaults to './data.db' */
  dbPath?: string;
  /** Base directory for auto-created session directories. Defaults to ~/.agent-dock/sessions */
  sessionsBaseDir?: string;
}

export interface CreateSessionOptions {
  name?: string;
  /** Explicit working directory. If not specified, a new directory will be auto-created. */
  workingDir?: string;
}

interface SessionRow {
  id: string;
  name: string;
  working_dir: string;
  created_at: string;
  status: string;
  claude_session_id: string | null;
  permission_mode: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ModelUsage {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

interface MessageRow {
  id: number;
  session_id: string;
  type: string;
  content: string;
  timestamp: string;
}

export class SessionManager {
  private db: Database.Database;
  private sessionCounter: number;
  private sessionsBaseDir: string;

  // Prepared statements for better performance
  private stmts: {
    insertSession: Database.Statement;
    getSession: Database.Statement;
    listSessions: Database.Statement;
    deleteSession: Database.Statement;
    updateName: Database.Statement;
    updateStatus: Database.Statement;
    updateClaudeSessionId: Database.Statement;
    updatePermissionMode: Database.Statement;
    updateModel: Database.Statement;
    insertMessage: Database.Statement;
    getMessages: Database.Statement;
    countSessions: Database.Statement;
    addUsage: Database.Statement;
    getUsage: Database.Statement;
    upsertModelUsage: Database.Statement;
    getModelUsage: Database.Statement;
  };

  constructor(options: SessionManagerOptions = {}) {
    const dbPath = options.dbPath ?? './data.db';
    this.sessionsBaseDir = options.sessionsBaseDir ?? join(homedir(), '.agent-dock', 'sessions');
    this.db = initDatabase(dbPath);

    // Prepare statements
    this.stmts = {
      insertSession: this.db.prepare(`
        INSERT INTO sessions (id, name, working_dir, created_at, status, claude_session_id, permission_mode, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getSession: this.db.prepare('SELECT * FROM sessions WHERE id = ?'),
      listSessions: this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
      deleteSession: this.db.prepare('DELETE FROM sessions WHERE id = ?'),
      updateName: this.db.prepare('UPDATE sessions SET name = ? WHERE id = ?'),
      updateStatus: this.db.prepare('UPDATE sessions SET status = ? WHERE id = ?'),
      updateClaudeSessionId: this.db.prepare('UPDATE sessions SET claude_session_id = ? WHERE id = ?'),
      updatePermissionMode: this.db.prepare('UPDATE sessions SET permission_mode = ? WHERE id = ?'),
      updateModel: this.db.prepare('UPDATE sessions SET model = ? WHERE id = ?'),
      insertMessage: this.db.prepare(`
        INSERT INTO messages (session_id, type, content, timestamp)
        VALUES (?, ?, ?, ?)
      `),
      getMessages: this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC'),
      countSessions: this.db.prepare('SELECT COUNT(*) as count FROM sessions'),
      addUsage: this.db.prepare(`
        UPDATE sessions SET
          input_tokens = COALESCE(input_tokens, 0) + ?,
          output_tokens = COALESCE(output_tokens, 0) + ?,
          cache_creation_tokens = COALESCE(cache_creation_tokens, 0) + ?,
          cache_read_tokens = COALESCE(cache_read_tokens, 0) + ?
        WHERE id = ?
      `),
      getUsage: this.db.prepare(`
        SELECT input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens
        FROM sessions WHERE id = ?
      `),
      upsertModelUsage: this.db.prepare(`
        INSERT INTO session_model_usage (session_id, model_name, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, model_name) DO UPDATE SET
          input_tokens = input_tokens + excluded.input_tokens,
          output_tokens = output_tokens + excluded.output_tokens,
          cache_creation_tokens = cache_creation_tokens + excluded.cache_creation_tokens,
          cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens
      `),
      getModelUsage: this.db.prepare(`
        SELECT model_name, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens
        FROM session_model_usage WHERE session_id = ?
      `),
    };

    // Restore session counter from existing sessions
    const countRow = this.stmts.countSessions.get() as { count: number };
    this.sessionCounter = countRow.count;
  }

  private rowToSessionInfo(row: SessionRow): SessionInfo {
    return {
      id: row.id,
      name: row.name,
      workingDir: row.working_dir,
      createdAt: row.created_at,
      status: row.status as SessionStatus,
      claudeSessionId: row.claude_session_id ?? undefined,
      permissionMode: (row.permission_mode as PermissionMode) ?? undefined,
      model: row.model ?? undefined,
    };
  }

  private rowToMessageItem(row: MessageRow): MessageItem {
    return {
      type: row.type as MessageItem['type'],
      content: JSON.parse(row.content),
      timestamp: row.timestamp,
    };
  }

  createSession(options: CreateSessionOptions = {}): SessionInfo {
    this.sessionCounter++;
    const id = nanoid();

    // Determine working directory
    let workingDir: string;
    if (options.workingDir) {
      // Use explicit working directory
      workingDir = options.workingDir;
    } else {
      // Auto-create session directory
      workingDir = join(this.sessionsBaseDir, id);
      mkdirSync(workingDir, { recursive: true });
    }

    const createdAt = new Date().toISOString();
    const name = options.name ?? `Session ${this.sessionCounter}`;
    const status = 'idle';

    this.stmts.insertSession.run(id, name, workingDir, createdAt, status, null, null, null);

    // Return the same structure as getSession for consistency
    return this.getSession(id)!;
  }

  getSession(id: string): SessionInfo | undefined {
    const row = this.stmts.getSession.get(id) as SessionRow | undefined;
    return row ? this.rowToSessionInfo(row) : undefined;
  }

  /** Get the underlying database instance */
  getDb(): Database.Database {
    return this.db;
  }

  listSessions(): SessionInfo[] {
    const rows = this.stmts.listSessions.all() as SessionRow[];
    return rows.map((row) => {
      const session = this.rowToSessionInfo(row);
      const modelUsage = this.getModelUsage(row.id);

      if (modelUsage.length > 0) {
        const totals = modelUsage.reduce(
          (acc, m) => ({
            inputTokens: acc.inputTokens + m.inputTokens,
            outputTokens: acc.outputTokens + m.outputTokens,
            cacheCreationTokens: acc.cacheCreationTokens + m.cacheCreationTokens,
            cacheReadTokens: acc.cacheReadTokens + m.cacheReadTokens,
          }),
          { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
        );

        const totalTokens =
          totals.inputTokens +
          totals.outputTokens +
          totals.cacheCreationTokens +
          totals.cacheReadTokens;

        // Calculate cost based on model pricing (USD per 1M tokens)
        const totalCost = modelUsage.reduce((acc, m) => {
          const pricing = this.getModelPricing(m.modelName);
          return (
            acc +
            (m.inputTokens * pricing.input) / 1_000_000 +
            (m.outputTokens * pricing.output) / 1_000_000 +
            (m.cacheCreationTokens * pricing.cacheCreation) / 1_000_000 +
            (m.cacheReadTokens * pricing.cacheRead) / 1_000_000
          );
        }, 0);

        session.usage = {
          totalCost,
          totalTokens,
          inputTokens: totals.inputTokens,
          outputTokens: totals.outputTokens,
          cacheCreationTokens: totals.cacheCreationTokens,
          cacheReadTokens: totals.cacheReadTokens,
          modelsUsed: modelUsage.map((m) => m.modelName),
        };
      }

      return session;
    });
  }

  /**
   * Get pricing for a model (USD per 1M tokens)
   */
  private getModelPricing(modelName: string): {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  } {
    // Default pricing based on model family
    if (modelName.includes('opus')) {
      return { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 };
    }
    if (modelName.includes('sonnet')) {
      return { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 };
    }
    if (modelName.includes('haiku')) {
      return { input: 0.25, output: 1.25, cacheCreation: 0.3, cacheRead: 0.03 };
    }
    // Default to Sonnet pricing
    return { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 };
  }

  deleteSession(id: string): boolean {
    const result = this.stmts.deleteSession.run(id);
    return result.changes > 0;
  }

  renameSession(id: string, name: string): boolean {
    const result = this.stmts.updateName.run(name, id);
    return result.changes > 0;
  }

  updateSessionStatus(id: string, status: SessionStatus): boolean {
    const result = this.stmts.updateStatus.run(status, id);
    return result.changes > 0;
  }

  getHistory(id: string): MessageItem[] {
    const rows = this.stmts.getMessages.all(id) as MessageRow[];
    return rows.map((row) => this.rowToMessageItem(row));
  }

  addMessage(id: string, message: MessageItem): void {
    const content = JSON.stringify(message.content);
    this.stmts.insertMessage.run(id, message.type, content, message.timestamp);
  }

  addToHistory(id: string, message: MessageItem): void {
    this.addMessage(id, message);
  }

  setClaudeSessionId(id: string, claudeSessionId: string): boolean {
    const result = this.stmts.updateClaudeSessionId.run(claudeSessionId, id);
    return result.changes > 0;
  }

  setPermissionMode(id: string, mode: PermissionMode): boolean {
    const result = this.stmts.updatePermissionMode.run(mode, id);
    return result.changes > 0;
  }

  setModel(id: string, model: string): boolean {
    const result = this.stmts.updateModel.run(model, id);
    return result.changes > 0;
  }

  /**
   * Add usage to session (accumulates with existing usage)
   */
  addUsage(id: string, usage: SessionUsage): boolean {
    const result = this.stmts.addUsage.run(
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheCreationTokens,
      usage.cacheReadTokens,
      id
    );
    return result.changes > 0;
  }

  /**
   * Get accumulated usage for a session
   */
  getUsage(id: string): SessionUsage | null {
    const row = this.stmts.getUsage.get(id) as {
      input_tokens: number | null;
      output_tokens: number | null;
      cache_creation_tokens: number | null;
      cache_read_tokens: number | null;
    } | undefined;

    if (!row) return null;

    return {
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      cacheCreationTokens: row.cache_creation_tokens ?? 0,
      cacheReadTokens: row.cache_read_tokens ?? 0,
    };
  }

  /**
   * Add usage for a specific model in a session
   */
  addModelUsage(sessionId: string, modelName: string, usage: SessionUsage): void {
    this.stmts.upsertModelUsage.run(
      sessionId,
      modelName,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheCreationTokens,
      usage.cacheReadTokens
    );
  }

  /**
   * Get model breakdown for a session
   */
  getModelUsage(sessionId: string): ModelUsage[] {
    const rows = this.stmts.getModelUsage.all(sessionId) as Array<{
      model_name: string;
      input_tokens: number;
      output_tokens: number;
      cache_creation_tokens: number;
      cache_read_tokens: number;
    }>;

    return rows.map((row) => ({
      modelName: row.model_name,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      cacheReadTokens: row.cache_read_tokens,
    }));
  }

  /**
   * Close the database connection.
   * Call this when shutting down the server.
   */
  close(): void {
    this.db.close();
  }
}
