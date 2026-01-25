import { ClaudeRunner } from './claude-runner.js';
import type { ClaudeRunnerOptions, ClaudeRunnerEvents, StartOptions, ImageContent, ClaudePermissionMode } from './claude-runner.js';
import { EventEmitter } from 'events';
import { isContainerBackend } from '@agent-dock/shared';
import type { RunnerBackend } from '@agent-dock/shared';

// Re-export ClaudePermissionMode for use in server.ts
export type { ClaudePermissionMode };

export type RunnerEventType = keyof ClaudeRunnerEvents;
export type RunnerEventHandler = (
  sessionId: string,
  eventType: RunnerEventType,
  data: unknown
) => void;

export interface StartSessionOptions {
  workingDir?: string;
  claudePath?: string;
  mcpConfigPath?: string;
  permissionToolName?: string;
  claudeSessionId?: string;
  images?: ImageContent[];
  /** Enable extended thinking mode */
  thinkingEnabled?: boolean;
  /** Permission mode to use for the session */
  permissionMode?: ClaudePermissionMode;
  /** Runner backend to use for this session */
  runnerBackend?: RunnerBackend;
  /**
   * Run browser inside the container (Issue #78: same-container mode).
   * When true, uses the browser container runner factory instead of the
   * regular container runner factory.
   */
  browserInContainer?: boolean;
  /**
   * Bridge port for browser-in-container mode (Issue #78).
   * Each session should use a unique port to avoid conflicts.
   */
  bridgePort?: number;
  /**
   * Container ID for exec mode (Issue #78: same-container mode).
   * If provided, uses `podman exec` on this container instead of `podman run`.
   */
  containerId?: string;
  onEvent: RunnerEventHandler;
}

/**
 * Interface for Claude runner implementations (real or mock)
 */
export interface IClaudeRunner extends EventEmitter {
  readonly isRunning: boolean;
  readonly permissionMode: ClaudePermissionMode;
  start(prompt: string, options?: StartOptions): void;
  stop(): void;
  sendInput(input: string): void;
  sendUserMessage(text: string): boolean;
  requestPermissionModeChange(targetMode: ClaudePermissionMode): boolean;
  on<K extends keyof ClaudeRunnerEvents>(event: K, listener: ClaudeRunnerEvents[K]): this;
}

/**
 * Factory function type for creating runner instances
 */
export type RunnerFactory = (options: ClaudeRunnerOptions) => IClaudeRunner;

/**
 * Default factory that creates real ClaudeRunner instances
 */
export const defaultRunnerFactory: RunnerFactory = (options) => new ClaudeRunner(options);

export class RunnerManager {
  private runners: Map<string, IClaudeRunner> = new Map();
  private eventHandlers: Map<string, RunnerEventHandler> = new Map();
  private runnerFactory: RunnerFactory;
  private containerRunnerFactory: RunnerFactory | null = null;
  private browserContainerRunnerFactory: RunnerFactory | null = null;

  constructor(runnerFactory: RunnerFactory = defaultRunnerFactory) {
    this.runnerFactory = runnerFactory;
  }

  /**
   * Set a custom runner factory (useful for testing with mock)
   */
  setRunnerFactory(factory: RunnerFactory): void {
    this.runnerFactory = factory;
  }

  /**
   * Set the container runner factory (used when runnerBackend is container-based)
   */
  setContainerRunnerFactory(factory: RunnerFactory): void {
    this.containerRunnerFactory = factory;
  }

  /**
   * Set the browser container runner factory (Issue #78: same-container mode).
   * Used when browserInContainer is true - runs Claude and browser bridge
   * in the same container so they share localhost.
   */
  setBrowserContainerRunnerFactory(factory: RunnerFactory): void {
    this.browserContainerRunnerFactory = factory;
  }

  startSession(sessionId: string, prompt: string, options: StartSessionOptions): void {
    // Check if session is already running
    const existingRunner = this.runners.get(sessionId);
    if (existingRunner?.isRunning) {
      throw new Error(`Session ${sessionId} is already running`);
    }

    const runnerOptions: ClaudeRunnerOptions = {
      workingDir: options.workingDir,
      claudePath: options.claudePath,
      mcpConfigPath: options.mcpConfigPath,
      permissionToolName: options.permissionToolName,
      bridgePort: options.bridgePort,
      containerId: options.containerId,
    };

    // Choose the appropriate factory based on runnerBackend and browserInContainer
    let factory: RunnerFactory;
    if (isContainerBackend(options.runnerBackend)) {
      // Use browser container factory if browserInContainer is true and available
      // Otherwise use regular container factory
      if (options.browserInContainer && this.browserContainerRunnerFactory) {
        factory = this.browserContainerRunnerFactory;
      } else if (this.containerRunnerFactory) {
        factory = this.containerRunnerFactory;
      } else {
        factory = this.runnerFactory;
      }
    } else {
      factory = this.runnerFactory;
    }
    const runner = factory(runnerOptions);
    this.runners.set(sessionId, runner);
    this.eventHandlers.set(sessionId, options.onEvent);

    // Set up event forwarding
    this.setupEventForwarding(sessionId, runner, options.onEvent);

    // Start the runner
    runner.start(prompt, {
      sessionId: options.claudeSessionId,
      images: options.images,
      thinkingEnabled: options.thinkingEnabled,
      permissionMode: options.permissionMode,
    });
  }

  stopSession(sessionId: string): void {
    const runner = this.runners.get(sessionId);
    if (runner) {
      runner.stop();
    }
  }

  stopAll(): void {
    for (const [sessionId] of this.runners) {
      this.stopSession(sessionId);
    }
  }

  getRunner(sessionId: string): IClaudeRunner | undefined {
    return this.runners.get(sessionId);
  }

  hasRunningSession(sessionId: string): boolean {
    const runner = this.runners.get(sessionId);
    return runner?.isRunning ?? false;
  }

  /**
   * Send input to a running session (stream input during execution)
   * @returns true if input was sent, false if session is not running
   */
  sendInputToSession(sessionId: string, input: string): boolean {
    const runner = this.runners.get(sessionId);
    if (!runner?.isRunning) {
      return false;
    }
    runner.sendInput(input);
    return true;
  }

  /**
   * Request permission mode change for a running session
   * Sends control_request to Claude Code to change permission mode
   * @returns true if mode change was requested, false if session is not running
   */
  requestPermissionModeChange(sessionId: string, targetMode: ClaudePermissionMode): boolean {
    const runner = this.runners.get(sessionId);
    if (!runner?.isRunning) {
      return false;
    }
    return runner.requestPermissionModeChange(targetMode);
  }

  /**
   * Send a follow-up user message to a running session via stdin.
   * This allows continuing the conversation without restarting Claude.
   * @returns true if message was sent, false if session is not running or stdin unavailable
   */
  sendUserMessage(sessionId: string, text: string): boolean {
    const runner = this.runners.get(sessionId);
    if (!runner?.isRunning) {
      return false;
    }
    return runner.sendUserMessage(text);
  }

  getRunningCount(): number {
    let count = 0;
    for (const runner of this.runners.values()) {
      if (runner.isRunning) {
        count++;
      }
    }
    return count;
  }

  private setupEventForwarding(
    sessionId: string,
    runner: IClaudeRunner,
    onEvent: RunnerEventHandler
  ): void {
    const events: RunnerEventType[] = [
      'started',
      'text',
      'thinking',
      'tool_use',
      'tool_result',
      'result',
      'system',
      'usage',
      'error',
      'exit',
      'permission_request',
      'permission_mode_changed',
    ];

    for (const eventType of events) {
      runner.on(eventType, (data: unknown) => {
        onEvent(sessionId, eventType, data);

        // Clean up runner on exit
        if (eventType === 'exit') {
          this.runners.delete(sessionId);
          this.eventHandlers.delete(sessionId);
        }
      });
    }
  }
}
