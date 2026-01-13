import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { BrowserController } from '../browser-controller';

describe('BrowserController', () => {
  let controller: BrowserController;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.launch({ headless: true });
  });

  afterAll(async () => {
    await controller.close();
  });

  describe('launch and close', () => {
    it('should launch browser and get page', async () => {
      const newController = new BrowserController();
      await newController.launch({ headless: true });

      const page = newController.getPage();
      expect(page).not.toBeNull();

      await newController.close();
    });

    it('should handle multiple launch calls gracefully', async () => {
      const newController = new BrowserController();
      await newController.launch({ headless: true });
      // Second launch should be no-op or throw
      await expect(newController.launch()).rejects.toThrow('Browser already launched');
      await newController.close();
    });
  });

  describe('navigation', () => {
    it('should navigate to URL', async () => {
      await controller.navigate('data:text/html,<h1>Hello</h1>');
      const page = controller.getPage();
      expect(page).not.toBeNull();
      const content = await page!.content();
      expect(content).toContain('Hello');
    });

    it('should navigate back', async () => {
      await controller.navigate('data:text/html,<h1>Page 1</h1>');
      await controller.navigate('data:text/html,<h1>Page 2</h1>');
      await controller.navigateBack();
      const page = controller.getPage();
      const content = await page!.content();
      expect(content).toContain('Page 1');
    });
  });

  describe('interaction', () => {
    it('should click element by selector', async () => {
      await controller.navigate('data:text/html,<button id="btn">Click me</button><script>document.getElementById("btn").onclick = () => document.body.innerHTML = "Clicked!";</script>');
      await controller.click('#btn');
      const page = controller.getPage();
      const content = await page!.content();
      expect(content).toContain('Clicked!');
    });

    it('should type text into element', async () => {
      await controller.navigate('data:text/html,<input id="input" type="text">');
      await controller.type('#input', 'Hello World');
      const page = controller.getPage();
      const value = await page!.$eval('#input', (el) => (el as HTMLInputElement).value);
      expect(value).toBe('Hello World');
    });

    it('should hover over element', async () => {
      await controller.navigate('data:text/html,<div id="hover" onmouseover="this.textContent=\'Hovered\'">Hover me</div>');
      await controller.hover('#hover');
      const page = controller.getPage();
      const text = await page!.$eval('#hover', (el) => el.textContent);
      expect(text).toBe('Hovered');
    });

    it('should press key', async () => {
      await controller.navigate('data:text/html,<input id="input" type="text">');
      const page = controller.getPage();
      await page!.focus('#input');
      await controller.pressKey('a');
      await controller.pressKey('b');
      await controller.pressKey('c');
      const value = await page!.$eval('#input', (el) => (el as HTMLInputElement).value);
      expect(value).toBe('abc');
    });
  });

  describe('inspection', () => {
    it('should take accessibility snapshot', async () => {
      await controller.navigate('data:text/html,<h1>Test Page</h1><button>Click</button>');
      const snapshot = await controller.snapshot();
      expect(snapshot).toContain('Test Page');
      expect(snapshot).toContain('button');
    });

    it('should take screenshot', async () => {
      await controller.navigate('data:text/html,<h1>Screenshot Test</h1>');
      const screenshot = await controller.takeScreenshot();
      expect(screenshot).toBeDefined();
      expect(typeof screenshot).toBe('string');
      // Should be base64 encoded
      expect(screenshot.length).toBeGreaterThan(100);
    });
  });

  describe('utilities', () => {
    it('should wait for text to appear', async () => {
      await controller.navigate('data:text/html,<div id="content"></div><script>setTimeout(() => document.getElementById("content").textContent = "Loaded", 100);</script>');
      await controller.waitFor({ text: 'Loaded' });
      const page = controller.getPage();
      const text = await page!.$eval('#content', (el) => el.textContent);
      expect(text).toBe('Loaded');
    });

    it('should wait for specified time', async () => {
      const start = Date.now();
      await controller.waitFor({ time: 0.1 });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should resize browser', async () => {
      await controller.resize(800, 600);
      const page = controller.getPage();
      const viewport = page!.viewportSize();
      expect(viewport?.width).toBe(800);
      expect(viewport?.height).toBe(600);
    });
  });

  describe('error handling', () => {
    it('should throw error when not launched', async () => {
      const newController = new BrowserController();
      await expect(newController.navigate('https://example.com')).rejects.toThrow('Browser not launched');
    });

    it('should throw error for invalid selector', async () => {
      await controller.navigate('data:text/html,<h1>Test</h1>');
      await expect(controller.click('#nonexistent', { timeout: 100 })).rejects.toThrow();
    });
  });
});
