import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackSessionManager } from '../slack-session-manager.js';
import type { MessageBridge } from '../message-bridge.js';
import type { SessionInfo, ServerMessage } from '@agent-dock/shared';

function createMockBridge(): MessageBridge & {
  mockCreateSession: ReturnType<typeof vi.fn>;
  mockOnMessage: ReturnType<typeof vi.fn>;
  mockAttachSession: ReturnType<typeof vi.fn>;
  mockSaveThreadBinding: ReturnType<typeof vi.fn>;
  mockRequestThreadBindings: ReturnType<typeof vi.fn>;
  listeners: Set<(msg: ServerMessage) => void>;
  simulateServerResponse: (msg: ServerMessage) => void;
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
    mockSaveThreadBinding: vi.fn(),
    saveThreadBinding: vi.fn(),
    mockRequestThreadBindings: vi.fn(),
    requestThreadBindings: vi.fn(),
    listeners,
    simulateServerResponse: (msg: ServerMessage) => {
      for (const listener of listeners) {
        listener(msg);
      }
    },
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

  describe('race condition handling', () => {
    it('should handle concurrent findOrCreateSession calls for the same thread', async () => {
      // Add artificial delay to createSession to simulate network latency
      let resolveFirst: (value: SessionInfo) => void;
      const firstCallPromise = new Promise<SessionInfo>((resolve) => {
        resolveFirst = resolve;
      });

      let callCount = 0;
      mockBridge.createSession = vi.fn().mockImplementation(async (name: string, workingDir: string) => {
        callCount++;
        if (callCount === 1) {
          // First call waits for manual resolution
          return firstCallPromise;
        }
        // Subsequent calls resolve immediately (shouldn't be called)
        return {
          id: `session-${callCount}`,
          name,
          workingDir,
          createdAt: new Date().toISOString(),
          status: 'idle',
        } as SessionInfo;
      });

      // Start two concurrent requests for the same thread
      const promise1 = manager.findOrCreateSession('T123', 'C456', '1234567890.123456');
      const promise2 = manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      // Both should be waiting for the same creation
      expect(mockBridge.createSession).toHaveBeenCalledTimes(1);

      // Resolve the first call
      resolveFirst!({
        id: 'session-1',
        name: 'Test Session',
        workingDir: '/default/working/dir',
        createdAt: new Date().toISOString(),
        status: 'idle',
      });

      // Wait for both promises to resolve
      const [binding1, binding2] = await Promise.all([promise1, promise2]);

      // Both should return the same session
      expect(binding1.agentDockSessionId).toBe('session-1');
      expect(binding2.agentDockSessionId).toBe('session-1');

      // createSession should only have been called once
      expect(mockBridge.createSession).toHaveBeenCalledTimes(1);
    });

    it('should handle hasThread with includePending during session creation', async () => {
      // Add artificial delay to createSession
      let resolveCreation: (value: SessionInfo) => void;
      mockBridge.createSession = vi.fn().mockImplementation(async () => {
        return new Promise<SessionInfo>((resolve) => {
          resolveCreation = resolve;
        });
      });

      // Start session creation (won't complete yet)
      const creationPromise = manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      // Without includePending, hasThread returns false
      expect(manager.hasThread('T123', 'C456', '1234567890.123456', false)).toBe(false);

      // With includePending, hasThread returns true
      expect(manager.hasThread('T123', 'C456', '1234567890.123456', true)).toBe(true);

      // hasPendingCreation should also return true
      expect(manager.hasPendingCreation('T123', 'C456', '1234567890.123456')).toBe(true);

      // Complete the creation
      resolveCreation!({
        id: 'session-1',
        name: 'Test Session',
        workingDir: '/default/working/dir',
        createdAt: new Date().toISOString(),
        status: 'idle',
      });

      await creationPromise;

      // After completion, hasThread should return true even without includePending
      expect(manager.hasThread('T123', 'C456', '1234567890.123456', false)).toBe(true);

      // hasPendingCreation should return false
      expect(manager.hasPendingCreation('T123', 'C456', '1234567890.123456')).toBe(false);
    });

    it('should handle multiple concurrent requests for different threads independently', async () => {
      let resolveFirst: (value: SessionInfo) => void;
      let resolveSecond: (value: SessionInfo) => void;
      let callCount = 0;

      mockBridge.createSession = vi.fn().mockImplementation(async (name: string, workingDir: string) => {
        callCount++;
        if (callCount === 1) {
          return new Promise<SessionInfo>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return new Promise<SessionInfo>((resolve) => {
          resolveSecond = resolve;
        });
      });

      // Start two concurrent requests for DIFFERENT threads
      const promise1 = manager.findOrCreateSession('T123', 'C456', '1234567890.111111');
      const promise2 = manager.findOrCreateSession('T123', 'C456', '1234567890.222222');

      // Both should have started their own creation
      expect(mockBridge.createSession).toHaveBeenCalledTimes(2);

      // Resolve them in reverse order
      resolveSecond!({
        id: 'session-2',
        name: 'Test Session 2',
        workingDir: '/default/working/dir',
        createdAt: new Date().toISOString(),
        status: 'idle',
      });

      resolveFirst!({
        id: 'session-1',
        name: 'Test Session 1',
        workingDir: '/default/working/dir',
        createdAt: new Date().toISOString(),
        status: 'idle',
      });

      const [binding1, binding2] = await Promise.all([promise1, promise2]);

      // Each should have its own session
      expect(binding1.agentDockSessionId).toBe('session-1');
      expect(binding2.agentDockSessionId).toBe('session-2');
    });
  });

  describe('persistence', () => {
    it('should save binding to server when creating new session', async () => {
      await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      expect(mockBridge.saveThreadBinding).toHaveBeenCalledWith(
        expect.objectContaining({
          slackTeamId: 'T123',
          slackChannelId: 'C456',
          slackThreadTs: '1234567890.123456',
          agentDockSessionId: 'session-1',
        })
      );
    });

    it('should not save binding when returning existing session', async () => {
      // First call creates and saves
      await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');
      expect(mockBridge.saveThreadBinding).toHaveBeenCalledTimes(1);

      // Second call returns existing, should not save again
      await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');
      expect(mockBridge.saveThreadBinding).toHaveBeenCalledTimes(1);
    });

    it('should load bindings from server on initialize', async () => {
      const existingBindings = [
        {
          slackTeamId: 'T123',
          slackChannelId: 'C456',
          slackThreadTs: '1234567890.111111',
          agentDockSessionId: 'existing-session-1',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          slackTeamId: 'T123',
          slackChannelId: 'C789',
          slackThreadTs: '1234567890.222222',
          agentDockSessionId: 'existing-session-2',
          createdAt: '2024-01-01T00:00:01Z',
        },
      ];

      // Start initialization
      const initPromise = manager.initialize();

      // Verify requestThreadBindings was called
      expect(mockBridge.requestThreadBindings).toHaveBeenCalled();

      // Simulate server response
      mockBridge.simulateServerResponse({
        type: 'thread_bindings_list',
        bindings: existingBindings,
      });

      await initPromise;

      // Verify bindings are loaded
      const binding1 = manager.getSessionByThread('T123', 'C456', '1234567890.111111');
      expect(binding1?.agentDockSessionId).toBe('existing-session-1');

      const binding2 = manager.getSessionByThread('T123', 'C789', '1234567890.222222');
      expect(binding2?.agentDockSessionId).toBe('existing-session-2');
    });

    it('should attach to existing sessions after initialize', async () => {
      const existingBindings = [
        {
          slackTeamId: 'T123',
          slackChannelId: 'C456',
          slackThreadTs: '1234567890.123456',
          agentDockSessionId: 'existing-session',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      const initPromise = manager.initialize();
      mockBridge.simulateServerResponse({
        type: 'thread_bindings_list',
        bindings: existingBindings,
      });
      await initPromise;

      // After initialize, finding existing thread should reattach, not create
      const binding = await manager.findOrCreateSession('T123', 'C456', '1234567890.123456');

      expect(binding.agentDockSessionId).toBe('existing-session');
      expect(mockBridge.createSession).not.toHaveBeenCalled();
      expect(mockBridge.attachSession).toHaveBeenCalledWith('existing-session');
    });
  });
});
