import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve, type ServerType } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { ClientMessage, ServerMessage } from '@claude-bridge/shared';
import { SessionManager } from './session-manager.js';
import { RunnerManager, RunnerEventType, RunnerFactory, defaultRunnerFactory } from './runner-manager.js';
import { MockClaudeRunner, Scenario } from './mock-claude-runner.js';

export interface ServerOptions {
  port: number;
  host?: string;
  /** Use mock runner instead of real Claude CLI */
  useMock?: boolean;
  /** Custom scenarios for mock runner */
  mockScenarios?: Scenario[];
  /** Base directory for auto-created session directories. Defaults to ~/.claude-bridge/sessions */
  sessionsBaseDir?: string;
  /** Database file path. Defaults to './data.db' */
  dbPath?: string;
}

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSessionManager(): SessionManager;
  getRunnerManager(): RunnerManager;
}

export function createServer(options: ServerOptions): BridgeServer {
  const { port, host = '0.0.0.0', useMock = false, mockScenarios = [], sessionsBaseDir, dbPath } = options;

  const app = new Hono();
  const sessionManager = new SessionManager({ sessionsBaseDir, dbPath });

  // Create runner factory based on mock mode
  let runnerFactory: RunnerFactory = defaultRunnerFactory;
  if (useMock) {
    runnerFactory = () => {
      const mock = new MockClaudeRunner();
      // Add custom scenarios
      for (const scenario of mockScenarios) {
        mock.addScenario(scenario);
      }
      return mock;
    };
    console.log('[Server] Using mock Claude runner');
  }

  const runnerManager = new RunnerManager(runnerFactory);
  let httpServer: HttpServer | null = null;
  let wss: WebSocketServer | null = null;

  // Map session ID to WebSocket for sending events
  const sessionWebSockets = new Map<string, WebSocket>();

  // Map request ID to WebSocket for permission responses (from MCP server)
  const pendingPermissionRequests = new Map<string, WebSocket>();

  // Accumulator for current turn's text (to save as single history entry)
  const turnAccumulator = new Map<string, { text: string; thinking: string }>();

  function getOrCreateAccumulator(sessionId: string) {
    if (!turnAccumulator.has(sessionId)) {
      turnAccumulator.set(sessionId, { text: '', thinking: '' });
    }
    return turnAccumulator.get(sessionId)!;
  }

  function flushAccumulator(sessionId: string) {
    const acc = turnAccumulator.get(sessionId);
    if (acc) {
      const timestamp = new Date().toISOString();
      if (acc.thinking) {
        sessionManager.addToHistory(sessionId, {
          type: 'thinking',
          content: acc.thinking,
          timestamp,
        });
      }
      if (acc.text) {
        sessionManager.addToHistory(sessionId, {
          type: 'assistant',
          content: acc.text,
          timestamp,
        });
      }
      turnAccumulator.delete(sessionId);
    }
  }

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
    const timestamp = new Date().toISOString();

    switch (eventType) {
      case 'text': {
        const text = (eventData as { text: string }).text;
        sendToSession(sessionId, {
          type: 'text_output',
          sessionId,
          text,
        });
        // Accumulate text (will be saved to history on result/exit)
        getOrCreateAccumulator(sessionId).text += text;
        break;
      }

      case 'thinking': {
        const thinking = (eventData as { thinking: string }).thinking;
        sendToSession(sessionId, {
          type: 'thinking_output',
          sessionId,
          thinking,
        });
        // Accumulate thinking (will be saved to history on result/exit)
        getOrCreateAccumulator(sessionId).thinking += thinking;
        break;
      }

      case 'tool_use': {
        const toolName = (eventData as { name: string }).name;
        const toolUseId = (eventData as { id: string }).id;
        const input = (eventData as { input: unknown }).input;

        // Handle AskUserQuestion specially - convert to ask_user_question message
        if (toolName === 'AskUserQuestion') {
          const askInput = input as { questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> };
          sendToSession(sessionId, {
            type: 'ask_user_question',
            sessionId,
            requestId: toolUseId,
            questions: askInput.questions,
          });
          // Update session status
          sessionManager.updateSessionStatus(sessionId, 'waiting_input');
          // Store in history as question
          sessionManager.addToHistory(sessionId, {
            type: 'question',
            content: { requestId: toolUseId, questions: askInput.questions },
            timestamp,
          });
        } else {
          sendToSession(sessionId, {
            type: 'tool_use',
            sessionId,
            toolName,
            toolUseId,
            input,
          });
          // Store in history
          sessionManager.addToHistory(sessionId, {
            type: 'tool_use',
            content: { toolName, toolUseId, input },
            timestamp,
          });
        }
        break;
      }

      case 'tool_result': {
        const toolUseId = (eventData as { toolUseId: string }).toolUseId;
        const content = (eventData as { content: string }).content;
        const isError = (eventData as { isError: boolean }).isError;
        sendToSession(sessionId, {
          type: 'tool_result',
          sessionId,
          toolUseId,
          content,
          isError,
        });
        // Store in history
        sessionManager.addToHistory(sessionId, {
          type: 'tool_result',
          content: { toolUseId, content, isError },
          timestamp,
        });
        break;
      }

      case 'result': {
        const resultData = eventData as { result: string; sessionId: string };
        // Update session with Claude's session ID
        if (resultData.sessionId) {
          sessionManager.setClaudeSessionId(sessionId, resultData.sessionId);
        }
        // Flush accumulated text/thinking to history
        flushAccumulator(sessionId);
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
        // Flush any remaining accumulated content
        flushAccumulator(sessionId);
        sessionManager.updateSessionStatus(sessionId, 'idle');
        break;

      case 'system': {
        const systemData = eventData as {
          sessionId?: string;
          model?: string;
          permissionMode?: string;
          cwd?: string;
          tools?: string[];
        };
        // Capture Claude session ID from system init event
        if (systemData.sessionId) {
          sessionManager.setClaudeSessionId(sessionId, systemData.sessionId);
        }
        // Send system info to client
        sendToSession(sessionId, {
          type: 'system_info',
          sessionId,
          model: systemData.model,
          permissionMode: systemData.permissionMode,
          cwd: systemData.cwd,
          tools: systemData.tools,
        });
        break;
      }

      case 'usage': {
        const usageData = eventData as {
          inputTokens: number;
          outputTokens: number;
          cacheCreationInputTokens?: number;
          cacheReadInputTokens?: number;
        };
        sendToSession(sessionId, {
          type: 'usage_info',
          sessionId,
          inputTokens: usageData.inputTokens,
          outputTokens: usageData.outputTokens,
          cacheCreationInputTokens: usageData.cacheCreationInputTokens,
          cacheReadInputTokens: usageData.cacheReadInputTokens,
        });
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

      case 'set_permission_mode': {
        const session = sessionManager.getSession(message.sessionId);
        if (session) {
          // Store the permission mode for the session
          sessionManager.setPermissionMode(message.sessionId, message.mode);
          // Send back the updated system info
          response = {
            type: 'system_info',
            sessionId: message.sessionId,
            permissionMode: message.mode,
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

      case 'set_model': {
        const session = sessionManager.getSession(message.sessionId);
        if (session) {
          // Store the model for the session
          sessionManager.setModel(message.sessionId, message.model);
          // Send back the updated system info
          response = {
            type: 'system_info',
            sessionId: message.sessionId,
            model: message.model,
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
        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        // Send the answer to the runner (for mock runner, this triggers wait_for_input to continue)
        const runner = runnerManager.getRunner(message.sessionId);
        if (runner) {
          // Convert answers to a string (take the first answer value)
          const answerValues = Object.values(message.answers);
          const answerText = answerValues.join(', ');
          runner.sendInput(answerText);
        }

        // Update session status back to running
        sessionManager.updateSessionStatus(message.sessionId, 'running');

        // No response needed
        return;
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
          // Close database connection
          sessionManager.close();
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
