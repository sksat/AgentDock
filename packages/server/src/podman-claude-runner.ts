/**
 * PodmanClaudeRunner - Runs Claude Code inside a Podman container.
 *
 * This runner implements the IClaudeRunner interface and spawns Claude Code
 * inside a rootless Podman container for isolation.
 *
 * Uses ClaudeStreamProcessor for stream parsing and event emission,
 * keeping this class focused on container management.
 */

import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { ClaudeStreamProcessor } from './claude-stream-processor.js';
import type { ClaudePermissionMode } from './claude-stream-processor.js';
import type { ClaudeRunnerEvents, StartOptions } from './claude-runner.js';
import { buildPodmanArgs, getGitEnvVars } from './container-config.js';
import type { ContainerConfig } from './container-config.js';

// Regex for valid tool names: alphanumeric, hyphen, underscore, colon, slash, at-sign, dot
// Examples: "Bash", "Read", "mcp__server:tool", "plugin@namespace"
const VALID_TOOL_NAME_REGEX = /^[a-zA-Z0-9_\-:/@.]+$/;

/**
 * Validate tool names to prevent command injection via tool arguments.
 * Tool names should only contain safe characters.
 */
function validateToolNames(tools: string[]): void {
  for (const tool of tools) {
    if (!VALID_TOOL_NAME_REGEX.test(tool)) {
      throw new Error(`Invalid tool name: "${tool}". Tool names can only contain alphanumeric characters, hyphens, underscores, colons, slashes, at-signs, and dots.`);
    }
    // Also reject if it looks like a flag
    if (tool.startsWith('-')) {
      throw new Error(`Invalid tool name: "${tool}". Tool names cannot start with a hyphen.`);
    }
  }
}

export interface PodmanClaudeRunnerOptions {
  /** Host working directory to mount into container */
  workingDir?: string;
  /** Container configuration */
  containerConfig: ContainerConfig;
  /** Path to claude binary inside container (default: 'claude') */
  claudePath?: string;
  /** MCP config path (will be mounted into container) */
  mcpConfigPath?: string;
  /** Permission tool name for MCP */
  permissionToolName?: string;
  /**
   * Container ID for exec mode (Issue #78: same-container mode).
   * If provided, uses `podman exec` on this container instead of `podman run`.
   * This allows Claude to run in the same container as the browser bridge,
   * sharing localhost for dev server access.
   */
  containerId?: string;
}

export class PodmanClaudeRunner extends EventEmitter {
  private options: PodmanClaudeRunnerOptions;
  private ptyProcess: IPty | null = null;
  private processor: ClaudeStreamProcessor;
  private _isRunning: boolean = false;

  constructor(options: PodmanClaudeRunnerOptions) {
    super();
    this.options = {
      workingDir: options.workingDir ?? process.cwd(),
      containerConfig: options.containerConfig,
      claudePath: options.claudePath ?? 'claude',
      mcpConfigPath: options.mcpConfigPath,
      permissionToolName: options.permissionToolName,
      containerId: options.containerId,
    };
    this.processor = new ClaudeStreamProcessor();
    this.setupProcessorEvents();
  }

  /**
   * Forward events from processor to this runner.
   */
  private setupProcessorEvents(): void {
    const events = [
      'text', 'thinking', 'tool_use', 'tool_result',
      'result', 'system', 'usage', 'permission_mode_changed', 'control_response'
    ] as const;
    for (const eventName of events) {
      this.processor.on(eventName, (data: unknown) => {
        this.emit(eventName, data as never);
      });
    }
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get permissionMode(): ClaudePermissionMode {
    return this.processor.permissionMode;
  }

  /**
   * Generate a unique request ID for control requests.
   */
  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Send a control_request message to Claude Code via PTY.
   * This is the format used by the Claude Agent SDK for runtime configuration changes.
   * @param request The control request payload (e.g., { subtype: 'set_permission_mode', mode: 'plan' })
   * @returns The request ID if sent successfully, null if no PTY available
   */
  sendControlRequest(request: { subtype: string; [key: string]: unknown }): string | null {
    if (!this.ptyProcess || !this._isRunning) {
      console.log('[PodmanClaudeRunner] Cannot send control_request: no PTY available');
      return null;
    }

    const requestId = this.generateRequestId();
    const controlRequest = {
      type: 'control_request',
      request_id: requestId,
      request,
    };

    console.log('[PodmanClaudeRunner] Sending control_request via PTY:', JSON.stringify(controlRequest));
    this.ptyProcess.write(JSON.stringify(controlRequest) + '\n');
    return requestId;
  }

  /**
   * Request permission mode change by sending control_request to Claude Code.
   * The actual mode change is confirmed via control_response event.
   * @param targetMode The desired permission mode
   * @returns true if control_request was sent, false if already at target or no PTY
   */
  requestPermissionModeChange(targetMode: ClaudePermissionMode): boolean {
    if (this.processor.permissionMode === targetMode) {
      return false;
    }

    const requestId = this.sendControlRequest({
      subtype: 'set_permission_mode',
      mode: targetMode,
    });

    if (requestId) {
      console.log(`[PodmanClaudeRunner] Requested permission mode change to ${targetMode} (request_id: ${requestId})`);
      return true;
    }

    return false;
  }

  /**
   * Update permission mode from Claude Code's system event.
   */
  updatePermissionMode(mode: string): void {
    this.processor.updatePermissionMode(mode);
  }

  /**
   * Start Claude Code inside a Podman container.
   * If containerId is provided (exec mode), runs in existing container via podman exec.
   * Otherwise (run mode), starts a new container via podman run.
   */
  start(prompt: string, options: StartOptions = {}): void {
    // Reset processor state for new session
    this.processor.resetBuffer();
    if (options.permissionMode) {
      this.processor.setInitialPermissionMode(options.permissionMode);
    }

    if (this.options.containerId) {
      // Exec mode: run Claude in existing container (Issue #78: same-container mode)
      this.startExecMode(prompt, options);
    } else {
      // Run mode: start new container
      this.startRunMode(prompt, options);
    }
  }

  /**
   * Start Claude using podman exec in an existing container.
   * This allows Claude to share localhost with browser bridge.
   */
  private startExecMode(prompt: string, options: StartOptions = {}): void {
    // Build environment variables to pass via -e flags
    const envArgs: string[] = [];

    // Pass ANTHROPIC_API_KEY to container
    if (process.env.ANTHROPIC_API_KEY) {
      envArgs.push('-e', `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
    }

    if (options.thinkingEnabled) {
      envArgs.push('-e', 'MAX_THINKING_TOKENS=31999');
      console.log('[PodmanClaudeRunner] Extended thinking enabled');
    }

    // Build podman exec arguments
    const claudeArgs = this.buildClaudeArgs(prompt, options);
    const podmanArgs = [
      'exec',
      '-it',
      ...envArgs,
      this.options.containerId!,
      this.options.claudePath!,
      ...claudeArgs,
    ];

    console.log('[PodmanClaudeRunner] Starting (exec mode):', 'podman', podmanArgs.join(' '));

    // Spawn podman exec with PTY
    this.ptyProcess = pty.spawn('podman', podmanArgs, {
      name: 'xterm-color',
      cols: 200,
      rows: 50,
      env: process.env as Record<string, string>,
    });

    console.log('[PodmanClaudeRunner] Exec started with PID:', this.ptyProcess.pid);

    this._isRunning = true;
    this.emit('started', { pid: this.ptyProcess.pid });

    this.ptyProcess.onData((data: string) => {
      this.processor.handleData(data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      console.log('[PodmanClaudeRunner] Exec exited:', exitCode, signal);
      this._isRunning = false;
      this.emit('exit', { code: exitCode, signal: signal !== undefined ? String(signal) : null });
    });

    // Send initial user message via stream-json format
    const userMessage = this.buildUserMessage(prompt);
    this.ptyProcess.write(userMessage + '\n');
    console.log('[PodmanClaudeRunner] Initial message sent via PTY');
  }

  /**
   * Start Claude in a new container using podman run.
   * This is the traditional mode where each Claude invocation gets a new container.
   */
  private startRunMode(prompt: string, options: StartOptions = {}): void {
    // Build environment variables to pass to container
    // Include Git environment variables from host config
    const env: Record<string, string> = {
      ...getGitEnvVars(),
    };

    // Pass ANTHROPIC_API_KEY to container
    if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }

    if (options.thinkingEnabled) {
      env.MAX_THINKING_TOKENS = '31999';
      console.log('[PodmanClaudeRunner] Extended thinking enabled');
    }

    // Clone container config to add MCP-related mounts if needed
    const containerConfig = {
      ...this.options.containerConfig,
      extraMounts: [...this.options.containerConfig.extraMounts],
      extraArgs: [...this.options.containerConfig.extraArgs],
    };

    // Mount MCP config directory and use host network for MCP server communication
    if (this.options.mcpConfigPath) {
      const mcpDir = this.options.mcpConfigPath.substring(0, this.options.mcpConfigPath.lastIndexOf('/'));
      containerConfig.extraMounts.push({
        source: mcpDir,
        target: mcpDir, // Use same path inside container for simplicity
        options: 'ro',
      });

      // Mount the mcp-server directory (needed because MCP config references host path)
      // Find mcp-server directory from the config file content
      const mcpServerDir = process.cwd().includes('packages/server')
        ? process.cwd().replace('/packages/server', '/packages/mcp-server')
        : `${process.cwd()}/packages/mcp-server`;
      const projectRoot = process.cwd().includes('packages/server')
        ? process.cwd().replace('/packages/server', '')
        : process.cwd();

      // Mount the entire project so mcp-server paths work
      containerConfig.extraMounts.push({
        source: projectRoot,
        target: projectRoot,
        options: 'ro',
      });

      // Use host network so localhost works for WebSocket connection
      containerConfig.extraArgs.push('--network=host');
    }

    // Build podman run arguments
    const podmanArgs = buildPodmanArgs(
      containerConfig,
      this.options.workingDir!,
      env
    );

    // Add claude command and its arguments after the image
    const claudeArgs = this.buildClaudeArgs(prompt, options);
    podmanArgs.push(this.options.claudePath!, ...claudeArgs);

    console.log('[PodmanClaudeRunner] Starting:', 'podman', podmanArgs.join(' '));

    // Spawn podman with PTY
    this.ptyProcess = pty.spawn('podman', podmanArgs, {
      name: 'xterm-color',
      cols: 200,
      rows: 50,
      // cwd is not used since we're running in container
      env: process.env as Record<string, string>,
    });

    console.log('[PodmanClaudeRunner] Container started with PID:', this.ptyProcess.pid);

    this._isRunning = true;
    this.emit('started', { pid: this.ptyProcess.pid });

    this.ptyProcess.onData((data: string) => {
      this.processor.handleData(data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      console.log('[PodmanClaudeRunner] Container exited:', exitCode, signal);
      this._isRunning = false;
      this.emit('exit', { code: exitCode, signal: signal !== undefined ? String(signal) : null });
    });

    // Send initial user message via stream-json format
    const userMessage = this.buildUserMessage(prompt);
    this.ptyProcess.write(userMessage + '\n');
    console.log('[PodmanClaudeRunner] Initial message sent via PTY');
  }

  /**
   * Build Claude CLI arguments.
   */
  private buildClaudeArgs(prompt: string, options: StartOptions): string[] {
    const args: string[] = [];

    // Use stream-json input/output format for multi-turn support
    // Empty prompt via -p, actual message sent via stdin
    args.push('-p', '');
    args.push('--input-format', 'stream-json');
    args.push('--output-format', 'stream-json', '--verbose');

    // Resume session
    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    // Permission mode
    if (options.permissionMode) {
      args.push('--permission-mode', options.permissionMode);
    }

    // MCP config (if available inside container)
    if (this.options.mcpConfigPath && this.options.permissionToolName) {
      args.push('--permission-prompt-tool', this.options.permissionToolName);
      args.push('--mcp-config', this.options.mcpConfigPath);
      // Disable Playwright plugin to avoid conflicts
      args.push('--settings', JSON.stringify({
        enabledPlugins: { 'playwright@claude-plugins-official': false },
      }));
    }

    // Allowed/disallowed tools (validate before using)
    if (options.allowedTools && options.allowedTools.length > 0) {
      validateToolNames(options.allowedTools);
      args.push('--allowedTools', options.allowedTools.join(','));
    }
    if (options.disallowedTools && options.disallowedTools.length > 0) {
      validateToolNames(options.disallowedTools);
      args.push('--disallowedTools', options.disallowedTools.join(','));
    }

    return args;
  }

  /**
   * Stop the container.
   */
  stop(): void {
    if (this.ptyProcess) {
      console.log('[PodmanClaudeRunner] Stopping container');
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  /**
   * Send input to the running container.
   */
  sendInput(input: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(input);
    }
  }

  /**
   * Build a user message in stream-json format.
   */
  private buildUserMessage(text: string): string {
    return JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text }],
      },
    });
  }

  /**
   * Send a follow-up user message via PTY in stream-json format.
   * This allows multi-turn conversations in container mode.
   * @returns true if message was sent, false if PTY is not available
   */
  sendUserMessage(text: string): boolean {
    if (!this.ptyProcess || !this._isRunning) {
      console.log('[PodmanClaudeRunner] Cannot send user message: PTY not available');
      return false;
    }

    const userMessage = this.buildUserMessage(text);
    this.ptyProcess.write(userMessage + '\n');
    console.log('[PodmanClaudeRunner] Follow-up message sent via PTY');
    return true;
  }

  // Event typing
  on<K extends keyof ClaudeRunnerEvents>(event: K, listener: ClaudeRunnerEvents[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ClaudeRunnerEvents>(event: K, ...args: Parameters<ClaudeRunnerEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}
