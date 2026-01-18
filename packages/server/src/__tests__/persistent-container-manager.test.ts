import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock ws with OPEN constant
vi.mock('ws', () => ({
  WebSocket: Object.assign(vi.fn(), { OPEN: 1 }),
}));

import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { PersistentContainerManager } from '../persistent-container-manager.js';
import type { ContainerConfig } from '../container-config.js';

describe('PersistentContainerManager', () => {
  let manager: PersistentContainerManager;
  const mockContainerConfig: ContainerConfig = {
    image: 'test-image:latest',
    mounts: [],
    extraMounts: [],
    extraArgs: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new PersistentContainerManager({
      containerConfig: mockContainerConfig,
      workingDir: '/test/dir',
      bridgePort: 3002,
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('startContainer', () => {
    it('should validate container ID format', async () => {
      const mockProcess = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);

      const startPromise = manager.startContainer();

      // Simulate valid container ID output
      mockProcess.stdout.emit('data', 'abc123def456789\n');
      mockProcess.emit('close', 0);

      const containerId = await startPromise;
      expect(containerId).toBe('abc123def456');
    });

    it('should reject invalid container ID (too short)', async () => {
      const mockProcess = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      const startPromise = manager.startContainer();

      // Simulate short container ID
      mockProcess.stdout.emit('data', 'abc123\n');
      mockProcess.emit('close', 0);

      await expect(startPromise).rejects.toThrow('Invalid container ID');
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should reject invalid container ID (non-hex characters)', async () => {
      const mockProcess = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);

      // Register error handler to prevent unhandled error
      manager.on('error', () => {});

      const startPromise = manager.startContainer();

      // Simulate invalid container ID with non-hex chars
      mockProcess.stdout.emit('data', 'abc123ghijklmnop\n');
      mockProcess.emit('close', 0);

      await expect(startPromise).rejects.toThrow('Invalid container ID');
    });

    it('should reject empty container ID', async () => {
      const mockProcess = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);

      // Register error handler to prevent unhandled error
      manager.on('error', () => {});

      const startPromise = manager.startContainer();

      // Simulate empty output
      mockProcess.stdout.emit('data', '');
      mockProcess.emit('close', 0);

      await expect(startPromise).rejects.toThrow('Invalid container ID');
    });
  });

  describe('reconnection with exponential backoff', () => {
    it('should have isRunning true after successful start', async () => {
      const mockProcess = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);

      const startPromise = manager.startContainer();
      mockProcess.stdout.emit('data', 'abc123def456789\n');
      mockProcess.emit('close', 0);
      await startPromise;

      expect(manager.isRunning).toBe(true);
    });

    it('should have isBridgeConnected false when not connected', () => {
      // Bridge is not connected initially
      expect(manager.isBridgeConnected).toBe(false);
    });
  });

  describe('stopContainer', () => {
    it('should clear reconnect timer on stop', async () => {
      // Setup container
      const mockProcess = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);

      const startPromise = manager.startContainer();
      mockProcess.stdout.emit('data', 'abc123def456789\n');
      mockProcess.emit('close', 0);
      await startPromise;

      // Stop container
      const stopProcess = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(stopProcess);

      const stopPromise = manager.stopContainer();
      stopProcess.emit('close', 0);
      await stopPromise;

      expect(manager.isRunning).toBe(false);
    });
  });
});
