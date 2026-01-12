import { ClaudeRunner, ClaudeRunnerOptions, ClaudeRunnerEvents, StartOptions, ImageContent } from './claude-runner.js';
import { EventEmitter } from 'events';

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
  onEvent: RunnerEventHandler;
}

/**
 * Interface for Claude runner implementations (real or mock)
 */
export interface IClaudeRunner extends EventEmitter {
  readonly isRunning: boolean;
  start(prompt: string, options?: StartOptions): void;
  stop(): void;
  sendInput(input: string): void;
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

  constructor(runnerFactory: RunnerFactory = defaultRunnerFactory) {
    this.runnerFactory = runnerFactory;
  }

  /**
   * Set a custom runner factory (useful for testing with mock)
   */
  setRunnerFactory(factory: RunnerFactory): void {
    this.runnerFactory = factory;
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
    };

    const runner = this.runnerFactory(runnerOptions);
    this.runners.set(sessionId, runner);
    this.eventHandlers.set(sessionId, options.onEvent);

    // Set up event forwarding
    this.setupEventForwarding(sessionId, runner, options.onEvent);

    // Start the runner
    runner.start(prompt, {
      sessionId: options.claudeSessionId,
      images: options.images,
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
