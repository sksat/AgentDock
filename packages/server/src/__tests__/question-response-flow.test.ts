import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockClaudeRunner } from '../mock-claude-runner.js';
import type { Scenario } from '../mock-claude-runner.js';

/**
 * Tests for AskUserQuestion response flow.
 *
 * This tests the fix for the issue where question_response was calling
 * sendInput() which doesn't work in child process mode. The fix uses
 * sendUserMessage() instead.
 */
describe('Question Response Flow', () => {
  describe('sendInput vs sendUserMessage behavior', () => {
    it('sendInput should store input for wait_for_input scenarios', async () => {
      const scenario: Scenario = {
        name: 'input-test',
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

      const runner = new MockClaudeRunner();
      runner.setScenario(scenario);

      const toolUseHandler = vi.fn();
      const textHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('tool_use', toolUseHandler);
      runner.on('text', textHandler);
      runner.on('result', resultHandler);

      runner.start('ask question');

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'AskUserQuestion',
          })
        );
      });

      // Send input via sendInput
      runner.sendInput('React');

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledWith({ text: 'You chose: React' });
      });

      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });
    });

    it('sendUserMessage should also resume wait_for_input scenarios', async () => {
      const scenario: Scenario = {
        name: 'user-message-test',
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

      const runner = new MockClaudeRunner();
      runner.setScenario(scenario);

      const toolUseHandler = vi.fn();
      const textHandler = vi.fn();
      const resultHandler = vi.fn();

      runner.on('tool_use', toolUseHandler);
      runner.on('text', textHandler);
      runner.on('result', resultHandler);

      runner.start('ask question');

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'AskUserQuestion',
          })
        );
      });

      // Send input via sendUserMessage (this is what should be used for question_response)
      const sent = runner.sendUserMessage('Vue');
      expect(sent).toBe(true);

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledWith({ text: 'You chose: Vue' });
      });

      await vi.waitFor(() => {
        expect(resultHandler).toHaveBeenCalled();
      });
    });

    it('sendUserMessage should return false when not running', () => {
      const runner = new MockClaudeRunner();
      const sent = runner.sendUserMessage('test');
      expect(sent).toBe(false);
    });
  });

  describe('Answer formatting', () => {
    it('should handle single answer', () => {
      const answers = { Library: 'React' };
      const answerText = Object.values(answers).join(', ');
      expect(answerText).toBe('React');
    });

    it('should handle multiple answers with comma join', () => {
      const answers = { Library: 'React', Styling: 'Tailwind' };
      const answerText = Object.values(answers).join(', ');
      expect(answerText).toBe('React, Tailwind');
    });

    it('should handle empty answers', () => {
      const answers = {};
      const answerText = Object.values(answers).join(', ');
      expect(answerText).toBe('');
    });
  });

  describe('Multi-select answers', () => {
    it('should handle comma-separated multi-select values', async () => {
      const scenario: Scenario = {
        name: 'multi-select-test',
        steps: [
          {
            type: 'tool_use',
            id: 'ask-1',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Which features?',
                  header: 'Features',
                  options: [
                    { label: 'Auth', description: 'Authentication' },
                    { label: 'DB', description: 'Database' },
                    { label: 'API', description: 'REST API' },
                  ],
                  multiSelect: true,
                },
              ],
            },
          },
          { type: 'wait_for_input' },
          { type: 'text', text: 'Selected: {input}' },
          { type: 'result', result: 'Done' },
        ],
      };

      const runner = new MockClaudeRunner();
      runner.setScenario(scenario);

      const toolUseHandler = vi.fn();
      const textHandler = vi.fn();

      runner.on('tool_use', toolUseHandler);
      runner.on('text', textHandler);

      runner.start('select features');

      await vi.waitFor(() => {
        expect(toolUseHandler).toHaveBeenCalled();
      });

      // Multi-select answers are joined with comma on client side
      runner.sendUserMessage('Auth,DB');

      await vi.waitFor(() => {
        expect(textHandler).toHaveBeenCalledWith({ text: 'Selected: Auth,DB' });
      });
    });
  });
});
