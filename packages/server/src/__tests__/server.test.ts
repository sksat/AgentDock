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
});
