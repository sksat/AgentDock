import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve, type ServerType } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get project root (../../.. from packages/server/src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
import { tmpdir } from 'node:os';
import type { ClientMessage, ServerMessage, GlobalUsageMessage, ImageAttachment } from '@claude-bridge/shared';
import { randomBytes } from 'node:crypto';
import { SessionManager } from './session-manager.js';
import { RunnerManager, RunnerEventType, RunnerFactory, defaultRunnerFactory } from './runner-manager.js';
import { MockClaudeRunner, Scenario } from './mock-claude-runner.js';
import { UsageMonitor, UsageData } from './usage-monitor.js';

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
  /** MCP server command (e.g., 'npx') */
  mcpServerCommand?: string;
  /** MCP server arguments (e.g., ['tsx', 'packages/mcp-server/src/index.ts']) */
  mcpServerArgs?: string[];
  /** MCP server working directory (for relative paths in args) */
  mcpServerCwd?: string;
  /** Usage monitor interval in milliseconds (default: 30000 = 30 seconds) */
  usageMonitorInterval?: number;
  /** Disable usage monitoring (default: false) */
  disableUsageMonitor?: boolean;
}

/**
 * Generate a temporary MCP config file for a session
 */
function generateMcpConfig(
  sessionId: string,
  wsUrl: string,
  mcpServerCommand: string,
  mcpServerArgs: string[],
  mcpServerCwd?: string
): string {
  const configDir = join(tmpdir(), 'claude-bridge-mcp');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const configPath = join(configDir, `mcp-config-${sessionId}.json`);
  const serverConfig: Record<string, unknown> = {
    command: mcpServerCommand,
    args: mcpServerArgs,
    env: {
      BRIDGE_WS_URL: wsUrl,
      SESSION_ID: sessionId,
    },
  };

  // Add cwd if provided (needed when using relative paths)
  if (mcpServerCwd) {
    serverConfig.cwd = mcpServerCwd;
  }

  const config = {
    mcpServers: {
      bridge: serverConfig,
    },
  };

  const configJson = JSON.stringify(config, null, 2);
  writeFileSync(configPath, configJson);
  return configPath;
}

/**
 * Clean up temporary MCP config file
 */
function cleanupMcpConfig(sessionId: string): void {
  const configPath = join(tmpdir(), 'claude-bridge-mcp', `mcp-config-${sessionId}.json`);
  if (existsSync(configPath)) {
    rmSync(configPath);
  }
}

/**
 * Save images to temporary files and return their paths
 */
function saveImagesToTempFiles(images: ImageAttachment[]): string[] {
  const imageDir = join(tmpdir(), 'claude-bridge-images');
  if (!existsSync(imageDir)) {
    mkdirSync(imageDir, { recursive: true });
  }

  const imagePaths: string[] = [];
  for (const image of images) {
    const ext = image.mediaType.split('/')[1]; // e.g., 'jpeg', 'png'
    const filename = `${randomBytes(16).toString('hex')}.${ext}`;
    const filepath = join(imageDir, filename);

    // Decode base64 and save to file
    const buffer = Buffer.from(image.data, 'base64');
    writeFileSync(filepath, buffer);
    imagePaths.push(filepath);
  }

  return imagePaths;
}

/**
 * Clean up temporary image files
 */
function cleanupImageFiles(imagePaths: string[]): void {
  for (const filepath of imagePaths) {
    if (existsSync(filepath)) {
      rmSync(filepath);
    }
  }
}

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSessionManager(): SessionManager;
  getRunnerManager(): RunnerManager;
}

export function createServer(options: ServerOptions): BridgeServer {
  const {
    port,
    host = '0.0.0.0',
    useMock = false,
    mockScenarios = [],
    sessionsBaseDir,
    dbPath,
    mcpServerCommand = 'node',
    mcpServerArgs = [join(PROJECT_ROOT, 'packages/mcp-server/dist/index.js')],
    mcpServerCwd,  // Optional, not needed if using absolute path
    usageMonitorInterval = 30000,
    disableUsageMonitor = false,
  } = options;

  // WebSocket URL for MCP server to connect back to
  const wsUrl = `ws://localhost:${port}/ws`;

  const app = new Hono();
  const sessionManager = new SessionManager({ sessionsBaseDir, dbPath });

  // Create usage monitor (if not disabled)
  const usageMonitor = disableUsageMonitor ? null : new UsageMonitor({ interval: usageMonitorInterval });

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

  // All connected WebSocket clients (for broadcasting usage)
  const allClients = new Set<WebSocket>();

  // Map request ID to WebSocket for permission responses (from MCP server)
  const pendingPermissionRequests = new Map<string, WebSocket>();

  // Broadcast global usage to all clients
  function broadcastUsage(data: UsageData): void {
    const message: GlobalUsageMessage = {
      type: 'global_usage',
      today: data.today,
      totals: data.totals,
    };
    const messageStr = JSON.stringify(message);
    for (const ws of allClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Set up usage monitor events
  if (usageMonitor) {
    usageMonitor.on('usage', (data) => {
      broadcastUsage(data);
    });
    usageMonitor.on('error', (error) => {
      console.error('[UsageMonitor] Error:', error.message);
    });
  }

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
        // Save model to session for model-specific usage tracking
        if (systemData.model) {
          sessionManager.setModel(sessionId, systemData.model);
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
        const usage = {
          inputTokens: usageData.inputTokens,
          outputTokens: usageData.outputTokens,
          cacheCreationTokens: usageData.cacheCreationInputTokens ?? 0,
          cacheReadTokens: usageData.cacheReadInputTokens ?? 0,
        };
        // Save total usage to DB
        sessionManager.addUsage(sessionId, usage);
        // Save model-specific usage
        const session = sessionManager.getSession(sessionId);
        if (session?.model) {
          sessionManager.addModelUsage(sessionId, session.model, usage);
        }
        // Send to client
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

      case 'permission_request': {
        // Permission request from mock runner - forward to client
        const permData = eventData as {
          requestId: string;
          toolName: string;
          input: unknown;
        };
        // Update session status
        sessionManager.updateSessionStatus(sessionId, 'waiting_permission');
        // Forward to client
        sendToSession(sessionId, {
          type: 'permission_request',
          sessionId,
          requestId: permData.requestId,
          toolName: permData.toolName,
          input: permData.input,
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
          const usage = sessionManager.getUsage(message.sessionId);
          const modelUsage = sessionManager.getModelUsage(message.sessionId);
          response = {
            type: 'session_attached',
            sessionId: message.sessionId,
            history: sessionManager.getHistory(message.sessionId),
            usage: usage ?? undefined,
            modelUsage: modelUsage.length > 0 ? modelUsage : undefined,
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

        // Add user message to history (including images if present)
        sessionManager.addToHistory(message.sessionId, {
          type: 'user',
          content: message.images ? { text: message.content, images: message.images } : message.content,
          timestamp: new Date().toISOString(),
        });

        // Update session status
        sessionManager.updateSessionStatus(message.sessionId, 'running');

        // Save images to temporary files if present
        let imageFiles: string[] = [];
        if (message.images && message.images.length > 0) {
          imageFiles = saveImagesToTempFiles(message.images);
        }

        // Start Claude CLI with MCP permission handling
        try {
          // Generate MCP config for this session (unless using mock)
          let mcpConfigPath: string | undefined;
          let permissionToolName: string | undefined;
          if (!useMock) {
            mcpConfigPath = generateMcpConfig(
              message.sessionId,
              wsUrl,
              mcpServerCommand,
              mcpServerArgs,
              mcpServerCwd
            );
            permissionToolName = 'mcp__bridge__permission_prompt';
          }

          runnerManager.startSession(message.sessionId, message.content, {
            workingDir: session.workingDir,
            claudeSessionId: session.claudeSessionId,
            mcpConfigPath,
            permissionToolName,
            imageFiles: imageFiles.length > 0 ? imageFiles : undefined,
            onEvent: (sessionId, eventType, data) => {
              handleRunnerEvent(sessionId, eventType, data);
              // Clean up MCP config and image files on exit
              if (eventType === 'exit') {
                if (mcpConfigPath) {
                  cleanupMcpConfig(sessionId);
                }
                if (imageFiles.length > 0) {
                  cleanupImageFiles(imageFiles);
                }
              }
            },
          });
          // Don't send response here - events will be sent via handleRunnerEvent
          return;
        } catch (error) {
          // Clean up image files on error
          if (imageFiles.length > 0) {
            cleanupImageFiles(imageFiles);
          }
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
        // First check if this is for a mock runner
        const runner = runnerManager.getRunner(message.sessionId);
        if (runner && 'respondToPermission' in runner) {
          // Mock runner - respond directly
          const mockRunner = runner as import('./mock-claude-runner.js').MockClaudeRunner;
          mockRunner.respondToPermission(message.requestId, message.response);
          sessionManager.updateSessionStatus(message.sessionId, 'running');
          return;
        }

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
          sessionManager.updateSessionStatus(message.sessionId, 'running');
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

      case 'compact_session': {
        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        // Check if already running
        if (runnerManager.hasRunningSession(message.sessionId)) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Cannot compact while session is running',
          };
          break;
        }

        // Get current history for this session
        const history = sessionManager.getHistory(message.sessionId);
        if (history.length === 0) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'No messages to compact',
          };
          break;
        }

        // Store WebSocket for this session
        sessionWebSockets.set(message.sessionId, ws);

        // Update session status
        sessionManager.updateSessionStatus(message.sessionId, 'running');

        // Create a summary prompt based on conversation history
        const summaryPrompt = `Please provide a brief summary of our conversation so far. Focus on:
1. The main topics discussed
2. Key decisions or conclusions reached
3. Any pending tasks or questions

Keep it concise but comprehensive.`;

        // Start Claude CLI with the summary request
        try {
          let mcpConfigPath: string | undefined;
          let permissionToolName: string | undefined;
          if (!useMock) {
            mcpConfigPath = generateMcpConfig(
              message.sessionId,
              wsUrl,
              mcpServerCommand,
              mcpServerArgs,
              mcpServerCwd
            );
            permissionToolName = 'mcp__bridge__permission_prompt';
          }

          runnerManager.startSession(message.sessionId, summaryPrompt, {
            workingDir: session.workingDir,
            claudeSessionId: session.claudeSessionId,
            mcpConfigPath,
            permissionToolName,
            onEvent: (sessionId, eventType, data) => {
              handleRunnerEvent(sessionId, eventType, data);
              if (eventType === 'exit' && mcpConfigPath) {
                cleanupMcpConfig(sessionId);
              }
            },
          });
          return;
        } catch (error) {
          sessionManager.updateSessionStatus(message.sessionId, 'idle');
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: error instanceof Error ? error.message : 'Failed to compact session',
          };
        }
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
          // Track client
          allClients.add(ws);

          // Send current usage data to new client
          if (usageMonitor) {
            const lastUsage = usageMonitor.getLastUsage();
            if (lastUsage) {
              ws.send(JSON.stringify({
                type: 'global_usage',
                today: lastUsage.today,
                totals: lastUsage.totals,
              }));
            }
          }

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

          ws.on('close', () => {
            allClients.delete(ws);
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
          // Start usage monitor
          usageMonitor?.start();
          resolve();
        });
      });
    },

    async stop() {
      return new Promise((resolve) => {
        // Stop usage monitor
        usageMonitor?.stop();
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
