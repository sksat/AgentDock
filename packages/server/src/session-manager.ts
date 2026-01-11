import { nanoid } from 'nanoid';
import type { SessionInfo, SessionStatus, MessageItem } from '@claude-bridge/shared';

export interface CreateSessionOptions {
  name?: string;
  workingDir?: string;
}

export class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private sessionCounter = 0;
  private messageHistory: Map<string, MessageItem[]> = new Map();

  createSession(options: CreateSessionOptions = {}): SessionInfo {
    this.sessionCounter++;
    const id = nanoid();
    const session: SessionInfo = {
      id,
      name: options.name ?? `Session ${this.sessionCounter}`,
      workingDir: options.workingDir ?? process.cwd(),
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
}
