import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve, type ServerType } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFile, readdir } from 'node:fs';
import { exec, spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get project root (../../.. from packages/server/src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
import { tmpdir, homedir } from 'node:os';
import type { ClientMessage, ServerMessage, GlobalUsageMessage, SessionStatus, SessionInfo, BrowserCommand, PermissionMode, RunnerBackend, MachinePortsMessage, MachineProcessInfo, MachinePortInfo } from '@agent-dock/shared';
import type { BrowserController } from '@anthropic/playwright-mcp';
import { SessionManager } from './session-manager.js';
import { RunnerManager, defaultRunnerFactory } from './runner-manager.js';
import type { RunnerEventType, RunnerFactory, ClaudePermissionMode } from './runner-manager.js';
import { MockClaudeRunner } from './mock-claude-runner.js';
import type { Scenario } from './mock-claude-runner.js';
import { PodmanClaudeRunner } from './podman-claude-runner.js';
import { createDefaultContainerConfig, buildPodmanArgs, getGitEnvVars } from './container-config.js';
import type { ContainerConfig, ContainerMount } from './container-config.js';
import { UsageMonitor } from './usage-monitor.js';
import type { UsageData } from './usage-monitor.js';
import { GitStatusProvider } from './git-status-provider.js';
import { BrowserSessionManager } from './browser-session-manager.js';
import { ContainerBrowserSessionManager } from './container-browser-session-manager.js';
import { PersistentContainerManager } from './persistent-container-manager.js';
import { SettingsManager } from './settings-manager.js';
import { RepositoryManager } from './repository-manager.js';
import { WorkspaceSetup } from './workspace-setup.js';
import { expandSystemPromptTemplate, buildSystemPromptVariables } from './system-prompt.js';
import { nanoid } from 'nanoid';
import { parsePermissionPattern, matchesPermission, suggestPattern, type PermissionPattern } from './permission-pattern.js';

export interface ServerOptions {
  port: number;
  host?: string;
  /** Use mock runner instead of real Claude CLI */
  useMock?: boolean;
  /** Custom scenarios for mock runner */
  mockScenarios?: Scenario[];
  /** Base directory for auto-created session directories. Defaults to ~/.agent-dock/sessions */
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
  /** Enable container mode (run Claude in Podman container) */
  containerEnabled?: boolean;
  /** Container image to use for Claude CLI (required if containerEnabled is true) */
  containerImage?: string;
  /** Container image to use for browser (defaults to containerImage + '-browser' suffix or containerImage if not found) */
  browserContainerImage?: string;
  /** Additional volume mounts for container */
  containerMounts?: ContainerMount[];
  /** Additional arguments for podman */
  containerExtraArgs?: string[];
}

interface GenerateMcpConfigOptions {
  sessionId: string;
  wsUrl: string;
  mcpServerCommand: string;
  mcpServerArgs: string[];
  mcpServerCwd?: string;
  /** Override the browser bridge URL (for same-container mode) */
  browserBridgeUrl?: string;
  /** When true, replace localhost with host.containers.internal for container access to host */
  useContainerHost?: boolean;
}

/**
 * Generate a temporary MCP config file for a session
 */
function generateMcpConfig(options: GenerateMcpConfigOptions): string {
  const { sessionId, wsUrl, mcpServerCommand, mcpServerArgs, mcpServerCwd, browserBridgeUrl, useContainerHost } = options;

  // When running inside a container, replace localhost with host.containers.internal
  // so the MCP server can reach the AgentDock server on the host
  const effectiveWsUrl = useContainerHost
    ? wsUrl.replace('localhost', 'host.containers.internal')
    : wsUrl;
  const configDir = join(tmpdir(), 'agent-dock-mcp');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const configPath = join(configDir, `mcp-config-${sessionId}.json`);
  const serverConfig: Record<string, unknown> = {
    command: mcpServerCommand,
    args: mcpServerArgs,
    env: {
      BRIDGE_WS_URL: effectiveWsUrl,
      SESSION_ID: sessionId,
      // If browserBridgeUrl is provided (same-container mode), use it for browser operations
      ...(browserBridgeUrl && { BROWSER_BRIDGE_URL: browserBridgeUrl }),
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
  const configPath = join(tmpdir(), 'agent-dock-mcp', `mcp-config-${sessionId}.json`);
  if (existsSync(configPath)) {
    rmSync(configPath);
  }
}

// ==================== Port Monitoring Utilities ====================

/**
 * Parse ss command output and return a map of PID -> PortInfo[]
 */
function parseSSOutput(output: string): Map<number, MachinePortInfo[]> {
  const result = new Map<number, MachinePortInfo[]>();
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.startsWith('Netid') || line.trim() === '') {
      continue;
    }

    const match = line.match(
      /^(tcp|udp)\s+(\w+)\s+\d+\s+\d+\s+(\S+):(\d+)\s+\S+\s+.*pid=(\d+)/
    );

    if (match) {
      const [, protocol, state, address, portStr, pidStr] = match;
      const port = parseInt(portStr, 10);
      const pid = parseInt(pidStr, 10);

      const portInfo: MachinePortInfo = {
        port,
        protocol: protocol as 'tcp' | 'udp',
        address,
        state,
      };

      const existing = result.get(pid) || [];
      existing.push(portInfo);
      result.set(pid, existing);
    }
  }

  return result;
}

/**
 * Get listening ports by executing ss command
 */
async function getListeningPorts(): Promise<Map<number, MachinePortInfo[]>> {
  return new Promise((resolve) => {
    exec('ss -tulnp', (error, stdout) => {
      if (error || !stdout) {
        resolve(new Map());
        return;
      }
      resolve(parseSSOutput(stdout));
    });
  });
}

/**
 * Read process info from /proc
 */
async function readProcessInfo(pid: number): Promise<{ command: string; commandShort: string; ppid: number | null } | null> {
  return new Promise((resolve) => {
    readFile(`/proc/${pid}/cmdline`, 'utf8', (err, cmdline) => {
      if (err) {
        resolve(null);
        return;
      }
      const command = cmdline.replace(/\0/g, ' ').trim() || `[pid ${pid}]`;
      const commandShort = command.split(' ')[0].split('/').pop() || `pid${pid}`;

      readFile(`/proc/${pid}/stat`, 'utf8', (statErr, stat) => {
        if (statErr) {
          resolve({ command, commandShort, ppid: null });
          return;
        }
        const statMatch = stat.match(/^\d+\s+\([^)]+\)\s+\S+\s+(\d+)/);
        const ppid = statMatch ? parseInt(statMatch[1], 10) : null;
        resolve({ command, commandShort, ppid });
      });
    });
  });
}

/**
 * Get child PIDs of a process
 */
async function getChildPids(parentPid: number): Promise<number[]> {
  return new Promise((resolve) => {
    readdir('/proc', (err, entries) => {
      if (err) {
        resolve([]);
        return;
      }

      const checkPromises = entries
        .filter(entry => /^\d+$/.test(entry))
        .map(entry => {
          const pid = parseInt(entry, 10);
          return new Promise<number | null>((res) => {
            readFile(`/proc/${pid}/stat`, 'utf8', (statErr, stat) => {
              if (statErr) {
                res(null);
                return;
              }
              const match = stat.match(/^\d+\s+\([^)]+\)\s+\S+\s+(\d+)/);
              if (match && parseInt(match[1], 10) === parentPid) {
                res(pid);
              } else {
                res(null);
              }
            });
          });
        });

      Promise.all(checkPromises).then(results => {
        resolve(results.filter((pid): pid is number => pid !== null));
      });
    });
  });
}

/**
 * Build process tree starting from a PID
 */
async function buildProcessTree(
  pid: number,
  portsByPid: Map<number, MachinePortInfo[]>
): Promise<MachineProcessInfo | null> {
  const info = await readProcessInfo(pid);
  if (!info) {
    return null;
  }

  const childPids = await getChildPids(pid);
  const children: MachineProcessInfo[] = [];

  for (const childPid of childPids) {
    const childTree = await buildProcessTree(childPid, portsByPid);
    if (childTree) {
      children.push(childTree);
    }
  }

  return {
    pid,
    command: info.command,
    commandShort: info.commandShort,
    ports: portsByPid.get(pid) || [],
    parentPid: info.ppid,
    children,
  };
}

/**
 * Collect all ports from a process tree
 */
function collectPortsFromTree(node: MachineProcessInfo): number[] {
  const ports = node.ports.map(p => p.port);
  for (const child of node.children) {
    ports.push(...collectPortsFromTree(child));
  }
  return ports;
}

/**
 * Count processes in a tree
 */
function countProcesses(node: MachineProcessInfo): number {
  return 1 + node.children.reduce((sum, child) => sum + countProcesses(child), 0);
}

/**
 * Check if a tool name is a screenshot tool.
 * Used to track screenshot results and include filename for Slack uploads.
 */
export function isScreenshotTool(toolName: string): boolean {
  const lowerName = toolName.toLowerCase();
  return lowerName.includes('screenshot') || lowerName.includes('take_screenshot');
}

/**
 * Check if a tool name is an AgentDock built-in browser tool
 * Matches:
 *   - mcp__bridge__browser_* (AgentDock MCP bridge browser tools)
 *   - browser_* (direct browser tools, if any)
 * Does NOT match:
 *   - mcp__plugin_playwright_*__browser_* (external Playwright MCP)
 */
export function isBrowserTool(toolName: string): boolean {
  // Match AgentDock bridge browser tools (mcp__bridge__browser_*)
  if (/^mcp__bridge__browser_/.test(toolName)) {
    return true;
  }
  // Match direct browser_* tools (AgentDock internal)
  if (/^browser_[a-z]/.test(toolName)) {
    return true;
  }
  return false;
}

/**
 * Check if a tool is an AgentDock integrated MCP tool (mcp__bridge__*)
 *
 * AgentDock integrated MCP tools are provided by the AgentDock bridge MCP server
 * and are designed to work seamlessly with the AgentDock UI. These tools are
 * considered trusted and are auto-allowed without user permission.
 *
 * Examples:
 *   - mcp__bridge__browser_* (browser automation)
 *   - mcp__bridge__port_monitor (port monitoring)
 *   - mcp__bridge__permission_prompt (permission handling - internal use)
 *
 * Note: External MCP tools (e.g., mcp__plugin_*) are NOT auto-allowed.
 */
export function isAgentDockTool(toolName: string): boolean {
  return /^mcp__bridge__/.test(toolName);
}

/**
 * UI/internal tools that don't require permission (no file access or system changes)
 */
const AUTO_ALLOWED_TOOLS = new Set([
  'AskUserQuestion',  // UI interaction tool
  'ExitPlanMode',     // Plan mode signal
  'EnterPlanMode',    // Plan mode signal
  'TodoWrite',        // Internal todo list
  'TaskOutput',       // Task output retrieval
]);

/**
 * Check if a tool should be auto-allowed without user permission
 *
 * Auto-allowed tools are executed immediately without requiring user confirmation.
 * This is appropriate for:
 *   1. AgentDock integrated MCP tools (mcp__bridge__*) - trusted, UI-integrated tools
 *   2. Direct browser tools (browser_*) - AgentDock internal tools
 *   3. UI/internal tools (AskUserQuestion, ExitPlanMode, TodoWrite, etc.)
 *
 * Security note: Only tools that are either:
 *   - Provided by AgentDock itself and designed for safe operation
 *   - UI interaction tools that require user action anyway
 * should be added to this list. External MCP tools should never be auto-allowed.
 */
export function isAutoAllowedTool(toolName: string): boolean {
  // AgentDock integrated MCP tools are all auto-allowed
  if (isAgentDockTool(toolName)) {
    return true;
  }
  // Direct browser tools (browser_*) are AgentDock internal, auto-allowed
  if (isBrowserTool(toolName)) {
    return true;
  }
  // UI/internal tools
  if (AUTO_ALLOWED_TOOLS.has(toolName)) {
    return true;
  }
  return false;
}

/**
 * Web tools that can be optionally auto-allowed via settings
 */
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);

/**
 * Check if a tool is a web tool (WebFetch, WebSearch)
 * These can be auto-allowed via global or session settings
 */
export function isWebTool(toolName: string): boolean {
  return WEB_TOOLS.has(toolName);
}

/**
 * Execute a browser command via BrowserController
 */
async function executeBrowserCommand(controller: BrowserController, command: BrowserCommand): Promise<unknown> {
  switch (command.name) {
    case 'browser_navigate':
      await controller.navigate(command.url);
      return { success: true };

    case 'browser_navigate_back':
      await controller.navigateBack();
      return { success: true };

    case 'browser_click':
      await controller.click(command.ref, {
        button: command.button,
        modifiers: command.modifiers,
        doubleClick: command.doubleClick,
      });
      return { success: true };

    case 'browser_hover':
      await controller.hover(command.ref);
      return { success: true };

    case 'browser_type':
      await controller.type(command.ref, command.text, {
        slowly: command.slowly,
        submit: command.submit,
      });
      return { success: true };

    case 'browser_press_key':
      await controller.pressKey(command.key);
      return { success: true };

    case 'browser_select_option':
      await controller.selectOption(command.ref, command.values);
      return { success: true };

    case 'browser_drag':
      await controller.drag(command.startRef, command.endRef);
      return { success: true };

    case 'browser_fill_form':
      await controller.fillForm(command.fields);
      return { success: true };

    case 'browser_snapshot':
      return await controller.snapshot();

    case 'browser_take_screenshot':
      return await controller.takeScreenshot({
        fullPage: command.fullPage,
        ref: command.ref,
      });

    case 'browser_console_messages':
      return await controller.getConsoleMessages(command.level);

    case 'browser_network_requests':
      return await controller.getNetworkRequests(command.includeStatic);

    case 'browser_evaluate':
      return await controller.evaluate(command.function, command.ref);

    case 'browser_wait_for':
      await controller.waitFor({
        text: command.text,
        textGone: command.textGone,
        time: command.time,
      });
      return { success: true };

    case 'browser_handle_dialog':
      await controller.handleDialog(command.accept, command.promptText);
      return { success: true };

    case 'browser_resize':
      await controller.resize(command.width, command.height);
      return { success: true };

    case 'browser_tabs':
      return await controller.manageTabs(command.action, command.index);

    case 'browser_close':
      await controller.close();
      return { success: true };

    default:
      throw new Error(`Unknown browser command: ${(command as { name: string }).name}`);
  }
}

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSessionManager(): SessionManager;
  getRunnerManager(): RunnerManager;
  /** Get the container browser session manager (for testing) */
  getContainerBrowserSessionManager(): ContainerBrowserSessionManager;
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
    containerEnabled = false,
    containerImage,
    browserContainerImage,
    containerMounts = [],
    containerExtraArgs = [],
  } = options;

  // WebSocket URL for MCP server to connect back to
  const wsUrl = `ws://localhost:${port}/ws`;

  const app = new Hono();
  const sessionManager = new SessionManager({ sessionsBaseDir, dbPath });
  const settingsManager = new SettingsManager(sessionManager.getDb());
  const repositoryManager = new RepositoryManager({ db: sessionManager.getDb() });

  // Create usage monitor (if not disabled)
  const usageMonitor = disableUsageMonitor
    ? null
    : new UsageMonitor({
        interval: usageMonitorInterval,
        db: sessionManager.getDb(),
      });

  // Create git status provider (5 second polling)
  const gitStatusProvider = new GitStatusProvider({
    interval: 5000,
  });

  // Build container config if enabled
  let containerConfig: ContainerConfig | null = null;
  let browserContainerConfig: ContainerConfig | null = null;
  if (containerEnabled) {
    if (!containerImage) {
      throw new Error('containerImage is required when containerEnabled is true');
    }
    containerConfig = createDefaultContainerConfig(containerImage, {
      extraMounts: containerMounts,
      extraArgs: containerExtraArgs,
    });
    console.log(`[Server] Container mode enabled with image: ${containerImage}`);

    // Browser container config (uses browserContainerImage if provided, otherwise same as containerImage)
    const browserImage = browserContainerImage ?? containerImage;
    browserContainerConfig = createDefaultContainerConfig(browserImage, {
      extraMounts: containerMounts,
      extraArgs: containerExtraArgs,
    });
    if (browserContainerImage) {
      console.log(`[Server] Browser container image: ${browserContainerImage}`);
    }
  }

  // Create runner factory based on mode
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

  // Set up container runner factory if container mode is available
  if (containerConfig && !useMock) {
    const containerRunnerFactory: RunnerFactory = (opts) => {
      return new PodmanClaudeRunner({
        workingDir: opts.workingDir,
        containerConfig: containerConfig!,
        claudePath: opts.claudePath,
        mcpConfigPath: opts.mcpConfigPath,
        permissionToolName: opts.permissionToolName,
      });
    };
    runnerManager.setContainerRunnerFactory(containerRunnerFactory);
    console.log('[Server] Container runner available (image: %s)', containerConfig.image);

    // Set up browser container runner factory (Issue #78: same-container mode)
    // This runs Claude and browser bridge in the same container, sharing localhost
    if (browserContainerConfig) {
      const browserContainerRunnerFactory: RunnerFactory = (opts) => {
        // Create config with browser bridge enabled
        // bridgePort is passed per-session to avoid conflicts between sessions
        const configWithBrowser: ContainerConfig = {
          ...browserContainerConfig!,
          browserBridgeEnabled: true,
          bridgePort: opts.bridgePort ?? 3002,
        };
        return new PodmanClaudeRunner({
          workingDir: opts.workingDir,
          containerConfig: configWithBrowser,
          claudePath: opts.claudePath,
          mcpConfigPath: opts.mcpConfigPath,
          permissionToolName: opts.permissionToolName,
          containerId: opts.containerId,
        });
      };
      runnerManager.setBrowserContainerRunnerFactory(browserContainerRunnerFactory);
      console.log('[Server] Browser container runner available (image: %s)', browserContainerConfig.image);
    }
  }
  const browserSessionManager = new BrowserSessionManager();
  const containerBrowserSessionManager = new ContainerBrowserSessionManager();

  // Map session ID to PersistentContainerManager (for sessions using container browser)
  const sessionContainerManagers = new Map<string, PersistentContainerManager>();

  // Map session ID to container ID (Issue #78: same-container mode)
  // Used when browserInContainer is true to track the persistent container
  const sessionContainerIds = new Map<string, string>();

  let httpServer: HttpServer | null = null;
  let wss: WebSocketServer | null = null;

  // Map session ID to Set of WebSockets for sending events (supports multiple clients)
  const sessionWebSockets = new Map<string, Set<WebSocket>>();

  // All connected WebSocket clients (for broadcasting usage)
  const allClients = new Set<WebSocket>();

  // Map request ID to WebSocket for permission responses (from MCP server)
  const pendingPermissionRequests = new Map<string, WebSocket>();

  // Map session ID to permission patterns that are allowed for the entire session
  // Patterns can be tool-only (e.g., "Bash") or tool+pattern (e.g., "Bash(git:*)")
  const sessionAllowedPatterns = new Map<string, PermissionPattern[]>();

  // Map session ID to machine monitor interval (for port monitoring)
  const machineMonitorIntervals = new Map<string, ReturnType<typeof setInterval>>();

  // Map session ID to Claude Code process PID (for session-specific process tree monitoring)
  const sessionClaudePids = new Map<string, number>();

  // Map session ID to pending permission request (for restoring on reload)
  const sessionPendingPermissions = new Map<string, { requestId: string; toolName: string; input: unknown }>();

  // Map session ID to queued input (to be sent after current execution completes)
  const sessionInputQueue = new Map<string, string[]>();

  // Map session ID to runner backend preference (undefined means use default)
  const sessionRunnerBackends = new Map<string, RunnerBackend>();

  // Map session ID to browser in container preference (undefined means follow default)
  const sessionBrowserInContainer = new Map<string, boolean>();

  // Map session ID to workspace cleanup function (for worktree removal, etc.)
  const sessionWorkspaceCleanups = new Map<string, () => Promise<void>>();

  // Workspace setup paths
  const tmpfsBasePath = join(homedir(), '.agent-dock', 'tmpfs');
  const workspaceCacheDir = join(homedir(), '.agent-dock', 'cache');

  /**
   * Determine if a session should use container browser based on settings
   */
  function shouldUseContainerBrowser(sessionId: string): boolean {
    // Check explicit session setting first (runtime map)
    const explicit = sessionBrowserInContainer.get(sessionId);
    if (explicit !== undefined) {
      return explicit;
    }

    // Check session's stored browserInContainer setting from DB
    const session = sessionManager.getSession(sessionId);
    if (session?.browserInContainer !== undefined) {
      // Also populate runtime map for future calls
      sessionBrowserInContainer.set(sessionId, session.browserInContainer);
      return session.browserInContainer;
    }

    // Default: true when running in podman, false when native
    // Check runtime map first, then session's stored value, then global default
    let runnerBackend = sessionRunnerBackends.get(sessionId);
    if (runnerBackend === undefined && session?.runnerBackend) {
      runnerBackend = session.runnerBackend;
      // Also populate runtime map for future calls
      sessionRunnerBackends.set(sessionId, runnerBackend);
    }
    runnerBackend = runnerBackend ?? settingsManager.get('defaultRunnerBackend');
    return runnerBackend === 'podman';
  }

  /**
   * Get or create PersistentContainerManager for a session
   */
  async function getOrCreateContainerManager(sessionId: string, workingDir: string): Promise<PersistentContainerManager> {
    let manager = sessionContainerManagers.get(sessionId);
    if (!manager) {
      if (!browserContainerConfig) {
        throw new Error('Browser container mode not configured');
      }
      // Use a port based on session hash for uniqueness
      const bridgePort = 3002 + (sessionId.charCodeAt(0) % 1000);

      // Create a new config with browserBridgeEnabled for same-container mode (Issue #78)
      // This allows Browser MCP and dev servers to share the same localhost
      const configWithBridge: ContainerConfig = {
        ...browserContainerConfig,
        browserBridgeEnabled: true,
        bridgePort,
      };

      manager = new PersistentContainerManager({
        containerConfig: configWithBridge,
        workingDir,
        bridgePort,
      });
      sessionContainerManagers.set(sessionId, manager);
    }
    return manager;
  }

  // Broadcast global usage to all clients
  function broadcastUsage(data: UsageData): void {
    const message: GlobalUsageMessage = {
      type: 'global_usage',
      today: data.today,
      totals: data.totals,
      daily: data.daily,
      blocks: data.blocks,
    };
    const messageStr = JSON.stringify(message);
    for (const ws of allClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Broadcast session status change to all clients
  function broadcastStatusChange(sessionId: string, status: SessionStatus): void {
    const message: ServerMessage = {
      type: 'session_status_changed',
      sessionId,
      status,
    };
    const messageStr = JSON.stringify(message);
    for (const ws of allClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Broadcast session created to all clients (for real-time session list updates)
  function broadcastSessionCreated(session: SessionInfo): void {
    const message: ServerMessage = {
      type: 'session_created',
      session,
    };
    const messageStr = JSON.stringify(message);
    for (const ws of allClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Broadcast any message to all connected clients
  function broadcastToAll(message: ServerMessage): void {
    const messageStr = JSON.stringify(message);
    for (const ws of allClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Update session status and broadcast to all clients
  function updateAndBroadcastStatus(sessionId: string, status: SessionStatus): void {
    sessionManager.updateSessionStatus(sessionId, status);
    broadcastStatusChange(sessionId, status);
  }

  // Get sessions with usage data (internal tracking from SessionManager)
  function getSessionsWithUsage() {
    // SessionManager now includes usage data directly from internal tracking
    return sessionManager.listSessions();
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

  // Set up git status provider events
  gitStatusProvider.on('status', (sessionId, result) => {
    sendToSession(sessionId, {
      type: 'git_status',
      sessionId,
      status: result.status,
      isGitRepo: result.isGitRepo,
      error: result.error,
    });
  });
  gitStatusProvider.on('error', (sessionId, error) => {
    console.error(`[GitStatusProvider] Error for session ${sessionId}:`, error.message);
  });

  // Set up browser session manager events for screencast
  browserSessionManager.on('frame', ({ sessionId, data, metadata }) => {
    sendToSession(sessionId, {
      type: 'screencast_frame',
      sessionId,
      data,
      metadata,
    });
  });

  browserSessionManager.on('status', ({ sessionId, active, browserUrl, browserTitle }) => {
    sendToSession(sessionId, {
      type: 'screencast_status',
      sessionId,
      active,
      browserUrl,
      browserTitle,
    });
  });

  browserSessionManager.on('error', ({ sessionId, message }) => {
    console.error(`[BrowserSession] Error for ${sessionId}: ${message}`);
  });

  // Set up container browser session manager events for screencast
  containerBrowserSessionManager.on('frame', ({ sessionId, data, metadata }) => {
    sendToSession(sessionId, {
      type: 'screencast_frame',
      sessionId,
      data,
      metadata,
    });
  });

  containerBrowserSessionManager.on('status', ({ sessionId, active, browserUrl, browserTitle }) => {
    sendToSession(sessionId, {
      type: 'screencast_status',
      sessionId,
      active,
      browserUrl,
      browserTitle,
    });
  });

  containerBrowserSessionManager.on('error', ({ sessionId, message }) => {
    console.error(`[ContainerBrowserSession] Error for ${sessionId}: ${message}`);
  });

  // Accumulator for current turn's text (to save as single history entry)
  const turnAccumulator = new Map<string, { text: string; thinking: string }>();

  // Track screenshot tool calls to include filename in tool_result
  // Key: toolUseId, Value: filename from the screenshot tool input
  const pendingScreenshots = new Map<string, string>();

  // Track TodoWrite tool calls to skip their tool_result messages
  const pendingTodoWrites = new Set<string>();

  // Track EnterPlanMode/ExitPlanMode tool calls to sync permission mode on result
  // Key: toolUseId, Value: 'enter' | 'exit'
  const pendingPlanModeTools = new Map<string, 'enter' | 'exit'>();

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

  // Send message to all WebSockets attached to a session
  function sendToSession(sessionId: string, message: ServerMessage): void {
    const clients = sessionWebSockets.get(sessionId);
    if (!clients) return;
    const messageStr = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Send message to all WebSockets attached to a session, except the specified one
  function sendToSessionExcept(sessionId: string, message: ServerMessage, exceptWs: WebSocket): void {
    const clients = sessionWebSockets.get(sessionId);
    if (!clients) return;
    const messageStr = JSON.stringify(message);
    for (const ws of clients) {
      if (ws !== exceptWs && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Add WebSocket to session's client set
  function addWebSocketToSession(sessionId: string, ws: WebSocket): void {
    let clients = sessionWebSockets.get(sessionId);
    if (!clients) {
      clients = new Set();
      sessionWebSockets.set(sessionId, clients);
    }
    clients.add(ws);
  }

  // Remove WebSocket from all sessions
  function removeWebSocketFromSessions(ws: WebSocket): void {
    for (const [sessionId, clients] of sessionWebSockets) {
      clients.delete(ws);
      if (clients.size === 0) {
        sessionWebSockets.delete(sessionId);
      }
    }
  }

  /**
   * Start a persistent container for same-container mode (Issue #78).
   * Returns the container ID if successful.
   */
  async function startPersistentContainer(
    sessionId: string,
    workingDir: string,
    bridgePort: number
  ): Promise<string> {
    // Check if container already exists
    const existingId = sessionContainerIds.get(sessionId);
    if (existingId) {
      return existingId;
    }

    if (!browserContainerConfig) {
      throw new Error('Browser container config not available');
    }

    // Build container config with browser bridge enabled
    const configWithBrowser: ContainerConfig = {
      ...browserContainerConfig,
      browserBridgeEnabled: true,
      bridgePort,
    };

    // Build environment variables
    const gitEnv = getGitEnvVars();

    // Build podman args
    const podmanRunArgs = buildPodmanArgs(configWithBrowser, workingDir, gitEnv);

    // Modify args for detached mode: replace 'run -it' with 'run -d'
    const detachedArgs = podmanRunArgs.map((arg, i) => {
      if (arg === '-it') return '-d';
      return arg;
    });

    // Add sleep infinity to keep container running
    detachedArgs.push('sleep', 'infinity');

    console.log(`[Server] Starting persistent container: podman ${detachedArgs.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('podman', detachedArgs);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        if (code === 0) {
          const rawId = stdout.trim();
          // Validate container ID format
          if (!rawId || rawId.length < 12 || !/^[a-f0-9]+$/i.test(rawId)) {
            reject(new Error(`Invalid container ID received: ${rawId}`));
            return;
          }
          const containerId = rawId.substring(0, 12);
          sessionContainerIds.set(sessionId, containerId);
          console.log(`[Server] Persistent container started: ${containerId}`);

          // Wait for browser bridge to be ready
          try {
            await waitForBrowserBridge(bridgePort);
            console.log(`[Server] Browser bridge ready on port ${bridgePort}`);
          } catch (error) {
            console.warn(`[Server] Browser bridge not responding on port ${bridgePort}, continuing anyway`);
          }

          resolve(containerId);
        } else {
          reject(new Error(`Failed to start container: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Wait for browser bridge to be ready on the given port.
   */
  async function waitForBrowserBridge(port: number, timeoutMs = 10000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${port}`);
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Connection timeout'));
          }, 1000);
          ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve();
          });
          ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
        return; // Connection successful
      } catch {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error(`Browser bridge not ready after ${timeoutMs}ms`);
  }

  /**
   * Stop a persistent container for a session.
   */
  async function stopPersistentContainer(sessionId: string): Promise<void> {
    const containerId = sessionContainerIds.get(sessionId);
    if (!containerId) {
      return;
    }

    sessionContainerIds.delete(sessionId);

    return new Promise((resolve) => {
      const proc = spawn('podman', ['stop', '-t', '2', containerId]);
      proc.on('close', () => {
        console.log(`[Server] Persistent container stopped: ${containerId}`);
        resolve();
      });
      proc.on('error', () => {
        resolve(); // Ignore errors during cleanup
      });
    });
  }

  // Process queued input after current execution completes
  async function processQueuedInput(sessionId: string, content: string): Promise<void> {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      console.log(`[Server] processQueuedInput: session ${sessionId} not found`);
      return;
    }

    // Update status to running
    updateAndBroadcastStatus(sessionId, 'running');

    // Start Claude CLI with MCP permission handling
    try {
      // Use global default for thinking
      const thinkingEnabled = settingsManager.get('defaultThinkingEnabled');

      // Map session permission mode to Claude permission mode
      const modeMap: Record<string, ClaudePermissionMode> = {
        'ask': 'default',
        'auto-edit': 'acceptEdits',
        'plan': 'plan',
      };
      const sessionMode = session.permissionMode ?? settingsManager.get('defaultPermissionMode');
      const permissionMode = modeMap[sessionMode];

      // Use session's runner backend if set, otherwise use global default
      // Check in-memory map first, then session from DB, then global default
      const runnerBackend = sessionRunnerBackends.get(sessionId) ?? session.runnerBackend ?? settingsManager.get('defaultRunnerBackend');

      // Get browserInContainer setting for this session (Issue #78)
      const browserInContainer = shouldUseContainerBrowser(sessionId);

      // Generate unique bridge port for this session (3002-4001 range)
      // Must match the port calculation in getOrCreateContainerManager
      const bridgePort = browserInContainer
        ? 3002 + (sessionId.charCodeAt(0) % 1000)
        : undefined;

      // Start persistent container if browserInContainer is true (Issue #78: same-container mode)
      // This allows Claude and browser bridge to share localhost
      let containerId: string | undefined;
      if (browserInContainer && bridgePort && runnerBackend === 'podman') {
        try {
          // Use PersistentContainerManager for container lifecycle and screencast support
          const containerManager = await getOrCreateContainerManager(sessionId, session.workingDir);
          containerId = await containerManager.startContainer();
          console.log(`[Server] Using persistent container ${containerId} for session ${sessionId}`);

          // Set up screencast connection via containerBrowserSessionManager
          if (!containerBrowserSessionManager.hasSession(sessionId)) {
            await containerManager.startBrowserBridge();
            await containerBrowserSessionManager.createSession(sessionId, containerManager);
            console.log(`[Server] Container browser session created for ${sessionId}`);
          }
        } catch (error) {
          console.error(`[Server] Failed to start persistent container:`, error);
          // Fall back to non-persistent mode
        }
      }

      // Generate MCP config for this session (unless using mock)
      let mcpConfigPath: string | undefined;
      let permissionToolName: string | undefined;
      if (!useMock) {
        mcpConfigPath = generateMcpConfig({
          sessionId,
          wsUrl,
          mcpServerCommand,
          mcpServerArgs,
          mcpServerCwd,
          // In same-container mode, the browser bridge runs inside the container
          browserBridgeUrl: bridgePort ? `ws://localhost:${bridgePort}` : undefined,
          // When running in container, use host.containers.internal to reach host
          useContainerHost: browserInContainer,
        });
        permissionToolName = 'mcp__bridge__permission_prompt';
      }

      // Expand system prompt template
      let systemPrompt: string | undefined;
      const systemPromptTemplate = settingsManager.get('systemPromptTemplate');
      if (systemPromptTemplate) {
        const clientPort = process.env.AGENTDOCK_CLIENT_PORT || '5173';
        const baseUrl = process.env.AGENTDOCK_BASE_URL || `http://localhost:${clientPort}`;
        const variables = buildSystemPromptVariables({
          sessionId,
          workingDir: session.workingDir,
          baseUrl,
          // Repository info could be added here if available
        });
        systemPrompt = expandSystemPromptTemplate(systemPromptTemplate, variables);
      }

      runnerManager.startSession(sessionId, content, {
        workingDir: session.workingDir,
        claudeSessionId: session.claudeSessionId,
        mcpConfigPath,
        permissionToolName,
        thinkingEnabled,
        permissionMode,
        runnerBackend,
        browserInContainer,
        bridgePort,
        containerId,
        systemPrompt,
        onEvent: (sid, eventType, data) => {
          handleRunnerEvent(sid, eventType, data);
          // Clean up MCP config on exit
          if (eventType === 'exit') {
            if (mcpConfigPath) {
              cleanupMcpConfig(sessionId);
            }
          }
        },
      });
    } catch (error) {
      console.error(`[Server] processQueuedInput error:`, error);
      updateAndBroadcastStatus(sessionId, 'idle');
      sendToSession(sessionId, {
        type: 'error',
        sessionId,
        message: error instanceof Error ? error.message : 'Failed to start Claude',
      });
    }
  }

  // Handle runner events and forward to WebSocket
  function handleRunnerEvent(sessionId: string, eventType: RunnerEventType, data: unknown): void {
    const eventData = data as Record<string, unknown>;
    const timestamp = new Date().toISOString();

    switch (eventType) {
      case 'started': {
        // Store the Claude Code process PID for session-specific process tree monitoring
        const pid = (eventData as { pid: number }).pid;
        sessionClaudePids.set(sessionId, pid);
        console.log(`[Server] Claude Code started for session ${sessionId} with PID ${pid}`);
        break;
      }

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
          updateAndBroadcastStatus(sessionId, 'waiting_input');
          // Store in history as question
          sessionManager.addToHistory(sessionId, {
            type: 'question',
            content: { requestId: toolUseId, questions: askInput.questions },
            timestamp,
          });
        } else if (toolName === 'TodoWrite') {
          // Handle TodoWrite specially - convert to todo_update message
          const todoInput = input as { todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }> };
          sendToSession(sessionId, {
            type: 'todo_update',
            sessionId,
            toolUseId,
            todos: todoInput.todos,
          });
          // Store in history as todo_update
          sessionManager.addToHistory(sessionId, {
            type: 'todo_update',
            content: { toolUseId, todos: todoInput.todos },
            timestamp,
          });
          // Track this tool_use ID to skip its tool_result
          pendingTodoWrites.add(toolUseId);
        } else if (toolName === 'EnterPlanMode') {
          // Track for permission mode sync on tool_result (after approval)
          pendingPlanModeTools.set(toolUseId, 'enter');
          // Store in history
          sessionManager.addToHistory(sessionId, {
            type: 'tool_use',
            content: { toolName, toolUseId, input },
            timestamp,
          });
        } else if (toolName === 'ExitPlanMode') {
          // Track for permission mode sync on tool_result (after approval)
          pendingPlanModeTools.set(toolUseId, 'exit');
          // Store in history
          sessionManager.addToHistory(sessionId, {
            type: 'tool_use',
            content: { toolName, toolUseId, input },
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
          // Track screenshot tool calls to include filename in tool_result
          if (isScreenshotTool(toolName)) {
            const screenshotInput = input as { filename?: string } | undefined;
            if (screenshotInput?.filename) {
              pendingScreenshots.set(toolUseId, screenshotInput.filename);
              console.log(`[Server] Tracking screenshot tool: ${toolUseId} -> ${screenshotInput.filename}`);
            }
          }
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

        // Skip TodoWrite tool results unless it's an error
        if (pendingTodoWrites.has(toolUseId)) {
          pendingTodoWrites.delete(toolUseId);
          if (!isError) {
            break;
          }
          // Fall through to show error message
        }

        // Check if this is a screenshot tool result
        const screenshotFilename = pendingScreenshots.get(toolUseId);
        if (screenshotFilename) {
          pendingScreenshots.delete(toolUseId);
          console.log(`[Server] Screenshot result: ${toolUseId} -> ${screenshotFilename}`);
        }

        // Check if this is a plan mode tool result (EnterPlanMode/ExitPlanMode)
        const planModeAction = pendingPlanModeTools.get(toolUseId);
        if (planModeAction && !isError) {
          pendingPlanModeTools.delete(toolUseId);
          const newMode = planModeAction === 'enter' ? 'plan' : 'ask';
          sessionManager.setPermissionMode(sessionId, newMode);
          sendToSession(sessionId, {
            type: 'system_info',
            sessionId,
            permissionMode: newMode,
          });
          console.log(`[Server] ${planModeAction === 'enter' ? 'EnterPlanMode' : 'ExitPlanMode'} completed - syncing to ${newMode} mode`);
        } else if (planModeAction && isError) {
          // Tool failed, don't change mode
          pendingPlanModeTools.delete(toolUseId);
          console.log(`[Server] Plan mode tool failed, not changing permission mode`);
        }

        sendToSession(sessionId, {
          type: 'tool_result',
          sessionId,
          toolUseId,
          content,
          isError,
          // Include screenshot filename if this was a screenshot tool
          ...(screenshotFilename && { screenshotFilename }),
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
        const resultData = eventData as {
          result: string;
          sessionId: string;
          modelUsage?: Record<string, {
            inputTokens?: number;
            outputTokens?: number;
            cacheReadInputTokens?: number;
            cacheCreationInputTokens?: number;
            contextWindow?: number;
          }>;
        };
        // Update session with Claude's session ID
        if (resultData.sessionId) {
          sessionManager.setClaudeSessionId(sessionId, resultData.sessionId);
        }
        // Process modelUsage from CLI result (cumulative values)
        if (resultData.modelUsage) {
          const session = sessionManager.getSession(sessionId);
          const currentModel = session?.model;

          for (const [modelName, usage] of Object.entries(resultData.modelUsage)) {
            // Save context window to DB
            if (usage.contextWindow) {
              sessionManager.addModelUsage(
                sessionId,
                modelName,
                { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
                usage.contextWindow
              );
            }

            // Send cumulative usage for current model to client
            if (modelName === currentModel && usage.inputTokens !== undefined) {
              sendToSession(sessionId, {
                type: 'usage_info',
                sessionId,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens ?? 0,
                cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
                cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
                isCumulative: true,
                contextWindow: usage.contextWindow,
                modelName: modelName,
              });
            }
          }
        }
        // Flush accumulated text/thinking to history
        flushAccumulator(sessionId);
        sendToSession(sessionId, {
          type: 'result',
          sessionId,
          result: resultData.result,
        });

        // Process queued input immediately via stdin (multi-turn conversation)
        // With stdin kept open for control_request, we can continue the conversation
        // without waiting for exit
        const queue = sessionInputQueue.get(sessionId);
        if (queue && queue.length > 0) {
          const nextInput = queue.shift()!;
          if (queue.length === 0) {
            sessionInputQueue.delete(sessionId);
          }
          console.log(`[Server] Processing queued input via stdin for session ${sessionId}: ${nextInput.substring(0, 50)}...`);
          const sent = runnerManager.sendUserMessage(sessionId, nextInput);
          if (sent) {
            // Status remains 'running' - new turn started
            console.log(`[Server] Follow-up message sent via stdin for session ${sessionId}`);
          } else {
            // Fallback: stdin not available, wait for exit to start new process
            console.log(`[Server] Could not send via stdin, re-queuing input for session ${sessionId}`);
            queue.unshift(nextInput);
            sessionInputQueue.set(sessionId, queue);
          }
        } else {
          // No queued input - set idle
          updateAndBroadcastStatus(sessionId, 'idle');
        }
        break;
      }

      case 'error':
        sendToSession(sessionId, {
          type: 'error',
          sessionId,
          message: (eventData as { message: string }).message,
        });
        break;

      case 'exit': {
        const exitData = eventData as { code: number | null; signal: string | null };
        // Clean up Claude PID
        sessionClaudePids.delete(sessionId);
        // Flush any remaining accumulated content
        flushAccumulator(sessionId);

        // If process exited with error and no result was sent, notify client
        const acc = turnAccumulator.get(sessionId);
        const hadNoResult = !acc || (!acc.text && !acc.thinking);
        if (exitData.code !== 0 && hadNoResult) {
          console.log(`[Server] Claude process exited with error code ${exitData.code} for session ${sessionId}`);
          sendToSession(sessionId, {
            type: 'error',
            sessionId,
            message: `Claude process exited unexpectedly (code: ${exitData.code})`,
          });
        }

        // Check if there's queued input to send (only on successful exit)
        const queue = sessionInputQueue.get(sessionId);
        if (exitData.code === 0 && queue && queue.length > 0) {
          const nextInput = queue.shift()!;
          if (queue.length === 0) {
            sessionInputQueue.delete(sessionId);
          }
          console.log(`[Server] Processing queued input for session ${sessionId}: ${nextInput}`);
          // Start new turn with queued input (use setTimeout to ensure runner is cleaned up)
          setTimeout(() => {
            processQueuedInput(sessionId, nextInput).catch((error) => {
              console.error(`[Server] Error processing queued input:`, error);
              updateAndBroadcastStatus(sessionId, 'idle');
            });
          }, 0);
        } else {
          updateAndBroadcastStatus(sessionId, 'idle');
        }
        break;
      }

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
        // Permission mode is set at startup via --permission-mode flag
        const runner = runnerManager.getRunner(sessionId);
        const reverseMap: Record<ClaudePermissionMode, string> = {
          'default': 'ask',
          'acceptEdits': 'auto-edit',
          'plan': 'plan',
        };
        const currentMode = runner ? reverseMap[runner.permissionMode] : systemData.permissionMode;
        sendToSession(sessionId, {
          type: 'system_info',
          sessionId,
          model: systemData.model,
          permissionMode: currentMode,
          cwd: systemData.cwd,
          homeDir: process.env.HOME,
          tools: systemData.tools,
        });
        break;
      }

      case 'permission_mode_changed': {
        const modeData = eventData as { permissionMode: ClaudePermissionMode };
        // Map ClaudePermissionMode back to PermissionMode (shared)
        const reverseMap: Record<ClaudePermissionMode, string> = {
          'default': 'ask',
          'acceptEdits': 'auto-edit',
          'plan': 'plan',
        };
        const sharedMode = reverseMap[modeData.permissionMode];
        // Update session manager
        sessionManager.setPermissionMode(sessionId, sharedMode as 'ask' | 'auto-edit' | 'plan');
        // Broadcast to all clients attached to this session
        sendToSession(sessionId, {
          type: 'system_info',
          sessionId,
          permissionMode: sharedMode,
        });
        console.log(`[Server] Permission mode synced for session ${sessionId}: ${sharedMode}`);
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
        updateAndBroadcastStatus(sessionId, 'waiting_permission');
        // Store pending permission for restoration on reload
        sessionPendingPermissions.set(sessionId, {
          requestId: permData.requestId,
          toolName: permData.toolName,
          input: permData.input,
        });
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
  async function handleMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
    let response: ServerMessage | undefined;

    switch (message.type) {
      case 'list_sessions': {
        // Return sessions with internal usage data
        const sessionsWithUsage = getSessionsWithUsage();
        response = {
          type: 'session_list',
          sessions: sessionsWithUsage,
        };
        break;
      }

      case 'create_session': {
        let workingDir = message.workingDir;
        let sessionId: string | undefined;
        let cleanupFn: (() => Promise<void>) | undefined;

        // If repositoryId is provided, use WorkspaceSetup to set up the workspace
        if (message.repositoryId) {
          const repository = repositoryManager.get(message.repositoryId);
          if (!repository) {
            response = {
              type: 'error',
              message: `Repository not found: ${message.repositoryId}`,
            };
            break;
          }

          // Generate session ID first (needed for worktree name)
          sessionId = nanoid();

          // Determine if container mode based on runner backend
          const runnerBackend = message.runnerBackend ?? settingsManager.get('defaultRunnerBackend');
          const isContainerMode = runnerBackend === 'podman';

          try {
            const result = await WorkspaceSetup.setup({
              repository,
              sessionId,
              tmpfsBasePath,
              cacheDir: workspaceCacheDir,
              worktreeName: message.worktreeName,
              isContainerMode,
            });
            workingDir = result.workingDir;
            cleanupFn = result.cleanup;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Server] Failed to setup workspace for repository ${message.repositoryId}:`, errorMessage);
            response = {
              type: 'error',
              message: `Failed to setup workspace: ${errorMessage}`,
            };
            break;
          }
        }

        const session = sessionManager.createSession({
          id: sessionId,
          name: message.name,
          workingDir,
          runnerBackend: message.runnerBackend,
          browserInContainer: message.browserInContainer,
        });

        // Store cleanup function for later
        if (cleanupFn) {
          sessionWorkspaceCleanups.set(session.id, cleanupFn);
        }

        // Also store in runtime maps for consistent lookups
        if (message.runnerBackend !== undefined) {
          sessionRunnerBackends.set(session.id, message.runnerBackend);
        }
        if (message.browserInContainer !== undefined) {
          sessionBrowserInContainer.set(session.id, message.browserInContainer);
        }
        // Broadcast to all clients for real-time session list updates
        broadcastSessionCreated(session);
        // Also send response to the creating client (will be deduplicated on client side)
        response = {
          type: 'session_created',
          session,
        };
        break;
      }

      case 'attach_session': {
        const session = sessionManager.getSession(message.sessionId);
        if (session) {
          // Store WebSocket for this session so it can receive events
          addWebSocketToSession(message.sessionId, ws);

          // Restore session settings from DB to runtime maps
          if (session.runnerBackend) {
            sessionRunnerBackends.set(message.sessionId, session.runnerBackend);
          }
          if (session.browserInContainer !== undefined) {
            sessionBrowserInContainer.set(message.sessionId, session.browserInContainer);
          }

          // Register session for git status tracking
          gitStatusProvider.registerSession(message.sessionId, session.workingDir);

          const usage = sessionManager.getUsage(message.sessionId);
          const modelUsage = sessionManager.getModelUsage(message.sessionId);
          const pendingPermission = sessionPendingPermissions.get(message.sessionId);

          // Check if a browser session exists for this session (either host or container)
          const hasBrowserSession =
            browserSessionManager.getController(message.sessionId) !== undefined ||
            containerBrowserSessionManager.hasSession(message.sessionId);

          // Get current permission mode for sync
          // Priority: runner's current mode > session's stored mode > global default
          const runner = runnerManager.getRunner(message.sessionId);
          let currentMode: PermissionMode;
          if (runner) {
            // Map ClaudePermissionMode to PermissionMode
            const reverseMap: Record<ClaudePermissionMode, PermissionMode> = {
              'default': 'ask',
              'acceptEdits': 'auto-edit',
              'plan': 'plan',
            };
            currentMode = reverseMap[runner.permissionMode];
          } else if (session.permissionMode) {
            // Use stored session permission mode
            currentMode = session.permissionMode;
          } else {
            // Fall back to global default
            currentMode = settingsManager.get('defaultPermissionMode') as PermissionMode;
          }

          response = {
            type: 'session_attached',
            sessionId: message.sessionId,
            history: sessionManager.getHistory(message.sessionId),
            usage: usage ?? undefined,
            modelUsage: modelUsage.length > 0 ? modelUsage : undefined,
            pendingPermission: pendingPermission ?? undefined,
            hasBrowserSession,
            isRunning: runnerManager.hasRunningSession(message.sessionId),
            permissionMode: currentMode,
            model: session.model ?? undefined,
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
          // Clean up session-allowed patterns and runner backend preferences
          sessionAllowedPatterns.delete(message.sessionId);
          sessionRunnerBackends.delete(message.sessionId);
          sessionBrowserInContainer.delete(message.sessionId);

          // Clean up browser sessions
          await browserSessionManager.destroySession(message.sessionId);
          await containerBrowserSessionManager.destroySession(message.sessionId);

          // Clean up container manager
          const containerManager = sessionContainerManagers.get(message.sessionId);
          if (containerManager) {
            await containerManager.stopContainer();
            sessionContainerManagers.delete(message.sessionId);
          }

          // Clean up persistent container (Issue #78: same-container mode)
          await stopPersistentContainer(message.sessionId);

          // Unregister from git status tracking
          gitStatusProvider.unregisterSession(message.sessionId);

          // Clean up workspace (remove worktree, etc.)
          const workspaceCleanup = sessionWorkspaceCleanups.get(message.sessionId);
          if (workspaceCleanup) {
            try {
              await workspaceCleanup();
            } catch (error) {
              console.error(`[Server] Failed to cleanup workspace for session ${message.sessionId}:`, error);
            }
            sessionWorkspaceCleanups.delete(message.sessionId);
          }

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

      // Thread binding operations (for Slack persistence)
      case 'save_thread_binding': {
        sessionManager.saveThreadBinding(message.binding);
        response = {
          type: 'thread_binding_saved',
          binding: message.binding,
        };
        break;
      }

      case 'load_thread_bindings': {
        const bindings = sessionManager.loadAllThreadBindings();
        response = {
          type: 'thread_bindings_list',
          bindings,
        };
        break;
      }

      case 'get_settings': {
        const settings = settingsManager.getAll();
        response = {
          type: 'settings',
          settings,
        };
        break;
      }

      case 'update_settings': {
        const settings = settingsManager.updateAll(message.settings);
        response = {
          type: 'settings',
          settings,
        };
        // Broadcast settings update to all connected clients
        broadcastToAll({
          type: 'settings',
          settings,
        });
        break;
      }

      // Repository management
      case 'list_repositories': {
        const repositories = repositoryManager.list();
        response = {
          type: 'repository_list',
          repositories,
        };
        break;
      }

      case 'create_repository': {
        const repository = repositoryManager.create({
          name: message.name,
          path: message.path,
          type: message.repositoryType,
          remoteUrl: message.remoteUrl,
          remoteProvider: message.remoteUrl?.includes('github.com') ? 'github' :
                          message.remoteUrl?.includes('gitlab.com') ? 'gitlab' :
                          message.remoteUrl?.includes('bitbucket.org') ? 'bitbucket' : undefined,
          remoteBranch: message.remoteBranch,
        });
        // Broadcast to all clients (including the requester)
        broadcastToAll({
          type: 'repository_created',
          repository,
        });
        break;
      }

      case 'update_repository': {
        const repository = repositoryManager.update(message.id, {
          name: message.name,
          path: message.path,
          type: message.repositoryType,
          remoteUrl: message.remoteUrl,
          remoteBranch: message.remoteBranch,
        });
        if (repository) {
          // Broadcast to all clients (including the requester)
          broadcastToAll({
            type: 'repository_updated',
            repository,
          });
        } else {
          response = {
            type: 'error',
            message: 'Repository not found',
          };
        }
        break;
      }

      case 'delete_repository': {
        const deleted = repositoryManager.delete(message.id);
        if (deleted) {
          // Broadcast to all clients (including the requester)
          broadcastToAll({
            type: 'repository_deleted',
            id: message.id,
          });
        } else {
          response = {
            type: 'error',
            message: 'Repository not found',
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
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        // Map PermissionMode (shared) to ClaudePermissionMode
        const modeMap: Record<string, ClaudePermissionMode> = {
          'ask': 'default',
          'auto-edit': 'acceptEdits',
          'plan': 'plan',
        };
        const claudeMode = modeMap[message.mode];
        if (!claudeMode) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: `Invalid permission mode: ${message.mode}`,
          };
          break;
        }

        // Always store the permission mode in session
        // It will be applied on next Claude Code startup via --permission-mode flag
        sessionManager.setPermissionMode(message.sessionId, message.mode);
        console.log(`[Server] Permission mode set for session ${message.sessionId}: ${message.mode}`);

        // If Claude Code is currently running, try to change the mode via control_request
        if (runnerManager.hasRunningSession(message.sessionId)) {
          const changed = runnerManager.requestPermissionModeChange(message.sessionId, claudeMode);
          if (changed) {
            console.log(`[Server] Requested permission mode change for running session ${message.sessionId}: ${claudeMode}`);
          }
        }

        // Broadcast to all clients attached to this session
        sendToSession(message.sessionId, {
          type: 'system_info',
          sessionId: message.sessionId,
          permissionMode: message.mode,
        });

        // No additional response needed - already broadcast via sendToSession
        return;
      }

      case 'set_model': {
        const session = sessionManager.getSession(message.sessionId);
        if (session) {
          // Use client-provided oldModel, or fall back to stored model
          const oldModel = message.oldModel ?? session.model;
          // Store the model for the session
          sessionManager.setModel(message.sessionId, message.model);

          // If model actually changed, save and broadcast system message
          if (oldModel !== message.model) {
            const shortName = (model: string | undefined) => {
              if (!model) return 'unknown';
              if (model.includes('opus')) return 'opus';
              if (model.includes('sonnet')) return 'sonnet';
              if (model.includes('haiku')) return 'haiku';
              return model.split('-')[0];
            };

            const systemMessage = {
              type: 'system' as const,
              content: {
                title: 'Model changed',
                message: `${shortName(oldModel)} → ${shortName(message.model)}`,
                type: 'info',
              },
              timestamp: new Date().toISOString(),
            };

            // Save to history
            sessionManager.addMessage(message.sessionId, systemMessage);

            // Send to current client (use ws directly, not sendToSession which requires user_message first)
            ws.send(JSON.stringify({
              type: 'system_message',
              sessionId: message.sessionId,
              content: systemMessage.content,
            }));
          }

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
        addWebSocketToSession(message.sessionId, ws);

        // Check if already running - auto-queue the input instead of returning error
        if (runnerManager.hasRunningSession(message.sessionId)) {
          // Check if session is idle (waiting for input after result)
          // If idle but runner is still active, send via stdin directly
          const currentStatus = sessionManager.getSession(message.sessionId)?.status;
          if (currentStatus === 'idle') {
            // Session completed a turn, runner still active - send via stdin
            console.log(`[Server] Session ${message.sessionId} is idle with active runner, sending via stdin`);
            const sent = runnerManager.sendUserMessage(message.sessionId, message.content);
            if (sent) {
              updateAndBroadcastStatus(message.sessionId, 'running');
              // Add to history and broadcast
              const timestamp = new Date().toISOString();
              sessionManager.addToHistory(message.sessionId, {
                type: 'user',
                content: message.content,
                timestamp,
              });
              sendToSession(message.sessionId, {
                type: 'user_input',
                sessionId: message.sessionId,
                content: message.content,
                source: message.source || 'web',
                slackContext: message.slackContext,
                timestamp,
              });
              return;
            }
            // If sendUserMessage failed, fall through to queue
            console.log(`[Server] sendUserMessage failed, falling back to queue`);
          }

          // Queue the input (session is actively processing)
          let queue = sessionInputQueue.get(message.sessionId);
          if (!queue) {
            queue = [];
            sessionInputQueue.set(message.sessionId, queue);
          }
          queue.push(message.content);
          console.log(`[Server] Session ${message.sessionId} is running, queued input (queue size: ${queue.length})`);

          // Add to history and broadcast (same as stream_input)
          const queuedTimestamp = new Date().toISOString();
          sessionManager.addToHistory(message.sessionId, {
            type: 'user',
            content: message.content,
            timestamp: queuedTimestamp,
          });

          sendToSession(message.sessionId, {
            type: 'user_input',
            sessionId: message.sessionId,
            content: message.content,
            source: message.source || 'web',
            slackContext: message.slackContext,
            timestamp: queuedTimestamp,
          });
          return;
        }

        // Add user message to history (including images if present)
        const timestamp = new Date().toISOString();
        sessionManager.addToHistory(message.sessionId, {
          type: 'user',
          content: message.images ? { text: message.content, images: message.images } : message.content,
          timestamp,
        });

        // Broadcast user input to all clients attached to this session (except sender)
        sendToSessionExcept(message.sessionId, {
          type: 'user_input',
          sessionId: message.sessionId,
          content: message.content,
          source: message.source || 'web',
          slackContext: message.slackContext,
          timestamp,
        }, ws);

        // Update session status
        updateAndBroadcastStatus(message.sessionId, 'running');

        // Convert ImageAttachment to ImageContent for the runner
        const images = message.images?.map((img) => ({
          type: 'image' as const,
          data: img.data,
          mediaType: img.mediaType,
        }));

        if (images && images.length > 0) {
          console.log('[Server] Images attached:', images.length);
        }

        // Start Claude CLI with MCP permission handling
        try {
          // Use message's thinkingEnabled if specified, otherwise use global default
          const thinkingEnabled = message.thinkingEnabled ?? settingsManager.get('defaultThinkingEnabled');

          // Map session permission mode to Claude permission mode
          const modeMap: Record<string, ClaudePermissionMode> = {
            'ask': 'default',
            'auto-edit': 'acceptEdits',
            'plan': 'plan',
          };
          const sessionMode = session.permissionMode ?? settingsManager.get('defaultPermissionMode');
          const permissionMode = modeMap[sessionMode];

          // Use session's runner backend if set, otherwise use global default
          // Check in-memory map first, then session from DB, then global default
          const runnerBackend = sessionRunnerBackends.get(message.sessionId) ?? session.runnerBackend ?? settingsManager.get('defaultRunnerBackend');

          // Get browserInContainer setting for this session (Issue #78)
          const browserInContainer = shouldUseContainerBrowser(message.sessionId);

          // Generate unique bridge port for this session (3002-4001 range)
          // IMPORTANT: Must match the port calculation in getOrCreateContainerManager
          const bridgePort = browserInContainer
            ? 3002 + (message.sessionId.charCodeAt(0) % 1000)
            : undefined;

          // Start persistent container if browserInContainer is true (Issue #78: same-container mode)
          // This allows Claude and browser bridge to share localhost
          let containerId: string | undefined;
          if (browserInContainer && bridgePort && runnerBackend === 'podman') {
            try {
              // Use PersistentContainerManager for container lifecycle and screencast support
              const containerManager = await getOrCreateContainerManager(message.sessionId, session.workingDir);
              containerId = await containerManager.startContainer();
              console.log(`[Server] Using persistent container ${containerId} for session ${message.sessionId}`);

              // Set up screencast connection via containerBrowserSessionManager
              if (!containerBrowserSessionManager.hasSession(message.sessionId)) {
                await containerManager.startBrowserBridge();
                await containerBrowserSessionManager.createSession(message.sessionId, containerManager);
                console.log(`[Server] Container browser session created for ${message.sessionId}`);
              }
            } catch (error) {
              console.error(`[Server] Failed to start persistent container:`, error);
              // Fall back to non-persistent mode
            }
          }

          // Generate MCP config for this session (unless using mock)
          let mcpConfigPath: string | undefined;
          let permissionToolName: string | undefined;
          if (!useMock) {
            mcpConfigPath = generateMcpConfig({
              sessionId: message.sessionId,
              wsUrl,
              mcpServerCommand,
              mcpServerArgs,
              mcpServerCwd,
              // In same-container mode, the browser bridge runs inside the container
              browserBridgeUrl: bridgePort ? `ws://localhost:${bridgePort}` : undefined,
              // When running in container, use host.containers.internal to reach host
              useContainerHost: browserInContainer,
            });
            permissionToolName = 'mcp__bridge__permission_prompt';
          }

          // Expand system prompt template
          let systemPrompt: string | undefined;
          const systemPromptTemplate = settingsManager.get('systemPromptTemplate');
          if (systemPromptTemplate) {
            const clientPort = process.env.AGENTDOCK_CLIENT_PORT || '5173';
            const baseUrl = process.env.AGENTDOCK_BASE_URL || `http://localhost:${clientPort}`;
            const variables = buildSystemPromptVariables({
              sessionId: message.sessionId,
              workingDir: session.workingDir,
              baseUrl,
            });
            systemPrompt = expandSystemPromptTemplate(systemPromptTemplate, variables);
          }

          runnerManager.startSession(message.sessionId, message.content, {
            workingDir: session.workingDir,
            claudeSessionId: session.claudeSessionId,
            mcpConfigPath,
            permissionToolName,
            images,
            thinkingEnabled,
            permissionMode,
            runnerBackend,
            browserInContainer,
            bridgePort,
            containerId,
            systemPrompt,
            onEvent: (sessionId, eventType, data) => {
              handleRunnerEvent(sessionId, eventType, data);
              // Clean up MCP config on exit
              if (eventType === 'exit') {
                if (mcpConfigPath) {
                  cleanupMcpConfig(sessionId);
                }
              }
            },
          });
          // Don't send response here - events will be sent via handleRunnerEvent
          return;
        } catch (error) {
          updateAndBroadcastStatus(message.sessionId, 'idle');
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
        updateAndBroadcastStatus(message.sessionId, 'idle');
        response = {
          type: 'result',
          sessionId: message.sessionId,
          result: 'Interrupted',
        };
        break;
      }

      case 'stream_input': {
        // Queue input for after current execution completes
        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        // Check if session is running
        if (!runnerManager.hasRunningSession(message.sessionId)) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session is not running',
          };
          break;
        }

        // Add to queue
        let queue = sessionInputQueue.get(message.sessionId);
        if (!queue) {
          queue = [];
          sessionInputQueue.set(message.sessionId, queue);
        }
        queue.push(message.content);
        console.log(`[Server] stream_input queued: sessionId=${message.sessionId}, content=${message.content}, queueSize=${queue.length}`);

        // Add to history and broadcast to all clients (including sender)
        const timestamp = new Date().toISOString();
        sessionManager.addToHistory(message.sessionId, {
          type: 'user',
          content: { text: message.content },
          timestamp,
        });

        // Broadcast to all clients attached to this session
        sendToSession(message.sessionId, {
          type: 'user_input',
          sessionId: message.sessionId,
          content: message.content,
          source: 'web',
          timestamp,
        });

        return;
      }

      case 'permission_response': {
        // Track session-wide permission pattern if requested
        if (
          message.response.behavior === 'allow' &&
          message.response.allowForSession
        ) {
          // Use pattern if provided, otherwise fall back to tool name only (legacy behavior)
          const patternStr = message.response.pattern || message.response.toolName;
          if (patternStr) {
            const pattern = parsePermissionPattern(patternStr);
            let patterns = sessionAllowedPatterns.get(message.sessionId);
            if (!patterns) {
              patterns = [];
              sessionAllowedPatterns.set(message.sessionId, patterns);
            }
            patterns.push(pattern);
            console.log(`[Session ${message.sessionId}] Pattern "${patternStr}" allowed for session`);

            // Auto-switch to 'auto-edit' mode when Edit tool is allowed for session (without pattern restriction)
            if (pattern.toolName === 'Edit' && pattern.pattern === undefined) {
              sessionManager.setPermissionMode(message.sessionId, 'auto-edit');
              sendToSession(message.sessionId, {
                type: 'system_info',
                sessionId: message.sessionId,
                permissionMode: 'auto-edit',
              });
              console.log(`[Session ${message.sessionId}] Auto-switched to 'auto-edit' mode`);
            }
          }
        }

        // Clear the stored pending permission (no longer pending)
        sessionPendingPermissions.delete(message.sessionId);

        // Broadcast permission_cleared to all clients attached to this session
        sendToSession(message.sessionId, {
          type: 'permission_cleared',
          sessionId: message.sessionId,
          requestId: message.requestId,
        });

        // First check if this is for a mock runner
        const runner = runnerManager.getRunner(message.sessionId);
        if (runner && 'respondToPermission' in runner) {
          // Mock runner - respond directly
          const mockRunner = runner as import('./mock-claude-runner.js').MockClaudeRunner;
          mockRunner.respondToPermission(message.requestId, message.response);
          updateAndBroadcastStatus(message.sessionId, 'running');
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
          updateAndBroadcastStatus(message.sessionId, 'running');
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

        // Auto-allow certain tools (browser tools, AskUserQuestion, etc.)
        if (isAutoAllowedTool(message.toolName)) {
          ws.send(JSON.stringify({
            type: 'permission_response',
            sessionId: message.sessionId,
            requestId: message.requestId,
            response: { behavior: 'allow', updatedInput: message.input },
          }));
          return;
        }

        // Auto-allow web tools if session or global setting allows
        if (isWebTool(message.toolName)) {
          const session = sessionManager.getSession(message.sessionId);
          // Session setting takes precedence, fall back to global setting
          const autoAllowWebTools = session?.autoAllowWebTools ?? settingsManager.get('autoAllowWebTools');
          if (autoAllowWebTools) {
            ws.send(JSON.stringify({
              type: 'permission_response',
              sessionId: message.sessionId,
              requestId: message.requestId,
              response: { behavior: 'allow', updatedInput: message.input },
            }));
            return;
          }
        }

        // Check if tool matches any allowed pattern for this session
        const allowedPatterns = sessionAllowedPatterns.get(message.sessionId);
        if (allowedPatterns && matchesPermission(message.toolName, message.input, allowedPatterns)) {
          // Auto-allow - respond immediately to MCP server
          ws.send(JSON.stringify({
            type: 'permission_response',
            sessionId: message.sessionId,
            requestId: message.requestId,
            response: { behavior: 'allow', updatedInput: message.input },
          }));
          return;
        }

        // Store MCP WebSocket for response
        pendingPermissionRequests.set(message.requestId, ws);

        // Store pending permission for restoration on reload
        sessionPendingPermissions.set(message.sessionId, {
          requestId: message.requestId,
          toolName: message.toolName,
          input: message.input,
        });

        // Update session status
        updateAndBroadcastStatus(message.sessionId, 'waiting_permission');

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
        updateAndBroadcastStatus(message.sessionId, 'running');

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
        addWebSocketToSession(message.sessionId, ws);

        // Add compact command to history as a user message
        sessionManager.addToHistory(message.sessionId, {
          type: 'user',
          content: '/compact',
          timestamp: new Date().toISOString(),
        });

        // Update session status
        updateAndBroadcastStatus(message.sessionId, 'running');

        // Create a summary prompt based on conversation history
        const summaryPrompt = `Please provide a brief summary of our conversation so far. Focus on:
1. The main topics discussed
2. Key decisions or conclusions reached
3. Any pending tasks or questions

Keep it concise but comprehensive.`;

        // Start Claude CLI with the summary request
        try {
          // Map session permission mode to Claude permission mode
          const modeMap: Record<string, ClaudePermissionMode> = {
            'ask': 'default',
            'auto-edit': 'acceptEdits',
            'plan': 'plan',
          };
          const sessionMode = session.permissionMode ?? settingsManager.get('defaultPermissionMode');
          const permissionMode = modeMap[sessionMode];

          // Use session's runner backend if set, otherwise use global default
          // Check in-memory map first, then session from DB, then global default
          const runnerBackend = sessionRunnerBackends.get(message.sessionId) ?? session.runnerBackend ?? settingsManager.get('defaultRunnerBackend');

          // Get browserInContainer setting for this session (Issue #78)
          const browserInContainer = shouldUseContainerBrowser(message.sessionId);

          // Generate unique bridge port for this session (3002-4001 range)
          // IMPORTANT: Must match the port calculation in getOrCreateContainerManager
          const bridgePort = browserInContainer
            ? 3002 + (message.sessionId.charCodeAt(0) % 1000)
            : undefined;

          // Start persistent container if browserInContainer is true (Issue #78: same-container mode)
          // This allows Claude and browser bridge to share localhost
          let containerId: string | undefined;
          if (browserInContainer && bridgePort && runnerBackend === 'podman') {
            try {
              // Use PersistentContainerManager for container lifecycle and screencast support
              const containerManager = await getOrCreateContainerManager(message.sessionId, session.workingDir);
              containerId = await containerManager.startContainer();
              console.log(`[Server] Using persistent container ${containerId} for session ${message.sessionId}`);

              // Set up screencast connection via containerBrowserSessionManager
              if (!containerBrowserSessionManager.hasSession(message.sessionId)) {
                await containerManager.startBrowserBridge();
                await containerBrowserSessionManager.createSession(message.sessionId, containerManager);
                console.log(`[Server] Container browser session created for ${message.sessionId}`);
              }
            } catch (error) {
              console.error(`[Server] Failed to start persistent container:`, error);
              // Fall back to non-persistent mode
            }
          }

          let mcpConfigPath: string | undefined;
          let permissionToolName: string | undefined;
          if (!useMock) {
            mcpConfigPath = generateMcpConfig({
              sessionId: message.sessionId,
              wsUrl,
              mcpServerCommand,
              mcpServerArgs,
              mcpServerCwd,
              // In same-container mode, the browser bridge runs inside the container
              browserBridgeUrl: bridgePort ? `ws://localhost:${bridgePort}` : undefined,
              // When running in container, use host.containers.internal to reach host
              useContainerHost: browserInContainer,
            });
            permissionToolName = 'mcp__bridge__permission_prompt';
          }

          // Expand system prompt template
          let systemPrompt: string | undefined;
          const systemPromptTemplate = settingsManager.get('systemPromptTemplate');
          if (systemPromptTemplate) {
            const clientPort = process.env.AGENTDOCK_CLIENT_PORT || '5173';
            const baseUrl = process.env.AGENTDOCK_BASE_URL || `http://localhost:${clientPort}`;
            const variables = buildSystemPromptVariables({
              sessionId: message.sessionId,
              workingDir: session.workingDir,
              baseUrl,
            });
            systemPrompt = expandSystemPromptTemplate(systemPromptTemplate, variables);
          }

          runnerManager.startSession(message.sessionId, summaryPrompt, {
            workingDir: session.workingDir,
            claudeSessionId: session.claudeSessionId,
            mcpConfigPath,
            permissionToolName,
            permissionMode,
            runnerBackend,
            browserInContainer,
            bridgePort,
            containerId,
            systemPrompt,
            onEvent: (sessionId, eventType, data) => {
              handleRunnerEvent(sessionId, eventType, data);
              if (eventType === 'exit' && mcpConfigPath) {
                cleanupMcpConfig(sessionId);
              }
            },
          });
          return;
        } catch (error) {
          updateAndBroadcastStatus(message.sessionId, 'idle');
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: error instanceof Error ? error.message : 'Failed to compact session',
          };
        }
        break;
      }

      case 'start_screencast': {
        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          response = {
            type: 'error',
            sessionId: message.sessionId,
            message: 'Session not found',
          };
          break;
        }

        // Store WebSocket for this session (required for screencast events)
        addWebSocketToSession(message.sessionId, ws);

        // Determine whether to use container browser or host browser
        const useContainerBrowser = shouldUseContainerBrowser(message.sessionId);

        if (useContainerBrowser) {
          // Use container browser session manager
          if (!containerBrowserSessionManager.hasSession(message.sessionId)) {
            try {
              const containerManager = await getOrCreateContainerManager(message.sessionId, session.workingDir);
              await containerBrowserSessionManager.createSession(message.sessionId, containerManager);
              console.log(`[ContainerBrowserSession] Created for session ${message.sessionId}`);
            } catch (error) {
              response = {
                type: 'error',
                sessionId: message.sessionId,
                message: error instanceof Error ? error.message : 'Failed to create container browser session',
              };
              break;
            }
          } else {
            // Session already exists - send current status to reconnect client
            // For container sessions, we don't have cached status, so just indicate active
            sendToSession(message.sessionId, {
              type: 'screencast_status',
              sessionId: message.sessionId,
              active: true,
            });
            console.log(`[ContainerBrowserSession] Reconnected client for session ${message.sessionId}`);
          }
        } else {
          // Use host browser session manager
          if (!browserSessionManager.getController(message.sessionId)) {
            try {
              await browserSessionManager.createSession(message.sessionId);
              console.log(`[BrowserSession] Created for session ${message.sessionId}`);
            } catch (error) {
              response = {
                type: 'error',
                sessionId: message.sessionId,
                message: error instanceof Error ? error.message : 'Failed to create browser session',
              };
              break;
            }
          } else {
            // Session already exists - send current status to reconnect client
            const status = await browserSessionManager.getStatus(message.sessionId);
            if (status) {
              sendToSession(message.sessionId, {
                type: 'screencast_status',
                sessionId: message.sessionId,
                active: status.active,
                browserUrl: status.browserUrl,
                browserTitle: status.browserTitle,
              });
              console.log(`[BrowserSession] Reconnected client for session ${message.sessionId}`);
            }
          }
        }
        // Screencast starts automatically on session creation
        return;
      }

      case 'stop_screencast': {
        // Destroy browser session (both managers will ignore if session doesn't exist)
        const useContainerBrowser = shouldUseContainerBrowser(message.sessionId);
        if (useContainerBrowser) {
          await containerBrowserSessionManager.destroySession(message.sessionId);
          console.log(`[ContainerBrowserSession] Destroyed for session ${message.sessionId}`);
        } else {
          await browserSessionManager.destroySession(message.sessionId);
          console.log(`[BrowserSession] Destroyed for session ${message.sessionId}`);
        }
        return;
      }

      case 'start_machine_monitor': {
        const sessionId = message.sessionId;

        // Stop existing monitor if any
        const existingInterval = machineMonitorIntervals.get(sessionId);
        if (existingInterval) {
          clearInterval(existingInterval);
        }

        // Store WebSocket for this session
        addWebSocketToSession(sessionId, ws);

        // Function to send machine ports data
        const sendMachineData = async () => {
          try {
            // Get Claude Code PID for this session
            const claudePid = sessionClaudePids.get(sessionId);

            // Get all listening ports
            const portsByPid = await getListeningPorts();

            // Build session-specific process tree if we have the Claude PID
            let processTree: MachineProcessInfo | null = null;
            let sessionPorts: number[] = [];

            if (claudePid) {
              processTree = await buildProcessTree(claudePid, portsByPid);
              if (processTree) {
                // Collect ports from the session's process tree only
                sessionPorts = collectPortsFromTree(processTree);
              }
            } else {
              // No Claude PID yet - session might not be running
              // Return empty data
            }

            const machineData: MachinePortsMessage = {
              type: 'machine_ports',
              sessionId,
              processTree,
              summary: {
                totalProcesses: processTree ? countProcesses(processTree) : 0,
                totalListeningPorts: sessionPorts.length,
                portList: [...new Set(sessionPorts)].sort((a, b) => a - b),
              },
            };

            // Send to all clients attached to this session
            const clients = sessionWebSockets.get(sessionId);
            if (clients) {
              const messageStr = JSON.stringify(machineData);
              clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(messageStr);
                }
              });
            }
          } catch (error) {
            console.error(`[MachineMonitor] Error getting port data:`, error);
          }
        };

        // Send initial data immediately
        await sendMachineData();

        // Start polling every 3 seconds
        const interval = setInterval(sendMachineData, 3000);
        machineMonitorIntervals.set(sessionId, interval);
        console.log(`[MachineMonitor] Started for session ${sessionId}`);
        return;
      }

      case 'stop_machine_monitor': {
        const sessionId = message.sessionId;
        const existingInterval = machineMonitorIntervals.get(sessionId);
        if (existingInterval) {
          clearInterval(existingInterval);
          machineMonitorIntervals.delete(sessionId);
          console.log(`[MachineMonitor] Stopped for session ${sessionId}`);
        }
        return;
      }

      case 'user_browser_click': {
        const useContainerBrowser = containerBrowserSessionManager.hasSession(message.sessionId);
        if (useContainerBrowser) {
          try {
            await containerBrowserSessionManager.click(message.sessionId, message.x, message.y);
            console.log(`[ContainerBrowserSession] Click at (${message.x}, ${message.y})`);
          } catch (error) {
            console.error(`[ContainerBrowserSession] Click failed:`, error);
          }
        } else {
          const controller = browserSessionManager.getController(message.sessionId);
          if (!controller) {
            console.log(`[BrowserSession] No active browser for click in session ${message.sessionId}`);
            return;
          }
          try {
            const page = controller.getPage();
            if (page) {
              await page.mouse.click(message.x, message.y);
              console.log(`[BrowserSession] Click at (${message.x}, ${message.y})`);
            }
          } catch (error) {
            console.error(`[BrowserSession] Click failed:`, error);
          }
        }
        return;
      }

      case 'user_browser_key_press': {
        const useContainerBrowser = containerBrowserSessionManager.hasSession(message.sessionId);
        if (useContainerBrowser) {
          try {
            await containerBrowserSessionManager.pressKey(message.sessionId, message.key);
            console.log(`[ContainerBrowserSession] Key press: ${message.key}`);
          } catch (error) {
            console.error(`[ContainerBrowserSession] Key press failed:`, error);
          }
        } else {
          const controller = browserSessionManager.getController(message.sessionId);
          if (!controller) {
            console.log(`[BrowserSession] No active browser for key press in session ${message.sessionId}`);
            return;
          }
          try {
            const page = controller.getPage();
            if (page) {
              await page.keyboard.press(message.key);
              console.log(`[BrowserSession] Key press: ${message.key}`);
            }
          } catch (error) {
            console.error(`[BrowserSession] Key press failed:`, error);
          }
        }
        return;
      }

      case 'user_browser_scroll': {
        const useContainerBrowser = containerBrowserSessionManager.hasSession(message.sessionId);
        if (useContainerBrowser) {
          try {
            await containerBrowserSessionManager.scroll(message.sessionId, message.deltaX, message.deltaY);
          } catch (error) {
            console.error(`[ContainerBrowserSession] Scroll failed:`, error);
          }
        } else {
          const controller = browserSessionManager.getController(message.sessionId);
          if (!controller) {
            console.log(`[BrowserSession] No active browser for scroll in session ${message.sessionId}`);
            return;
          }
          try {
            const page = controller.getPage();
            if (page) {
              await page.mouse.wheel(message.deltaX, message.deltaY);
            }
          } catch (error) {
            console.error(`[BrowserSession] Scroll failed:`, error);
          }
        }
        return;
      }

      case 'user_browser_mouse_move': {
        const controller = browserSessionManager.getController(message.sessionId);
        if (!controller) {
          return; // Silent fail for mouse move (too frequent to log)
        }
        try {
          const page = controller.getPage();
          if (page) {
            await page.mouse.move(message.x, message.y);

            // Get cursor style at current position and send to client
            // Note: This function is evaluated in the browser context, not Node.js
            const cursor = await page.evaluate(({ x, y }: { x: number; y: number }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const win = globalThis as any;
              const el = win.document.elementFromPoint(x, y);
              if (el) {
                return win.getComputedStyle(el).cursor;
              }
              return 'default';
            }, { x: message.x, y: message.y });

            // Send cursor update to all clients
            sendToSession(message.sessionId, {
              type: 'screencast_cursor',
              sessionId: message.sessionId,
              cursor,
            });
          }
        } catch {
          // Silent fail for mouse move
        }
        return;
      }

      case 'user_browser_navigate': {
        const useContainerBrowser = containerBrowserSessionManager.hasSession(message.sessionId);
        if (useContainerBrowser) {
          try {
            await containerBrowserSessionManager.navigate(message.sessionId, message.url);
            console.log(`[ContainerBrowserSession] Navigated to ${message.url}`);
          } catch (error) {
            console.error(`[ContainerBrowserSession] Navigate failed:`, error);
          }
        } else {
          let controller = browserSessionManager.getController(message.sessionId);
          if (!controller) {
            // Auto-create browser session if not exists
            try {
              await browserSessionManager.createSession(message.sessionId);
              controller = browserSessionManager.getController(message.sessionId);
              console.log(`[BrowserSession] Auto-created for navigate in session ${message.sessionId}`);
            } catch (error) {
              console.error(`[BrowserSession] Failed to create session for navigate:`, error);
              return;
            }
          }
          try {
            const page = controller?.getPage();
            if (page) {
              await page.goto(message.url);
              console.log(`[BrowserSession] Navigated to ${message.url}`);
            }
          } catch (error) {
            console.error(`[BrowserSession] Navigate failed:`, error);
          }
        }
        return;
      }

      case 'user_browser_back': {
        const controller = browserSessionManager.getController(message.sessionId);
        if (!controller) {
          console.log(`[BrowserSession] No active browser for back in session ${message.sessionId}`);
          return;
        }
        try {
          const page = controller.getPage();
          if (page) {
            await page.goBack();
            console.log(`[BrowserSession] Navigated back`);
          }
        } catch (error) {
          console.error(`[BrowserSession] Go back failed:`, error);
        }
        return;
      }

      case 'user_browser_forward': {
        const controller = browserSessionManager.getController(message.sessionId);
        if (!controller) {
          console.log(`[BrowserSession] No active browser for forward in session ${message.sessionId}`);
          return;
        }
        try {
          const page = controller.getPage();
          if (page) {
            await page.goForward();
            console.log(`[BrowserSession] Navigated forward`);
          }
        } catch (error) {
          console.error(`[BrowserSession] Go forward failed:`, error);
        }
        return;
      }

      case 'user_browser_refresh': {
        const controller = browserSessionManager.getController(message.sessionId);
        if (!controller) {
          console.log(`[BrowserSession] No active browser for refresh in session ${message.sessionId}`);
          return;
        }
        try {
          const page = controller.getPage();
          if (page) {
            await page.reload();
            console.log(`[BrowserSession] Page refreshed`);
          }
        } catch (error) {
          console.error(`[BrowserSession] Refresh failed:`, error);
        }
        return;
      }

      case 'browser_command': {
        const useContainerBrowser = shouldUseContainerBrowser(message.sessionId);

        if (useContainerBrowser) {
          // Container browser mode
          if (!containerBrowserSessionManager.hasSession(message.sessionId)) {
            // Auto-create container browser session
            const session = sessionManager.getSession(message.sessionId);
            if (!session) {
              response = {
                type: 'browser_command_result',
                sessionId: message.sessionId,
                requestId: message.requestId,
                success: false,
                error: 'Session not found',
              };
              break;
            }
            try {
              const containerManager = await getOrCreateContainerManager(message.sessionId, session.workingDir);
              await containerBrowserSessionManager.createSession(message.sessionId, containerManager);
              console.log(`[ContainerBrowserSession] Auto-created for session ${message.sessionId}`);
            } catch (error) {
              response = {
                type: 'browser_command_result',
                sessionId: message.sessionId,
                requestId: message.requestId,
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create container browser session',
              };
              break;
            }
          }

          // Execute command via container browser session manager
          try {
            const result = await containerBrowserSessionManager.executeCommand(
              message.sessionId,
              message.command.name,
              message.command as unknown as Record<string, unknown>
            );
            response = {
              type: 'browser_command_result',
              sessionId: message.sessionId,
              requestId: message.requestId,
              success: true,
              result,
            };
          } catch (error) {
            response = {
              type: 'browser_command_result',
              sessionId: message.sessionId,
              requestId: message.requestId,
              success: false,
              error: error instanceof Error ? error.message : 'Browser command failed',
            };
          }
        } else {
          // Host browser mode
          const controller = browserSessionManager.getController(message.sessionId);
          if (!controller) {
            // Auto-create browser session if not exists
            try {
              await browserSessionManager.createSession(message.sessionId);
              console.log(`[BrowserSession] Auto-created for session ${message.sessionId}`);
            } catch (error) {
              response = {
                type: 'browser_command_result',
                sessionId: message.sessionId,
                requestId: message.requestId,
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create browser session',
              };
              break;
            }
          }

          // Execute the browser command
          try {
            const ctrl = browserSessionManager.getController(message.sessionId)!;
            const result = await executeBrowserCommand(ctrl, message.command);
            response = {
              type: 'browser_command_result',
              sessionId: message.sessionId,
              requestId: message.requestId,
              success: true,
              result,
            };
          } catch (error) {
            response = {
              type: 'browser_command_result',
              sessionId: message.sessionId,
              requestId: message.requestId,
              success: false,
              error: error instanceof Error ? error.message : 'Browser command failed',
            };
          }
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

    // Only send response if one was assigned (some operations use broadcast only)
    if (response) {
      ws.send(JSON.stringify(response));
    }
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
                daily: lastUsage.daily,
                blocks: lastUsage.blocks,
              }));
            }
          }

          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString()) as ClientMessage;
              handleMessage(ws, message).catch((error) => {
                console.error('[Server] Error handling message:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Error processing message',
                }));
              });
            } catch (error) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format',
              }));
            }
          });

          ws.on('close', () => {
            allClients.delete(ws);
            removeWebSocketFromSessions(ws);
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
          // Start git status provider
          gitStatusProvider.start();
          resolve();
        });
      });
    },

    async stop() {
      // Clean up browser sessions first
      await browserSessionManager.destroyAll();
      await containerBrowserSessionManager.destroyAll();

      // Stop all container managers
      for (const [sessionId, containerManager] of sessionContainerManagers) {
        await containerManager.stopContainer().catch((error) => {
          console.error(`[Server] Failed to stop container for session ${sessionId}:`, error);
        });
      }
      sessionContainerManagers.clear();

      return new Promise((resolve) => {
        // Stop usage monitor
        usageMonitor?.stop();
        // Stop git status provider
        gitStatusProvider.stop();
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

    getContainerBrowserSessionManager() {
      return containerBrowserSessionManager;
    },
  };
}
