import WebSocket from 'ws';
import type { BrowserCommand, BrowserCommandMessage, ServerMessage } from '@agent-dock/shared';

// Type for direct bridge response (from container-browser-bridge)
interface DirectBridgeResponse {
  type: 'command_result';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Handles Playwright browser commands by sending them to the AgentDock server
 * or directly to the container browser bridge (Issue #78: same-container mode).
 */
export class PlaywrightHandler {
  private ws: WebSocket | null = null;
  private pendingCommands: Map<string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private requestCounter = 0;
  private browserLaunched = false;

  /**
   * @param bridgeUrl WebSocket URL to connect to
   * @param sessionId Session ID for AgentDock server mode
   * @param directBridgeMode If true, connect directly to container bridge (Issue #78)
   */
  constructor(
    private bridgeUrl: string,
    private sessionId: string,
    private directBridgeMode = false
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.bridgeUrl);

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const rawMessage = JSON.parse(data.toString());

          // Handle both message formats:
          // - AgentDock server: { type: 'browser_command_result', ... }
          // - Direct bridge: { type: 'command_result', ... }
          const responseType = this.directBridgeMode ? 'command_result' : 'browser_command_result';
          if (rawMessage.type === responseType) {
            const pending = this.pendingCommands.get(rawMessage.requestId);
            if (pending) {
              this.pendingCommands.delete(rawMessage.requestId);
              if (rawMessage.success) {
                pending.resolve(rawMessage.result);
              } else {
                pending.reject(new Error(rawMessage.error || 'Browser command failed'));
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
        this.browserLaunched = false;
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

    // In direct bridge mode, we need to launch the browser first
    if (this.directBridgeMode && !this.browserLaunched) {
      await this.launchBrowserDirect();
    }

    const requestId = `playwright-${++this.requestCounter}`;

    // Build message based on mode
    let message: unknown;
    if (this.directBridgeMode) {
      // Direct bridge format: { requestId, command: { type, ...params } }
      // Convert from BrowserCommand format to BridgeCommand format
      message = {
        requestId,
        command: this.convertToBridgeCommand(command),
      };
    } else {
      // AgentDock server format: { type: 'browser_command', sessionId, requestId, command }
      message = {
        type: 'browser_command',
        sessionId: this.sessionId,
        requestId,
        command,
      } as BrowserCommandMessage;
    }

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

  // ==================== Direct Bridge Mode Helpers (Issue #78) ====================

  /**
   * Launch browser in direct bridge mode
   */
  private async launchBrowserDirect(): Promise<void> {
    const requestId = `launch-${++this.requestCounter}`;
    const message = {
      requestId,
      command: { type: 'launch_browser' },
    };

    return new Promise((resolve, reject) => {
      this.pendingCommands.set(requestId, {
        resolve: () => {
          this.browserLaunched = true;
          resolve();
        },
        reject,
      });

      this.ws!.send(JSON.stringify(message), (error) => {
        if (error) {
          this.pendingCommands.delete(requestId);
          reject(error);
        }
      });
    });
  }

  /**
   * Convert BrowserCommand (AgentDock format) to BridgeCommand (container bridge format)
   * The main difference is command.name vs command.type
   */
  private convertToBridgeCommand(command: BrowserCommand): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = command as any;
    const name = cmd.name as string;

    // Map command names to types
    const typeMap: Record<string, string> = {
      'browser_navigate': 'browser_navigate',
      'browser_navigate_back': 'browser_navigate_back',
      'browser_click': 'browser_click',
      'browser_hover': 'browser_hover',
      'browser_type': 'browser_type',
      'browser_press_key': 'browser_press_key',
      'browser_select_option': 'browser_select_option',
      'browser_drag': 'browser_drag',
      'browser_fill_form': 'browser_fill_form',
      'browser_snapshot': 'browser_snapshot',
      'browser_take_screenshot': 'browser_screenshot',
      'browser_console_messages': 'browser_console_messages',
      'browser_network_requests': 'browser_network_requests',
      'browser_evaluate': 'browser_evaluate',
      'browser_wait_for': 'browser_wait_for',
      'browser_handle_dialog': 'browser_handle_dialog',
      'browser_resize': 'browser_resize',
      'browser_tabs': 'browser_tabs',
      'browser_close': 'close_browser',
    };

    const type = typeMap[name] || name;

    // Build the bridge command with type instead of name
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name: _, ...rest } = cmd;
    return { type, ...rest };
  }
}
