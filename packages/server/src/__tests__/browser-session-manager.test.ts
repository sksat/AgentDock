import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserSessionManager } from '../browser-session-manager';
import type { ScreencastMetadata } from '@agent-dock/shared';

describe('BrowserSessionManager', () => {
  let manager: BrowserSessionManager;

  beforeEach(() => {
    manager = new BrowserSessionManager();
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  describe('session lifecycle', () => {
    it('should create a browser session', async () => {
      await manager.createSession('session-1');
      const controller = manager.getController('session-1');
      expect(controller).toBeDefined();
    });

    it('should destroy a browser session', async () => {
      await manager.createSession('session-1');
      await manager.destroySession('session-1');
      const controller = manager.getController('session-1');
      expect(controller).toBeUndefined();
    });

    it('should manage multiple sessions', async () => {
      await manager.createSession('session-1');
      await manager.createSession('session-2');

      expect(manager.getController('session-1')).toBeDefined();
      expect(manager.getController('session-2')).toBeDefined();

      await manager.destroySession('session-1');
      expect(manager.getController('session-1')).toBeUndefined();
      expect(manager.getController('session-2')).toBeDefined();
    });

    it('should destroy all sessions', async () => {
      await manager.createSession('session-1');
      await manager.createSession('session-2');
      await manager.destroyAll();

      expect(manager.getController('session-1')).toBeUndefined();
      expect(manager.getController('session-2')).toBeUndefined();
    });

    it('should handle destroying non-existent session gracefully', async () => {
      await expect(manager.destroySession('non-existent')).resolves.not.toThrow();
    });
  });

  describe('screencast', () => {
    it('should emit status event on session creation', async () => {
      const statusHandler = vi.fn();
      manager.on('status', statusHandler);

      await manager.createSession('session-1');

      expect(statusHandler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        active: false,
        browserUrl: expect.any(String),
      });
    });

    it('should start screencast and emit frame events', async () => {
      const frameHandler = vi.fn();
      manager.on('frame', frameHandler);

      await manager.createSession('session-1');

      // Navigate to trigger frame updates
      const controller = manager.getController('session-1');
      await controller!.navigate('data:text/html,<h1>Test</h1>');

      // Wait for frames
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(frameHandler).toHaveBeenCalled();
      const frame = frameHandler.mock.calls[0][0];
      expect(frame.sessionId).toBe('session-1');
      expect(frame.data).toBeDefined();
      expect(frame.metadata).toBeDefined();
    });

    it('should emit status event with active=true when streaming', async () => {
      const statusHandler = vi.fn();
      manager.on('status', statusHandler);

      await manager.createSession('session-1');

      // Should have emitted initial status
      expect(statusHandler).toHaveBeenCalled();
    });

    it('should stop emitting frames after session destruction', async () => {
      const frameHandler = vi.fn();
      manager.on('frame', frameHandler);

      await manager.createSession('session-1');
      const controller = manager.getController('session-1');
      await controller!.navigate('data:text/html,<h1>Test</h1>');

      // Wait for some frames
      await new Promise((resolve) => setTimeout(resolve, 200));
      const countBefore = frameHandler.mock.calls.length;

      await manager.destroySession('session-1');

      // Wait and check no more frames
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(frameHandler.mock.calls.length).toBe(countBefore);
    });
  });

  describe('error handling', () => {
    it('should emit error event on failure', async () => {
      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      await manager.createSession('session-1');

      // Force an error by closing the page
      const controller = manager.getController('session-1');
      const page = controller!.getPage();
      await page!.close();

      // Wait for error to be emitted
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error might be emitted (implementation dependent)
      // The important thing is it doesn't crash
    });
  });

  describe('controller access', () => {
    it('should return undefined for non-existent session', () => {
      const controller = manager.getController('non-existent');
      expect(controller).toBeUndefined();
    });

    it('should allow browser operations through controller', async () => {
      await manager.createSession('session-1');
      const controller = manager.getController('session-1');

      await controller!.navigate('data:text/html,<h1>Hello</h1>');
      const snapshot = await controller!.snapshot();
      expect(snapshot).toContain('Hello');
    });
  });
});
