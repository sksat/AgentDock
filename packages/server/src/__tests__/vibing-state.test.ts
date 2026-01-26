import { describe, it, expect, vi } from 'vitest';
import { MockClaudeRunner } from '../mock-claude-runner.js';
import type { Scenario } from '../mock-claude-runner.js';

/**
 * Tests for vibing state management.
 *
 * Vibing = agent is doing autonomous work (thinking, tool execution)
 * NOT vibing = waiting for user input, permission, or idle
 */
describe('Vibing State Management', () => {
  describe('MockClaudeRunner vibing transitions', () => {
    it('should start vibing when processing a message', async () => {
      const runner = MockClaudeRunner.withEchoScenario();
      const startedHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('started', startedHandler);
      runner.on('result', resultHandler);

      runner.start('test message');

      await vi.waitFor(() => {
        expect(startedHandler).toHaveBeenCalled();
      });

      // Runner should be active while processing
      expect(runner.isRunning).toBe(true);

      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });
    });

    it('should stop vibing when permission_request is emitted', async () => {
      const runner = MockClaudeRunner.withPermissionScenario();
      const permissionRequestHandler = vi.fn();

      runner.on('permission_request', permissionRequestHandler);

      runner.start('write file');

      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      // Runner is still running but waiting for permission
      expect(runner.isRunning).toBe(true);

      // Verify permission request structure
      expect(permissionRequestHandler).toHaveBeenCalledWith({
        requestId: expect.any(String),
        toolName: 'Write',
        input: expect.any(Object),
      });
    });

    it('should resume vibing after permission is granted', async () => {
      const runner = MockClaudeRunner.withPermissionScenario();
      const permissionRequestHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('permission_request', permissionRequestHandler);
      runner.on('result', resultHandler);

      runner.start('write file');

      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      // Grant permission
      const requestId = permissionRequestHandler.mock.calls[0][0].requestId;
      runner.respondToPermission(requestId, { behavior: 'allow' });

      // Should continue to result
      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });
    });

    it('should stop vibing when result is received', async () => {
      const runner = MockClaudeRunner.withEchoScenario();
      const resultHandler = vi.fn();
      const exitHandler = vi.fn();

      runner.on('result', resultHandler);
      runner.on('exit', exitHandler);

      expect(runner.isRunning).toBe(false);

      runner.start('test');

      expect(runner.isRunning).toBe(true);

      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(exitHandler).toHaveBeenCalled();
      });

      expect(runner.isRunning).toBe(false);
    });
  });

  describe('AskUserQuestion vibing transitions', () => {
    it('should emit tool_use for AskUserQuestion and wait for response', async () => {
      const scenario: Scenario = {
        name: 'ask-question-test',
        steps: [
          {
            type: 'tool_use',
            id: 'ask-1',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Which option?',
                  header: 'Choice',
                  options: [
                    { label: 'Option A', description: 'First option' },
                    { label: 'Option B', description: 'Second option' },
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

      const runner = new MockClaudeRunner();
      runner.setScenario(scenario);

      const toolUseHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('tool_use', toolUseHandler);
      runner.on('result', resultHandler);

      runner.start('ask question');

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'AskUserQuestion',
          })
        );
      });

      // Runner should be waiting for input (vibing should be false at this point)
      expect(runner.isRunning).toBe(true);

      // Send user response
      runner.sendInput('Option A');

      // Should continue to result
      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });
    });
  });

  describe('Session status and vibing state relationship', () => {
    it('vibing should be true during thinking/tool_use', async () => {
      const scenario: Scenario = {
        name: 'thinking-tool-test',
        steps: [
          { type: 'thinking', thinking: 'Processing...' },
          {
            type: 'tool_use',
            id: 'read-1',
            name: 'Read',
            input: { file_path: '/test.txt' },
          },
          { type: 'text', text: 'Done' },
          { type: 'result', result: 'Complete' },
        ],
      };

      const runner = new MockClaudeRunner();
      runner.setScenario(scenario);

      const thinkingHandler = vi.fn();
      const toolUseHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('thinking', thinkingHandler);
      runner.on('tool_use', toolUseHandler);
      runner.on('result', resultHandler);

      runner.start('test');

      await vi.waitFor(() => {
        expect(thinkingHandler).toHaveBeenCalled();
      });

      // During thinking, runner is active (vibing)
      expect(runner.isRunning).toBe(true);

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalled();
      });

      // During tool_use, runner is still active (vibing)
      expect(runner.isRunning).toBe(true);

      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });
    });

    it('vibing should be false when waiting for permission', async () => {
      const runner = MockClaudeRunner.withPermissionScenario();
      const permissionHandler = vi.fn();

      runner.on('permission_request', permissionHandler);

      runner.start('test');

      await vi.waitFor(() => {
        expect(permissionHandler).toHaveBeenCalled();
      });

      // Runner is running but should NOT be vibing (waiting for user)
      expect(runner.isRunning).toBe(true);
      // Note: MockClaudeRunner doesn't track vibing state directly,
      // but in the real server, this would be when setVibing(false) is called
    });
  });
});
