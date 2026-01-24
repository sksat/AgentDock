import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunnerManager } from '../runner-manager.js';
import { ClaudeRunner } from '../claude-runner.js';
import { EventEmitter } from 'events';

// Mock ClaudeRunner
vi.mock('../claude-runner.js', () => ({
  ClaudeRunner: vi.fn(function() {
    const emitter = new EventEmitter();
    return {
      ...emitter,
      on: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
      start: vi.fn(),
      stop: vi.fn(),
      interrupt: vi.fn(),
      sendInput: vi.fn(),
      isRunning: false,
    };
  }),
}));

describe('RunnerManager', () => {
  let manager: RunnerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new RunnerManager();
  });

  afterEach(() => {
    manager.stopAll();
  });

  describe('startSession', () => {
    it('should create and start a runner for a new session', () => {
      const eventHandler = vi.fn();
      manager.startSession('session1', 'Hello Claude', {
        workingDir: '/test/dir',
        onEvent: eventHandler,
      });

      expect(ClaudeRunner).toHaveBeenCalledWith({
        workingDir: '/test/dir',
        claudePath: undefined,
        mcpConfigPath: undefined,
        permissionToolName: undefined,
      });

      const runner = manager.getRunner('session1');
      expect(runner).toBeDefined();
      expect(runner?.start).toHaveBeenCalledWith('Hello Claude', {
        sessionId: undefined,
        images: undefined,
      });
    });

    it('should use existing claude session ID when provided', () => {
      manager.startSession('session1', 'Hello', {
        claudeSessionId: 'claude-abc123',
        onEvent: vi.fn(),
      });

      const runner = manager.getRunner('session1');
      expect(runner?.start).toHaveBeenCalledWith('Hello', {
        sessionId: 'claude-abc123',
        images: undefined,
      });
    });

    it('should pass images to runner when provided', () => {
      const images = [{
        type: 'image' as const,
        data: 'base64data',
        mediaType: 'image/png' as const,
      }];

      manager.startSession('session1', 'What color?', {
        images,
        onEvent: vi.fn(),
      });

      const runner = manager.getRunner('session1');
      expect(runner?.start).toHaveBeenCalledWith('What color?', {
        sessionId: undefined,
        images,
      });
    });

    it('should forward runner events to event handler', () => {
      const eventHandler = vi.fn();
      manager.startSession('session1', 'test', { onEvent: eventHandler });

      const runner = manager.getRunner('session1') as unknown as EventEmitter;
      runner.emit('text', { text: 'Hello!' });

      expect(eventHandler).toHaveBeenCalledWith('session1', 'text', { text: 'Hello!' });
    });

    it('should forward all event types', () => {
      const eventHandler = vi.fn();
      manager.startSession('session1', 'test', { onEvent: eventHandler });

      const runner = manager.getRunner('session1') as unknown as EventEmitter;

      runner.emit('text', { text: 'test' });
      runner.emit('tool_use', { id: '1', name: 'Bash', input: {} });
      runner.emit('tool_result', { toolUseId: '1', content: 'ok', isError: false });
      runner.emit('result', { result: 'done', sessionId: 'abc' });
      runner.emit('error', { type: 'stderr', message: 'err' });
      runner.emit('exit', { code: 0, signal: null });
      runner.emit('system', { subtype: 'init', sessionId: 'abc' });

      expect(eventHandler).toHaveBeenCalledTimes(7);
    });

    it('should throw if session already running', () => {
      manager.startSession('session1', 'test', { onEvent: vi.fn() });

      // Mock isRunning to return true
      const runner = manager.getRunner('session1');
      (runner as unknown as { isRunning: boolean }).isRunning = true;

      expect(() => {
        manager.startSession('session1', 'test2', { onEvent: vi.fn() });
      }).toThrow('Session session1 is already running');
    });
  });

  describe('stopSession', () => {
    it('should stop a running session', () => {
      manager.startSession('session1', 'test', { onEvent: vi.fn() });
      const runner = manager.getRunner('session1');

      manager.stopSession('session1');

      expect(runner?.stop).toHaveBeenCalled();
    });

    it('should remove runner from manager after stop', () => {
      manager.startSession('session1', 'test', { onEvent: vi.fn() });
      const runner = manager.getRunner('session1') as unknown as EventEmitter;

      // Simulate exit event
      runner.emit('exit', { code: 0, signal: null });

      expect(manager.getRunner('session1')).toBeUndefined();
    });

    it('should not throw if session does not exist', () => {
      expect(() => manager.stopSession('nonexistent')).not.toThrow();
    });
  });

  describe('stopAll', () => {
    it('should stop all running sessions', () => {
      manager.startSession('session1', 'test1', { onEvent: vi.fn() });
      manager.startSession('session2', 'test2', { onEvent: vi.fn() });

      const runner1 = manager.getRunner('session1');
      const runner2 = manager.getRunner('session2');

      manager.stopAll();

      expect(runner1?.stop).toHaveBeenCalled();
      expect(runner2?.stop).toHaveBeenCalled();
    });
  });

  describe('hasRunningSession', () => {
    it('should return false for unknown session', () => {
      expect(manager.hasRunningSession('unknown')).toBe(false);
    });

    it('should return true for running session', () => {
      manager.startSession('session1', 'test', { onEvent: vi.fn() });
      const runner = manager.getRunner('session1');
      (runner as unknown as { isRunning: boolean }).isRunning = true;

      expect(manager.hasRunningSession('session1')).toBe(true);
    });

    it('should return false for stopped session', () => {
      manager.startSession('session1', 'test', { onEvent: vi.fn() });
      // isRunning defaults to false in mock

      expect(manager.hasRunningSession('session1')).toBe(false);
    });
  });

  describe('getRunningCount', () => {
    it('should return 0 when no sessions', () => {
      expect(manager.getRunningCount()).toBe(0);
    });

    it('should count running sessions', () => {
      manager.startSession('session1', 'test1', { onEvent: vi.fn() });
      manager.startSession('session2', 'test2', { onEvent: vi.fn() });

      const runner1 = manager.getRunner('session1');
      const runner2 = manager.getRunner('session2');
      (runner1 as unknown as { isRunning: boolean }).isRunning = true;
      (runner2 as unknown as { isRunning: boolean }).isRunning = true;

      expect(manager.getRunningCount()).toBe(2);
    });
  });
});
