import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import type { ClaudeRunnerEvents, StartOptions, UsageData, ClaudePermissionMode } from './claude-runner.js';

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

export interface ResultModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  contextWindow?: number;
}

export interface ResultStep {
  type: 'result';
  result: string;
  modelUsage?: Record<string, ResultModelUsage>;
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

export interface PermissionRequestStep {
  type: 'permission_request';
  /** Tool name requesting permission */
  toolName: string;
  /** Tool input */
  input: unknown;
  /** Tool result if allowed (optional, defaults to success message) */
  resultOnAllow?: string;
  /** Tool result if denied (optional, defaults to error message) */
  resultOnDeny?: string;
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
  | UsageStep
  | PermissionRequestStep;

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

export interface PermissionResult {
  behavior: 'allow' | 'deny';
  updatedInput?: unknown;
  message?: string;
}

export class MockClaudeRunner extends EventEmitter {
  private scenarios: Scenario[] = [];
  private currentScenario: Scenario = DEFAULT_SCENARIO;
  private sessionId: string = nanoid();
  private _isRunning: boolean = false;
  private _permissionMode: ClaudePermissionMode = 'default';
  private stepIndex: number = 0;
  private stopped: boolean = false;
  private waitingForInput: boolean = false;
  private lastInput: string = '';
  private executionPromise: Promise<void> | null = null;
  private inputResolver: ((value: string) => void) | null = null;
  private permissionResolver: ((result: PermissionResult) => void) | null = null;
  private pendingPermissionRequestId: string | null = null;

  constructor() {
    super();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get permissionMode(): ClaudePermissionMode {
    return this._permissionMode;
  }

  /**
   * Mock implementation - just updates the mode directly and emits event
   */
  requestPermissionModeChange(targetMode: ClaudePermissionMode): boolean {
    if (this._permissionMode === targetMode) {
      return false;
    }
    this._permissionMode = targetMode;
    this.emit('permission_mode_changed', { permissionMode: targetMode });
    return true;
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

  sendUserMessage(text: string): boolean {
    // Mock implementation - just store the input
    this.lastInput = text;
    if (this.inputResolver) {
      this.inputResolver(text);
      this.inputResolver = null;
    }
    return this._isRunning;
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
          modelUsage: step.modelUsage,
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

      case 'permission_request': {
        const requestId = nanoid();
        this.pendingPermissionRequestId = requestId;

        // Emit tool_use first (like real Claude does)
        const toolUseId = nanoid();
        this.emit('tool_use', {
          id: toolUseId,
          name: step.toolName,
          input: step.input,
        });

        // Emit permission_request event
        this.emit('permission_request', {
          requestId,
          toolName: step.toolName,
          input: step.input,
        });

        // Wait for permission response
        const result = await this.waitForPermission();

        // Emit tool_result based on permission decision
        if (result.behavior === 'allow') {
          this.emit('tool_result', {
            toolUseId,
            content: step.resultOnAllow ?? `${step.toolName} executed successfully`,
            isError: false,
          });
        } else {
          this.emit('tool_result', {
            toolUseId,
            content: result.message ?? step.resultOnDeny ?? `Permission denied for ${step.toolName}`,
            isError: true,
          });
        }
        break;
      }
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

  private async waitForPermission(): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      this.permissionResolver = (result: PermissionResult) => {
        this.pendingPermissionRequestId = null;
        resolve(result);
      };
    });
  }

  /**
   * Respond to a pending permission request
   */
  respondToPermission(requestId: string, result: PermissionResult): void {
    if (this.pendingPermissionRequestId === requestId && this.permissionResolver) {
      this.permissionResolver(result);
      this.permissionResolver = null;
    }
  }

  /**
   * Get the current pending permission request ID (for testing)
   */
  getPendingPermissionRequestId(): string | null {
    return this.pendingPermissionRequestId;
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
          permissionMode: 'default',
        },
        { type: 'thinking', thinking: 'I need to write a file...' },
        {
          type: 'permission_request',
          toolName: 'Write',
          input: {
            file_path: '/tmp/test.txt',
            content: 'Hello, World!\n',
          },
          resultOnAllow: 'File written successfully',
          resultOnDeny: 'Permission denied: cannot write file',
        },
        { type: 'text', text: 'I have written the file.' },
        { type: 'result', result: 'File write completed' },
      ],
    });
    return runner;
  }

  static withWritePermissionScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.addScenario({
      name: 'write-permission',
      promptPattern: /write|create.*file/i,
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Write', 'Edit', 'Bash'],
          permissionMode: 'default',
        },
        {
          type: 'permission_request',
          toolName: 'Write',
          input: {
            file_path: '/home/user/test.txt',
            content: 'Test content\n',
          },
          resultOnAllow: 'File created successfully at: /home/user/test.txt',
          resultOnDeny: 'Permission denied by user',
        },
        { type: 'text', text: 'Done.' },
        { type: 'result', result: 'Task completed' },
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

  /**
   * Creates a scenario that enters plan mode.
   * In plan mode, Claude plans but doesn't execute until user approves.
   */
  static withEnterPlanModeScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'enter-plan-mode',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Write', 'Edit', 'Bash', 'EnterPlanMode', 'ExitPlanMode'],
          permissionMode: 'plan',
        },
        { type: 'text', text: 'I am now in plan mode. I will analyze and plan before executing.' },
        { type: 'result', result: 'Entered plan mode' },
      ],
    });
    return runner;
  }

  /**
   * Creates a scenario that exits plan mode with permission request.
   * This simulates Claude Code CLI behavior where ExitPlanMode requires user approval.
   */
  static withExitPlanModeScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'exit-plan-mode',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Write', 'Edit', 'Bash', 'EnterPlanMode', 'ExitPlanMode'],
          permissionMode: 'plan',
        },
        { type: 'thinking', thinking: 'I have completed planning. Now requesting to exit plan mode.' },
        { type: 'text', text: 'Here is my implementation plan:\n1. First step\n2. Second step' },
        {
          type: 'permission_request',
          toolName: 'ExitPlanMode',
          input: { allowedPrompts: [] },
          resultOnAllow: 'Plan approved. Exiting plan mode.',
          resultOnDeny: 'Plan not approved. Staying in plan mode.',
        },
        { type: 'text', text: 'Plan has been reviewed. Proceeding with implementation.' },
        { type: 'result', result: 'Plan mode exited' },
      ],
    });
    return runner;
  }

  /**
   * Creates a scenario for full plan workflow: enter -> plan -> exit
   */
  static withFullPlanWorkflowScenario(): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'full-plan-workflow',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Write', 'Edit', 'Bash', 'EnterPlanMode', 'ExitPlanMode', 'TodoWrite'],
          permissionMode: 'plan',
        },
        { type: 'thinking', thinking: 'Entering plan mode to design the implementation.' },
        {
          type: 'tool_use',
          id: 'read-1',
          name: 'Read',
          input: { file_path: '/project/src/index.ts' },
        },
        {
          type: 'tool_result',
          toolUseId: 'read-1',
          content: 'export function main() { console.log("Hello"); }',
          isError: false,
        },
        { type: 'text', text: 'Based on my analysis, here is the implementation plan:\n\n## Plan\n1. Add new feature\n2. Update tests\n3. Update documentation' },
        {
          type: 'permission_request',
          toolName: 'ExitPlanMode',
          input: {
            allowedPrompts: [
              { tool: 'Bash', prompt: 'run tests' },
            ],
          },
          resultOnAllow: 'Plan approved by user. Starting implementation.',
          resultOnDeny: 'User requested changes to the plan.',
        },
        { type: 'thinking', thinking: 'User approved the plan. Now implementing.' },
        { type: 'text', text: 'Implementing the approved plan...' },
        { type: 'result', result: 'Implementation complete based on approved plan.' },
      ],
    });
    return runner;
  }

  /**
   * Scenario with modelUsage including contextWindow
   * Used for testing context window display
   */
  static withUsageScenario(modelName: string = 'claude-sonnet-4-20250514'): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'usage',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: modelName,
          tools: ['Read', 'Write', 'Edit'],
        },
        { type: 'text', text: 'I will help you with that.' },
        {
          type: 'result',
          result: 'Task completed',
          modelUsage: {
            [modelName]: {
              inputTokens: 50000,
              outputTokens: 1000,
              cacheReadInputTokens: 10000,
              cacheCreationInputTokens: 5000,
              contextWindow: 200000,
            },
          },
        },
      ],
    });
    return runner;
  }

  /**
   * Scenario with modelUsage but WITHOUT contextWindow
   * Used for testing fallback behavior
   */
  static withUsageNoContextWindowScenario(modelName: string = 'claude-sonnet-4-20250514'): MockClaudeRunner {
    const runner = new MockClaudeRunner();
    runner.setScenario({
      name: 'usage-no-context-window',
      steps: [
        {
          type: 'system',
          subtype: 'init',
          model: modelName,
          tools: ['Read', 'Write', 'Edit'],
        },
        { type: 'text', text: 'I will help you with that.' },
        {
          type: 'result',
          result: 'Task completed',
          modelUsage: {
            [modelName]: {
              inputTokens: 50000,
              outputTokens: 1000,
            },
          },
        },
      ],
    });
    return runner;
  }
}
