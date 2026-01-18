import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContainerBrowserSessionManager } from '../container-browser-session-manager.js';
import type { PersistentContainerManager } from '../persistent-container-manager.js';
import { EventEmitter } from 'events';

// Mock PersistentContainerManager
function createMockContainerManager(): PersistentContainerManager & {
  sentCommands: Array<{ requestId: string; command: unknown }>;
  simulateMessage: (message: unknown) => void;
} {
  const emitter = new EventEmitter();
  const sentCommands: Array<{ requestId: string; command: unknown }> = [];

  const mock = {
    ...emitter,
    isRunning: true,
    isBridgeConnected: true,
    sentCommands,

    async startContainer() {
      return 'container-id';
    },

    async startBrowserBridge() {
      // Simulate bridge connected
      emitter.emit('bridge_connected');
    },

    async sendBrowserCommand(requestId: string, command: unknown) {
      sentCommands.push({ requestId, command });
      // Simulate successful response after short delay
      setTimeout(() => {
        emitter.emit('bridge_message', {
          type: 'command_result',
          requestId,
          success: true,
          result: null,
        });
      }, 10);
    },

    simulateMessage(message: unknown) {
      emitter.emit('bridge_message', message);
    },

    async stopContainer() {},

    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
  };

  return mock as unknown as PersistentContainerManager & typeof mock;
}

describe('ContainerBrowserSessionManager', () => {
  let manager: ContainerBrowserSessionManager;
  let mockContainerManager: ReturnType<typeof createMockContainerManager>;

  beforeEach(() => {
    manager = new ContainerBrowserSessionManager();
    mockContainerManager = createMockContainerManager();
  });

  describe('session lifecycle', () => {
    it('should create a session', async () => {
      await manager.createSession('session-1', mockContainerManager);
      expect(manager.hasSession('session-1')).toBe(true);
    });

    it('should throw if session already exists', async () => {
      await manager.createSession('session-1', mockContainerManager);
      await expect(manager.createSession('session-1', mockContainerManager))
        .rejects.toThrow('Session session-1 already exists');
    });

    it('should destroy a session', async () => {
      await manager.createSession('session-1', mockContainerManager);
      await manager.destroySession('session-1');
      expect(manager.hasSession('session-1')).toBe(false);
    });

    it('should destroy all sessions', async () => {
      await manager.createSession('session-1', mockContainerManager);
      await manager.createSession('session-2', createMockContainerManager());
      await manager.destroyAll();
      expect(manager.hasSession('session-1')).toBe(false);
      expect(manager.hasSession('session-2')).toBe(false);
    });

    it('should handle destroying non-existent session gracefully', async () => {
      await expect(manager.destroySession('non-existent')).resolves.not.toThrow();
    });
  });

  describe('command mapping', () => {
    beforeEach(async () => {
      await manager.createSession('session-1', mockContainerManager);
    });

    it('should map navigate to browser_navigate', async () => {
      await manager.executeCommand('session-1', 'navigate', { url: 'https://example.com' });

      expect(mockContainerManager.sentCommands.length).toBeGreaterThan(0);
      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'browser_navigate'
      );
      expect(cmd).toBeDefined();
      expect((cmd?.command as { url: string }).url).toBe('https://example.com');
    });

    it('should map click to browser_click', async () => {
      await manager.executeCommand('session-1', 'click', { x: 100, y: 200 });

      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'browser_click'
      );
      expect(cmd).toBeDefined();
    });

    it('should map snapshot to browser_snapshot', async () => {
      await manager.executeCommand('session-1', 'snapshot', {});

      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'browser_snapshot'
      );
      expect(cmd).toBeDefined();
    });

    it('should map screenshot to browser_screenshot', async () => {
      await manager.executeCommand('session-1', 'screenshot', { fullPage: true });

      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'browser_screenshot'
      );
      expect(cmd).toBeDefined();
    });

    it('should map take_screenshot to browser_screenshot', async () => {
      await manager.executeCommand('session-1', 'take_screenshot', {});

      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'browser_screenshot'
      );
      expect(cmd).toBeDefined();
    });

    it('should map close to close_browser', async () => {
      await manager.executeCommand('session-1', 'close', {});

      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'close_browser'
      );
      expect(cmd).toBeDefined();
    });

    it('should pass through already-prefixed commands', async () => {
      await manager.executeCommand('session-1', 'browser_navigate', { url: 'https://test.com' });

      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'browser_navigate'
      );
      expect(cmd).toBeDefined();
    });

    const commandMappings = [
      ['navigate', 'browser_navigate'],
      ['navigate_back', 'browser_navigate_back'],
      ['click', 'browser_click'],
      ['hover', 'browser_hover'],
      ['type', 'browser_type'],
      ['press_key', 'browser_press_key'],
      ['select_option', 'browser_select_option'],
      ['drag', 'browser_drag'],
      ['fill_form', 'browser_fill_form'],
      ['snapshot', 'browser_snapshot'],
      ['screenshot', 'browser_screenshot'],
      ['console_messages', 'browser_console_messages'],
      ['network_requests', 'browser_network_requests'],
      ['evaluate', 'browser_evaluate'],
      ['wait_for', 'browser_wait_for'],
      ['handle_dialog', 'browser_handle_dialog'],
      ['resize', 'browser_resize'],
      ['tabs', 'browser_tabs'],
      ['close', 'close_browser'],
    ];

    it.each(commandMappings)('should map %s to %s', async (shortName, bridgeType) => {
      mockContainerManager.sentCommands.length = 0;
      await manager.executeCommand('session-1', shortName, {});

      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === bridgeType
      );
      expect(cmd).toBeDefined();
    });
  });

  describe('convenience methods', () => {
    beforeEach(async () => {
      await manager.createSession('session-1', mockContainerManager);
    });

    it('should have click method', async () => {
      await manager.click('session-1', 100, 200);
      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string; x?: number; y?: number }).type === 'browser_click' &&
        (c.command as { x: number }).x === 100 &&
        (c.command as { y: number }).y === 200
      );
      expect(cmd).toBeDefined();
    });

    it('should have type method', async () => {
      await manager.type('session-1', 'Hello');
      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string; text?: string }).type === 'browser_type' &&
        (c.command as { text: string }).text === 'Hello'
      );
      expect(cmd).toBeDefined();
    });

    it('should have pressKey method', async () => {
      await manager.pressKey('session-1', 'Enter');
      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string; key?: string }).type === 'browser_press_key' &&
        (c.command as { key: string }).key === 'Enter'
      );
      expect(cmd).toBeDefined();
    });

    it('should have scroll method', async () => {
      await manager.scroll('session-1', 0, 100);
      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string }).type === 'browser_scroll'
      );
      expect(cmd).toBeDefined();
    });

    it('should have navigate method', async () => {
      await manager.navigate('session-1', 'https://example.com');
      const cmd = mockContainerManager.sentCommands.find(c =>
        (c.command as { type: string; url?: string }).type === 'browser_navigate' &&
        (c.command as { url: string }).url === 'https://example.com'
      );
      expect(cmd).toBeDefined();
    });
  });

  describe('events', () => {
    it('should emit status event on session creation', async () => {
      const statusHandler = vi.fn();
      manager.on('status', statusHandler);

      await manager.createSession('session-1', mockContainerManager);

      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          active: true,
        })
      );
    });

    it('should emit status event on bridge disconnect', async () => {
      const statusHandler = vi.fn();
      manager.on('status', statusHandler);

      await manager.createSession('session-1', mockContainerManager);
      statusHandler.mockClear();

      mockContainerManager.emit('bridge_disconnected');

      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          active: false,
        })
      );
    });

    it('should forward screencast frames', async () => {
      const frameHandler = vi.fn();
      manager.on('frame', frameHandler);

      await manager.createSession('session-1', mockContainerManager);

      mockContainerManager.simulateMessage({
        type: 'screencast_frame',
        data: 'base64data',
        metadata: { deviceWidth: 1280, deviceHeight: 720, timestamp: 12345 },
      });

      expect(frameHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          data: 'base64data',
          metadata: expect.objectContaining({
            deviceWidth: 1280,
            deviceHeight: 720,
          }),
        })
      );
    });

    it('should emit error event on error message', async () => {
      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      await manager.createSession('session-1', mockContainerManager);

      mockContainerManager.simulateMessage({
        type: 'error',
        message: 'Something went wrong',
      });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          message: 'Something went wrong',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw when executing command on non-existent session', async () => {
      await expect(manager.executeCommand('non-existent', 'navigate', { url: 'test' }))
        .rejects.toThrow('Session non-existent not found');
    });

    it('should reject pending requests on session destroy', async () => {
      // Create a mock that only responds to cleanup commands
      const slowMock = createMockContainerManager();
      const originalSend = slowMock.sendBrowserCommand.bind(slowMock);
      slowMock.sendBrowserCommand = async (requestId: string, command: unknown) => {
        const cmd = command as { type: string };
        // Respond to cleanup commands, but not to navigate
        if (cmd.type === 'stop_screencast' || cmd.type === 'close_browser' ||
            cmd.type === 'launch_browser' || cmd.type === 'start_screencast') {
          return originalSend(requestId, command);
        }
        // For navigate, don't respond (simulates slow command)
      };

      await manager.createSession('session-1', slowMock);

      // Start command but don't await yet
      const commandPromise = manager.executeCommand('session-1', 'navigate', { url: 'test' });

      // Give time for command to be sent
      await new Promise(resolve => setTimeout(resolve, 50));

      // Destroy session immediately
      await manager.destroySession('session-1');

      // Now the promise should reject
      await expect(commandPromise).rejects.toThrow('Session destroyed');
    });
  });
});
