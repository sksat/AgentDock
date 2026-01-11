import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { StreamJsonParser, StreamEvent } from './stream-parser.js';

export interface ClaudeRunnerOptions {
  workingDir?: string;
  claudePath?: string;
  mcpConfigPath?: string;
  permissionToolName?: string;
}

export interface StartOptions {
  sessionId?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface ClaudeRunnerEvents {
  started: (data: { pid: number }) => void;
  text: (data: { text: string }) => void;
  thinking: (data: { thinking: string }) => void;
  tool_use: (data: { id: string; name: string; input: unknown }) => void;
  tool_result: (data: { toolUseId: string; content: string; isError: boolean }) => void;
  result: (data: { result: string; sessionId?: string }) => void;
  system: (data: { subtype?: string; sessionId?: string; tools?: string[] }) => void;
  error: (data: { type: 'stderr' | 'process' | 'parse'; message: string; error?: Error }) => void;
  exit: (data: { code: number | null; signal: string | null }) => void;
}

export class ClaudeRunner extends EventEmitter {
  private options: ClaudeRunnerOptions;
  private ptyProcess: IPty | null = null;
  private parser: StreamJsonParser;
  private buffer: string = '';
  private _isRunning: boolean = false;

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

  start(prompt: string, options: StartOptions = {}): void {
    const args = this.buildArgs(prompt, options);

    console.log('[ClaudeRunner] Starting with PTY:', this.options.claudePath, args.join(' '));

    this.ptyProcess = pty.spawn(this.options.claudePath!, args, {
      name: 'xterm-color',
      cols: 200,
      rows: 50,
      cwd: this.options.workingDir,
      env: process.env as { [key: string]: string },
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

  stop(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    }
  }

  sendInput(input: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(input + '\n');
    }
  }

  private buildArgs(prompt: string, options: StartOptions): string[] {
    const args: string[] = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    if (this.options.mcpConfigPath && this.options.permissionToolName) {
      args.push('--permission-prompt-tool', this.options.permissionToolName);
      args.push('--mcp-config', this.options.mcpConfigPath);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    if (options.disallowedTools && options.disallowedTools.length > 0) {
      args.push('--disallowedTools', options.disallowedTools.join(','));
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
      this.processEvent(event);
    } catch {
      // Ignore non-JSON lines (likely terminal control sequences)
    }
  }

  private processEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'system':
        this.emit('system', {
          subtype: event.subtype,
          sessionId: event.session_id,
          tools: event.tools,
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
