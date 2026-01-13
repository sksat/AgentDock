import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '../session-manager.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let tempBaseDir: string;

  beforeEach(() => {
    // Create a temp directory for session tests
    tempBaseDir = mkdtempSync(join(tmpdir(), 'agent-dock-test-'));
    // Use in-memory SQLite for tests
    sessionManager = new SessionManager({
      sessionsBaseDir: tempBaseDir,
      dbPath: ':memory:',
    });
  });

  afterEach(() => {
    // Close the database connection
    sessionManager.close();
    // Clean up temp directory
    if (tempBaseDir && existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true });
    }
  });

  describe('createSession', () => {
    it('should create a new session with default name', () => {
      const session = sessionManager.createSession();

      expect(session.id).toBeDefined();
      expect(session.name).toMatch(/^Session \d+$/);
      expect(session.status).toBe('idle');
      expect(session.createdAt).toBeDefined();
    });

    it('should create a session with custom name', () => {
      const session = sessionManager.createSession({ name: 'My Session' });

      expect(session.name).toBe('My Session');
    });

    it('should create a session with custom working directory', () => {
      const session = sessionManager.createSession({ workingDir: '/tmp/test' });

      expect(session.workingDir).toBe('/tmp/test');
    });

    it('should auto-create session directory when workingDir not specified', () => {
      const session = sessionManager.createSession();

      // Should be a subdirectory of the base directory with the session ID
      expect(session.workingDir).toBe(join(tempBaseDir, session.id));
      // Directory should actually exist
      expect(existsSync(session.workingDir)).toBe(true);
    });
  });

  describe('getSession', () => {
    it('should return session by id', () => {
      const created = sessionManager.createSession({ name: 'Test' });
      const retrieved = sessionManager.getSession(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent session', () => {
      const session = sessionManager.getSession('non-existent');

      expect(session).toBeUndefined();
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions', () => {
      const sessions = sessionManager.listSessions();

      expect(sessions).toEqual([]);
    });

    it('should return all sessions', () => {
      sessionManager.createSession({ name: 'Session 1' });
      sessionManager.createSession({ name: 'Session 2' });

      const sessions = sessionManager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.name)).toContain('Session 1');
      expect(sessions.map(s => s.name)).toContain('Session 2');
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', () => {
      const session = sessionManager.createSession();
      const deleted = sessionManager.deleteSession(session.id);

      expect(deleted).toBe(true);
      expect(sessionManager.getSession(session.id)).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const deleted = sessionManager.deleteSession('non-existent');

      expect(deleted).toBe(false);
    });

    it('should also delete associated messages', () => {
      const session = sessionManager.createSession();
      sessionManager.addToHistory(session.id, {
        type: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      sessionManager.deleteSession(session.id);

      // Verify messages are also deleted (via CASCADE)
      const history = sessionManager.getHistory(session.id);
      expect(history).toHaveLength(0);
    });
  });

  describe('renameSession', () => {
    it('should rename existing session', () => {
      const session = sessionManager.createSession({ name: 'Old Name' });
      const renamed = sessionManager.renameSession(session.id, 'New Name');

      expect(renamed).toBe(true);
      expect(sessionManager.getSession(session.id)?.name).toBe('New Name');
    });

    it('should return false for non-existent session', () => {
      const renamed = sessionManager.renameSession('non-existent', 'New Name');

      expect(renamed).toBe(false);
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', () => {
      const session = sessionManager.createSession();
      sessionManager.updateSessionStatus(session.id, 'running');

      expect(sessionManager.getSession(session.id)?.status).toBe('running');
    });
  });

  describe('setClaudeSessionId', () => {
    it('should set Claude session ID', () => {
      const session = sessionManager.createSession();
      const result = sessionManager.setClaudeSessionId(session.id, 'claude-abc123');

      expect(result).toBe(true);
      expect(sessionManager.getSession(session.id)?.claudeSessionId).toBe('claude-abc123');
    });

    it('should return false for non-existent session', () => {
      const result = sessionManager.setClaudeSessionId('non-existent', 'claude-abc123');

      expect(result).toBe(false);
    });
  });

  describe('setPermissionMode', () => {
    it('should set permission mode', () => {
      const session = sessionManager.createSession();
      const result = sessionManager.setPermissionMode(session.id, 'auto-edit');

      expect(result).toBe(true);
      expect(sessionManager.getSession(session.id)?.permissionMode).toBe('auto-edit');
    });

    it('should return false for non-existent session', () => {
      const result = sessionManager.setPermissionMode('non-existent', 'auto-edit');

      expect(result).toBe(false);
    });
  });

  describe('setModel', () => {
    it('should set model', () => {
      const session = sessionManager.createSession();
      const result = sessionManager.setModel(session.id, 'claude-opus-4-20250514');

      expect(result).toBe(true);
      expect(sessionManager.getSession(session.id)?.model).toBe('claude-opus-4-20250514');
    });

    it('should return false for non-existent session', () => {
      const result = sessionManager.setModel('non-existent', 'claude-opus-4-20250514');

      expect(result).toBe(false);
    });
  });

  describe('addToHistory', () => {
    it('should add message to history', () => {
      const session = sessionManager.createSession();
      const message = {
        type: 'user' as const,
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      sessionManager.addToHistory(session.id, message);
      const history = sessionManager.getHistory(session.id);

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(message);
    });

    it('should preserve order of messages', () => {
      const session = sessionManager.createSession();
      const messages = [
        { type: 'user' as const, content: 'First', timestamp: '2024-01-01T00:00:00Z' },
        { type: 'assistant' as const, content: 'Second', timestamp: '2024-01-01T00:00:01Z' },
        { type: 'user' as const, content: 'Third', timestamp: '2024-01-01T00:00:02Z' },
      ];

      for (const msg of messages) {
        sessionManager.addToHistory(session.id, msg);
      }

      const history = sessionManager.getHistory(session.id);
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('First');
      expect(history[1].content).toBe('Second');
      expect(history[2].content).toBe('Third');
    });

    it('should handle complex content objects', () => {
      const session = sessionManager.createSession();
      const message = {
        type: 'tool_use' as const,
        content: {
          toolName: 'Read',
          toolUseId: 'tool-123',
          input: { file_path: '/path/to/file.ts' },
        },
        timestamp: new Date().toISOString(),
      };

      sessionManager.addToHistory(session.id, message);
      const history = sessionManager.getHistory(session.id);

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(message);
    });
  });

  describe('persistence', () => {
    it('should persist sessions across instances (file-based DB)', () => {
      const dbPath = join(tempBaseDir, 'test.db');

      // Create a session with first instance
      const manager1 = new SessionManager({ dbPath, sessionsBaseDir: tempBaseDir });
      const session = manager1.createSession({ name: 'Persistent Session' });
      manager1.addToHistory(session.id, {
        type: 'user',
        content: 'Hello from instance 1',
        timestamp: new Date().toISOString(),
      });
      manager1.close();

      // Read with second instance
      const manager2 = new SessionManager({ dbPath, sessionsBaseDir: tempBaseDir });
      const sessions = manager2.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('Persistent Session');

      const history = manager2.getHistory(session.id);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello from instance 1');

      manager2.close();
    });
  });

  describe('ephemeral sessions', () => {
    it('should create ephemeral session with default name', () => {
      const session = sessionManager.createSession();

      // Session should be in memory
      expect(session.id).toBeDefined();
      expect(session.name).toMatch(/^Session \d+$/);

      // Should be accessible via getSession
      expect(sessionManager.getSession(session.id)).toEqual(session);

      // Should be listed
      const sessions = sessionManager.listSessions();
      expect(sessions).toContainEqual(session);

      // Should be marked as ephemeral
      expect(sessionManager.isEphemeral(session.id)).toBe(true);
    });

    it('should immediately persist session with explicit name', () => {
      const session = sessionManager.createSession({ name: 'My Custom Session' });

      // Should NOT be ephemeral
      expect(sessionManager.isEphemeral(session.id)).toBe(false);

      // Should be in DB (accessible via getSession which checks DB)
      expect(sessionManager.getSession(session.id)).toBeDefined();
    });

    it('should persist ephemeral session on first message', () => {
      const session = sessionManager.createSession();
      expect(sessionManager.isEphemeral(session.id)).toBe(true);

      // Add a message - this should trigger persistence
      sessionManager.addToHistory(session.id, {
        type: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      // Should no longer be ephemeral
      expect(sessionManager.isEphemeral(session.id)).toBe(false);

      // Should have the message in history
      const history = sessionManager.getHistory(session.id);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello');
    });

    it('should persist ephemeral session on rename', () => {
      const session = sessionManager.createSession();
      expect(sessionManager.isEphemeral(session.id)).toBe(true);

      // Rename - this should trigger persistence
      sessionManager.renameSession(session.id, 'Renamed Session');

      // Should no longer be ephemeral
      expect(sessionManager.isEphemeral(session.id)).toBe(false);

      // Should have new name
      expect(sessionManager.getSession(session.id)?.name).toBe('Renamed Session');
    });

    it('should delete ephemeral session without DB access', () => {
      const session = sessionManager.createSession();
      expect(sessionManager.isEphemeral(session.id)).toBe(true);

      // Delete ephemeral session
      const deleted = sessionManager.deleteSession(session.id);
      expect(deleted).toBe(true);

      // Should no longer exist
      expect(sessionManager.getSession(session.id)).toBeUndefined();
      expect(sessionManager.listSessions()).not.toContainEqual(expect.objectContaining({ id: session.id }));
    });

    it('should update ephemeral session status in memory', () => {
      const session = sessionManager.createSession();
      expect(sessionManager.isEphemeral(session.id)).toBe(true);

      // Update status - should NOT trigger persistence
      sessionManager.updateSessionStatus(session.id, 'running');

      // Should still be ephemeral
      expect(sessionManager.isEphemeral(session.id)).toBe(true);

      // But status should be updated
      expect(sessionManager.getSession(session.id)?.status).toBe('running');
    });

    it('should update ephemeral session model in memory', () => {
      const session = sessionManager.createSession();
      expect(sessionManager.isEphemeral(session.id)).toBe(true);

      // Set model - should NOT trigger persistence
      sessionManager.setModel(session.id, 'claude-opus-4-5-20251101');

      // Should still be ephemeral
      expect(sessionManager.isEphemeral(session.id)).toBe(true);

      // But model should be updated
      expect(sessionManager.getSession(session.id)?.model).toBe('claude-opus-4-5-20251101');
    });

    it('should not persist ephemeral sessions across server restart', () => {
      const dbPath = join(tempBaseDir, 'ephemeral-test.db');

      // Create ephemeral session with first instance
      const manager1 = new SessionManager({ dbPath, sessionsBaseDir: tempBaseDir });
      const ephemeralSession = manager1.createSession(); // No name = ephemeral
      const persistedSession = manager1.createSession({ name: 'Persisted' });
      manager1.close();

      // Simulate server restart with second instance
      const manager2 = new SessionManager({ dbPath, sessionsBaseDir: tempBaseDir });
      const sessions = manager2.listSessions();

      // Only persisted session should exist
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('Persisted');

      // Ephemeral session should be lost
      expect(manager2.getSession(ephemeralSession.id)).toBeUndefined();

      manager2.close();
    });

    it('should list ephemeral sessions before persisted ones', () => {
      // Create persisted session first
      const persisted = sessionManager.createSession({ name: 'Persisted Session' });

      // Then create ephemeral session
      const ephemeral = sessionManager.createSession();

      const sessions = sessionManager.listSessions();
      expect(sessions).toHaveLength(2);

      // Ephemeral should come first (newest)
      expect(sessions[0].id).toBe(ephemeral.id);
      expect(sessions[1].id).toBe(persisted.id);
    });
  });
});
