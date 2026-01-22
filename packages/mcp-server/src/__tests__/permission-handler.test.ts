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

import { PermissionHandler, type PermissionRequest, type PermissionResponse } from '../permission-handler.js';

describe('PermissionHandler', () => {
  let handler: PermissionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances.length = 0;
  });

  afterEach(async () => {
    if (handler) {
      await handler.disconnect();
    }
  });

  describe('connect', () => {
    it('should connect to WebSocket server', async () => {
      handler = new PermissionHandler('ws://localhost:3001/ws');
      await handler.connect();

      expect(handler.isConnected).toBe(true);
    });
  });

  describe('requestPermission', () => {
    it('should send permission request and return response', async () => {
      handler = new PermissionHandler('ws://localhost:3001/ws');
      await handler.connect();

      const request: PermissionRequest = {
        sessionId: 'session-123',
        toolName: 'Bash',
        input: { command: 'ls -la' },
      };

      const responsePromise = handler.requestPermission(request);
      await new Promise(resolve => setTimeout(resolve, 10));

      const mockWs = mockInstances[0];
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);

      const response: PermissionResponse = {
        type: 'permission_response',
        sessionId: 'session-123',
        requestId: sentMessage.requestId,
        response: { behavior: 'allow', updatedInput: { command: 'ls -la' } },
      };

      mockWs.emit('message', JSON.stringify(response));

      const result = await responsePromise;
      expect(result).toEqual({ behavior: 'allow', updatedInput: { command: 'ls -la' } });
    });

    it('should handle deny response', async () => {
      handler = new PermissionHandler('ws://localhost:3001/ws');
      await handler.connect();

      const request: PermissionRequest = {
        sessionId: 'session-123',
        toolName: 'Write',
        input: { file_path: '/etc/passwd', content: 'hacked' },
      };

      const responsePromise = handler.requestPermission(request);
      await new Promise(resolve => setTimeout(resolve, 10));

      const mockWs = mockInstances[0];
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);

      mockWs.emit('message', JSON.stringify({
        type: 'permission_response',
        sessionId: 'session-123',
        requestId: sentMessage.requestId,
        response: { behavior: 'deny', message: 'Access denied to system files' },
      }));

      const result = await responsePromise;
      expect(result).toEqual({ behavior: 'deny', message: 'Access denied to system files' });
    });

    it('should reject if not connected', async () => {
      handler = new PermissionHandler('ws://localhost:3001/ws');

      const request: PermissionRequest = {
        sessionId: 'session-123',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      await expect(handler.requestPermission(request)).rejects.toThrow('Not connected to server');
    });
  });

  describe('disconnect', () => {
    it('should reject pending requests on disconnect', async () => {
      handler = new PermissionHandler('ws://localhost:3001/ws');
      await handler.connect();

      const request: PermissionRequest = {
        sessionId: 'session-123',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      const responsePromise = handler.requestPermission(request);
      await handler.disconnect();

      await expect(responsePromise).rejects.toThrow('Connection closed');
    });
  });
});
