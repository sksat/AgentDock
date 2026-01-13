import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import type {
  BrowserControllerOptions,
  ClickOptions,
  TypeOptions,
  FormField,
  ScreenshotOptions,
  ConsoleMessage,
  NetworkRequest,
  WaitOptions,
  TabAction,
  TabInfo,
} from './types';

/**
 * BrowserController provides a high-level API for browser automation
 * using Playwright. It manages a single browser instance with one active page.
 *
 * @example
 * ```typescript
 * const controller = new BrowserController();
 * await controller.launch({ headless: true });
 * await controller.navigate('https://example.com');
 * await controller.click('#button');
 * await controller.close();
 * ```
 */
export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private consoleMessages: ConsoleMessage[] = [];
  private networkRequests: NetworkRequest[] = [];

  /**
   * Launch the browser
   *
   * @param options - Launch options
   * @throws Error if browser is already launched
   */
  async launch(options?: BrowserControllerOptions): Promise<void> {
    if (this.browser) {
      throw new Error('Browser already launched');
    }

    this.browser = await chromium.launch({
      headless: options?.headless ?? true,
    });

    this.context = await this.browser.newContext({
      viewport: options?.viewport ?? { width: 1280, height: 720 },
    });

    this.page = await this.context.newPage();

    // Set up console message collection
    this.page.on('console', (msg) => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      });
    });

    // Set up network request collection
    this.page.on('request', (request) => {
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
      });
    });

    this.page.on('response', (response) => {
      const request = response.request();
      const entry = this.networkRequests.find(
        (r) => r.url === request.url() && r.method === request.method()
      );
      if (entry) {
        entry.status = response.status();
        entry.statusText = response.statusText();
      }
    });
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.consoleMessages = [];
      this.networkRequests = [];
    }
  }

  /**
   * Get the current page
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Ensure browser is launched
   */
  private ensureLaunched(): Page {
    if (!this.page) {
      throw new Error('Browser not launched');
    }
    return this.page;
  }

  // ==================== Navigation ====================

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    const page = this.ensureLaunched();
    await page.goto(url);
  }

  /**
   * Navigate back
   */
  async navigateBack(): Promise<void> {
    const page = this.ensureLaunched();
    await page.goBack();
  }

  // ==================== Interaction ====================

  /**
   * Click an element
   *
   * @param selector - CSS selector or element reference
   * @param options - Click options
   */
  async click(selector: string, options?: ClickOptions & { timeout?: number }): Promise<void> {
    const page = this.ensureLaunched();
    await page.click(selector, {
      button: options?.button,
      clickCount: options?.doubleClick ? 2 : 1,
      modifiers: options?.modifiers,
      timeout: options?.timeout,
    });
  }

  /**
   * Hover over an element
   */
  async hover(selector: string): Promise<void> {
    const page = this.ensureLaunched();
    await page.hover(selector);
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string, options?: TypeOptions): Promise<void> {
    const page = this.ensureLaunched();

    if (options?.slowly) {
      await page.locator(selector).pressSequentially(text);
    } else {
      await page.fill(selector, text);
    }

    if (options?.submit) {
      await page.press(selector, 'Enter');
    }
  }

  /**
   * Press a key
   */
  async pressKey(key: string): Promise<void> {
    const page = this.ensureLaunched();
    await page.keyboard.press(key);
  }

  /**
   * Select an option in a dropdown
   */
  async selectOption(selector: string, values: string[]): Promise<void> {
    const page = this.ensureLaunched();
    await page.selectOption(selector, values);
  }

  /**
   * Drag and drop
   */
  async drag(startSelector: string, endSelector: string): Promise<void> {
    const page = this.ensureLaunched();
    await page.dragAndDrop(startSelector, endSelector);
  }

  // ==================== Form ====================

  /**
   * Fill multiple form fields
   */
  async fillForm(fields: FormField[]): Promise<void> {
    const page = this.ensureLaunched();

    for (const field of fields) {
      switch (field.type) {
        case 'textbox':
          await page.fill(field.ref, field.value);
          break;
        case 'checkbox':
          if (field.value === 'true') {
            await page.check(field.ref);
          } else {
            await page.uncheck(field.ref);
          }
          break;
        case 'radio':
          await page.check(field.ref);
          break;
        case 'combobox':
          await page.selectOption(field.ref, field.value);
          break;
        case 'slider':
          // For sliders, we need to set the value via JavaScript
          await page.$eval(
            field.ref,
            (el, val) => {
              (el as HTMLInputElement).value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            },
            field.value
          );
          break;
      }
    }
  }

  /**
   * Upload files
   */
  async fileUpload(paths: string[]): Promise<void> {
    const page = this.ensureLaunched();
    const fileChooserPromise = page.waitForEvent('filechooser');
    // Note: The caller should trigger the file chooser dialog before calling this
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(paths);
  }

  // ==================== Inspection ====================

  /**
   * Get accessibility snapshot (ARIA snapshot)
   */
  async snapshot(): Promise<string> {
    const page = this.ensureLaunched();
    // Use ARIA snapshot which is the modern Playwright API
    const snapshot = await page.locator('body').ariaSnapshot();
    return snapshot;
  }

  /**
   * Take a screenshot
   *
   * @returns Base64 encoded screenshot
   */
  async takeScreenshot(options?: ScreenshotOptions): Promise<string> {
    const page = this.ensureLaunched();

    const buffer = await page.screenshot({
      fullPage: options?.fullPage,
      type: options?.type ?? 'png',
    });

    return buffer.toString('base64');
  }

  /**
   * Get console messages
   */
  async getConsoleMessages(level?: string): Promise<ConsoleMessage[]> {
    if (level) {
      return this.consoleMessages.filter((msg) => {
        if (level === 'error') return msg.type === 'error';
        if (level === 'warning') return msg.type === 'warning' || msg.type === 'error';
        if (level === 'info')
          return (
            msg.type === 'info' || msg.type === 'warning' || msg.type === 'error' || msg.type === 'log'
          );
        return true;
      });
    }
    return this.consoleMessages;
  }

  /**
   * Get network requests
   */
  async getNetworkRequests(includeStatic?: boolean): Promise<NetworkRequest[]> {
    if (includeStatic) {
      return this.networkRequests;
    }
    // Filter out static resources
    return this.networkRequests.filter((req) => {
      const url = req.url.toLowerCase();
      return !(
        url.endsWith('.png') ||
        url.endsWith('.jpg') ||
        url.endsWith('.jpeg') ||
        url.endsWith('.gif') ||
        url.endsWith('.css') ||
        url.endsWith('.js') ||
        url.endsWith('.woff') ||
        url.endsWith('.woff2') ||
        url.endsWith('.ttf')
      );
    });
  }

  // ==================== Execution ====================

  /**
   * Evaluate JavaScript
   */
  async evaluate(fn: string, selector?: string): Promise<unknown> {
    const page = this.ensureLaunched();

    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return await element.evaluate(new Function('element', fn) as (el: Element) => unknown);
    }

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return await page.evaluate(new Function(fn) as () => unknown);
  }

  /**
   * Run Playwright code
   */
  async runCode(code: string): Promise<unknown> {
    const page = this.ensureLaunched();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('page', `return (async () => { ${code} })()`) as (
      page: Page
    ) => Promise<unknown>;
    return await fn(page);
  }

  // ==================== Utilities ====================

  /**
   * Wait for condition
   */
  async waitFor(options: WaitOptions): Promise<void> {
    const page = this.ensureLaunched();

    if (options.text) {
      await page.waitForSelector(`text=${options.text}`);
    } else if (options.textGone) {
      await page.waitForSelector(`text=${options.textGone}`, { state: 'hidden' });
    } else if (options.time) {
      await page.waitForTimeout(options.time * 1000);
    }
  }

  /**
   * Handle dialog
   */
  async handleDialog(accept: boolean, promptText?: string): Promise<void> {
    const page = this.ensureLaunched();
    page.once('dialog', async (dialog) => {
      if (accept) {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    });
  }

  /**
   * Resize browser viewport
   */
  async resize(width: number, height: number): Promise<void> {
    const page = this.ensureLaunched();
    await page.setViewportSize({ width, height });
  }

  /**
   * Manage tabs
   */
  async manageTabs(action: TabAction, index?: number): Promise<TabInfo[]> {
    const context = this.context;
    if (!context) {
      throw new Error('Browser not launched');
    }

    const pages = context.pages();

    switch (action) {
      case 'list':
        return pages.map((p, i) => ({
          index: i,
          url: p.url(),
          title: '',
        }));

      case 'new': {
        const newPage = await context.newPage();
        this.page = newPage;
        return pages.map((p, i) => ({
          index: i,
          url: p.url(),
          title: '',
        }));
      }

      case 'close':
        if (index !== undefined && pages[index]) {
          await pages[index].close();
          if (this.page === pages[index]) {
            this.page = pages[0] || null;
          }
        } else if (this.page) {
          await this.page.close();
          this.page = pages.find((p) => p !== this.page) || null;
        }
        return context.pages().map((p, i) => ({
          index: i,
          url: p.url(),
          title: '',
        }));

      case 'select':
        if (index !== undefined && pages[index]) {
          this.page = pages[index];
        }
        return pages.map((p, i) => ({
          index: i,
          url: p.url(),
          title: '',
        }));

      default:
        return [];
    }
  }
}
