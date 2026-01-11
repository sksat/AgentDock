import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import type { ClaudeRunnerEvents, StartOptions, UsageData } from './claude-runner.js';

export interface TextStep {
  type: 'text';
  text: string;
  delay?: number;
}

export interface ThinkingStep {
  type: 'thinking';
  thinking: string;
  delay?: number;
}

export interface ToolUseStep {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
  delay?: number;
}

export interface ToolResultStep {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError: boolean;
  delay?: number;
}

export interface ResultStep {
  type: 'result';
  result: string;
  delay?: number;
}

export interface SystemStep {
  type: 'system';
  subtype?: string;
  model?: string;
  tools?: string[];
  permissionMode?: string;
  cwd?: string;
  delay?: number;
}

export interface WaitForInputStep {
  type: 'wait_for_input';
  delay?: number;
}

export interface UsageStep {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  delay?: number;
}

export type ScenarioStep =
  | TextStep
  | ThinkingStep
  | ToolUseStep
  | ToolResultStep
  | ResultStep
  | SystemStep
  | WaitForInputStep
  | UsageStep;

export interface Scenario {
  name: string;
  promptPattern?: RegExp;
  steps: ScenarioStep[];
}

const DEFAULT_SCENARIO: Scenario = {
  name: 'default',
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
    },
    { type: 'text', text: 'I understand your request. Let me help you with that.' },
    { type: 'result', result: 'Task completed successfully.' },
  ],
};

export class MockClaudeRunner extends EventEmitter {
  private scenarios: Scenario[] = [];
  private currentScenario: Scenario = DEFAULT_SCENARIO;
  private sessionId: string = nanoid();
  private _isRunning: boolean = false;
  private stepIndex: number = 0;
  private stopped: boolean = false;
  private waitingForInput: boolean = false;
  private lastInput: string = '';
  private executionPromise: Promise<void> | null = null;
  private inputResolver: ((value: string) => void) | null = null;

  constructor() {
    super();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  setScenario(scenario: Scenario): void {
    this.currentScenario = scenario;
  }

  addScenario(scenario: Scenario): void {
    this.scenarios.push(scenario);
  }

  clearScenarios(): void {
    this.scenarios = [];
    this.currentScenario = DEFAULT_SCENARIO;
  }

  start(prompt: string, _options: StartOptions = {}): void {
    this.stopped = false;
    this._isRunning = true;
    this.stepIndex = 0;
    this.sessionId = nanoid();

    // Select scenario based on prompt pattern
    const matchedScenario = this.scenarios.find(
      (s) => s.promptPattern && s.promptPattern.test(prompt)
    );
    if (matchedScenario) {
      this.currentScenario = matchedScenario;
    }

    // Store prompt for use in steps
    this.lastInput = prompt;

    // Emit started event
    this.emit('started', { pid: Math.floor(Math.random() * 100000) });

    // Execute scenario steps
    this.executionPromise = this.executeSteps();
  }

  stop(): void {
    this.stopped = true;
    this._isRunning = false;
    if (this.inputResolver) {
      this.inputResolver('');
    }
    this.emit('exit', { code: null, signal: 'SIGTERM' });
  }

  sendInput(input: string): void {
    this.lastInput = input;
    if (this.inputResolver) {
      this.inputResolver(input);
      this.inputResolver = null;
    }
  }

  private async executeSteps(): Promise<void> {
    for (this.stepIndex = 0; this.stepIndex < this.currentScenario.steps.length; this.stepIndex++) {
      if (this.stopped) {
        return;
      }

      const step = this.currentScenario.steps[this.stepIndex];

      // Apply delay if specified
      if (step.delay && step.delay > 0) {
        await this.delay(step.delay);
      }

      if (this.stopped) {
        return;
      }

      await this.executeStep(step);
    }

    // Scenario completed
    this._isRunning = false;
    this.emit('exit', { code: 0, signal: null });
  }

  private async executeStep(step: ScenarioStep): Promise<void> {
    switch (step.type) {
      case 'text':
        this.emit('text', { text: this.interpolate(step.text) });
        break;

      case 'thinking':
        this.emit('thinking', { thinking: step.thinking });
        break;

      case 'tool_use':
        this.emit('tool_use', {
          id: step.id,
          name: step.name,
          input: step.input,
        });
        break;

      case 'tool_result':
        this.emit('tool_result', {
          toolUseId: step.toolUseId,
          content: step.content,
          isError: step.isError,
        });
        break;

      case 'result':
        this.emit('result', {
          result: step.result,
          sessionId: this.sessionId,
        });
        break;

      case 'system':
        this.emit('system', {
          subtype: step.subtype,
          sessionId: this.sessionId,
          tools: step.tools,
          model: step.model,
          permissionMode: step.permissionMode,
          cwd: step.cwd,
        });
        break;

      case 'wait_for_input':
        await this.waitForInput();
        break;

      case 'usage':
        this.emit('usage', {
          inputTokens: step.inputTokens,
          outputTokens: step.outputTokens,
          cacheCreationInputTokens: step.cacheCreationInputTokens,
          cacheReadInputTokens: step.cacheReadInputTokens,
        });
        break;
    }
  }

  private async waitForInput(): Promise<string> {
    this.waitingForInput = true;
    return new Promise<string>((resolve) => {
      this.inputResolver = (input: string) => {
        this.waitingForInput = false;
        resolve(input);
      };
    });
  }

  private interpolate(text: string): string {
    return text.replace(/\{input\}/g, this.lastInput);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  // Factory methods for common scenarios
  static withEchoScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'echo',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
        },
        { type: 'text', text: 'Echo: {input}' },
        { type: 'result', result: 'Echo completed' },
      ],
    });
    return runner;
  }

  static withFileScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'file-read',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Write', 'Edit'],
        },
        { type: 'thinking', thinking: 'I need to read the file...' },
        {
          type: 'tool_use',
          id: 'read-1',
          name: 'Read',
          input: { file_path: '/test/file.txt' },
        },
        {
          type: 'tool_result',
          toolUseId: 'read-1',
          content: 'File contents here',
          isError: false,
        },
        { type: 'text', text: 'I have read the file.' },
        { type: 'result', result: 'File read successfully' },
      ],
    });
    return runner;
  }

  static withAskQuestionScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'ask-question',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
        },
        {
          type: 'tool_use',
          id: 'ask-1',
          name: 'AskUserQuestion',
          input: {
            questions: [
              {
                question: 'Which library should we use?',
                header: 'Library',
                options: [
                  { label: 'React', description: 'A JavaScript library for building UIs' },
                  { label: 'Vue', description: 'A progressive JavaScript framework' },
                  { label: 'Angular', description: 'A platform for building web apps' },
                ],
                multiSelect: false,
              },
            ],
          },
        },
        { type: 'wait_for_input' },
        { type: 'text', text: 'Great choice! You selected: {input}' },
        { type: 'result', result: 'Question answered' },
      ],
    });
    return runner;
  }

  static withPermissionScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'permission',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Write', 'Edit', 'Bash'],
        },
        { type: 'thinking', thinking: 'I need to edit the file...' },
        {
          type: 'tool_use',
          id: 'edit-1',
          name: 'Edit',
          input: {
            file_path: '/src/app.ts',
            old_string: 'const foo = 1;',
            new_string: 'const foo = 2;',
          },
        },
        { type: 'wait_for_input' }, // Wait for permission
        {
          type: 'tool_result',
          toolUseId: 'edit-1',
          content: 'File edited successfully',
          isError: false,
        },
        { type: 'text', text: 'I have made the edit.' },
        { type: 'result', result: 'Edit completed' },
      ],
    });
    return runner;
  }

  static withThinkingScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'thinking',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
        },
        { type: 'thinking', thinking: 'Let me analyze this problem step by step...' },
        { type: 'thinking', thinking: 'First, I need to understand the requirements.' },
        { type: 'thinking', thinking: 'Now I can formulate a solution.' },
        { type: 'text', text: 'After careful consideration, here is my answer.' },
        { type: 'result', result: 'Analysis complete' },
      ],
    });
    return runner;
  }

  static withMultiStepScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'multi-step',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
        },
        { type: 'thinking', thinking: 'Planning the implementation...' },
        {
          type: 'tool_use',
          id: 'glob-1',
          name: 'Glob',
          input: { pattern: '**/*.ts' },
        },
        {
          type: 'tool_result',
          toolUseId: 'glob-1',
          content: 'src/index.ts\nsrc/app.ts',
          isError: false,
        },
        {
          type: 'tool_use',
          id: 'read-1',
          name: 'Read',
          input: { file_path: 'src/app.ts' },
        },
        {
          type: 'tool_result',
          toolUseId: 'read-1',
          content: 'export function app() {}',
          isError: false,
        },
        { type: 'text', text: 'I have analyzed the codebase. Here are my findings.' },
        { type: 'result', result: 'Analysis complete' },
      ],
    });
    return runner;
  }
}
