import { ClaudeRunner, ClaudeRunnerOptions, ClaudeRunnerEvents } from './claude-runner.js';

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
  onEvent: RunnerEventHandler;
}

export class RunnerManager {
  private runners: Map<string, ClaudeRunner> = new Map();
  private eventHandlers: Map<string, RunnerEventHandler> = new Map();

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

    const runner = new ClaudeRunner(runnerOptions);
    this.runners.set(sessionId, runner);
    this.eventHandlers.set(sessionId, options.onEvent);

    // Set up event forwarding
    this.setupEventForwarding(sessionId, runner, options.onEvent);

    // Start the runner
    runner.start(prompt, {
      sessionId: options.claudeSessionId,
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

  getRunner(sessionId: string): ClaudeRunner | undefined {
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
    runner: ClaudeRunner,
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
