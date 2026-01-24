import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeRunner, ClaudeRunnerOptions, ClaudeRunnerEvents, ClaudePermissionMode } from '../claude-runner.js';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// Mock child_process for pipes mode
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock node-pty (not used in current implementation, but kept for compatibility)
vi.mock('node-pty', () => ({
  default: {
    spawn: vi.fn(),
  },
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import * as pty from 'node-pty';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;
const mockPtySpawn = pty.spawn as ReturnType<typeof vi.fn>;

// Create mock child process (for pipes mode)
function createMockProcess(): {
  process: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; writableEnded: boolean };
} {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = {
    write: vi.fn(),
    end: vi.fn(),
    writableEnded: false,
  };
  const process = new EventEmitter() as ChildProcess;
  (process as unknown as { stdout: EventEmitter }).stdout = stdout;
  (process as unknown as { stderr: EventEmitter }).stderr = stderr;
  (process as unknown as { stdin: typeof stdin }).stdin = stdin;
  (process as unknown as { pid: number }).pid = 12345;
  (process as unknown as { kill: ReturnType<typeof vi.fn> }).kill = vi.fn();
  return { process, stdout, stderr, stdin };
}

describe('ClaudeRunner', () => {
  let mockProcess: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess.process);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const runner = new ClaudeRunner();
      expect(runner).toBeInstanceOf(ClaudeRunner);
    });

    it('should create instance with custom options', () => {
      const options: ClaudeRunnerOptions = {
        workingDir: '/path/to/project',
        claudePath: '/custom/claude',
        mcpConfigPath: '/path/to/mcp-config.json',
      };
      const runner = new ClaudeRunner(options);
      expect(runner).toBeInstanceOf(ClaudeRunner);
    });
  });

  describe('start (pipes mode)', () => {
    it('should spawn claude process with stream-json input format', async () => {
      const runner = new ClaudeRunner();
      runner.start('Hello Claude');

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '-p', '',
          '--input-format', 'stream-json',
          '--output-format', 'stream-json',
        ]),
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
    });

    it('should write user message to stdin', async () => {
      const runner = new ClaudeRunner();
      runner.start('Hello Claude');

      expect(mockProcess.stdin.write).toHaveBeenCalled();
      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const parsed = JSON.parse(writtenData.replace('\n', ''));
      expect(parsed.type).toBe('user');
      expect(parsed.message.content[0].text).toBe('Hello Claude');
    });

    it('should keep stdin open for control_request messages', async () => {
      const runner = new ClaudeRunner();
      runner.start('Hello Claude');

      // stdin.end should NOT be called (kept open for control_request)
      expect(mockProcess.stdin.end).not.toHaveBeenCalled();
    });

    it('should use custom working directory', async () => {
      const runner = new ClaudeRunner({ workingDir: '/custom/dir' });
      runner.start('test');

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: '/custom/dir',
        })
      );
    });

    it('should use custom claude path', async () => {
      const runner = new ClaudeRunner({ claudePath: '/usr/local/bin/claude' });
      runner.start('test');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should include --resume flag when sessionId provided', async () => {
      const runner = new ClaudeRunner();
      runner.start('test', { sessionId: 'abc123' });

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--resume', 'abc123']),
        expect.any(Object)
      );
    });

    it('should include --permission-prompt-tool when mcpConfigPath provided', async () => {
      const runner = new ClaudeRunner({
        mcpConfigPath: '/path/to/mcp.json',
        permissionToolName: 'mcp__bridge__permission_prompt',
      });
      runner.start('test');

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '--permission-prompt-tool', 'mcp__bridge__permission_prompt',
          '--mcp-config', '/path/to/mcp.json',
        ]),
        expect.any(Object)
      );
    });

    it('should emit started event', async () => {
      const runner = new ClaudeRunner();
      const startedHandler = vi.fn();
      runner.on('started', startedHandler);

      runner.start('test');

      expect(startedHandler).toHaveBeenCalledWith({ pid: 12345 });
    });
  });

  describe('stream-json parsing', () => {
    it('should emit text event for assistant message', async () => {
      const runner = new ClaudeRunner();
      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('test');

      const assistantMessage = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello!' }],
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(assistantMessage + '\n'));

      expect(textHandler).toHaveBeenCalledWith({ text: 'Hello!' });
    });

    it('should emit tool_use event', async () => {
      const runner = new ClaudeRunner();
      const toolUseHandler = vi.fn();
      runner.on('tool_use', toolUseHandler);

      runner.start('test');

      const toolUseMessage = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'tool_123',
            name: 'Bash',
            input: { command: 'ls -la' },
          }],
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(toolUseMessage + '\n'));

      expect(toolUseHandler).toHaveBeenCalledWith({
        id: 'tool_123',
        name: 'Bash',
        input: { command: 'ls -la' },
      });
    });

    it('should emit tool_result event', async () => {
      const runner = new ClaudeRunner();
      const toolResultHandler = vi.fn();
      runner.on('tool_result', toolResultHandler);

      runner.start('test');

      const toolResultMessage = JSON.stringify({
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool_123',
            content: 'file1.txt\nfile2.txt',
          }],
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(toolResultMessage + '\n'));

      expect(toolResultHandler).toHaveBeenCalledWith({
        toolUseId: 'tool_123',
        content: 'file1.txt\nfile2.txt',
        isError: false,
      });
    });

    it('should emit result event when process completes', async () => {
      const runner = new ClaudeRunner();
      const resultHandler = vi.fn();
      runner.on('result', resultHandler);

      runner.start('test');

      const resultMessage = JSON.stringify({
        type: 'result',
        result: 'Task completed successfully',
        session_id: 'session_abc',
      });
      mockProcess.stdout.emit('data', Buffer.from(resultMessage + '\n'));

      expect(resultHandler).toHaveBeenCalledWith({
        result: 'Task completed successfully',
        sessionId: 'session_abc',
      });
    });

    it('should handle multiple lines in single chunk', async () => {
      const runner = new ClaudeRunner();
      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('test');

      const multiLine = [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Line 1' }] } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Line 2' }] } }),
      ].join('\n') + '\n';

      mockProcess.stdout.emit('data', Buffer.from(multiLine));

      expect(textHandler).toHaveBeenCalledTimes(2);
      expect(textHandler).toHaveBeenNthCalledWith(1, { text: 'Line 1' });
      expect(textHandler).toHaveBeenNthCalledWith(2, { text: 'Line 2' });
    });

    it('should handle partial lines across chunks', async () => {
      const runner = new ClaudeRunner();
      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('test');

      const fullLine = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Complete' }] },
      });

      // Send partial data
      mockProcess.stdout.emit('data', Buffer.from(fullLine.slice(0, 20)));
      expect(textHandler).not.toHaveBeenCalled();

      // Send rest of data
      mockProcess.stdout.emit('data', Buffer.from(fullLine.slice(20) + '\n'));
      expect(textHandler).toHaveBeenCalledWith({ text: 'Complete' });
    });
  });

  describe('exit handling', () => {
    it('should emit exit event when process exits', async () => {
      const runner = new ClaudeRunner();
      const exitHandler = vi.fn();
      runner.on('exit', exitHandler);

      runner.start('test');

      mockProcess.process.emit('exit', 0, null);

      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: null });
    });

    it('should emit exit event with signal when killed', async () => {
      const runner = new ClaudeRunner();
      const exitHandler = vi.fn();
      runner.on('exit', exitHandler);

      runner.start('test');

      mockProcess.process.emit('exit', 0, 'SIGTERM');

      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: 'SIGTERM' });
    });

    it('should emit error event on process error', async () => {
      const runner = new ClaudeRunner();
      const errorHandler = vi.fn();
      runner.on('error', errorHandler);

      runner.start('test');

      const error = new Error('Process failed');
      mockProcess.process.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith({
        type: 'process',
        message: 'Process failed',
        error,
      });
    });
  });

  describe('stop', () => {
    it('should kill the child process', async () => {
      const runner = new ClaudeRunner();
      runner.start('test');

      runner.stop();

      expect(mockProcess.process.kill).toHaveBeenCalled();
    });

    it('should not throw if process not started', async () => {
      const runner = new ClaudeRunner();
      expect(() => runner.stop()).not.toThrow();
    });
  });

  describe('isRunning', () => {
    it('should return false before start', () => {
      const runner = new ClaudeRunner();
      expect(runner.isRunning).toBe(false);
    });

    it('should return true after start', () => {
      const runner = new ClaudeRunner();
      runner.start('test');
      expect(runner.isRunning).toBe(true);
    });

    it('should return false after exit', () => {
      const runner = new ClaudeRunner();
      runner.start('test');
      mockProcess.process.emit('exit', 0, null);
      expect(runner.isRunning).toBe(false);
    });
  });

  describe('system event', () => {
    it('should emit system event for system messages', async () => {
      const runner = new ClaudeRunner();
      const systemHandler = vi.fn();
      runner.on('system', systemHandler);

      runner.start('test');

      const systemMessage = JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'session_123',
        tools: ['Bash', 'Read', 'Write'],
      });
      mockProcess.stdout.emit('data', Buffer.from(systemMessage + '\n'));

      expect(systemHandler).toHaveBeenCalledWith({
        subtype: 'init',
        sessionId: 'session_123',
        tools: ['Bash', 'Read', 'Write'],
      });
    });
  });

  describe('image support', () => {
    it('should use stream-json input format when images are provided', async () => {
      const runner = new ClaudeRunner();
      runner.start('What color is this?', {
        images: [{
          type: 'image',
          data: 'base64encodeddata',
          mediaType: 'image/png',
        }],
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '-p', '',
          '--input-format', 'stream-json',
          '--output-format', 'stream-json',
        ]),
        expect.any(Object)
      );
    });

    it('should write image message to stdin when images are provided', async () => {
      const runner = new ClaudeRunner();
      runner.start('What color is this?', {
        images: [{
          type: 'image',
          data: 'base64encodeddata',
          mediaType: 'image/png',
        }],
      });

      expect(mockProcess.stdin.write).toHaveBeenCalled();
      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const parsedMessage = JSON.parse(writtenData.replace('\n', ''));

      expect(parsedMessage.type).toBe('user');
      expect(parsedMessage.message.role).toBe('user');
      expect(parsedMessage.message.content).toHaveLength(2); // image + text
      expect(parsedMessage.message.content[0].type).toBe('image');
      expect(parsedMessage.message.content[0].source.type).toBe('base64');
      expect(parsedMessage.message.content[0].source.media_type).toBe('image/png');
      expect(parsedMessage.message.content[0].source.data).toBe('base64encodeddata');
      expect(parsedMessage.message.content[1].type).toBe('text');
      expect(parsedMessage.message.content[1].text).toBe('What color is this?');
    });

    it('should handle multiple images', async () => {
      const runner = new ClaudeRunner();
      runner.start('Compare these images', {
        images: [
          { type: 'image', data: 'data1', mediaType: 'image/png' },
          { type: 'image', data: 'data2', mediaType: 'image/jpeg' },
        ],
      });

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const parsedMessage = JSON.parse(writtenData.replace('\n', ''));

      expect(parsedMessage.message.content).toHaveLength(3); // 2 images + 1 text
      expect(parsedMessage.message.content[0].type).toBe('image');
      expect(parsedMessage.message.content[1].type).toBe('image');
      expect(parsedMessage.message.content[2].type).toBe('text');
    });

    it('should emit events from child process stdout with images', async () => {
      const runner = new ClaudeRunner();
      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('What color?', {
        images: [{ type: 'image', data: 'data', mediaType: 'image/png' }],
      });

      const assistantMessage = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'The color is red.' }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(assistantMessage + '\n'));

      expect(textHandler).toHaveBeenCalledWith({ text: 'The color is red.' });
    });
  });

  describe('permission mode', () => {
    it('should have default permission mode initially', () => {
      const runner = new ClaudeRunner();
      expect(runner.permissionMode).toBe('default');
    });

    describe('updatePermissionMode', () => {
      it('should update permission mode and emit event', () => {
        const runner = new ClaudeRunner();
        const modeChangedHandler = vi.fn();
        runner.on('permission_mode_changed', modeChangedHandler);

        runner.updatePermissionMode('acceptEdits');

        expect(runner.permissionMode).toBe('acceptEdits');
        expect(modeChangedHandler).toHaveBeenCalledWith({ permissionMode: 'acceptEdits' });
      });

      it('should not emit event if mode is the same', () => {
        const runner = new ClaudeRunner();
        const modeChangedHandler = vi.fn();
        runner.on('permission_mode_changed', modeChangedHandler);

        runner.updatePermissionMode('default');

        expect(modeChangedHandler).not.toHaveBeenCalled();
      });

      it('should handle variation "normal" as "default"', () => {
        const runner = new ClaudeRunner();
        runner.updatePermissionMode('acceptEdits'); // Change first
        runner.updatePermissionMode('normal');
        expect(runner.permissionMode).toBe('default');
      });

      it('should handle variation "ask" as "default"', () => {
        const runner = new ClaudeRunner();
        runner.updatePermissionMode('acceptEdits'); // Change first
        runner.updatePermissionMode('ask');
        expect(runner.permissionMode).toBe('default');
      });

      it('should handle variation "auto-edit" as "acceptEdits"', () => {
        const runner = new ClaudeRunner();
        runner.updatePermissionMode('auto-edit');
        expect(runner.permissionMode).toBe('acceptEdits');
      });

      it('should handle variation "autoEdit" as "acceptEdits"', () => {
        const runner = new ClaudeRunner();
        runner.updatePermissionMode('autoEdit');
        expect(runner.permissionMode).toBe('acceptEdits');
      });

      it('should ignore unknown mode', () => {
        const runner = new ClaudeRunner();
        const modeChangedHandler = vi.fn();
        runner.on('permission_mode_changed', modeChangedHandler);

        runner.updatePermissionMode('unknownMode');

        expect(runner.permissionMode).toBe('default');
        expect(modeChangedHandler).not.toHaveBeenCalled();
      });
    });

    describe('requestPermissionModeChange', () => {
      it('should return false if already at target mode', () => {
        const runner = new ClaudeRunner();
        runner.start('test');

        const result = runner.requestPermissionModeChange('default');

        expect(result).toBe(false);
      });

      it('should return false if no process started', () => {
        const runner = new ClaudeRunner();
        // Don't start - no process

        const result = runner.requestPermissionModeChange('acceptEdits');

        expect(result).toBe(false);
      });

      it('should send control_request to change mode', () => {
        const runner = new ClaudeRunner();
        runner.start('test');
        vi.clearAllMocks(); // Clear the initial user message write

        const result = runner.requestPermissionModeChange('acceptEdits');

        expect(result).toBe(true);
        // Should send control_request via stdin
        expect(mockProcess.stdin.write).toHaveBeenCalledTimes(1);
        const call = mockProcess.stdin.write.mock.calls[0][0];
        const parsed = JSON.parse(call.replace('\n', ''));
        expect(parsed.type).toBe('control_request');
        expect(parsed.request.subtype).toBe('set_permission_mode');
        expect(parsed.request.mode).toBe('acceptEdits');
      });

      it('should send control_request for any mode change', () => {
        const runner = new ClaudeRunner();
        runner.start('test');
        runner.updatePermissionMode('acceptEdits');
        vi.clearAllMocks();

        const result = runner.requestPermissionModeChange('plan');

        expect(result).toBe(true);
        const call = mockProcess.stdin.write.mock.calls[0][0];
        const parsed = JSON.parse(call.replace('\n', ''));
        expect(parsed.request.mode).toBe('plan');
      });

      it('should work for mode change from plan to default', () => {
        const runner = new ClaudeRunner();
        runner.start('test');
        runner.updatePermissionMode('plan');
        vi.clearAllMocks();

        const result = runner.requestPermissionModeChange('default');

        expect(result).toBe(true);
        const call = mockProcess.stdin.write.mock.calls[0][0];
        const parsed = JSON.parse(call.replace('\n', ''));
        expect(parsed.request.mode).toBe('default');
      });
    });

    describe('system event with permissionMode', () => {
      it('should update permission mode from system event', () => {
        const runner = new ClaudeRunner();
        const modeChangedHandler = vi.fn();
        runner.on('permission_mode_changed', modeChangedHandler);
        runner.start('test');

        const systemMessage = JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session_123',
          permissionMode: 'acceptEdits',
        });
        mockProcess.stdout.emit('data', Buffer.from(systemMessage + '\n'));

        expect(runner.permissionMode).toBe('acceptEdits');
        expect(modeChangedHandler).toHaveBeenCalledWith({ permissionMode: 'acceptEdits' });
      });

      it('should not emit if permissionMode not in system event', () => {
        const runner = new ClaudeRunner();
        const modeChangedHandler = vi.fn();
        runner.on('permission_mode_changed', modeChangedHandler);
        runner.start('test');

        const systemMessage = JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session_123',
        });
        mockProcess.stdout.emit('data', Buffer.from(systemMessage + '\n'));

        expect(modeChangedHandler).not.toHaveBeenCalled();
      });
    });

    describe('control_response handling', () => {
      it('should emit control_response event on success', () => {
        const runner = new ClaudeRunner();
        const controlResponseHandler = vi.fn();
        runner.on('control_response', controlResponseHandler);
        runner.start('test');

        const controlResponse = JSON.stringify({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'req_123',
            response: { mode: 'acceptEdits' },
          },
        });
        mockProcess.stdout.emit('data', Buffer.from(controlResponse + '\n'));

        expect(controlResponseHandler).toHaveBeenCalledWith({
          subtype: 'success',
          request_id: 'req_123',
          response: { mode: 'acceptEdits' },
          error: undefined,
        });
      });

      it('should update permission mode from successful control_response', () => {
        const runner = new ClaudeRunner();
        const modeChangedHandler = vi.fn();
        runner.on('permission_mode_changed', modeChangedHandler);
        runner.start('test');

        const controlResponse = JSON.stringify({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'req_123',
            response: { mode: 'plan' },
          },
        });
        mockProcess.stdout.emit('data', Buffer.from(controlResponse + '\n'));

        expect(runner.permissionMode).toBe('plan');
        expect(modeChangedHandler).toHaveBeenCalledWith({ permissionMode: 'plan' });
      });

      it('should emit control_response event on error', () => {
        const runner = new ClaudeRunner();
        const controlResponseHandler = vi.fn();
        runner.on('control_response', controlResponseHandler);
        runner.start('test');

        const controlResponse = JSON.stringify({
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id: 'req_123',
            error: 'Invalid mode',
          },
        });
        mockProcess.stdout.emit('data', Buffer.from(controlResponse + '\n'));

        expect(controlResponseHandler).toHaveBeenCalledWith({
          subtype: 'error',
          request_id: 'req_123',
          response: undefined,
          error: 'Invalid mode',
        });
      });
    });
  });
});
