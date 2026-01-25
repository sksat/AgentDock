import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { spawn, ChildProcess } from 'child_process';
import { type ResultModelUsage } from './stream-parser.js';
import { ClaudeStreamProcessor, ClaudePermissionMode, UsageData, ControlResponse } from './claude-stream-processor.js';

// Re-export for backward compatibility
export { ClaudePermissionMode, UsageData, ControlResponse } from './claude-stream-processor.js';

export interface ClaudeRunnerOptions {
  workingDir?: string;
  claudePath?: string;
  mcpConfigPath?: string;
  permissionToolName?: string;
  /**
   * Bridge port for browser-in-container mode (Issue #78).
   * Used to configure the browser bridge's listening port.
   */
  bridgePort?: number;
  /**
   * Container ID for exec mode (Issue #78: same-container mode).
   * If provided, uses `podman exec` on this container instead of `podman run`.
   */
  containerId?: string;
}

export interface ImageContent {
  type: 'image';
  data: string; // base64 encoded image data
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface StartOptions {
  sessionId?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  images?: ImageContent[];
  /** Enable extended thinking mode */
  thinkingEnabled?: boolean;
  /** Permission mode to use for the session */
  permissionMode?: ClaudePermissionMode;
}

export interface ClaudeRunnerEvents {
  started: (data: { pid: number }) => void;
  text: (data: { text: string }) => void;
  thinking: (data: { thinking: string }) => void;
  tool_use: (data: { id: string; name: string; input: unknown }) => void;
  tool_result: (data: { toolUseId: string; content: string; isError: boolean }) => void;
  result: (data: { result: string; sessionId?: string; modelUsage?: Record<string, ResultModelUsage> }) => void;
  system: (data: { subtype?: string; sessionId?: string; tools?: string[]; model?: string; permissionMode?: string; cwd?: string }) => void;
  usage: (data: UsageData) => void;
  error: (data: { type: 'stderr' | 'process' | 'parse'; message: string; error?: Error }) => void;
  exit: (data: { code: number | null; signal: string | null }) => void;
  /** Permission request for mock runner */
  permission_request: (data: { requestId: string; toolName: string; input: unknown }) => void;
  /** Permission mode changed (from Claude Code's system event) */
  permission_mode_changed: (data: { permissionMode: ClaudePermissionMode }) => void;
  /** Control response received */
  control_response: (data: ControlResponse) => void;
}

export class ClaudeRunner extends EventEmitter {
  private options: ClaudeRunnerOptions;
  private ptyProcess: IPty | null = null;
  private childProcess: ChildProcess | null = null;
  private processor: ClaudeStreamProcessor;
  private _isRunning: boolean = false;

  constructor(options: ClaudeRunnerOptions = {}) {
    super();
    this.options = {
      workingDir: options.workingDir ?? process.cwd(),
      claudePath: options.claudePath ?? 'claude',
      mcpConfigPath: options.mcpConfigPath,
      permissionToolName: options.permissionToolName,
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
   * Generate a unique request ID for control requests
   */
  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Send a control_request message to Claude Code via stdin.
   * This is the format used by the Claude Agent SDK for runtime configuration changes.
   * @param request The control request payload (e.g., { subtype: 'set_permission_mode', mode: 'plan' })
   * @returns The request ID if sent successfully, null if no stdin available
   */
  sendControlRequest(request: { subtype: string; [key: string]: unknown }): string | null {
    // Prefer childProcess stdin (pipes mode) over PTY
    const stdin = this.childProcess?.stdin;
    if (!stdin || stdin.writableEnded) {
      // Fallback to PTY if available (less reliable for control_request)
      if (this.ptyProcess) {
        const requestId = this.generateRequestId();
        const controlRequest = {
          type: 'control_request',
          request_id: requestId,
          request,
        };
        console.log('[ClaudeRunner] Sending control_request via PTY:', JSON.stringify(controlRequest));
        this.ptyProcess.write(JSON.stringify(controlRequest) + '\n');
        return requestId;
      }
      console.log('[ClaudeRunner] Cannot send control_request: no stdin available');
      return null;
    }

    const requestId = this.generateRequestId();
    const controlRequest = {
      type: 'control_request',
      request_id: requestId,
      request,
    };

    console.log('[ClaudeRunner] Sending control_request:', JSON.stringify(controlRequest));
    stdin.write(JSON.stringify(controlRequest) + '\n');
    return requestId;
  }

  /**
   * Request permission mode change by sending control_request to Claude Code.
   * The actual mode change is confirmed via control_response event.
   * @param targetMode The desired permission mode
   * @returns true if control_request was sent, false if already at target or no stdin
   */
  requestPermissionModeChange(targetMode: ClaudePermissionMode): boolean {
    if (this.processor.permissionMode === targetMode) {
      return false;
    }

    const requestId = this.sendControlRequest({
      subtype: 'set_permission_mode',
      mode: targetMode,
    });

    if (!requestId) {
      // Fallback to Shift+Tab for PTY mode (legacy behavior)
      if (this.ptyProcess) {
        console.log('[ClaudeRunner] Falling back to Shift+Tab for permission mode change');
        return this.processor.requestPermissionModeChange(
          targetMode,
          (data) => this.ptyProcess!.write(data)
        );
      }
      return false;
    }

    return true;
  }

  /**
   * Update permission mode from Claude Code's system event.
   * This is called when we receive a system event with permissionMode.
   */
  updatePermissionMode(mode: string): void {
    this.processor.updatePermissionMode(mode);
  }

  start(prompt: string, options: StartOptions = {}): void {
    // Reset processor state for new session
    this.processor.resetBuffer();
    if (options.permissionMode) {
      this.processor.setInitialPermissionMode(options.permissionMode);
    }

    const args = this.buildArgs(prompt, options);
    const hasImages = options.images && options.images.length > 0;

    // Build environment with optional thinking tokens
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
    };
    if (options.thinkingEnabled) {
      env.MAX_THINKING_TOKENS = '31999';
      console.log('[ClaudeRunner] Extended thinking enabled with MAX_THINKING_TOKENS=31999');
    }

    // Always use pipes mode for stream-json input to support control_request
    // This enables runtime configuration changes like permission mode updates
    this.startWithPipes(prompt, args, hasImages ? options.images! : undefined, env);
  }

  private startWithPty(prompt: string, args: string[], env: Record<string, string>): void {
    console.log('[ClaudeRunner] Starting with PTY:', this.options.claudePath, args.join(' '));

    this.ptyProcess = pty.spawn(this.options.claudePath!, args, {
      name: 'xterm-color',
      cols: 200,
      rows: 50,
      cwd: this.options.workingDir,
      env,
    });

    console.log('[ClaudeRunner] PTY process started with PID:', this.ptyProcess.pid);

    this._isRunning = true;
    this.emit('started', { pid: this.ptyProcess.pid });

    this.ptyProcess.onData((data: string) => {
      this.processor.handleData(data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      console.log('[ClaudeRunner] PTY process exited:', exitCode, signal);
      this._isRunning = false;
      this.emit('exit', { code: exitCode, signal: signal !== undefined ? String(signal) : null });
    });
  }

  private startWithPipes(prompt: string, args: string[], images: ImageContent[] | undefined, env: Record<string, string>): void {
    const hasImages = images && images.length > 0;
    console.log('[ClaudeRunner] Starting with pipes:', this.options.claudePath, args.join(' '));
    if (hasImages) {
      console.log('[ClaudeRunner] Images attached:', images.length);
    }

    // Build the user message
    const userMessage = hasImages
      ? this.buildUserMessageWithImages(prompt, images)
      : this.buildUserMessage(prompt);

    this.childProcess = spawn(this.options.claudePath!, args, {
      cwd: this.options.workingDir,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('[ClaudeRunner] Child process started with PID:', this.childProcess.pid);

    // Write the user message to stdin
    // DO NOT close stdin - keep it open for control_request messages
    if (this.childProcess.stdin) {
      this.childProcess.stdin.write(userMessage + '\n');
      console.log('[ClaudeRunner] User message written to stdin (keeping stdin open for control_request)');
    }

    this._isRunning = true;
    this.emit('started', { pid: this.childProcess.pid ?? 0 });

    // Handle stdout
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (data: Buffer) => {
        this.processor.handleData(data.toString());
      });
    }

    // Handle stderr (log but don't crash)
    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (data: Buffer) => {
        console.error('[ClaudeRunner] stderr:', data.toString());
      });
    }

    // Handle exit
    this.childProcess.on('exit', (code, signal) => {
      console.log('[ClaudeRunner] Child process exited:', code, signal);
      this._isRunning = false;
      this.emit('exit', { code, signal: signal ?? null });
    });

    this.childProcess.on('error', (error) => {
      console.error('[ClaudeRunner] Child process error:', error);
      this._isRunning = false;
      this.emit('error', { type: 'process', message: error.message, error });
    });
  }

  /**
   * Build a stream-json user message with text only
   */
  private buildUserMessage(prompt: string): string {
    const message = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    };
    return JSON.stringify(message);
  }

  /**
   * Build a stream-json user message with images
   */
  private buildUserMessageWithImages(prompt: string, images: ImageContent[]): string {
    const content: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [];

    // Add images first
    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType,
          data: img.data,
        },
      });
    }

    // Add text prompt
    if (prompt) {
      content.push({
        type: 'text',
        text: prompt,
      });
    }

    const message = {
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    };

    return JSON.stringify(message);
  }

  stop(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    }
    if (this.childProcess) {
      this.childProcess.kill();
    }
  }

  sendInput(input: string): void {
    if (this.ptyProcess) {
      console.log(`[ClaudeRunner] Sending input to PTY: ${input}`);
      this.ptyProcess.write(input + '\n');
    } else {
      console.log('[ClaudeRunner] sendInput called but no PTY process (child process mode)');
    }
    // Note: sendInput is not supported for child process mode (image messages)
    // as stdin is closed after sending the image
  }

  /**
   * Send a follow-up user message via stdin (for multi-turn conversations).
   * This allows continuing the conversation without restarting Claude.
   * @param text The user message text
   * @returns true if message was sent, false if stdin is not available
   */
  sendUserMessage(text: string): boolean {
    const stdin = this.childProcess?.stdin;
    if (!stdin || stdin.writableEnded) {
      console.log('[ClaudeRunner] Cannot send user message: no stdin available');
      return false;
    }

    const userMessage = this.buildUserMessage(text);
    console.log('[ClaudeRunner] Sending follow-up user message via stdin');
    stdin.write(userMessage + '\n');
    return true;
  }

  private buildArgs(prompt: string, options: StartOptions): string[] {
    const hasImages = options.images && options.images.length > 0;

    // Always use stream-json input format to support control_request messages
    // This enables runtime configuration changes like permission mode updates
    // The actual content is sent via stdin
    const args: string[] = hasImages
      ? ['-p', '', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']
      : ['-p', '', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    if (this.options.mcpConfigPath && this.options.permissionToolName) {
      args.push('--permission-prompt-tool', this.options.permissionToolName);
      args.push('--mcp-config', this.options.mcpConfigPath);
      // Disable Playwright plugin to avoid conflict with AgentDock's built-in browser
      // Other plugins (like frontend-design) remain enabled
      args.push('--settings', JSON.stringify({
        enabledPlugins: {
          'playwright@claude-plugins-official': false,
        },
      }));
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    if (options.disallowedTools && options.disallowedTools.length > 0) {
      args.push('--disallowedTools', options.disallowedTools.join(','));
    }

    // Set permission mode at startup
    if (options.permissionMode) {
      args.push('--permission-mode', options.permissionMode);
    }

    return args;
  }

  // Type-safe event emitter methods
  override on<K extends keyof ClaudeRunnerEvents>(
    event: K,
    listener: ClaudeRunnerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof ClaudeRunnerEvents>(
    event: K,
    ...args: Parameters<ClaudeRunnerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
