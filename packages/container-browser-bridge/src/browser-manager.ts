import { chromium, type Browser, type BrowserContext, type Page, type CDPSession, type ConsoleMessage, type Request, type Dialog } from 'playwright-core';
import { EventEmitter } from 'events';
import type { ScreencastOptions } from './types.js';

export interface BrowserManagerOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export interface BrowserManagerEvents {
  frame: (data: { data: string; metadata: { deviceWidth: number; deviceHeight: number; timestamp: number } }) => void;
  status: (data: { active: boolean; url?: string; title?: string }) => void;
  error: (error: Error) => void;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export class BrowserManager extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdpSession: CDPSession | null = null;
  private screencastActive = false;
  private consoleMessages: Array<{ level: string; text: string; timestamp: number }> = [];
  private networkRequests: Array<{ url: string; method: string; status?: number; resourceType: string }> = [];
  private pendingDialog: Dialog | null = null;

  async launch(options: BrowserManagerOptions = {}): Promise<void> {
    if (this.browser) {
      throw new Error('Browser already launched');
    }

    const viewport = options.viewport ?? DEFAULT_VIEWPORT;

    // Launch browser with container-friendly options
    this.browser = await chromium.launch({
      headless: options.headless ?? true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    this.context = await this.browser.newContext({
      viewport,
    });

    this.page = await this.context.newPage();

    // Set up page event listeners
    this.page.on('framenavigated', () => {
      this.emitStatus();
    });

    // Console message tracking
    this.page.on('console', (msg: ConsoleMessage) => {
      this.consoleMessages.push({
        level: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
      // Keep only last 1000 messages
      if (this.consoleMessages.length > 1000) {
        this.consoleMessages.shift();
      }
    });

    // Network request tracking
    this.page.on('request', (request: Request) => {
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      });
      // Keep only last 500 requests
      if (this.networkRequests.length > 500) {
        this.networkRequests.shift();
      }
    });

    this.page.on('response', async (response) => {
      const req = this.networkRequests.find(r => r.url === response.url() && r.status === undefined);
      if (req) {
        req.status = response.status();
      }
    });

    // Dialog tracking
    this.page.on('dialog', async (dialog: Dialog) => {
      this.pendingDialog = dialog;
    });

    this.emit('status', { active: true });
  }

  async close(): Promise<void> {
    await this.stopScreencast();

    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }

    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }

    this.emit('status', { active: false });
  }

  getPage(): Page | null {
    return this.page;
  }

  isLaunched(): boolean {
    return this.browser !== null;
  }

  // Browser actions
  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.goto(url);
  }

  async click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.mouse.click(x, y, { button });
  }

  async type(text: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.keyboard.type(text);
  }

  async pressKey(key: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.keyboard.press(key);
  }

  async scroll(deltaX: number, deltaY: number): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.mouse.wheel(deltaX, deltaY);
  }

  async snapshot(): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');
    // Return page HTML content as snapshot
    const content = await this.page.content();
    return content;
  }

  async screenshot(fullPage = false): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');
    const buffer = await this.page.screenshot({
      fullPage,
      type: 'jpeg',
      quality: 80,
    });
    return buffer.toString('base64');
  }

  async navigateBack(): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.goBack();
  }

  async hover(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.hover(selector);
  }

  async selectOption(selector: string, values: string[]): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.selectOption(selector, values);
  }

  async drag(startSelector: string, endSelector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.dragAndDrop(startSelector, endSelector);
  }

  async fillForm(fields: Array<{ ref: string; name: string; type: string; value: string }>): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    for (const field of fields) {
      const selector = field.ref;
      switch (field.type) {
        case 'textbox':
          await this.page.fill(selector, field.value);
          break;
        case 'checkbox':
        case 'radio':
          if (field.value === 'true') {
            await this.page.check(selector);
          } else {
            await this.page.uncheck(selector);
          }
          break;
        case 'combobox':
          await this.page.selectOption(selector, field.value);
          break;
        case 'slider':
          await this.page.fill(selector, field.value);
          break;
      }
    }
  }

  getConsoleMessages(level?: string): Array<{ level: string; text: string; timestamp: number }> {
    if (!level) return this.consoleMessages;
    const levelOrder = ['error', 'warning', 'info', 'debug'];
    const levelIndex = levelOrder.indexOf(level);
    if (levelIndex === -1) return this.consoleMessages;
    const includedLevels = levelOrder.slice(0, levelIndex + 1);
    return this.consoleMessages.filter(m => includedLevels.includes(m.level));
  }

  getNetworkRequests(includeStatic = false): Array<{ url: string; method: string; status?: number; resourceType: string }> {
    if (includeStatic) return this.networkRequests;
    const staticTypes = ['image', 'font', 'stylesheet', 'script'];
    return this.networkRequests.filter(r => !staticTypes.includes(r.resourceType) || r.status !== 200);
  }

  async evaluate(fn: string, selector?: string): Promise<unknown> {
    if (!this.page) throw new Error('Browser not launched');
    if (selector) {
      const element = await this.page.$(selector);
      if (element) {
        // Execute the function with the element
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const evalFn = new Function('element', `return (${fn})(element)`) as (el: unknown) => unknown;
        return await element.evaluate(evalFn);
      }
      throw new Error(`Element not found: ${selector}`);
    }
    // Execute the function without element
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const evalFn = new Function(`return (${fn})()`) as () => unknown;
    return await this.page.evaluate(evalFn);
  }

  async waitFor(options: { text?: string; textGone?: string; time?: number }): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    if (options.time) {
      await this.page.waitForTimeout(options.time * 1000);
    } else if (options.text) {
      await this.page.waitForSelector(`text=${options.text}`);
    } else if (options.textGone) {
      await this.page.waitForSelector(`text=${options.textGone}`, { state: 'hidden' });
    }
  }

  async handleDialog(accept: boolean, promptText?: string): Promise<void> {
    if (!this.pendingDialog) {
      throw new Error('No pending dialog');
    }
    if (accept) {
      await this.pendingDialog.accept(promptText);
    } else {
      await this.pendingDialog.dismiss();
    }
    this.pendingDialog = null;
  }

  async resize(width: number, height: number): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.setViewportSize({ width, height });
  }

  async tabs(action: 'list' | 'new' | 'close' | 'select', index?: number): Promise<unknown> {
    if (!this.context) throw new Error('Browser not launched');
    const pages = this.context.pages();

    switch (action) {
      case 'list':
        return pages.map((p, i) => ({
          index: i,
          url: p.url(),
          title: '', // Getting title async would complicate this
        }));
      case 'new':
        const newPage = await this.context.newPage();
        this.page = newPage;
        return null;
      case 'close':
        if (index !== undefined && pages[index]) {
          await pages[index].close();
          if (this.page === pages[index]) {
            this.page = pages[0] || null;
          }
        } else if (this.page) {
          await this.page.close();
          this.page = pages.find(p => p !== this.page) || null;
        }
        return null;
      case 'select':
        if (index !== undefined && pages[index]) {
          this.page = pages[index];
          await pages[index].bringToFront();
        }
        return null;
    }
  }

  // Screencast methods
  async startScreencast(options: ScreencastOptions = {}): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    if (this.screencastActive) return;

    // Create CDP session for screencast
    this.cdpSession = await this.page.context().newCDPSession(this.page);

    // Set up frame handler
    this.cdpSession.on('Page.screencastFrame', async (params) => {
      const { data, metadata, sessionId } = params;

      this.emit('frame', {
        data,
        metadata: {
          deviceWidth: metadata.deviceWidth,
          deviceHeight: metadata.deviceHeight,
          timestamp: metadata.timestamp,
        },
      });

      // Acknowledge frame to get the next one
      await this.cdpSession?.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });

    // Start screencast
    await this.cdpSession.send('Page.startScreencast', {
      format: options.format ?? 'jpeg',
      quality: options.quality ?? 70,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      everyNthFrame: options.everyNthFrame ?? 1,
    });

    this.screencastActive = true;
    this.emitStatus();
  }

  async stopScreencast(): Promise<void> {
    if (!this.screencastActive || !this.cdpSession) return;

    try {
      await this.cdpSession.send('Page.stopScreencast');
      await this.cdpSession.detach();
    } catch {
      // Ignore errors during cleanup
    }

    this.cdpSession = null;
    this.screencastActive = false;
  }

  private emitStatus(): void {
    if (!this.page) return;

    this.emit('status', {
      active: true,
      url: this.page.url(),
      title: '', // Will be populated async if needed
    });
  }
}
