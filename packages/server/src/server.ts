import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve, type ServerType } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { ClientMessage, ServerMessage } from '@claude-bridge/shared';
import { SessionManager } from './session-manager.js';

export interface ServerOptions {
  port: number;
  host?: string;
}

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSessionManager(): SessionManager;
}

export function createServer(options: ServerOptions): BridgeServer {
  const { port, host = '0.0.0.0' } = options;

  const app = new Hono();
  const sessionManager = new SessionManager();
  let httpServer: HttpServer | null = null;
  let wss: WebSocketServer | null = null;

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
        // TODO: Implement Claude CLI execution
        response = {
          type: 'error',
          sessionId: message.sessionId,
          message: 'Not implemented yet',
        };
        break;
      }

      case 'interrupt': {
        // TODO: Implement interrupt
        response = {
          type: 'error',
          sessionId: message.sessionId,
          message: 'Not implemented yet',
        };
        break;
      }

      case 'permission_response': {
        // TODO: Implement permission response handling
        response = {
          type: 'error',
          sessionId: message.sessionId,
          message: 'Not implemented yet',
        };
        break;
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

          app.fetch(fetchRequest).then(async (response) => {
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
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
        wss?.close();
        httpServer?.close(() => {
          resolve();
        });
      });
    },

    getSessionManager() {
      return sessionManager;
    },
  };
}
