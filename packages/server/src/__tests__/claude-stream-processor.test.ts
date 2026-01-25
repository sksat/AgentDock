import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeStreamProcessor } from '../claude-stream-processor.js';

describe('ClaudeStreamProcessor', () => {
  let processor: ClaudeStreamProcessor;

  beforeEach(() => {
    processor = new ClaudeStreamProcessor();
  });

  describe('handleData', () => {
    it('should emit text event for assistant message', () => {
      const textHandler = vi.fn();
      processor.on('text', textHandler);

      const event = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello, world!' }],
        },
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(textHandler).toHaveBeenCalledWith({ text: 'Hello, world!' });
    });

    it('should emit thinking event for thinking block', () => {
      const thinkingHandler = vi.fn();
      processor.on('thinking', thinkingHandler);

      const event = {
        type: 'assistant',
        message: {
          content: [{ type: 'thinking', thinking: 'Let me think about this...' }],
        },
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(thinkingHandler).toHaveBeenCalledWith({ thinking: 'Let me think about this...' });
    });

    it('should emit tool_use event for tool use block', () => {
      const toolUseHandler = vi.fn();
      processor.on('tool_use', toolUseHandler);

      const event = {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'ls' },
          }],
        },
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(toolUseHandler).toHaveBeenCalledWith({
        id: 'tool-1',
        name: 'Bash',
        input: { command: 'ls' },
      });
    });

    it('should emit tool_result event for user message with tool result', () => {
      const toolResultHandler = vi.fn();
      processor.on('tool_result', toolResultHandler);

      const event = {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'file1.txt\nfile2.txt',
            is_error: false,
          }],
        },
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(toolResultHandler).toHaveBeenCalledWith({
        toolUseId: 'tool-1',
        content: 'file1.txt\nfile2.txt',
        isError: false,
      });
    });

    it('should emit system event', () => {
      const systemHandler = vi.fn();
      processor.on('system', systemHandler);

      const event = {
        type: 'system',
        subtype: 'init',
        session_id: 'session-123',
        tools: ['Bash', 'Read'],
        model: 'claude-3-opus',
        permissionMode: 'default',
        cwd: '/home/user',
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(systemHandler).toHaveBeenCalledWith({
        subtype: 'init',
        sessionId: 'session-123',
        tools: ['Bash', 'Read'],
        model: 'claude-3-opus',
        permissionMode: 'default',
        cwd: '/home/user',
      });
    });

    it('should emit result event', () => {
      const resultHandler = vi.fn();
      processor.on('result', resultHandler);

      const event = {
        type: 'result',
        result: 'Task completed',
        session_id: 'session-123',
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(resultHandler).toHaveBeenCalledWith({
        result: 'Task completed',
        sessionId: 'session-123',
        modelUsage: undefined,
      });
    });

    it('should emit usage event when usage data is available', () => {
      const usageHandler = vi.fn();
      processor.on('usage', usageHandler);

      const event = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hi' }],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 5,
          },
        },
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(usageHandler).toHaveBeenCalledWith({
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 5,
      });
    });

    it('should handle partial lines across chunks', () => {
      const textHandler = vi.fn();
      processor.on('text', textHandler);

      const event = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      };
      const jsonStr = JSON.stringify(event);

      // Send data in two chunks
      processor.handleData(jsonStr.slice(0, 10));
      expect(textHandler).not.toHaveBeenCalled();

      processor.handleData(jsonStr.slice(10) + '\n');
      expect(textHandler).toHaveBeenCalledWith({ text: 'Hello' });
    });

    it('should filter ANSI escape sequences', () => {
      const textHandler = vi.fn();
      processor.on('text', textHandler);

      const event = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Clean text' }],
        },
      };
      // Add ANSI escape sequences around the JSON
      processor.handleData('\x1b[32m' + JSON.stringify(event) + '\x1b[0m\n');

      expect(textHandler).toHaveBeenCalledWith({ text: 'Clean text' });
    });

    it('should ignore non-JSON lines', () => {
      const textHandler = vi.fn();
      processor.on('text', textHandler);

      processor.handleData('This is not JSON\n');
      processor.handleData('Also not JSON\n');

      expect(textHandler).not.toHaveBeenCalled();
    });
  });

  describe('permission mode', () => {
    it('should have default permission mode initially', () => {
      expect(processor.permissionMode).toBe('default');
    });

    it('should update permission mode and emit event', () => {
      const modeHandler = vi.fn();
      processor.on('permission_mode_changed', modeHandler);

      processor.updatePermissionMode('acceptEdits');

      expect(processor.permissionMode).toBe('acceptEdits');
      expect(modeHandler).toHaveBeenCalledWith({ permissionMode: 'acceptEdits' });
    });

    it('should handle permission mode variations', () => {
      processor.updatePermissionMode('ask');
      expect(processor.permissionMode).toBe('default');

      processor.updatePermissionMode('auto-edit');
      expect(processor.permissionMode).toBe('acceptEdits');
    });

    it('should not emit event for same mode', () => {
      const modeHandler = vi.fn();
      processor.on('permission_mode_changed', modeHandler);

      processor.updatePermissionMode('default');

      expect(modeHandler).not.toHaveBeenCalled();
    });

    it('should set initial permission mode', () => {
      processor.setInitialPermissionMode('plan');
      expect(processor.permissionMode).toBe('plan');
    });

    it('should calculate correct Shift+Tab steps for mode change', () => {
      const writeFn = vi.fn();

      // default -> acceptEdits: 1 step
      processor.requestPermissionModeChange('acceptEdits', writeFn);
      expect(writeFn).toHaveBeenCalledTimes(1);
      expect(writeFn).toHaveBeenCalledWith('\x1b[Z');

      writeFn.mockClear();
      processor.setInitialPermissionMode('default');

      // default -> plan: 2 steps
      processor.requestPermissionModeChange('plan', writeFn);
      expect(writeFn).toHaveBeenCalledTimes(2);
    });

    it('should return false when no writeFn provided', () => {
      const result = processor.requestPermissionModeChange('acceptEdits', null);
      expect(result).toBe(false);
    });

    it('should return false when already at target mode', () => {
      const writeFn = vi.fn();
      const result = processor.requestPermissionModeChange('default', writeFn);
      expect(result).toBe(false);
      expect(writeFn).not.toHaveBeenCalled();
    });

    it('should update mode from system event', () => {
      const modeHandler = vi.fn();
      processor.on('permission_mode_changed', modeHandler);

      const event = {
        type: 'system',
        permissionMode: 'plan',
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(processor.permissionMode).toBe('plan');
      expect(modeHandler).toHaveBeenCalledWith({ permissionMode: 'plan' });
    });
  });

  describe('buffer management', () => {
    it('should reset buffer', () => {
      const textHandler = vi.fn();
      processor.on('text', textHandler);

      // Send partial data
      processor.handleData('{"type":"assistant","message":{');

      // Reset buffer
      processor.resetBuffer();

      // Send complete data - should not crash due to leftover buffer
      const event = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'After reset' }],
        },
      };
      processor.handleData(JSON.stringify(event) + '\n');

      expect(textHandler).toHaveBeenCalledWith({ text: 'After reset' });
    });
  });
});
