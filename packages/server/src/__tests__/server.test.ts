import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type BridgeServer } from '../server.js';

describe('BridgeServer', () => {
  let server: BridgeServer;
  const TEST_PORT = 3099;

  beforeAll(async () => {
    server = createServer({ port: TEST_PORT });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('HTTP endpoints', () => {
    it('should respond to health check', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'ok' });
    });

    it('should list sessions via REST API', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/api/sessions`);
      const data = await response.json() as { sessions: unknown[] };

      expect(response.status).toBe(200);
      expect(Array.isArray(data.sessions)).toBe(true);
    });
  });

  describe('WebSocket connection', () => {
    it('should accept WebSocket connections', async () => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          ws.close();
          resolve();
        };
        ws.onerror = reject;
      });
    });

    it('should handle list_sessions message', async () => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      const response = await new Promise<any>((resolve, reject) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'list_sessions' }));
        };
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          ws.close();
          resolve(data);
        };
        ws.onerror = reject;
      });

      expect(response.type).toBe('session_list');
      expect(Array.isArray(response.sessions)).toBe(true);
    });

    it('should handle create_session message', async () => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      const response = await new Promise<any>((resolve, reject) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: 'create_session',
            name: 'Test Session'
          }));
        };
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          ws.close();
          resolve(data);
        };
        ws.onerror = reject;
      });

      expect(response.type).toBe('session_created');
      expect(response.session.name).toBe('Test Session');
      expect(response.session.id).toBeDefined();
    });
  });

  describe('Session status broadcast', () => {
    it('should broadcast session_status_changed to all clients when status changes', async () => {
      // Create two WebSocket clients
      const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      // Wait for both to connect
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          ws1.onopen = () => resolve();
          ws1.onerror = reject;
        }),
        new Promise<void>((resolve, reject) => {
          ws2.onopen = () => resolve();
          ws2.onerror = reject;
        }),
      ]);

      // Create a session via ws1
      const createResponse = await new Promise<any>((resolve) => {
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'session_created') {
            ws1.removeEventListener('message', handler);
            resolve(data);
          }
        };
        ws1.addEventListener('message', handler);
        ws1.send(JSON.stringify({ type: 'create_session', name: 'Status Test' }));
      });

      const sessionId = createResponse.session.id;

      // Set up listeners on both clients to receive status change
      const statusPromise1 = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for status on ws1')), 5000);
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'session_status_changed' && data.sessionId === sessionId) {
            clearTimeout(timeout);
            ws1.removeEventListener('message', handler);
            resolve(data);
          }
        };
        ws1.addEventListener('message', handler);
      });

      const statusPromise2 = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for status on ws2')), 5000);
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'session_status_changed' && data.sessionId === sessionId) {
            clearTimeout(timeout);
            ws2.removeEventListener('message', handler);
            resolve(data);
          }
        };
        ws2.addEventListener('message', handler);
      });

      // Send a user_message to trigger status change to 'running'
      // Note: This will fail to actually run (no claude CLI), but the status should change
      ws1.send(JSON.stringify({
        type: 'user_message',
        sessionId,
        content: 'test message',
      }));

      // Both clients should receive the status change
      const [status1, status2] = await Promise.all([statusPromise1, statusPromise2]);

      expect(status1.type).toBe('session_status_changed');
      expect(status1.sessionId).toBe(sessionId);
      expect(status1.status).toBe('running');

      expect(status2.type).toBe('session_status_changed');
      expect(status2.sessionId).toBe(sessionId);
      expect(status2.status).toBe('running');

      // Clean up
      ws1.close();
      ws2.close();
    });
  });
});
