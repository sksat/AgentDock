import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeRunner, ClaudeRunnerOptions, ClaudeRunnerEvents } from '../claude-runner.js';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;

// Create mock process
function createMockProcess(): {
  process: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
} {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = {
    write: vi.fn(),
    end: vi.fn(),
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

  describe('start', () => {
    it('should spawn claude process with correct arguments', async () => {
      const runner = new ClaudeRunner();
      runner.start('Hello Claude');

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '-p', 'Hello Claude',
          '--output-format', 'stream-json',
        ]),
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
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

      // Simulate stream-json output
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

  describe('error handling', () => {
    it('should emit error event on stderr', async () => {
      const runner = new ClaudeRunner();
      const errorHandler = vi.fn();
      runner.on('error', errorHandler);

      runner.start('test');

      mockProcess.stderr.emit('data', Buffer.from('Some error occurred'));

      expect(errorHandler).toHaveBeenCalledWith({
        type: 'stderr',
        message: 'Some error occurred',
      });
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

      mockProcess.process.emit('exit', null, 'SIGTERM');

      expect(exitHandler).toHaveBeenCalledWith({ code: null, signal: 'SIGTERM' });
    });
  });

  describe('stop', () => {
    it('should kill the process with SIGINT', async () => {
      const runner = new ClaudeRunner();
      runner.start('test');

      runner.stop();

      expect(mockProcess.process.kill).toHaveBeenCalledWith('SIGINT');
    });

    it('should not throw if process not started', async () => {
      const runner = new ClaudeRunner();
      expect(() => runner.stop()).not.toThrow();
    });
  });

  describe('sendInput', () => {
    it('should write to stdin', async () => {
      const runner = new ClaudeRunner();
      runner.start('test');

      runner.sendInput('user input');

      expect(mockProcess.stdin.write).toHaveBeenCalledWith('user input\n');
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
});
