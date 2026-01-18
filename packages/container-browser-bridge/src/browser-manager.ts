import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from 'playwright-core';
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
