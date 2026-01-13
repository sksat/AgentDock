import WebSocket from 'ws';
import type { BrowserCommand, BrowserCommandMessage, ServerMessage } from '@agent-dock/shared';

/**
 * Handles Playwright browser commands by sending them to the AgentDock server
 * and waiting for the result.
 */
export class PlaywrightHandler {
  private ws: WebSocket | null = null;
  private pendingCommands: Map<string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private requestCounter = 0;

  constructor(
    private bridgeUrl: string,
    private sessionId: string
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.bridgeUrl);

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as ServerMessage;
          if (message.type === 'browser_command_result') {
            const pending = this.pendingCommands.get(message.requestId);
            if (pending) {
              this.pendingCommands.delete(message.requestId);
              if (message.success) {
                pending.resolve(message.result);
              } else {
                pending.reject(new Error(message.error || 'Browser command failed'));
              }
            }
          }
        } catch {
          // Ignore parse errors for other message types
        }
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('close', () => {
        // Reject all pending commands on disconnect
        for (const [, pending] of this.pendingCommands) {
          pending.reject(new Error('WebSocket connection closed'));
        }
        this.pendingCommands.clear();
        this.ws = null;
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Execute a browser command and wait for the result
   */
  async executeCommand(command: BrowserCommand): Promise<unknown> {
    if (!this.isConnected()) {
      await this.connect();
    }

    const requestId = `playwright-${++this.requestCounter}`;
    const message: BrowserCommandMessage = {
      type: 'browser_command',
      sessionId: this.sessionId,
      requestId,
      command,
    };

    return new Promise((resolve, reject) => {
      this.pendingCommands.set(requestId, { resolve, reject });

      // Set timeout for command
      const timeout = setTimeout(() => {
        const pending = this.pendingCommands.get(requestId);
        if (pending) {
          this.pendingCommands.delete(requestId);
          pending.reject(new Error('Browser command timeout'));
        }
      }, 30000); // 30 second timeout

      this.ws!.send(JSON.stringify(message), (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingCommands.delete(requestId);
          reject(error);
        }
      });

      // Clear timeout when command completes
      const originalResolve = this.pendingCommands.get(requestId)?.resolve;
      const originalReject = this.pendingCommands.get(requestId)?.reject;
      if (originalResolve && originalReject) {
        this.pendingCommands.set(requestId, {
          resolve: (result) => {
            clearTimeout(timeout);
            originalResolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            originalReject(error);
          },
        });
      }
    });
  }

  // Convenience methods for each command type

  async navigate(url: string): Promise<unknown> {
    return this.executeCommand({ name: 'browser_navigate', url });
  }

  async navigateBack(): Promise<unknown> {
    return this.executeCommand({ name: 'browser_navigate_back' });
  }

  async click(
    element: string,
    ref: string,
    options?: {
      button?: 'left' | 'right' | 'middle';
      modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
      doubleClick?: boolean;
    }
  ): Promise<unknown> {
    return this.executeCommand({
      name: 'browser_click',
      element,
      ref,
      ...options,
    });
  }

  async hover(element: string, ref: string): Promise<unknown> {
    return this.executeCommand({ name: 'browser_hover', element, ref });
  }

  async type(
    element: string,
    ref: string,
    text: string,
    options?: { slowly?: boolean; submit?: boolean }
  ): Promise<unknown> {
    return this.executeCommand({
      name: 'browser_type',
      element,
      ref,
      text,
      ...options,
    });
  }

  async pressKey(key: string): Promise<unknown> {
    return this.executeCommand({ name: 'browser_press_key', key });
  }

  async selectOption(element: string, ref: string, values: string[]): Promise<unknown> {
    return this.executeCommand({
      name: 'browser_select_option',
      element,
      ref,
      values,
    });
  }

  async drag(
    startElement: string,
    startRef: string,
    endElement: string,
    endRef: string
  ): Promise<unknown> {
    return this.executeCommand({
      name: 'browser_drag',
      startElement,
      startRef,
      endElement,
      endRef,
    });
  }

  async fillForm(
    fields: Array<{
      name: string;
      type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
      ref: string;
      value: string;
    }>
  ): Promise<unknown> {
    return this.executeCommand({ name: 'browser_fill_form', fields });
  }

  async snapshot(): Promise<unknown> {
    return this.executeCommand({ name: 'browser_snapshot' });
  }

  async takeScreenshot(options?: {
    element?: string;
    ref?: string;
    fullPage?: boolean;
  }): Promise<unknown> {
    return this.executeCommand({
      name: 'browser_take_screenshot',
      ...options,
    });
  }

  async getConsoleMessages(level?: 'error' | 'warning' | 'info' | 'debug'): Promise<unknown> {
    return this.executeCommand({ name: 'browser_console_messages', level });
  }

  async getNetworkRequests(includeStatic?: boolean): Promise<unknown> {
    return this.executeCommand({ name: 'browser_network_requests', includeStatic });
  }

  async evaluate(fn: string, element?: string, ref?: string): Promise<unknown> {
    return this.executeCommand({
      name: 'browser_evaluate',
      function: fn,
      element,
      ref,
    });
  }

  async waitFor(options: { text?: string; textGone?: string; time?: number }): Promise<unknown> {
    return this.executeCommand({ name: 'browser_wait_for', ...options });
  }

  async handleDialog(accept: boolean, promptText?: string): Promise<unknown> {
    return this.executeCommand({
      name: 'browser_handle_dialog',
      accept,
      promptText,
    });
  }

  async resize(width: number, height: number): Promise<unknown> {
    return this.executeCommand({ name: 'browser_resize', width, height });
  }

  async manageTabs(action: 'list' | 'new' | 'close' | 'select', index?: number): Promise<unknown> {
    return this.executeCommand({ name: 'browser_tabs', action, index });
  }

  async close(): Promise<unknown> {
    return this.executeCommand({ name: 'browser_close' });
  }
}
