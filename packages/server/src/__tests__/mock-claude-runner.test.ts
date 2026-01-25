import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockClaudeRunner } from '../mock-claude-runner.js';
import type { Scenario, ScenarioStep } from '../mock-claude-runner.js';

describe('MockClaudeRunner', () => {
  let runner: MockClaudeRunner;

  beforeEach(() => {
    runner = new MockClaudeRunner();
  });

  describe('basic functionality', () => {
    it('should emit started event when start is called', async () => {
      const startedHandler = vi.fn();
      runner.on('started', startedHandler);

      runner.start('Hello');

      await vi.waitFor(() => {
        expect(startedHandler).toHaveBeenCalled();
      });
      expect(startedHandler).toHaveBeenCalledWith({ pid: expect.any(Number) });
    });

    it('should emit exit event when scenario completes', async () => {
      const exitHandler = vi.fn();
      runner.on('exit', exitHandler);

      runner.start('Hello');

      await vi.waitFor(() => {
        expect(exitHandler).toHaveBeenCalled();
      });
      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: null });
    });

    it('should set isRunning to true during execution', async () => {
      expect(runner.isRunning).toBe(false);

      runner.start('Hello');
      expect(runner.isRunning).toBe(true);

      await vi.waitFor(() => {
        expect(runner.isRunning).toBe(false);
      });
    });
  });

  describe('scenario execution', () => {
    it('should execute default scenario with text output', async () => {
      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('Hello');

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalled();
      });
    });

    it('should execute custom scenario', async () => {
      const scenario: Scenario = {
        name: 'custom-greeting',
        steps: [
          { type: 'text', text: 'Hello, world!' },
          { type: 'result', result: 'Greeting completed' },
        ],
      };

      runner.setScenario(scenario);
      const textHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('text', textHandler);
      runner.on('result', resultHandler);

      runner.start('greet');

      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });

      expect(textHandler).toHaveBeenCalledWith({ text: 'Hello, world!' });
      expect(resultHandler).toHaveBeenCalledWith({
        result: 'Greeting completed',
        sessionId: expect.any(String),
      });
    });

    it('should emit thinking events', async () => {
      const scenario: Scenario = {
        name: 'thinking-test',
        steps: [
          { type: 'thinking', thinking: 'Let me think about this...' },
          { type: 'text', text: 'I have thought about it.' },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const thinkingHandler = vi.fn();

      runner.on('thinking', thinkingHandler);
      runner.start('think');

      await vi.waitFor(() => {
        expect(thinkingHandler).toHaveBeenCalled();
      });

      expect(thinkingHandler).toHaveBeenCalledWith({
        thinking: 'Let me think about this...',
      });
    });

    it('should emit tool_use events', async () => {
      const scenario: Scenario = {
        name: 'tool-use-test',
        steps: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: '/test/file.txt' },
          },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const toolUseHandler = vi.fn();

      runner.on('tool_use', toolUseHandler);
      runner.start('read file');

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalled();
      });

      expect(toolUseHandler).toHaveBeenCalledWith({
        id: 'tool-1',
        name: 'Read',
        input: { file_path: '/test/file.txt' },
      });
    });

    it('should emit system event with session info', async () => {
      const scenario: Scenario = {
        name: 'system-test',
        steps: [
          {
            type: 'system',
            subtype: 'init',
            model: 'claude-sonnet-4-20250514',
            tools: ['Read', 'Write'],
          },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const systemHandler = vi.fn();

      runner.on('system', systemHandler);
      runner.start('init');

      await vi.waitFor(() => {
        expect(systemHandler).toHaveBeenCalled();
      });

      expect(systemHandler).toHaveBeenCalledWith({
        subtype: 'init',
        sessionId: expect.any(String),
        model: 'claude-sonnet-4-20250514',
        tools: ['Read', 'Write'],
        permissionMode: undefined,
        cwd: undefined,
      });
    });
  });

  describe('input handling', () => {
    it('should resume execution when sendInput is called during wait_for_input step', async () => {
      const scenario: Scenario = {
        name: 'input-test',
        steps: [
          { type: 'text', text: 'Please provide input:' },
          { type: 'wait_for_input' },
          { type: 'text', text: 'You said: {input}' },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const textHandler = vi.fn();

      runner.on('text', textHandler);
      runner.start('get input');

      // Wait for first text
      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledWith({ text: 'Please provide input:' });
      });

      // Send input
      runner.sendInput('Hello from user');

      // Wait for response text
      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledWith({ text: 'You said: Hello from user' });
      });
    });
  });

  describe('prompt matching', () => {
    it('should select scenario based on prompt pattern', async () => {
      const greetScenario: Scenario = {
        name: 'greet',
        promptPattern: /hello|hi|greet/i,
        steps: [
          { type: 'text', text: 'Hello there!' },
          { type: 'result', result: 'Greeted' },
        ],
      };

      const codeScenario: Scenario = {
        name: 'code',
        promptPattern: /code|program|implement/i,
        steps: [
          { type: 'thinking', thinking: 'Planning implementation...' },
          { type: 'text', text: 'Here is the code.' },
          { type: 'result', result: 'Code provided' },
        ],
      };

      runner.addScenario(greetScenario);
      runner.addScenario(codeScenario);

      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('Hello Claude');

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledWith({ text: 'Hello there!' });
      });
    });

    it('should use default scenario when no pattern matches', async () => {
      const specificScenario: Scenario = {
        name: 'specific',
        promptPattern: /very specific phrase/i,
        steps: [
          { type: 'text', text: 'Specific response' },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.addScenario(specificScenario);

      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('something else entirely');

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalled();
      });

      // Should not have called specific response
      expect(textHandler).not.toHaveBeenCalledWith({ text: 'Specific response' });
    });
  });

  describe('delay configuration', () => {
    it('should respect step delays', async () => {
      const scenario: Scenario = {
        name: 'delay-test',
        steps: [
          { type: 'text', text: 'Fast', delay: 10 },
          { type: 'text', text: 'Slow', delay: 100 },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const textHandler = vi.fn();

      runner.on('text', textHandler);

      const startTime = Date.now();
      runner.start('delay test');

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledTimes(2);
      });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe('stop functionality', () => {
    it('should stop execution and emit exit event', async () => {
      const scenario: Scenario = {
        name: 'long-running',
        steps: [
          { type: 'text', text: 'Starting...', delay: 1000 },
          { type: 'text', text: 'This should not appear' },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const exitHandler = vi.fn();
      const textHandler = vi.fn();

      runner.on('exit', exitHandler);
      runner.on('text', textHandler);

      runner.start('long task');

      // Stop immediately
      runner.stop();

      await vi.waitFor(() => {
        expect(exitHandler).toHaveBeenCalled();
      });

      expect(exitHandler).toHaveBeenCalledWith({ code: null, signal: 'SIGTERM' });
      expect(textHandler).not.toHaveBeenCalledWith({ text: 'This should not appear' });
    });
  });

  describe('AskUserQuestion simulation', () => {
    it('should emit tool_use for AskUserQuestion', async () => {
      const scenario: Scenario = {
        name: 'ask-question',
        steps: [
          {
            type: 'tool_use',
            id: 'ask-1',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Which library?',
                  header: 'Library',
                  options: [
                    { label: 'React', description: 'A UI library' },
                    { label: 'Vue', description: 'Progressive framework' },
                  ],
                  multiSelect: false,
                },
              ],
            },
          },
          { type: 'wait_for_input' },
          { type: 'text', text: 'You chose: {input}' },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const toolUseHandler = vi.fn();
      const textHandler = vi.fn();

      runner.on('tool_use', toolUseHandler);
      runner.on('text', textHandler);

      runner.start('ask me something');

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalled();
      });

      expect(toolUseHandler).toHaveBeenCalledWith({
        id: 'ask-1',
        name: 'AskUserQuestion',
        input: expect.objectContaining({
          questions: expect.any(Array),
        }),
      });

      // Simulate user answering
      runner.sendInput('React');

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledWith({ text: 'You chose: React' });
      });
    });
  });

  describe('permission request simulation', () => {
    it('should emit tool_use for permission-requiring tools', async () => {
      const scenario: Scenario = {
        name: 'permission-test',
        steps: [
          {
            type: 'tool_use',
            id: 'edit-1',
            name: 'Edit',
            input: {
              file_path: '/src/app.ts',
              old_string: 'foo',
              new_string: 'bar',
            },
          },
          { type: 'wait_for_input' }, // Wait for permission
          { type: 'tool_result', toolUseId: 'edit-1', content: 'File edited', isError: false },
          { type: 'text', text: 'Edit completed' },
          { type: 'result', result: 'Done' },
        ],
      };

      runner.setScenario(scenario);
      const toolUseHandler = vi.fn();
      const toolResultHandler = vi.fn();

      runner.on('tool_use', toolUseHandler);
      runner.on('tool_result', toolResultHandler);

      runner.start('edit file');

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalled();
      });

      // Simulate permission granted
      runner.sendInput('allow');

      await vi.waitFor(() => {
        expect(toolResultHandler).toHaveBeenCalledWith({
          toolUseId: 'edit-1',
          content: 'File edited',
          isError: false,
        });
      });
    });
  });
});

describe('Predefined scenarios', () => {
  it('should have echo scenario', async () => {
    const runner = MockClaudeRunner.withEchoScenario();
    const textHandler = vi.fn();

    runner.on('text', textHandler);
    runner.start('echo this message');

    await vi.waitFor(() => {
      expect(textHandler).toHaveBeenCalledWith({
        text: expect.stringContaining('echo this message'),
      });
    });
  });

  it('should have file read scenario', async () => {
    const runner = MockClaudeRunner.withFileScenario();
    const toolUseHandler = vi.fn();

    runner.on('tool_use', toolUseHandler);
    runner.start('read file');

    await vi.waitFor(() => {
      expect(toolUseHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Read',
        })
      );
    });
  });

  it('should have permission scenario with new permission_request step', async () => {
    const runner = MockClaudeRunner.withPermissionScenario();
    const permissionRequestHandler = vi.fn();
    const toolUseHandler = vi.fn();
    const toolResultHandler = vi.fn();
    const textHandler = vi.fn();

    runner.on('permission_request', permissionRequestHandler);
    runner.on('tool_use', toolUseHandler);
    runner.on('tool_result', toolResultHandler);
    runner.on('text', textHandler);

    runner.start('write file');

    // Wait for permission request
    await vi.waitFor(() => {
      expect(permissionRequestHandler).toHaveBeenCalled();
    });

    expect(permissionRequestHandler).toHaveBeenCalledWith({
      requestId: expect.any(String),
      toolName: 'Write',
      input: expect.objectContaining({
        file_path: '/tmp/test.txt',
      }),
    });

    // Should also emit tool_use before permission_request
    expect(toolUseHandler).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'Write',
      input: expect.objectContaining({
        file_path: '/tmp/test.txt',
      }),
    });

    // Get the request ID and respond with allow
    const requestId = permissionRequestHandler.mock.calls[0][0].requestId;
    runner.respondToPermission(requestId, { behavior: 'allow' });

    // Wait for tool result
    await vi.waitFor(() => {
      expect(toolResultHandler).toHaveBeenCalled();
    });

    expect(toolResultHandler).toHaveBeenCalledWith({
      toolUseId: expect.any(String),
      content: 'File written successfully',
      isError: false,
    });

    // Wait for completion text
    await vi.waitFor(() => {
      expect(textHandler).toHaveBeenCalledWith({ text: 'I have written the file.' });
    });
  });

  it('should handle permission denial', async () => {
    const runner = MockClaudeRunner.withPermissionScenario();
    const permissionRequestHandler = vi.fn();
    const toolResultHandler = vi.fn();

    runner.on('permission_request', permissionRequestHandler);
    runner.on('tool_result', toolResultHandler);

    runner.start('write file');

    // Wait for permission request
    await vi.waitFor(() => {
      expect(permissionRequestHandler).toHaveBeenCalled();
    });

    // Get the request ID and respond with deny
    const requestId = permissionRequestHandler.mock.calls[0][0].requestId;
    runner.respondToPermission(requestId, { behavior: 'deny', message: 'User denied permission' });

    // Wait for tool result (should be error)
    await vi.waitFor(() => {
      expect(toolResultHandler).toHaveBeenCalled();
    });

    expect(toolResultHandler).toHaveBeenCalledWith({
      toolUseId: expect.any(String),
      content: 'User denied permission',
      isError: true,
    });
  });
});
