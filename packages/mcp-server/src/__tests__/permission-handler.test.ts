import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionHandler, PermissionRequest, PermissionResponse } from '../permission-handler.js';
import { EventEmitter } from 'events';

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  sendMock = vi.fn();

  constructor(url: string) {
    super();
    this.url = url;
    // Simulate async connection
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    });
  }

  send(data: string) {
    this.sendMock(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }
}

vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

describe('PermissionHandler', () => {
  let handler: PermissionHandler;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
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

      // Start permission request
      const responsePromise = handler.requestPermission(request);

      // Wait a tick for the request to be sent
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the WebSocket instance
      mockWs = (handler as any).ws;

      // Simulate response from server
      const response: PermissionResponse = {
        type: 'permission_response',
        sessionId: 'session-123',
        requestId: expect.any(String),
        response: { behavior: 'allow', updatedInput: { command: 'ls -la' } },
      };

      // Find the requestId from the sent message
      const sentMessage = JSON.parse(mockWs.sendMock.mock.calls[0][0]);
      response.requestId = sentMessage.requestId;

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

      mockWs = (handler as any).ws;
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

    it('should timeout if no response received', async () => {
      handler = new PermissionHandler('ws://localhost:3001/ws', { timeout: 100 });
      await handler.connect();

      const request: PermissionRequest = {
        sessionId: 'session-123',
        toolName: 'Bash',
        input: { command: 'sleep 999' },
      };

      await expect(handler.requestPermission(request)).rejects.toThrow('Permission request timed out');
    });
  });
});
