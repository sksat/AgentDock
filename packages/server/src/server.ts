import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve, type ServerType } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { ClientMessage, ServerMessage } from '@claude-bridge/shared';
import { SessionManager } from './session-manager.js';
import { RunnerManager, RunnerEventType } from './runner-manager.js';

export interface ServerOptions {
  port: number;
  host?: string;
}

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSessionManager(): SessionManager;
  getRunnerManager(): RunnerManager;
}

export function createServer(options: ServerOptions): BridgeServer {
  const { port, host = '0.0.0.0' } = options;

  const app = new Hono();
  const sessionManager = new SessionManager();
  const runnerManager = new RunnerManager();
  let httpServer: HttpServer | null = null;
  let wss: WebSocketServer | null = null;

  // Map session ID to WebSocket for sending events
  const sessionWebSockets = new Map<string, WebSocket>();

  // Map request ID to WebSocket for permission responses (from MCP server)
  const pendingPermissionRequests = new Map<string, WebSocket>();

  // Send message to session's WebSocket
  function sendToSession(sessionId: string, message: ServerMessage): void {
    const ws = sessionWebSockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Handle runner events and forward to WebSocket
  function handleRunnerEvent(sessionId: string, eventType: RunnerEventType, data: unknown): void {
    const eventData = data as Record<string, unknown>;

    switch (eventType) {
      case 'text':
        sendToSession(sessionId, {
          type: 'text_output',
          sessionId,
          text: (eventData as { text: string }).text,
        });
        break;

      case 'thinking':
        sendToSession(sessionId, {
          type: 'thinking_output',
          sessionId,
          thinking: (eventData as { thinking: string }).thinking,
        });
        break;

      case 'tool_use':
        sendToSession(sessionId, {
          type: 'tool_use',
          sessionId,
          toolName: (eventData as { name: string }).name,
          toolUseId: (eventData as { id: string }).id,
          input: (eventData as { input: unknown }).input,
        });
        break;

      case 'tool_result':
        sendToSession(sessionId, {
          type: 'tool_result',
          sessionId,
          toolUseId: (eventData as { toolUseId: string }).toolUseId,
          content: (eventData as { content: string }).content,
          isError: (eventData as { isError: boolean }).isError,
        });
        break;

      case 'result': {
        const resultData = eventData as { result: string; sessionId: string };
        // Update session with Claude's session ID
        if (resultData.sessionId) {
          sessionManager.setClaudeSessionId(sessionId, resultData.sessionId);
        }
        sendToSession(sessionId, {
          type: 'result',
          sessionId,
          result: resultData.result,
        });
        sessionManager.updateSessionStatus(sessionId, 'idle');
        break;
      }

      case 'error':
        sendToSession(sessionId, {
          type: 'error',
          sessionId,
          message: (eventData as { message: string }).message,
        });
        break;

      case 'exit':
        sessionManager.updateSessionStatus(sessionId, 'idle');
        break;

      case 'system': {
        const systemData = eventData as { sessionId?: string };
        // Capture Claude session ID from system init event
        if (systemData.sessionId) {
          sessionManager.setClaudeSessionId(sessionId, systemData.sessionId);
        }
        break;
      }
    }
  }

  // CORS middleware
  app.use('*', cors());

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  // REST API for sessions
  app.get('/api/sessions', (c) => {
    const sessions = sessionManager.listSessions();
    return c.json({ sessions });
  });

  // Handle WebSocket messages
  function handleMessage(ws: WebSocket, message: ClientMessage): void {
    let response: ServerMessage;

    switch (message.type) {
      case 'list_sessions': {
        response = {
          type: 'session_list',
          sessions: sessionManager.listSessions(),
        };
        break;
      }

      case 'create_session': {
        const session = sessionManager.createSession({
          name: message.name,
          workingDir: message.workingDir,
        });
        response = {
          type: 'session_created',
          session,
        };
        break;
      }

      case 'attach_session': {
        const session = sessionManager.getSession(message.sessionId);
        if (session) {
          response = {
            type: 'session_attached',
            sessionId: message.sessionId,
            history: sessionManager.getHistory(message.sessionId),
          };
        } else {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
        }
        break;
      }

      case 'delete_session': {
        const deleted = sessionManager.deleteSession(message.sessionId);
        if (deleted) {
          response = {
            type: 'session_deleted',
            sessionId: message.sessionId,
          };
        } else {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
        }
        break;
      }

      case 'rename_session': {
        const renamed = sessionManager.renameSession(message.sessionId, message.name);
        if (renamed) {
          const session = sessionManager.getSession(message.sessionId)!;
          response = {
            type: 'session_created', // Reuse for update notification
            session,
          };
        } else {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
        }
        break;
      }

      case 'user_message': {
        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        // Store WebSocket for this session
        sessionWebSockets.set(message.sessionId, ws);

        // Check if already running
        if (runnerManager.hasRunningSession(message.sessionId)) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session is already running',
          };
          break;
        }

        // Add user message to history
        sessionManager.addToHistory(message.sessionId, {
          type: 'user',
          content: message.content,
          timestamp: new Date().toISOString(),
        });

        // Update session status
        sessionManager.updateSessionStatus(message.sessionId, 'running');

        // Start Claude CLI
        try {
          runnerManager.startSession(message.sessionId, message.content, {
            workingDir: session.workingDir,
            claudeSessionId: session.claudeSessionId,
            onEvent: handleRunnerEvent,
          });
          // Don't send response here - events will be sent via handleRunnerEvent
          return;
        } catch (error) {
          sessionManager.updateSessionStatus(message.sessionId, 'idle');
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: error instanceof Error ? error.message : 'Failed to start Claude',
          };
        }
        break;
      }

      case 'interrupt': {
        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        runnerManager.stopSession(message.sessionId);
        sessionManager.updateSessionStatus(message.sessionId, 'idle');
        response = {
          type: 'result',
          sessionId: message.sessionId,
          result: 'Interrupted',
        };
        break;
      }

      case 'permission_response': {
        // Forward permission response to waiting MCP server
        const mcpWs = pendingPermissionRequests.get(message.requestId);
        if (mcpWs && mcpWs.readyState === WebSocket.OPEN) {
          mcpWs.send(JSON.stringify({
            type: 'permission_response',
            sessionId: message.sessionId,
            requestId: message.requestId,
            response: message.response,
          }));
          pendingPermissionRequests.delete(message.requestId);
          // No response needed back to client
          return;
        } else {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Permission request not found or expired',
          };
        }
        break;
      }

      case 'permission_request': {
        // Permission request from MCP server - forward to client and store WS for response
        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        // Store MCP WebSocket for response
        pendingPermissionRequests.set(message.requestId, ws);

        // Update session status
        sessionManager.updateSessionStatus(message.sessionId, 'waiting_permission');

        // Forward to client
        sendToSession(message.sessionId, {
          type: 'permission_request',
          sessionId: message.sessionId,
          requestId: message.requestId,
          toolName: message.toolName,
          input: message.input,
        });

        // No immediate response - MCP server waits for permission_response
        return;
      }

      case 'question_response': {
        // TODO: Implement question response handling
        response = {
          type: 'error',
          sessionId: message.sessionId,
          message: 'Not implemented yet',
        };
        break;
      }

      default: {
        response = {
          type: 'error',
          message: 'Unknown message type',
        };
      }
    }

    ws.send(JSON.stringify(response));
  }

  return {
    async start() {
      return new Promise((resolve) => {
        // Create HTTP server
        httpServer = createHttpServer();

        // Create WebSocket server
        wss = new WebSocketServer({ server: httpServer, path: '/ws' });

        wss.on('connection', (ws) => {
          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString()) as ClientMessage;
              handleMessage(ws, message);
            } catch (error) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format',
              }));
            }
          });
        });

        // Handle HTTP requests with Hono
        httpServer.on('request', (req, res) => {
          // Skip WebSocket upgrade requests
          if (req.headers.upgrade === 'websocket') {
            return;
          }

          // Convert Node.js request to Fetch API request
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value) {
              headers.set(key, Array.isArray(value) ? value[0] : value);
            }
          }

          const fetchRequest = new Request(url.toString(), {
            method: req.method,
            headers,
          });

          Promise.resolve(app.fetch(fetchRequest)).then(async (response: Response) => {
            res.statusCode = response.status;
            response.headers.forEach((value: string, key: string) => {
              res.setHeader(key, value);
            });
            const body = await response.text();
            res.end(body);
          });
        });

        httpServer.listen(port, host, () => {
          resolve();
        });
      });
    },

    async stop() {
      return new Promise((resolve) => {
        // Stop all running Claude processes
        runnerManager.stopAll();
        wss?.close();
        httpServer?.close(() => {
          resolve();
        });
      });
    },

    getSessionManager() {
      return sessionManager;
    },

    getRunnerManager() {
      return runnerManager;
    },
  };
}
