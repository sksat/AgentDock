import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserManager } from '../browser-manager.js';

// Note: These are integration tests that actually launch Chromium
// For faster unit tests, you could mock playwright-core

describe('BrowserManager', () => {
  let manager: BrowserManager;

  beforeEach(() => {
    manager = new BrowserManager();
  });

  afterEach(async () => {
    try {
      await manager.close();
    } catch {
      // Ignore if already closed
    }
  });

  describe('lifecycle', () => {
    it('should launch browser', async () => {
      await manager.launch({ headless: true });
      expect(manager.isLaunched()).toBe(true);
    });

    it('should throw if browser already launched', async () => {
      await manager.launch({ headless: true });
      await expect(manager.launch({ headless: true })).rejects.toThrow('Browser already launched');
    });

    it('should close browser', async () => {
      await manager.launch({ headless: true });
      await manager.close();
      expect(manager.isLaunched()).toBe(false);
    });

    it('should emit status event on launch', async () => {
      const statusHandler = vi.fn();
      manager.on('status', statusHandler);
      await manager.launch({ headless: true });
      expect(statusHandler).toHaveBeenCalledWith({ active: true });
    });

    it('should emit status event on close', async () => {
      await manager.launch({ headless: true });
      const statusHandler = vi.fn();
      manager.on('status', statusHandler);
      await manager.close();
      expect(statusHandler).toHaveBeenCalledWith({ active: false });
    });
  });

  describe('navigation', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
    });

    it('should navigate to URL', async () => {
      await manager.navigate('data:text/html,<h1>Test</h1>');
      const snapshot = await manager.snapshot();
      expect(snapshot).toContain('Test');
    });

    it('should throw if browser not launched', async () => {
      await manager.close();
      await expect(manager.navigate('https://example.com')).rejects.toThrow('Browser not launched');
    });
  });

  describe('user actions', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
      await manager.navigate('data:text/html,<button id="btn">Click me</button>');
    });

    it('should click at coordinates', async () => {
      // This won't actually click anything useful but tests the API
      await expect(manager.click(10, 10)).resolves.not.toThrow();
    });

    it('should type text', async () => {
      await manager.navigate('data:text/html,<input id="inp" autofocus>');
      await manager.type('Hello');
      const snapshot = await manager.snapshot();
      expect(snapshot).toContain('input');
    });

    it('should press key', async () => {
      await expect(manager.pressKey('Enter')).resolves.not.toThrow();
    });

    it('should scroll', async () => {
      await expect(manager.scroll(0, 100)).resolves.not.toThrow();
    });
  });

  describe('screenshot', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
      await manager.navigate('data:text/html,<h1>Screenshot Test</h1>');
    });

    it('should take screenshot and return base64', async () => {
      const screenshot = await manager.screenshot();
      expect(screenshot).toBeTruthy();
      // Base64 JPEG starts with /9j/
      expect(screenshot.startsWith('/9j/')).toBe(true);
    });

    it('should take full page screenshot', async () => {
      const screenshot = await manager.screenshot(true);
      expect(screenshot).toBeTruthy();
    });
  });

  describe('snapshot', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
    });

    it('should return page HTML content', async () => {
      await manager.navigate('data:text/html,<h1>Hello World</h1>');
      const snapshot = await manager.snapshot();
      expect(snapshot).toContain('Hello World');
    });
  });

  describe('console messages', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
    });

    it('should track console messages', async () => {
      await manager.navigate('data:text/html,<script>console.log("test message")</script>');
      // Wait for console message to be captured
      await new Promise(resolve => setTimeout(resolve, 100));
      const messages = manager.getConsoleMessages();
      expect(messages.some(m => m.text.includes('test message'))).toBe(true);
    });

    it('should filter by level', async () => {
      await manager.navigate('data:text/html,<script>console.error("error"); console.log("log")</script>');
      await new Promise(resolve => setTimeout(resolve, 100));
      const errors = manager.getConsoleMessages('error');
      expect(errors.every(m => m.level === 'error')).toBe(true);
    });
  });

  describe('network requests', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
    });

    it('should return empty array initially', () => {
      const requests = manager.getNetworkRequests(true);
      expect(Array.isArray(requests)).toBe(true);
    });

    it('should return array from getNetworkRequests', async () => {
      await manager.navigate('data:text/html,<h1>Test</h1>');
      const requests = manager.getNetworkRequests(false);
      // data: URLs don't generate network requests tracked by the handler
      expect(Array.isArray(requests)).toBe(true);
    });
  });

  describe('viewport resize', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
    });

    it('should resize viewport', async () => {
      await expect(manager.resize(800, 600)).resolves.not.toThrow();
    });
  });

  describe('tabs', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
    });

    it('should list tabs', async () => {
      const tabs = await manager.tabs('list');
      expect(Array.isArray(tabs)).toBe(true);
      expect((tabs as Array<unknown>).length).toBeGreaterThan(0);
    });

    it('should create new tab', async () => {
      const tabsBefore = await manager.tabs('list') as Array<unknown>;
      await manager.tabs('new');
      const tabsAfter = await manager.tabs('list') as Array<unknown>;
      expect(tabsAfter.length).toBe(tabsBefore.length + 1);
    });

    it('should close tab', async () => {
      await manager.tabs('new');
      const tabsBefore = await manager.tabs('list') as Array<unknown>;
      await manager.tabs('close', 0);
      const tabsAfter = await manager.tabs('list') as Array<unknown>;
      expect(tabsAfter.length).toBe(tabsBefore.length - 1);
    });
  });

  describe('screencast', () => {
    beforeEach(async () => {
      await manager.launch({ headless: true });
    });

    it('should start screencast and emit frames', async () => {
      const frameHandler = vi.fn();
      manager.on('frame', frameHandler);

      await manager.startScreencast({ format: 'jpeg', quality: 50 });
      await manager.navigate('data:text/html,<h1>Screencast Test</h1>');

      // Wait for frames
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(frameHandler).toHaveBeenCalled();
      const frame = frameHandler.mock.calls[0][0];
      expect(frame.data).toBeDefined();
      expect(frame.metadata).toBeDefined();
    });

    it('should stop screencast', async () => {
      await manager.startScreencast();
      await expect(manager.stopScreencast()).resolves.not.toThrow();
    });

    it('should not start screencast twice', async () => {
      await manager.startScreencast();
      await expect(manager.startScreencast()).resolves.not.toThrow(); // Should be idempotent
    });
  });
});
