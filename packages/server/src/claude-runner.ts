import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { spawn, ChildProcess } from 'child_process';
import { StreamJsonParser, StreamEvent, type ResultModelUsage } from './stream-parser.js';

// Permission mode as reported by Claude Code's system event
// Maps to: 'default' -> ask, 'acceptEdits' -> auto-edit, 'plan' -> plan
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'plan';

// Permission mode cycle order (Shift+Tab cycles through these)
const PERMISSION_MODE_ORDER: ClaudePermissionMode[] = ['default', 'acceptEdits', 'plan'];

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

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
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
}

export class ClaudeRunner extends EventEmitter {
  private options: ClaudeRunnerOptions;
  private ptyProcess: IPty | null = null;
  private childProcess: ChildProcess | null = null;
  private parser: StreamJsonParser;
  private buffer: string = '';
  private _isRunning: boolean = false;
  private _permissionMode: ClaudePermissionMode = 'default';

  constructor(options: ClaudeRunnerOptions = {}) {
    super();
    this.options = {
      workingDir: options.workingDir ?? process.cwd(),
      claudePath: options.claudePath ?? 'claude',
      mcpConfigPath: options.mcpConfigPath,
      permissionToolName: options.permissionToolName,
    };
    this.parser = new StreamJsonParser();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get permissionMode(): ClaudePermissionMode {
    return this._permissionMode;
  }

  /**
   * Request permission mode change by sending Shift+Tab to Claude Code.
   * The actual mode change is confirmed via system event response.
   * @param targetMode The desired permission mode
   * @returns true if Shift+Tab was sent, false if already at target or no PTY
   */
  requestPermissionModeChange(targetMode: ClaudePermissionMode): boolean {
    if (this._permissionMode === targetMode) {
      return false;
    }

    if (!this.ptyProcess) {
      console.log('[ClaudeRunner] Cannot change permission mode: no PTY process');
      return false;
    }

    // Calculate how many Shift+Tab presses needed
    const currentIndex = PERMISSION_MODE_ORDER.indexOf(this._permissionMode);
    const targetIndex = PERMISSION_MODE_ORDER.indexOf(targetMode);

    if (currentIndex === -1 || targetIndex === -1) {
      console.log('[ClaudeRunner] Invalid permission mode');
      return false;
    }

    // Calculate steps (cycle forward only)
    let steps = targetIndex - currentIndex;
    if (steps <= 0) {
      steps += PERMISSION_MODE_ORDER.length;
    }

    console.log(`[ClaudeRunner] Sending ${steps} Shift+Tab(s) to change mode from ${this._permissionMode} to ${targetMode}`);

    // Send Shift+Tab (escape sequence: \x1b[Z)
    for (let i = 0; i < steps; i++) {
      this.ptyProcess.write('\x1b[Z');
    }

    return true;
  }

  /**
   * Update permission mode from Claude Code's system event.
   * This is called when we receive a system event with permissionMode.
   */
  updatePermissionMode(mode: string): void {
    const validMode = this.parsePermissionMode(mode);
    if (validMode && validMode !== this._permissionMode) {
      const oldMode = this._permissionMode;
      this._permissionMode = validMode;
      console.log(`[ClaudeRunner] Permission mode changed: ${oldMode} -> ${validMode}`);
      this.emit('permission_mode_changed', { permissionMode: validMode });
    }
  }

  /**
   * Parse permission mode string from Claude Code to our type
   */
  private parsePermissionMode(mode: string): ClaudePermissionMode | null {
    if (mode === 'default' || mode === 'acceptEdits' || mode === 'plan') {
      return mode;
    }
    // Handle possible variations
    if (mode === 'normal' || mode === 'ask') {
      return 'default';
    }
    if (mode === 'auto-edit' || mode === 'autoEdit') {
      return 'acceptEdits';
    }
    console.log(`[ClaudeRunner] Unknown permission mode: ${mode}`);
    return null;
  }

  start(prompt: string, options: StartOptions = {}): void {
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

    if (hasImages) {
      // Use child_process.spawn with pipes for image messages
      // This allows us to write stdin before the process reads it
      this.startWithPipes(prompt, args, options.images!, env);
    } else {
      // Use PTY for regular messages (supports interactive features)
      this.startWithPty(prompt, args, env);
    }
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
      this.handleStdout(data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      console.log('[ClaudeRunner] PTY process exited:', exitCode, signal);
      this._isRunning = false;
      this.emit('exit', { code: exitCode, signal: signal !== undefined ? String(signal) : null });
    });
  }

  private startWithPipes(prompt: string, args: string[], images: ImageContent[], env: Record<string, string>): void {
    console.log('[ClaudeRunner] Starting with pipes for image:', this.options.claudePath, args.join(' '));
    console.log('[ClaudeRunner] Images attached:', images.length);

    // Build the user message with images
    const userMessage = this.buildUserMessageWithImages(prompt, images);

    this.childProcess = spawn(this.options.claudePath!, args, {
      cwd: this.options.workingDir,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('[ClaudeRunner] Child process started with PID:', this.childProcess.pid);

    // Write the image message to stdin immediately, then close stdin
    if (this.childProcess.stdin) {
      this.childProcess.stdin.write(userMessage + '\n');
      this.childProcess.stdin.end();
      console.log('[ClaudeRunner] Image message written to stdin');
    }

    this._isRunning = true;
    this.emit('started', { pid: this.childProcess.pid ?? 0 });

    // Handle stdout
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (data: Buffer) => {
        this.handleStdout(data.toString());
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

  private buildArgs(prompt: string, options: StartOptions): string[] {
    const hasImages = options.images && options.images.length > 0;

    // When images are present, use stream-json input format with empty prompt
    // The actual content (including images) is sent via stdin using pipes
    const args: string[] = hasImages
      ? ['-p', '', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']
      : ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

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
      // Also set internal state
      this._permissionMode = options.permissionMode;
    }

    return args;
  }

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

  private parseLine(line: string): void {
    try {
      const event = JSON.parse(line) as StreamEvent;
      // Debug: uncomment to log thinking events for streaming investigation
      // if (event.type === 'assistant' && event.message?.content) {
      //   const hasThinking = event.message.content.some((b) => b.type === 'thinking');
      //   if (hasThinking) {
      //     const thinkingBlocks = event.message.content.filter((b) => b.type === 'thinking');
      //     console.log('[ClaudeRunner] Thinking event received:', {
      //       blockCount: thinkingBlocks.length,
      //       lengths: thinkingBlocks.map((b) => (b as { thinking: string }).thinking.length),
      //     });
      //   }
      // }
      this.processEvent(event);
    } catch {
      // Ignore non-JSON lines (likely terminal control sequences)
    }
  }

  private processEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'system':
        // Update internal permission mode state from Claude Code
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
          modelUsage: event.modelUsage,
        });
        break;
    }
  }

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
