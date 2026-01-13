import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to declare mock instances that can be accessed from both
// the mock factory and the tests
const { mockInstances, MockWebSocket } = vi.hoisted(() => {
  const mockInstances: any[] = [];
  const { EventEmitter } = require('events');

  class MockWebSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = 0;
    url: string;
    sendMock = vi.fn();

    constructor(url: string) {
      super();
      this.url = url;
      mockInstances.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.emit('open');
      });
    }

    send(data: string) {
      this.sendMock(data);
    }

    close() {
      this.readyState = 3;
      this.emit('close');
    }
  }

  return { mockInstances, MockWebSocket };
});

vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

import { MessageBridge } from '../message-bridge.js';
import type { ClientMessage, ServerMessage } from '@agent-dock/shared';

describe('MessageBridge', () => {
  let bridge: MessageBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances.length = 0;
  });

  afterEach(async () => {
    if (bridge) {
      await bridge.disconnect();
    }
  });

  describe('connect', () => {
    it('should connect to AgentDock server', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      expect(bridge.isConnected).toBe(true);
      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0].url).toBe('ws://localhost:3001/ws');
    });

    it('should reject if already connected', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      await expect(bridge.connect()).rejects.toThrow('Already connected');
    });
  });

  describe('send', () => {
    it('should send client message to server', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      const message: ClientMessage = {
        type: 'create_session',
        name: 'Slack Session',
        workingDir: '/home/user/project',
      };

      bridge.send(message);

      const mockWs = mockInstances[0];
      expect(mockWs.sendMock).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should throw if not connected', () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');

      const message: ClientMessage = {
        type: 'create_session',
        name: 'Test',
        workingDir: '/tmp',
      };

      expect(() => bridge.send(message)).toThrow('Not connected to server');
    });
  });

  describe('onMessage', () => {
    it('should emit server messages to listeners', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      const listener = vi.fn();
      bridge.onMessage(listener);

      const serverMessage: ServerMessage = {
        type: 'session_created',
        session: {
          id: 'session-123',
          name: 'Test Session',
          createdAt: '2026-01-14T00:00:00Z',
          workingDir: '/tmp',
          status: 'idle',
        },
      };

      mockInstances[0].emit('message', JSON.stringify(serverMessage));

      expect(listener).toHaveBeenCalledWith(serverMessage);
    });

    it('should support multiple listeners', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      bridge.onMessage(listener1);
      bridge.onMessage(listener2);

      const serverMessage: ServerMessage = {
        type: 'text_output',
        sessionId: 'session-123',
        text: 'Hello from Claude',
      };

      mockInstances[0].emit('message', JSON.stringify(serverMessage));

      expect(listener1).toHaveBeenCalledWith(serverMessage);
      expect(listener2).toHaveBeenCalledWith(serverMessage);
    });

    it('should handle invalid JSON gracefully', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      const listener = vi.fn();
      bridge.onMessage(listener);

      // Should not throw
      mockInstances[0].emit('message', 'invalid json {{{');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('offMessage', () => {
    it('should remove message listener', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      const listener = vi.fn();
      bridge.onMessage(listener);
      bridge.offMessage(listener);

      const serverMessage: ServerMessage = {
        type: 'text_output',
        sessionId: 'session-123',
        text: 'Hello',
      };

      mockInstances[0].emit('message', JSON.stringify(serverMessage));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket connection', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      await bridge.disconnect();

      expect(bridge.isConnected).toBe(false);
    });

    it('should do nothing if not connected', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');

      // Should not throw
      await bridge.disconnect();

      expect(bridge.isConnected).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should send create_session and wait for session_created response', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      const sessionPromise = bridge.createSession('Slack Session', '/home/user/project');

      // Wait for the send to be called
      await new Promise(resolve => setTimeout(resolve, 10));

      const mockWs = mockInstances[0];
      expect(mockWs.sendMock).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);
      expect(sentMessage.type).toBe('create_session');
      expect(sentMessage.name).toBe('Slack Session');
      expect(sentMessage.workingDir).toBe('/home/user/project');

      // Simulate server response
      const response: ServerMessage = {
        type: 'session_created',
        session: {
          id: 'session-456',
          name: 'Slack Session',
          createdAt: '2026-01-14T00:00:00Z',
          workingDir: '/home/user/project',
          status: 'idle',
        },
      };
      mockWs.emit('message', JSON.stringify(response));

      const session = await sessionPromise;
      expect(session.id).toBe('session-456');
      expect(session.name).toBe('Slack Session');
    });
  });

  describe('sendUserMessage', () => {
    it('should send user_message to server', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      bridge.sendUserMessage('session-123', 'Hello Claude!');

      const mockWs = mockInstances[0];
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);
      expect(sentMessage.type).toBe('user_message');
      expect(sentMessage.sessionId).toBe('session-123');
      expect(sentMessage.content).toBe('Hello Claude!');
    });

    it('should include source as slack', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      bridge.sendUserMessage('session-123', 'Hello', {
        source: 'slack',
        slackContext: {
          channelId: 'C123',
          threadTs: '1234567890.123456',
          userId: 'U456',
        },
      });

      const mockWs = mockInstances[0];
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);
      expect(sentMessage.source).toBe('slack');
      expect(sentMessage.slackContext).toEqual({
        channelId: 'C123',
        threadTs: '1234567890.123456',
        userId: 'U456',
      });
    });
  });

  describe('sendPermissionResponse', () => {
    it('should send permission_response to server', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      bridge.sendPermissionResponse('session-123', 'req-456', {
        behavior: 'allow',
        updatedInput: { command: 'ls -la' },
      });

      const mockWs = mockInstances[0];
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);
      expect(sentMessage.type).toBe('permission_response');
      expect(sentMessage.sessionId).toBe('session-123');
      expect(sentMessage.requestId).toBe('req-456');
      expect(sentMessage.response.behavior).toBe('allow');
    });

    it('should send deny response', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      bridge.sendPermissionResponse('session-123', 'req-456', {
        behavior: 'deny',
        message: 'User denied permission',
      });

      const mockWs = mockInstances[0];
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);
      expect(sentMessage.response.behavior).toBe('deny');
      expect(sentMessage.response.message).toBe('User denied permission');
    });
  });

  describe('attachSession', () => {
    it('should send attach_session to server', async () => {
      bridge = new MessageBridge('ws://localhost:3001/ws');
      await bridge.connect();

      bridge.attachSession('session-123');

      const mockWs = mockInstances[0];
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);
      expect(sentMessage.type).toBe('attach_session');
      expect(sentMessage.sessionId).toBe('session-123');
    });
  });
});
