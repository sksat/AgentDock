import { describe, it, expect, vi } from 'vitest';
import { MockClaudeRunner } from '../mock-claude-runner.js';
import type { Scenario } from '../mock-claude-runner.js';

/**
 * ExitPlanMode handling tests
 *
 * This test file verifies that ExitPlanMode requires user approval
 * before exiting plan mode, matching Claude Code CLI behavior.
 *
 * Key behaviors to test:
 * 1. ExitPlanMode should emit permission_request (not just tool_use)
 * 2. User must approve before plan mode is exited
 * 3. User can deny and stay in plan mode
 */
describe('ExitPlanMode handling', () => {
  describe('MockClaudeRunner with ExitPlanMode permission scenario', () => {
    it('should emit permission_request for ExitPlanMode', async () => {
      const runner = MockClaudeRunner.withExitPlanModeScenario();
      const permissionRequestHandler = vi.fn();

      runner.on('permission_request', permissionRequestHandler);
      runner.start('exit plan mode');

      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      expect(permissionRequestHandler).toHaveBeenCalledWith({
        requestId: expect.any(String),
        toolName: 'ExitPlanMode',
        input: expect.any(Object),
      });
    });

    it('should emit tool_use for ExitPlanMode before permission_request', async () => {
      const runner = MockClaudeRunner.withExitPlanModeScenario();
      const toolUseHandler = vi.fn();
      const permissionRequestHandler = vi.fn();
      const events: string[] = [];

      runner.on('tool_use', (data) => {
        events.push('tool_use');
        toolUseHandler(data);
      });
      runner.on('permission_request', (data) => {
        events.push('permission_request');
        permissionRequestHandler(data);
      });

      runner.start('exit plan mode');

      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      // tool_use should come before permission_request
      expect(events).toEqual(['tool_use', 'permission_request']);
      expect(toolUseHandler).toHaveBeenCalledWith({
        id: expect.any(String),
        name: 'ExitPlanMode',
        input: expect.any(Object),
      });
    });

    it('should emit successful tool_result when permission is granted', async () => {
      const runner = MockClaudeRunner.withExitPlanModeScenario();
      const permissionRequestHandler = vi.fn();
      const toolResultHandler = vi.fn();

      runner.on('permission_request', permissionRequestHandler);
      runner.on('tool_result', toolResultHandler);

      runner.start('exit plan mode');

      // Wait for permission request
      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      // Grant permission
      const requestId = permissionRequestHandler.mock.calls[0][0].requestId;
      runner.respondToPermission(requestId, { behavior: 'allow' });

      // Wait for tool result
      await vi.waitFor(() => {
        expect(toolResultHandler).toHaveBeenCalled();
      });

      expect(toolResultHandler).toHaveBeenCalledWith({
        toolUseId: expect.any(String),
        content: expect.stringContaining('Plan approved'),
        isError: false,
      });
    });

    it('should emit error tool_result when permission is denied', async () => {
      const runner = MockClaudeRunner.withExitPlanModeScenario();
      const permissionRequestHandler = vi.fn();
      const toolResultHandler = vi.fn();

      runner.on('permission_request', permissionRequestHandler);
      runner.on('tool_result', toolResultHandler);

      runner.start('exit plan mode');

      // Wait for permission request
      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      // Deny permission
      const requestId = permissionRequestHandler.mock.calls[0][0].requestId;
      runner.respondToPermission(requestId, {
        behavior: 'deny',
        message: 'User wants to continue planning',
      });

      // Wait for tool result
      await vi.waitFor(() => {
        expect(toolResultHandler).toHaveBeenCalled();
      });

      expect(toolResultHandler).toHaveBeenCalledWith({
        toolUseId: expect.any(String),
        content: 'User wants to continue planning',
        isError: true,
      });
    });

    it('should pause execution until permission response', async () => {
      const runner = MockClaudeRunner.withExitPlanModeScenario();
      const permissionRequestHandler = vi.fn();
      const textHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('permission_request', permissionRequestHandler);
      runner.on('text', textHandler);
      runner.on('result', resultHandler);

      runner.start('exit plan mode');

      // Wait for permission request
      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      // First text (plan) should have been emitted before permission_request
      expect(textHandler).toHaveBeenCalledTimes(1);
      expect(textHandler).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('implementation plan') })
      );

      // Result should NOT have been emitted yet (execution paused)
      expect(resultHandler).not.toHaveBeenCalled();

      // Grant permission
      const requestId = permissionRequestHandler.mock.calls[0][0].requestId;
      runner.respondToPermission(requestId, { behavior: 'allow' });

      // Now second text and result should be emitted
      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });

      // Second text after permission should have been emitted
      expect(textHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('MockClaudeRunner with EnterPlanMode scenario', () => {
    it('should start in plan mode after EnterPlanMode', async () => {
      const runner = MockClaudeRunner.withEnterPlanModeScenario();
      const systemHandler = vi.fn();

      runner.on('system', systemHandler);
      runner.start('enter plan mode');

      await vi.waitFor(() => {
        expect(systemHandler).toHaveBeenCalled();
      });

      expect(systemHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          permissionMode: 'plan',
        })
      );
    });
  });

  describe('Full plan mode workflow', () => {
    it('should handle enter -> plan -> exit flow with permission', async () => {
      const scenario: Scenario = {
        name: 'full-plan-workflow',
        steps: [
          {
            type: 'system',
            subtype: 'init',
            model: 'claude-sonnet-4-20250514',
            permissionMode: 'plan',
          },
          { type: 'text', text: 'I am now in plan mode. Let me analyze the task.' },
          { type: 'thinking', thinking: 'Planning the implementation...' },
          { type: 'text', text: 'Here is my plan:\n1. Step one\n2. Step two' },
          {
            type: 'permission_request',
            toolName: 'ExitPlanMode',
            input: { allowedPrompts: [] },
            resultOnAllow: 'Plan approved. Starting implementation.',
            resultOnDeny: 'Plan not approved. Please provide feedback.',
          },
          { type: 'text', text: 'Implementation started based on approved plan.' },
          { type: 'result', result: 'Task completed' },
        ],
      };

      const runner = new MockClaudeRunner();
      runner.setScenario(scenario);

      const systemHandler = vi.fn();
      const textHandler = vi.fn();
      const permissionRequestHandler = vi.fn();
      const toolResultHandler = vi.fn();

      runner.on('system', systemHandler);
      runner.on('text', textHandler);
      runner.on('permission_request', permissionRequestHandler);
      runner.on('tool_result', toolResultHandler);

      runner.start('implement feature X');

      // Wait for permission request (after plan is shown)
      await vi.waitFor(() => {
        expect(permissionRequestHandler).toHaveBeenCalled();
      });

      // Verify we're in plan mode
      expect(systemHandler).toHaveBeenCalledWith(
        expect.objectContaining({ permissionMode: 'plan' })
      );

      // Verify plan was shown
      expect(textHandler).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Here is my plan') })
      );

      // Approve the plan
      const requestId = permissionRequestHandler.mock.calls[0][0].requestId;
      runner.respondToPermission(requestId, { behavior: 'allow' });

      // Wait for completion
      await vi.waitFor(() => {
        expect(runner.isRunning).toBe(false);
      });

      // Verify tool result was successful
      expect(toolResultHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Plan approved'),
          isError: false,
        })
      );
    });
  });
});
