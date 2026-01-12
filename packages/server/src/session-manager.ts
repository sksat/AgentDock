import { nanoid } from 'nanoid';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionInfo, SessionStatus, MessageItem, PermissionMode } from '@claude-bridge/shared';

export interface SessionManagerOptions {
  /** Base directory for auto-created session directories. Defaults to ~/.claude-bridge/sessions */
  sessionsBaseDir?: string;
}

export interface CreateSessionOptions {
  name?: string;
  /** Explicit working directory. If not specified, a new directory will be auto-created. */
  workingDir?: string;
}

export class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private sessionCounter = 0;
  private messageHistory: Map<string, MessageItem[]> = new Map();
  private sessionsBaseDir: string;

  constructor(options: SessionManagerOptions = {}) {
    this.sessionsBaseDir = options.sessionsBaseDir ?? join(homedir(), '.claude-bridge', 'sessions');
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

    const session: SessionInfo = {
      id,
      name: options.name ?? `Session ${this.sessionCounter}`,
      workingDir,
      createdAt: new Date().toISOString(),
      status: 'idle',
    };

    this.sessions.set(id, session);
    this.messageHistory.set(id, []);

    return session;
  }

  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  deleteSession(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      this.messageHistory.delete(id);
    }
    return deleted;
  }

  renameSession(id: string, name: string): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    session.name = name;
    return true;
  }

  updateSessionStatus(id: string, status: SessionStatus): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    session.status = status;
    return true;
  }

  getHistory(id: string): MessageItem[] {
    return this.messageHistory.get(id) ?? [];
  }

  addMessage(id: string, message: MessageItem): void {
    const history = this.messageHistory.get(id);
    if (history) {
      history.push(message);
    }
  }

  addToHistory(id: string, message: MessageItem): void {
    this.addMessage(id, message);
  }

  setClaudeSessionId(id: string, claudeSessionId: string): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    session.claudeSessionId = claudeSessionId;
    return true;
  }

  setPermissionMode(id: string, mode: PermissionMode): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    session.permissionMode = mode;
    return true;
  }

  setModel(id: string, model: string): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    session.model = model;
    return true;
  }
}
