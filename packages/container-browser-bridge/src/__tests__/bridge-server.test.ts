import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BridgeServer } from '../bridge-server.js';
import { WebSocket } from 'ws';

describe('BridgeServer', () => {
  let server: BridgeServer;
  let client: WebSocket | null = null;
  // Use random port to avoid conflicts between parallel tests
  const TEST_PORT = 13000 + Math.floor(Math.random() * 1000);

  beforeEach(async () => {
    server = new BridgeServer({ port: TEST_PORT });
    await server.start();
  });

  afterEach(async () => {
    if (client?.readyState === WebSocket.OPEN) {
      client.close();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    client = null;
    await server.stop();
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('server lifecycle', () => {
    it('should start server on specified port', async () => {
      // Server already started in beforeEach
      expect(server).toBeDefined();
    });

    it('should accept WebSocket connections', async () => {
      return new Promise<void>((resolve, reject) => {
        client = new WebSocket(`ws://localhost:${TEST_PORT}`);
        client.on('open', () => {
          resolve();
        });
        client.on('error', reject);
      });
    });

    it('should stop server gracefully', async () => {
      await server.stop();
      // Should not throw when stopping again
      await server.stop();
    });
  });

  describe('command handling', () => {
    // Helper to wait for a command_result with specific requestId
    function waitForCommandResult(ws: WebSocket, requestId: string): Promise<{ type: string; requestId: string; success: boolean; result?: unknown; error?: string }> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${requestId}`)), 10000);
        const handler = (data: WebSocket.Data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'command_result' && msg.requestId === requestId) {
            clearTimeout(timeout);
            ws.off('message', handler);
            resolve(msg);
          }
        };
        ws.on('message', handler);
      });
    }

    beforeEach(async () => {
      return new Promise<void>((resolve, reject) => {
        client = new WebSocket(`ws://localhost:${TEST_PORT}`);
        client.on('open', () => {
          resolve();
        });
        client.on('error', reject);
      });
    });

    it('should handle launch_browser command', async () => {
      const responsePromise = waitForCommandResult(client!, 'req-1');
      client!.send(JSON.stringify({
        requestId: 'req-1',
        command: { type: 'launch_browser', options: { headless: true } },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
    });

    it('should return command_result with requestId', async () => {
      const responsePromise = waitForCommandResult(client!, 'test-request-123');
      client!.send(JSON.stringify({
        requestId: 'test-request-123',
        command: { type: 'launch_browser', options: { headless: true } },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.requestId).toBe('test-request-123');
      expect(response.success).toBe(true);
    });

    it('should handle error for unknown command', async () => {
      const responsePromise = waitForCommandResult(client!, 'req-2');
      client!.send(JSON.stringify({
        requestId: 'req-2',
        command: { type: 'unknown_command' },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unknown command');
    });

    it('should include requestId in error response', async () => {
      const responsePromise = waitForCommandResult(client!, 'error-test-123');
      // Send command that will fail (browser not launched, trying to navigate)
      client!.send(JSON.stringify({
        requestId: 'error-test-123',
        command: { type: 'browser_navigate', url: 'https://example.com' },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.requestId).toBe('error-test-123');
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should send generic error for malformed JSON', async () => {
      const errorPromise = new Promise<{ type: string; message: string }>((resolve) => {
        client!.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'error') {
            resolve(msg);
          }
        });
      });

      // Send malformed JSON
      client!.send('not valid json');

      const response = await errorPromise;
      expect(response.type).toBe('error');
      expect(response.message).toBeDefined();
    });
  });

  describe('browser operations', () => {
    // Helper to wait for a command_result with specific requestId
    function waitForCommandResult(ws: WebSocket, requestId: string): Promise<{ type: string; requestId: string; success: boolean; result?: unknown }> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${requestId}`)), 10000);
        const handler = (data: WebSocket.Data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'command_result' && msg.requestId === requestId) {
            clearTimeout(timeout);
            ws.off('message', handler);
            resolve(msg);
          }
        };
        ws.on('message', handler);
      });
    }

    beforeEach(async () => {
      return new Promise<void>((resolve, reject) => {
        client = new WebSocket(`ws://localhost:${TEST_PORT}`);
        client.on('open', async () => {
          // Launch browser first
          const launchPromise = waitForCommandResult(client!, 'launch');
          client!.send(JSON.stringify({
            requestId: 'launch',
            command: { type: 'launch_browser', options: { headless: true } },
          }));
          await launchPromise;
          resolve();
        });
        client.on('error', reject);
      });
    });

    it('should handle browser_navigate command', async () => {
      const responsePromise = waitForCommandResult(client!, 'nav-1');
      client!.send(JSON.stringify({
        requestId: 'nav-1',
        command: { type: 'browser_navigate', url: 'data:text/html,<h1>Test</h1>' },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
    });

    it('should handle browser_snapshot command', async () => {
      // Navigate first
      const navPromise = waitForCommandResult(client!, 'nav');
      client!.send(JSON.stringify({
        requestId: 'nav',
        command: { type: 'browser_navigate', url: 'data:text/html,<h1>Hello</h1>' },
      }));
      await navPromise;

      const responsePromise = waitForCommandResult(client!, 'snap-1');
      client!.send(JSON.stringify({
        requestId: 'snap-1',
        command: { type: 'browser_snapshot' },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
      expect(response.result).toContain('Hello');
    });

    it('should handle browser_click command', async () => {
      const responsePromise = waitForCommandResult(client!, 'click-1');
      client!.send(JSON.stringify({
        requestId: 'click-1',
        command: { type: 'browser_click', x: 100, y: 100 },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
    });

    it('should handle browser_type command', async () => {
      const responsePromise = waitForCommandResult(client!, 'type-1');
      client!.send(JSON.stringify({
        requestId: 'type-1',
        command: { type: 'browser_type', text: 'Hello World' },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
    });

    it('should handle browser_screenshot command', async () => {
      // Navigate first
      const navPromise = waitForCommandResult(client!, 'nav');
      client!.send(JSON.stringify({
        requestId: 'nav',
        command: { type: 'browser_navigate', url: 'data:text/html,<h1>Screenshot</h1>' },
      }));
      await navPromise;

      const responsePromise = waitForCommandResult(client!, 'screenshot-1');
      client!.send(JSON.stringify({
        requestId: 'screenshot-1',
        command: { type: 'browser_screenshot' },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
      // Result should be base64 JPEG
      expect((response.result as string).startsWith('/9j/')).toBe(true);
    });

    it('should handle close_browser command', async () => {
      const responsePromise = waitForCommandResult(client!, 'close-1');
      client!.send(JSON.stringify({
        requestId: 'close-1',
        command: { type: 'close_browser' },
      }));

      const response = await responsePromise;
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
    });
  });

  describe('screencast', () => {
    beforeEach(async () => {
      return new Promise<void>((resolve, reject) => {
        client = new WebSocket(`ws://localhost:${TEST_PORT}`);
        client.on('open', async () => {
          const launchPromise = new Promise<void>((res) => {
            client!.once('message', () => res());
          });
          client!.send(JSON.stringify({
            requestId: 'launch',
            command: { type: 'launch_browser', options: { headless: true } },
          }));
          await launchPromise;
          resolve();
        });
        client.on('error', reject);
      });
    });

    it('should start screencast and receive frames', async () => {
      const frames: unknown[] = [];

      // Set up frame listener
      const framePromise = new Promise<void>((resolve) => {
        client!.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'screencast_frame') {
            frames.push(msg);
            if (frames.length >= 1) resolve();
          }
        });
      });

      // Start screencast
      client!.send(JSON.stringify({
        requestId: 'start-sc',
        command: { type: 'start_screencast', options: { format: 'jpeg', quality: 50 } },
      }));

      // Navigate to trigger frames
      await new Promise(resolve => setTimeout(resolve, 100));
      client!.send(JSON.stringify({
        requestId: 'nav',
        command: { type: 'browser_navigate', url: 'data:text/html,<h1>Frame Test</h1>' },
      }));

      // Wait for frames
      await Promise.race([
        framePromise,
        new Promise(resolve => setTimeout(resolve, 2000)),
      ]);

      expect(frames.length).toBeGreaterThan(0);
    });

    it('should stop screencast', async () => {
      // Start screencast
      await new Promise<void>((resolve) => {
        client!.once('message', () => resolve());
        client!.send(JSON.stringify({
          requestId: 'start-sc',
          command: { type: 'start_screencast' },
        }));
      });

      // Stop screencast
      const responsePromise = new Promise<unknown>((resolve) => {
        client!.once('message', (data) => resolve(JSON.parse(data.toString())));
      });

      client!.send(JSON.stringify({
        requestId: 'stop-sc',
        command: { type: 'stop_screencast' },
      }));

      const response = await responsePromise as { type: string; success: boolean };
      expect(response.type).toBe('command_result');
      expect(response.success).toBe(true);
    });
  });
});
