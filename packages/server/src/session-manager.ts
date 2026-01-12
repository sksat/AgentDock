import { nanoid } from 'nanoid';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import type { SessionInfo, SessionStatus, MessageItem, PermissionMode } from '@claude-bridge/shared';
import { initDatabase } from './database.js';

export interface SessionManagerOptions {
  /** Database file path. Defaults to './data.db' */
  dbPath?: string;
  /** Base directory for auto-created session directories. Defaults to ~/.claude-bridge/sessions */
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
  };

  constructor(options: SessionManagerOptions = {}) {
    const dbPath = options.dbPath ?? './data.db';
    this.sessionsBaseDir = options.sessionsBaseDir ?? join(homedir(), '.claude-bridge', 'sessions');
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

  listSessions(): SessionInfo[] {
    const rows = this.stmts.listSessions.all() as SessionRow[];
    return rows.map((row) => this.rowToSessionInfo(row));
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
   * Close the database connection.
   * Call this when shutting down the server.
   */
  close(): void {
    this.db.close();
  }
}
