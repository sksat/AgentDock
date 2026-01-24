import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeRunner, ClaudeRunnerOptions, ClaudeRunnerEvents, ClaudePermissionMode } from '../claude-runner.js';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// Mock child_process for image mode (pipes)
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock node-pty for PTY mode
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

// Create mock child process (for image mode)
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

// Create mock PTY process (for non-image mode)
function createMockPty(): {
  pty: {
    pid: number;
    onData: ReturnType<typeof vi.fn>;
    onExit: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
  };
  dataCallback: ((data: string) => void) | null;
  exitCallback: ((exitInfo: { exitCode: number; signal?: number }) => void) | null;
} {
  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: ((exitInfo: { exitCode: number; signal?: number }) => void) | null = null;

  const mockPty = {
    pid: 12345,
    onData: vi.fn((cb: (data: string) => void) => { dataCallback = cb; }),
    onExit: vi.fn((cb: (exitInfo: { exitCode: number; signal?: number }) => void) => { exitCallback = cb; }),
    write: vi.fn(),
    kill: vi.fn(),
  };

  return {
    pty: mockPty,
    get dataCallback() { return dataCallback; },
    get exitCallback() { return exitCallback; },
  };
}

describe('ClaudeRunner', () => {
  let mockProcess: ReturnType<typeof createMockProcess>;
  let mockPty: ReturnType<typeof createMockPty>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
    mockPty = createMockPty();
    mockSpawn.mockReturnValue(mockProcess.process);
    mockPtySpawn.mockReturnValue(mockPty.pty);
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

  describe('start (PTY mode - no images)', () => {
    it('should spawn claude process with correct arguments', async () => {
      const runner = new ClaudeRunner();
      runner.start('Hello Claude');

      expect(mockPtySpawn).toHaveBeenCalledWith(
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

      expect(mockPtySpawn).toHaveBeenCalledWith(
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

      expect(mockPtySpawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should include --resume flag when sessionId provided', async () => {
      const runner = new ClaudeRunner();
      runner.start('test', { sessionId: 'abc123' });

      expect(mockPtySpawn).toHaveBeenCalledWith(
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

      expect(mockPtySpawn).toHaveBeenCalledWith(
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

  describe('stream-json parsing (PTY mode)', () => {
    it('should emit text event for assistant message', async () => {
      const runner = new ClaudeRunner();
      const textHandler = vi.fn();
      runner.on('text', textHandler);

      runner.start('test');

      // Simulate stream-json output via PTY
      const assistantMessage = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello!' }],
        },
      });
      mockPty.dataCallback?.(assistantMessage + '\n');

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
      mockPty.dataCallback?.(toolUseMessage + '\n');

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
      mockPty.dataCallback?.(toolResultMessage + '\n');

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
      mockPty.dataCallback?.(resultMessage + '\n');

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

      mockPty.dataCallback?.(multiLine);

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
      mockPty.dataCallback?.(fullLine.slice(0, 20));
      expect(textHandler).not.toHaveBeenCalled();

      // Send rest of data
      mockPty.dataCallback?.(fullLine.slice(20) + '\n');
      expect(textHandler).toHaveBeenCalledWith({ text: 'Complete' });
    });
  });

  describe('exit handling (PTY mode)', () => {
    it('should emit exit event when process exits', async () => {
      const runner = new ClaudeRunner();
      const exitHandler = vi.fn();
      runner.on('exit', exitHandler);

      runner.start('test');

      mockPty.exitCallback?.({ exitCode: 0 });

      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: null });
    });

    it('should emit exit event with signal when killed', async () => {
      const runner = new ClaudeRunner();
      const exitHandler = vi.fn();
      runner.on('exit', exitHandler);

      runner.start('test');

      mockPty.exitCallback?.({ exitCode: 0, signal: 15 });

      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: '15' });
    });
  });

  describe('stop (PTY mode)', () => {
    it('should kill the PTY process', async () => {
      const runner = new ClaudeRunner();
      runner.start('test');

      runner.stop();

      expect(mockPty.pty.kill).toHaveBeenCalled();
    });

    it('should not throw if process not started', async () => {
      const runner = new ClaudeRunner();
      expect(() => runner.stop()).not.toThrow();
    });
  });

  describe('interrupt (PTY mode)', () => {
    it('should send Escape key to PTY', async () => {
      const runner = new ClaudeRunner();
      runner.start('test');

      runner.interrupt();

      expect(mockPty.pty.write).toHaveBeenCalledWith('\x1b');
    });

    it('should not kill the PTY process', async () => {
      const runner = new ClaudeRunner();
      runner.start('test');

      runner.interrupt();

      expect(mockPty.pty.kill).not.toHaveBeenCalled();
    });

    it('should not throw if process not started', async () => {
      const runner = new ClaudeRunner();
      expect(() => runner.interrupt()).not.toThrow();
    });
  });

  describe('sendInput (PTY mode)', () => {
    it('should write to PTY', async () => {
      const runner = new ClaudeRunner();
      runner.start('test');

      runner.sendInput('user input');

      expect(mockPty.pty.write).toHaveBeenCalledWith('user input\n');
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
      mockPty.exitCallback?.({ exitCode: 0 });
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
      mockPty.dataCallback?.(systemMessage + '\n');

      expect(systemHandler).toHaveBeenCalledWith({
        subtype: 'init',
        sessionId: 'session_123',
        tools: ['Bash', 'Read', 'Write'],
      });
    });
  });

  describe('image support (pipes mode)', () => {
    it('should use child_process.spawn with stream-json when images are provided', async () => {
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
      // PTY should not be used
      expect(mockPtySpawn).not.toHaveBeenCalled();
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

    it('should close stdin after writing image message', async () => {
      const runner = new ClaudeRunner();
      runner.start('What color?', {
        images: [{
          type: 'image',
          data: 'data',
          mediaType: 'image/jpeg',
        }],
      });

      expect(mockProcess.stdin.end).toHaveBeenCalled();
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

    it('should emit events from child process stdout', async () => {
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

    it('should emit exit event from child process', async () => {
      const runner = new ClaudeRunner();
      const exitHandler = vi.fn();
      runner.on('exit', exitHandler);

      runner.start('What color?', {
        images: [{ type: 'image', data: 'data', mediaType: 'image/png' }],
      });

      mockProcess.process.emit('exit', 0, null);

      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: null });
    });

    it('should emit error event from child process error', async () => {
      const runner = new ClaudeRunner();
      const errorHandler = vi.fn();
      runner.on('error', errorHandler);

      runner.start('What color?', {
        images: [{ type: 'image', data: 'data', mediaType: 'image/png' }],
      });

      const error = new Error('Process failed');
      mockProcess.process.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith({
        type: 'process',
        message: 'Process failed',
        error,
      });
    });

    it('should stop child process when stop is called', async () => {
      const runner = new ClaudeRunner();
      runner.start('What color?', {
        images: [{ type: 'image', data: 'data', mediaType: 'image/png' }],
      });

      runner.stop();

      expect(mockProcess.process.kill).toHaveBeenCalled();
    });
  });

  describe('mode selection', () => {
    it('should use PTY mode when no images', () => {
      const runner = new ClaudeRunner();
      runner.start('Hello');

      expect(mockPtySpawn).toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should use pipes mode when images are provided', () => {
      const runner = new ClaudeRunner();
      runner.start('Hello', {
        images: [{ type: 'image', data: 'data', mediaType: 'image/png' }],
      });

      expect(mockSpawn).toHaveBeenCalled();
      expect(mockPtySpawn).not.toHaveBeenCalled();
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
        expect(mockPty.pty.write).not.toHaveBeenCalledWith('\x1b[Z');
      });

      it('should return false if no PTY process', () => {
        const runner = new ClaudeRunner();
        // Don't start - no PTY

        const result = runner.requestPermissionModeChange('acceptEdits');

        expect(result).toBe(false);
      });

      it('should send Shift+Tab to change from default to acceptEdits (1 step)', () => {
        const runner = new ClaudeRunner();
        runner.start('test');

        const result = runner.requestPermissionModeChange('acceptEdits');

        expect(result).toBe(true);
        expect(mockPty.pty.write).toHaveBeenCalledTimes(1);
        expect(mockPty.pty.write).toHaveBeenCalledWith('\x1b[Z');
      });

      it('should send 2 Shift+Tabs to change from default to plan', () => {
        const runner = new ClaudeRunner();
        runner.start('test');

        const result = runner.requestPermissionModeChange('plan');

        expect(result).toBe(true);
        expect(mockPty.pty.write).toHaveBeenCalledTimes(2);
        expect(mockPty.pty.write).toHaveBeenNthCalledWith(1, '\x1b[Z');
        expect(mockPty.pty.write).toHaveBeenNthCalledWith(2, '\x1b[Z');
      });

      it('should send 1 Shift+Tab to change from acceptEdits to plan', () => {
        const runner = new ClaudeRunner();
        runner.start('test');
        runner.updatePermissionMode('acceptEdits');
        vi.clearAllMocks(); // Clear the write calls from start

        const result = runner.requestPermissionModeChange('plan');

        expect(result).toBe(true);
        expect(mockPty.pty.write).toHaveBeenCalledTimes(1);
      });

      it('should wrap around: plan to default needs 1 Shift+Tab', () => {
        const runner = new ClaudeRunner();
        runner.start('test');
        runner.updatePermissionMode('plan');
        vi.clearAllMocks();

        const result = runner.requestPermissionModeChange('default');

        expect(result).toBe(true);
        expect(mockPty.pty.write).toHaveBeenCalledTimes(1);
      });

      it('should wrap around: acceptEdits to default needs 2 Shift+Tabs', () => {
        const runner = new ClaudeRunner();
        runner.start('test');
        runner.updatePermissionMode('acceptEdits');
        vi.clearAllMocks();

        const result = runner.requestPermissionModeChange('default');

        expect(result).toBe(true);
        expect(mockPty.pty.write).toHaveBeenCalledTimes(2);
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
        mockPty.dataCallback?.(systemMessage + '\n');

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
        mockPty.dataCallback?.(systemMessage + '\n');

        expect(modeChangedHandler).not.toHaveBeenCalled();
      });
    });
  });
});
