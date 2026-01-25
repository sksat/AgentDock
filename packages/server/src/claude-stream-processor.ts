/**
 * ClaudeStreamProcessor - Processes Claude Code's stream-json output.
 *
 * This class handles:
 * - Stream buffering and JSON line parsing
 * - Event emission (text, thinking, tool_use, tool_result, etc.)
 * - Permission mode state management
 *
 * Used by ClaudeRunner and PodmanClaudeRunner via composition.
 */

import { EventEmitter } from 'events';
import type { StreamEvent, ResultModelUsage } from './stream-parser.js';

// Permission mode as reported by Claude Code's system event
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'plan';

// Permission mode cycle order (Shift+Tab cycles through these)
const PERMISSION_MODE_ORDER: ClaudePermissionMode[] = ['default', 'acceptEdits', 'plan'];

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface ControlResponse {
  subtype: 'success' | 'error';
  request_id: string;
  response?: { mode?: ClaudePermissionMode };
  error?: string;
}

export interface ClaudeStreamProcessorEvents {
  text: (data: { text: string }) => void;
  thinking: (data: { thinking: string }) => void;
  tool_use: (data: { id: string; name: string; input: unknown }) => void;
  tool_result: (data: { toolUseId: string; content: string; isError: boolean }) => void;
  result: (data: { result: string; sessionId?: string; modelUsage?: Record<string, ResultModelUsage> }) => void;
  system: (data: { subtype?: string; sessionId?: string; tools?: string[]; model?: string; permissionMode?: string; cwd?: string }) => void;
  usage: (data: UsageData) => void;
  permission_mode_changed: (data: { permissionMode: ClaudePermissionMode }) => void;
  control_response: (data: ControlResponse) => void;
}

export class ClaudeStreamProcessor extends EventEmitter {
  private buffer: string = '';
  private _permissionMode: ClaudePermissionMode = 'default';

  get permissionMode(): ClaudePermissionMode {
    return this._permissionMode;
  }

  /**
   * Set initial permission mode (called from runner's start method).
   */
  setInitialPermissionMode(mode: ClaudePermissionMode): void {
    this._permissionMode = mode;
  }

  /**
   * Reset buffer (called on runner start).
   */
  resetBuffer(): void {
    this.buffer = '';
  }

  /**
   * Handle incoming stream data from PTY or child process stdout.
   * Buffers partial lines and processes complete JSON lines.
   */
  handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      // Filter out ANSI escape sequences and control characters
      const cleanLine = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\r/g, '');
      if (cleanLine && cleanLine.startsWith('{')) {
        this.processLine(cleanLine);
      }
    }
  }

  private processLine(line: string): void {
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

      case 'control_response':
        this.processControlResponse(event);
        break;
    }
  }

  private processControlResponse(event: StreamEvent): void {
    if (event.type !== 'control_response') return;

    const response = event.response;
    console.log('[ClaudeStreamProcessor] Control response received:', JSON.stringify(response));

    // Update permission mode if this was a set_permission_mode response
    if (response.subtype === 'success' && response.response?.mode) {
      this.updatePermissionMode(response.response.mode);
    }

    this.emit('control_response', {
      subtype: response.subtype,
      request_id: response.request_id,
      response: response.response as { mode?: ClaudePermissionMode },
      error: response.error,
    });
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

  /**
   * Update permission mode from Claude Code's system event.
   * This is called when we receive a system event with permissionMode.
   */
  updatePermissionMode(mode: string): void {
    const validMode = this.parsePermissionMode(mode);
    if (validMode && validMode !== this._permissionMode) {
      const oldMode = this._permissionMode;
      this._permissionMode = validMode;
      console.log(`[ClaudeStreamProcessor] Permission mode changed: ${oldMode} -> ${validMode}`);
      this.emit('permission_mode_changed', { permissionMode: validMode });
    }
  }

  /**
   * Parse permission mode string from Claude Code to our type.
   */
  parsePermissionMode(mode: string): ClaudePermissionMode | null {
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
    console.log(`[ClaudeStreamProcessor] Unknown permission mode: ${mode}`);
    return null;
  }

  /**
   * Request permission mode change by sending Shift+Tab sequences.
   * @param targetMode The desired permission mode
   * @param writeFn Function to write to the PTY (injected by runner)
   * @returns true if Shift+Tab was sent, false if already at target or no writeFn
   */
  requestPermissionModeChange(
    targetMode: ClaudePermissionMode,
    writeFn: ((data: string) => void) | null
  ): boolean {
    if (this._permissionMode === targetMode) {
      return false;
    }

    if (!writeFn) {
      console.log('[ClaudeStreamProcessor] Cannot change permission mode: no write function');
      return false;
    }

    // Calculate how many Shift+Tab presses needed
    const currentIndex = PERMISSION_MODE_ORDER.indexOf(this._permissionMode);
    const targetIndex = PERMISSION_MODE_ORDER.indexOf(targetMode);

    if (currentIndex === -1 || targetIndex === -1) {
      console.log('[ClaudeStreamProcessor] Invalid permission mode');
      return false;
    }

    // Calculate steps (cycle forward only)
    let steps = targetIndex - currentIndex;
    if (steps <= 0) {
      steps += PERMISSION_MODE_ORDER.length;
    }

    console.log(`[ClaudeStreamProcessor] Sending ${steps} Shift+Tab(s) to change mode from ${this._permissionMode} to ${targetMode}`);

    // Send Shift+Tab (escape sequence: \x1b[Z)
    for (let i = 0; i < steps; i++) {
      writeFn('\x1b[Z');
    }

    return true;
  }

  // Type-safe event emitter methods
  override on<K extends keyof ClaudeStreamProcessorEvents>(
    event: K,
    listener: ClaudeStreamProcessorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof ClaudeStreamProcessorEvents>(
    event: K,
    ...args: Parameters<ClaudeStreamProcessorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
