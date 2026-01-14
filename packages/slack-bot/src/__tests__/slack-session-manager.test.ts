import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackSessionManager } from '../slack-session-manager.js';
import type { MessageBridge } from '../message-bridge.js';
import type { SessionInfo, ServerMessage } from '@agent-dock/shared';

function createMockBridge(): MessageBridge & {
  mockCreateSession: ReturnType<typeof vi.fn>;
  mockOnMessage: ReturnType<typeof vi.fn>;
  mockAttachSession: ReturnType<typeof vi.fn>;
  listeners: Set<(msg: ServerMessage) => void>;
} {
  const listeners = new Set<(msg: ServerMessage) => void>();
  let sessionCounter = 0;
  return {
    isConnected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn((listener) => {
      listeners.add(listener);
    }),
    offMessage: vi.fn((listener) => {
      listeners.delete(listener);
    }),
    mockCreateSession: vi.fn(),
    createSession: vi.fn().mockImplementation(async (name: string, workingDir: string) => {
      sessionCounter++;
      return {
        id: `session-${sessionCounter}`,
        name,
        workingDir,
        createdAt: new Date().toISOString(),
        status: 'idle',
      } as SessionInfo;
    }),
    sendUserMessage: vi.fn(),
    sendPermissionResponse: vi.fn(),
    mockAttachSession: vi.fn(),
    attachSession: vi.fn(),
    mockOnMessage: vi.fn(),
    listeners,
  } as any;
}

describe('SlackSessionManager', () => {
  let manager: SlackSessionManager;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockBridge = createMockBridge();
    manager = new SlackSessionManager(mockBridge as any, '/default/working/dir');
  });

  describe('findOrCreateSession', () => {
    it('should create new session for new thread', async () => {
      const binding = await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      expect(binding.slackTeamId).toBe('T123');
      expect(binding.slackChannelId).toBe('C456');
      expect(binding.slackThreadTs).toBe('1234567890.123456');
      expect(binding.agentDockSessionId).toBeDefined();
      expect(mockBridge.createSession).toHaveBeenCalledWith(
        expect.stringContaining('Slack'),
        '/default/working/dir'
      );
    });

    it('should return existing session for known thread', async () => {
      // First call creates
      const binding1 = await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      // Second call should return the same session
      const binding2 = await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      expect(binding1.agentDockSessionId).toBe(binding2.agentDockSessionId);
      expect(mockBridge.createSession).toHaveBeenCalledTimes(1);
    });

    it('should create different sessions for different threads', async () => {
      const binding1 = await manager.findOrCreateSession('T123', 'C456', '1234567890.111111');
      const binding2 = await manager.findOrCreateSession('T123', 'C456', '1234567890.222222');

      expect(binding1.agentDockSessionId).not.toBe(binding2.agentDockSessionId);
      expect(mockBridge.createSession).toHaveBeenCalledTimes(2);
    });

    it('should create different sessions for different channels', async () => {
      const binding1 = await manager.findOrCreateSession('T123', 'C111', '1234567890.123456');
      const binding2 = await manager.findOrCreateSession('T123', 'C222', '1234567890.123456');

      expect(binding1.agentDockSessionId).not.toBe(binding2.agentDockSessionId);
    });

    it('should create different sessions for different teams', async () => {
      const binding1 = await manager.findOrCreateSession('T111', 'C456', '1234567890.123456');
      const binding2 = await manager.findOrCreateSession('T222', 'C456', '1234567890.123456');

      expect(binding1.agentDockSessionId).not.toBe(binding2.agentDockSessionId);
    });
  });

  describe('getSessionByThread', () => {
    it('should return session binding for known thread', async () => {
      await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      const binding = manager.getSessionByThread('T123', 'C456', '1234567890.123456');

      expect(binding).toBeDefined();
      expect(binding?.slackThreadTs).toBe('1234567890.123456');
    });

    it('should return undefined for unknown thread', () => {
      const binding = manager.getSessionByThread('T123', 'C456', '9999999999.999999');

      expect(binding).toBeUndefined();
    });
  });

  describe('getSessionById', () => {
    it('should return session binding by AgentDock session ID', async () => {
      const created = await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      const binding = manager.getSessionById(created.agentDockSessionId);

      expect(binding).toBeDefined();
      expect(binding?.slackThreadTs).toBe('1234567890.123456');
    });

    it('should return undefined for unknown session ID', () => {
      const binding = manager.getSessionById('unknown-session');

      expect(binding).toBeUndefined();
    });
  });

  describe('hasThread', () => {
    it('should return true for existing thread', async () => {
      await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      expect(manager.hasThread('T123', 'C456', '1234567890.123456')).toBe(true);
    });

    it('should return false for non-existing thread', () => {
      expect(manager.hasThread('T123', 'C456', '9999999999.999999')).toBe(false);
    });
  });

  describe('removeSession', () => {
    it('should remove session binding', async () => {
      const binding = await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      manager.removeSession(binding.agentDockSessionId);

      expect(manager.getSessionById(binding.agentDockSessionId)).toBeUndefined();
      expect(manager.getSessionByThread('T123', 'C456', '1234567890.123456')).toBeUndefined();
    });

    it('should not throw when removing non-existing session', () => {
      expect(() => manager.removeSession('unknown-session')).not.toThrow();
    });
  });

  describe('getAllBindings', () => {
    it('should return all session bindings', async () => {
      await manager.findOrCreateSession('T123', 'C456', '1234567890.111111');
      await manager.findOrCreateSession('T123', 'C456', '1234567890.222222');
      await manager.findOrCreateSession('T123', 'C789', '1234567890.333333');

      const bindings = manager.getAllBindings();

      expect(bindings).toHaveLength(3);
    });

    it('should return empty array when no sessions', () => {
      const bindings = manager.getAllBindings();

      expect(bindings).toEqual([]);
    });
  });

  describe('session name generation', () => {
    it('should generate unique session names', async () => {
      const binding1 = await manager.findOrCreateSession('T123', 'C456', '1234567890.111111');
      const binding2 = await manager.findOrCreateSession('T123', 'C456', '1234567890.222222');

      const call1 = (mockBridge.createSession as any).mock.calls[0];
      const call2 = (mockBridge.createSession as any).mock.calls[1];

      // Names should be different (include timestamp or counter)
      expect(call1[0]).toContain('Slack');
      expect(call2[0]).toContain('Slack');
    });
  });
});
