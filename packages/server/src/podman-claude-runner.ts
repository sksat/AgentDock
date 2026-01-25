/**
 * PodmanClaudeRunner - Runs Claude Code inside a Podman container.
 *
 * This runner implements the IClaudeRunner interface and spawns Claude Code
 * inside a rootless Podman container for isolation.
 */

import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { StreamEvent } from './stream-parser.js';
import {
  ClaudeRunnerEvents,
  ClaudePermissionMode,
  StartOptions,
} from './claude-runner.js';
import { ContainerConfig, buildPodmanArgs, getGitEnvVars } from './container-config.js';

// Permission mode cycle order (Shift+Tab cycles through these)
const PERMISSION_MODE_ORDER: ClaudePermissionMode[] = ['default', 'acceptEdits', 'plan'];

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
  private buffer: string = '';
  private _isRunning: boolean = false;
  private _permissionMode: ClaudePermissionMode = 'default';

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
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get permissionMode(): ClaudePermissionMode {
    return this._permissionMode;
  }

  /**
   * Request permission mode change by sending Shift+Tab to Claude Code.
   */
  requestPermissionModeChange(targetMode: ClaudePermissionMode): boolean {
    if (this._permissionMode === targetMode) {
      return false;
    }

    if (!this.ptyProcess) {
      console.log('[PodmanClaudeRunner] Cannot change permission mode: no PTY process');
      return false;
    }

    const currentIndex = PERMISSION_MODE_ORDER.indexOf(this._permissionMode);
    const targetIndex = PERMISSION_MODE_ORDER.indexOf(targetMode);

    if (currentIndex === -1 || targetIndex === -1) {
      console.log('[PodmanClaudeRunner] Invalid permission mode');
      return false;
    }

    let steps = targetIndex - currentIndex;
    if (steps <= 0) {
      steps += PERMISSION_MODE_ORDER.length;
    }

    console.log(`[PodmanClaudeRunner] Sending ${steps} Shift+Tab(s) to change mode from ${this._permissionMode} to ${targetMode}`);

    for (let i = 0; i < steps; i++) {
      this.ptyProcess.write('\x1b[Z');
    }

    return true;
  }

  /**
   * Update permission mode from Claude Code's system event.
   */
  updatePermissionMode(mode: string): void {
    const validMode = this.parsePermissionMode(mode);
    if (validMode && validMode !== this._permissionMode) {
      const oldMode = this._permissionMode;
      this._permissionMode = validMode;
      console.log(`[PodmanClaudeRunner] Permission mode changed: ${oldMode} -> ${validMode}`);
      this.emit('permission_mode_changed', { permissionMode: validMode });
    }
  }

  private parsePermissionMode(mode: string): ClaudePermissionMode | null {
    if (mode === 'default' || mode === 'acceptEdits' || mode === 'plan') {
      return mode;
    }
    if (mode === 'normal' || mode === 'ask') {
      return 'default';
    }
    if (mode === 'auto-edit' || mode === 'autoEdit') {
      return 'acceptEdits';
    }
    console.log(`[PodmanClaudeRunner] Unknown permission mode: ${mode}`);
    return null;
  }

  /**
   * Start Claude Code inside a Podman container.
   * If containerId is provided (exec mode), runs in existing container via podman exec.
   * Otherwise (run mode), starts a new container via podman run.
   */
  start(prompt: string, options: StartOptions = {}): void {
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
      this.handleStdout(data);
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
      this.handleStdout(data);
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
   * Handle stdout data from the container.
   */
  private handleStdout(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      // Filter out ANSI escape sequences and control characters
      const cleanLine = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\r/g, '');
      if (cleanLine && cleanLine.startsWith('{')) {
        this.parseLine(cleanLine);
      }
    }
  }

  /**
   * Parse a single line of stream-json output.
   */
  private parseLine(line: string): void {
    try {
      const event = JSON.parse(line) as StreamEvent;
      this.processEvent(event);
    } catch {
      // Ignore non-JSON lines (container startup messages, etc.)
    }
  }

  /**
   * Process a parsed stream-json event.
   */
  private processEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'system':
        if (event.permissionMode) {
          this.updatePermissionMode(event.permissionMode);
        }
        this.emit('system', {
          subtype: event.subtype,
          sessionId: event.session_id,
          tools: event.tools,
          model: event.model,
          permissionMode: event.permissionMode,
          cwd: event.cwd,
        });
        break;

      case 'assistant':
        this.processAssistantMessage(event);
        break;

      case 'user':
        this.processUserMessage(event);
        break;

      case 'result':
        this.emit('result', {
          result: event.result,
          sessionId: event.session_id,
        });
        break;
    }
  }

  /**
   * Process an assistant message event.
   */
  private processAssistantMessage(event: StreamEvent): void {
    if (event.type !== 'assistant') return;
    if (!event.message?.content) return;

    for (const block of event.message.content) {
      if (block.type === 'text') {
        this.emit('text', { text: block.text });
      } else if (block.type === 'thinking') {
        this.emit('thinking', { thinking: block.thinking });
      } else if (block.type === 'tool_use') {
        this.emit('tool_use', {
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    // Emit usage info if available
    if (event.message.usage) {
      this.emit('usage', {
        inputTokens: event.message.usage.input_tokens,
        outputTokens: event.message.usage.output_tokens,
        cacheCreationInputTokens: event.message.usage.cache_creation_input_tokens,
        cacheReadInputTokens: event.message.usage.cache_read_input_tokens,
      });
    }
  }

  /**
   * Process a user message event (for tool results).
   */
  private processUserMessage(event: StreamEvent): void {
    if (event.type !== 'user') return;
    if (!event.message?.content) return;
    if (typeof event.message.content === 'string') return;

    for (const block of event.message.content) {
      if (block.type === 'tool_result') {
        this.emit('tool_result', {
          toolUseId: block.tool_use_id,
          content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          isError: block.is_error ?? false,
        });
      }
    }
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
