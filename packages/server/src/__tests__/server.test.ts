import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, isBrowserTool, isAgentDockTool, isAutoAllowedTool, type BridgeServer } from '../server.js';

describe('BridgeServer', () => {
  let server: BridgeServer;
  const TEST_PORT = 3099;

  beforeAll(async () => {
    server = createServer({ port: TEST_PORT, disableUsageMonitor: true, dbPath: ':memory:' });
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

  describe('Real-time state sharing', () => {
    it('should broadcast session_created to all clients', async () => {
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

      // Set up listener on ws2 to receive session_created broadcast
      const broadcastPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for broadcast')), 5000);
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'session_created') {
            clearTimeout(timeout);
            ws2.removeEventListener('message', handler);
            resolve(data);
          }
        };
        ws2.addEventListener('message', handler);
      });

      // Create session via ws1
      ws1.send(JSON.stringify({ type: 'create_session', name: 'Broadcast Test' }));

      // ws2 should receive the broadcast
      const broadcast = await broadcastPromise;
      expect(broadcast.type).toBe('session_created');
      expect(broadcast.session.name).toBe('Broadcast Test');

      ws1.close();
      ws2.close();
    });

    it('should broadcast user_input to other attached clients but not sender', async () => {
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
        ws1.send(JSON.stringify({ type: 'create_session', name: 'User Input Test' }));
      });

      const sessionId = createResponse.session.id;

      // Attach ws2 to the session
      ws2.send(JSON.stringify({ type: 'attach_session', sessionId }));

      // Wait for attach response
      await new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'session_attached') {
            ws2.removeEventListener('message', handler);
            resolve();
          }
        };
        ws2.addEventListener('message', handler);
      });

      // Set up listener on ws2 for user_input
      const userInputPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for user_input')), 5000);
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'user_input') {
            clearTimeout(timeout);
            ws2.removeEventListener('message', handler);
            resolve(data);
          }
        };
        ws2.addEventListener('message', handler);
      });

      // Track if ws1 receives user_input (it shouldn't)
      let ws1ReceivedUserInput = false;
      const ws1Handler = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === 'user_input') {
          ws1ReceivedUserInput = true;
        }
      };
      ws1.addEventListener('message', ws1Handler);

      // Send user_message from ws1
      ws1.send(JSON.stringify({
        type: 'user_message',
        sessionId,
        content: 'Hello from ws1',
        source: 'web',
      }));

      // ws2 should receive user_input
      const userInput = await userInputPromise;
      expect(userInput.type).toBe('user_input');
      expect(userInput.content).toBe('Hello from ws1');
      expect(userInput.source).toBe('web');
      expect(userInput.sessionId).toBe(sessionId);

      // Wait a bit to ensure ws1 doesn't receive it
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(ws1ReceivedUserInput).toBe(false);

      ws1.removeEventListener('message', ws1Handler);
      ws1.close();
      ws2.close();
    });

    it('should support multiple clients attached to same session', async () => {
      // Create three WebSocket clients
      const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      const ws3 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      // Wait for all to connect
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          ws1.onopen = () => resolve();
          ws1.onerror = reject;
        }),
        new Promise<void>((resolve, reject) => {
          ws2.onopen = () => resolve();
          ws2.onerror = reject;
        }),
        new Promise<void>((resolve, reject) => {
          ws3.onopen = () => resolve();
          ws3.onerror = reject;
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
        ws1.send(JSON.stringify({ type: 'create_session', name: 'Multi Client Test' }));
      });

      const sessionId = createResponse.session.id;

      // Attach ws2 and ws3 to the session
      const attachPromises = [ws2, ws3].map((ws) => {
        return new Promise<void>((resolve) => {
          const handler = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            if (data.type === 'session_attached') {
              ws.removeEventListener('message', handler);
              resolve();
            }
          };
          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ type: 'attach_session', sessionId }));
        });
      });

      await Promise.all(attachPromises);

      // Set up listeners on ws2 and ws3 for user_input
      const userInputPromise2 = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout on ws2')), 5000);
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'user_input') {
            clearTimeout(timeout);
            ws2.removeEventListener('message', handler);
            resolve(data);
          }
        };
        ws2.addEventListener('message', handler);
      });

      const userInputPromise3 = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout on ws3')), 5000);
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'user_input') {
            clearTimeout(timeout);
            ws3.removeEventListener('message', handler);
            resolve(data);
          }
        };
        ws3.addEventListener('message', handler);
      });

      // Send user_message from ws1
      ws1.send(JSON.stringify({
        type: 'user_message',
        sessionId,
        content: 'Message to all',
        source: 'slack',
      }));

      // Both ws2 and ws3 should receive user_input
      const [input2, input3] = await Promise.all([userInputPromise2, userInputPromise3]);

      expect(input2.content).toBe('Message to all');
      expect(input2.source).toBe('slack');
      expect(input3.content).toBe('Message to all');
      expect(input3.source).toBe('slack');

      ws1.close();
      ws2.close();
      ws3.close();
    });
  });
});

describe('isBrowserTool', () => {
  it('should return true for AgentDock MCP bridge browser tools', () => {
    // mcp__bridge__browser_* tools are AgentDock's MCP bridge browser commands
    expect(isBrowserTool('mcp__bridge__browser_navigate')).toBe(true);
    expect(isBrowserTool('mcp__bridge__browser_click')).toBe(true);
    expect(isBrowserTool('mcp__bridge__browser_type')).toBe(true);
    expect(isBrowserTool('mcp__bridge__browser_snapshot')).toBe(true);
    expect(isBrowserTool('mcp__bridge__browser_take_screenshot')).toBe(true);
  });

  it('should return true for direct browser tools', () => {
    // Direct browser_* tools (if any)
    expect(isBrowserTool('browser_navigate')).toBe(true);
    expect(isBrowserTool('browser_click')).toBe(true);
    expect(isBrowserTool('browser_type')).toBe(true);
  });

  it('should return false for external MCP Playwright browser tools', () => {
    // External Playwright MCP tools should NOT be auto-allowed
    // They come from a separate MCP server, not AgentDock's built-in browser
    expect(isBrowserTool('mcp__plugin_playwright_playwright__browser_navigate')).toBe(false);
    expect(isBrowserTool('mcp__plugin_playwright_playwright__browser_click')).toBe(false);
    expect(isBrowserTool('mcp__plugin_playwright_playwright__browser_type')).toBe(false);
    expect(isBrowserTool('mcp__plugin_playwright_playwright__browser_snapshot')).toBe(false);
  });

  it('should return false for non-browser tools', () => {
    expect(isBrowserTool('Bash')).toBe(false);
    expect(isBrowserTool('Write')).toBe(false);
    expect(isBrowserTool('Edit')).toBe(false);
    expect(isBrowserTool('Read')).toBe(false);
    expect(isBrowserTool('mcp__bridge__permission_prompt')).toBe(false);
    expect(isBrowserTool('mcp__some_other_tool')).toBe(false);
  });
});

describe('isAgentDockTool', () => {
  it('should return true for AgentDock integrated MCP tools (mcp__bridge__*)', () => {
    expect(isAgentDockTool('mcp__bridge__browser_navigate')).toBe(true);
    expect(isAgentDockTool('mcp__bridge__port_monitor')).toBe(true);
    expect(isAgentDockTool('mcp__bridge__permission_prompt')).toBe(true);
    expect(isAgentDockTool('mcp__bridge__some_future_tool')).toBe(true);
  });

  it('should return false for external MCP tools', () => {
    expect(isAgentDockTool('mcp__plugin_playwright_playwright__browser_navigate')).toBe(false);
    expect(isAgentDockTool('mcp__plugin_some_other__tool')).toBe(false);
  });

  it('should return false for non-MCP tools', () => {
    expect(isAgentDockTool('Bash')).toBe(false);
    expect(isAgentDockTool('Write')).toBe(false);
    expect(isAgentDockTool('browser_navigate')).toBe(false);
  });
});

describe('isAutoAllowedTool', () => {
  it('should return true for AskUserQuestion', () => {
    expect(isAutoAllowedTool('AskUserQuestion')).toBe(true);
  });

  it('should return true for browser tools', () => {
    expect(isAutoAllowedTool('mcp__bridge__browser_navigate')).toBe(true);
    expect(isAutoAllowedTool('mcp__bridge__browser_click')).toBe(true);
    expect(isAutoAllowedTool('browser_navigate')).toBe(true);
  });

  it('should return true for all AgentDock integrated MCP tools (mcp__bridge__*)', () => {
    // All mcp__bridge__* tools should be auto-allowed as they are AgentDock integrated
    expect(isAutoAllowedTool('mcp__bridge__port_monitor')).toBe(true);
    expect(isAutoAllowedTool('mcp__bridge__permission_prompt')).toBe(true);
    expect(isAutoAllowedTool('mcp__bridge__browser_navigate')).toBe(true);
    expect(isAutoAllowedTool('mcp__bridge__some_future_tool')).toBe(true);
  });

  it('should return false for external MCP tools', () => {
    // External MCP tools (mcp__plugin_*) should NOT be auto-allowed
    expect(isAutoAllowedTool('mcp__plugin_playwright_playwright__browser_navigate')).toBe(false);
    expect(isAutoAllowedTool('mcp__plugin_some_other__tool')).toBe(false);
  });

  it('should return true for UI/internal tools (no system changes)', () => {
    expect(isAutoAllowedTool('ExitPlanMode')).toBe(true);
    expect(isAutoAllowedTool('TodoWrite')).toBe(true);
    expect(isAutoAllowedTool('TaskOutput')).toBe(true);
    expect(isAutoAllowedTool('EnterPlanMode')).toBe(true);
  });

  it('should return false for other tools', () => {
    expect(isAutoAllowedTool('Bash')).toBe(false);
    expect(isAutoAllowedTool('Write')).toBe(false);
    expect(isAutoAllowedTool('Edit')).toBe(false);
    expect(isAutoAllowedTool('Read')).toBe(false);
  });

  it('should return false for file access tools', () => {
    expect(isAutoAllowedTool('Glob')).toBe(false);
    expect(isAutoAllowedTool('Grep')).toBe(false);
  });

  it('should return false for web tools by default', () => {
    expect(isAutoAllowedTool('WebFetch')).toBe(false);
    expect(isAutoAllowedTool('WebSearch')).toBe(false);
  });
});

describe('isWebTool', () => {
  // Need to import isWebTool from server.ts
  let isWebTool: (toolName: string) => boolean;

  beforeAll(async () => {
    const serverModule = await import('../server.js');
    isWebTool = serverModule.isWebTool;
  });

  it('should return true for WebFetch', () => {
    expect(isWebTool('WebFetch')).toBe(true);
  });

  it('should return true for WebSearch', () => {
    expect(isWebTool('WebSearch')).toBe(true);
  });

  it('should return false for other tools', () => {
    expect(isWebTool('Bash')).toBe(false);
    expect(isWebTool('Write')).toBe(false);
    expect(isWebTool('Read')).toBe(false);
    expect(isWebTool('AskUserQuestion')).toBe(false);
  });
});
