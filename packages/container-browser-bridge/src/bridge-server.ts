import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { BrowserManager } from './browser-manager.js';
import type { BridgeCommand, BridgeMessage, BridgeRequest } from './types.js';

export interface BridgeServerOptions {
  port: number;
}

export class BridgeServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private browserManager: BrowserManager;
  /** All connected host clients (supports multiple connections) */
  private hostConnections: Set<WebSocket> = new Set();
  private port: number;

  constructor(options: BridgeServerOptions) {
    super();
    this.port = options.port;
    this.browserManager = new BrowserManager();
    this.setupBrowserEvents();
  }

  private setupBrowserEvents(): void {
    // Forward screencast frames to all connected clients
    this.browserManager.on('frame', (frame) => {
      this.broadcast({
        type: 'screencast_frame',
        data: frame.data,
        metadata: frame.metadata,
      });
    });

    // Forward status updates to all connected clients
    this.browserManager.on('status', (status) => {
      this.broadcast({
        type: 'screencast_status',
        active: status.active,
        url: status.url,
        title: status.title,
      });
    });

    // Forward errors to all connected clients
    this.browserManager.on('error', (error) => {
      this.broadcast({
        type: 'error',
        message: error.message,
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws) => {
          console.log(`[BridgeServer] Host connected (total: ${this.hostConnections.size + 1})`);
          this.hostConnections.add(ws);

          ws.on('message', async (data) => {
            let requestId: string | undefined;
            try {
              const message = JSON.parse(data.toString()) as BridgeRequest;
              requestId = message.requestId;
              await this.handleRequest(message, ws);
            } catch (error) {
              console.error('[BridgeServer] Error handling message:', error);
              // Include requestId in error response if available
              const errorResponse = requestId
                ? {
                    type: 'command_result' as const,
                    requestId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                  }
                : {
                    type: 'error' as const,
                    message: error instanceof Error ? error.message : 'Unknown error',
                  };
              this.sendToClient(ws, errorResponse);
            }
          });

          ws.on('close', () => {
            console.log(`[BridgeServer] Host disconnected (remaining: ${this.hostConnections.size - 1})`);
            this.hostConnections.delete(ws);
          });

          ws.on('error', (error) => {
            console.error('[BridgeServer] WebSocket error:', error);
          });
        });

        this.wss.on('listening', () => {
          console.log(`[BridgeServer] Listening on port ${this.port}`);
          resolve();
        });

        this.wss.on('error', (error) => {
          console.error('[BridgeServer] Server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    await this.browserManager.close();

    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(request: BridgeRequest, client: WebSocket): Promise<void> {
    const { requestId, command } = request;

    try {
      const result = await this.executeCommand(command);
      // Send response back to the requesting client only
      this.sendToClient(client, {
        type: 'command_result',
        requestId,
        success: true,
        result,
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'command_result',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async executeCommand(command: BridgeCommand): Promise<unknown> {
    switch (command.type) {
      case 'launch_browser':
        await this.browserManager.launch(command.options);
        this.broadcast({ type: 'browser_launched' });
        return null;

      case 'close_browser':
        await this.browserManager.close();
        this.broadcast({ type: 'browser_closed' });
        return null;

      case 'browser_navigate':
        await this.browserManager.navigate(command.url);
        return null;

      case 'browser_navigate_back':
        await this.browserManager.navigateBack();
        return null;

      case 'browser_click':
        await this.browserManager.click(command.x, command.y, command.button);
        return null;

      case 'browser_hover':
        await this.browserManager.hover(command.ref);
        return null;

      case 'browser_type':
        await this.browserManager.type(command.text);
        return null;

      case 'browser_press_key':
        await this.browserManager.pressKey(command.key);
        return null;

      case 'browser_scroll':
        await this.browserManager.scroll(command.deltaX, command.deltaY);
        return null;

      case 'browser_select_option':
        await this.browserManager.selectOption(command.ref, command.values);
        return null;

      case 'browser_drag':
        await this.browserManager.drag(command.startRef, command.endRef);
        return null;

      case 'browser_fill_form':
        await this.browserManager.fillForm(command.fields);
        return null;

      case 'browser_snapshot':
        return await this.browserManager.snapshot();

      case 'browser_screenshot':
        return await this.browserManager.screenshot(command.fullPage);

      case 'browser_console_messages':
        return this.browserManager.getConsoleMessages(command.level);

      case 'browser_network_requests':
        return this.browserManager.getNetworkRequests(command.includeStatic);

      case 'browser_evaluate':
        return await this.browserManager.evaluate(command.function, command.ref);

      case 'browser_wait_for':
        await this.browserManager.waitFor({
          text: command.text,
          textGone: command.textGone,
          time: command.time,
        });
        return null;

      case 'browser_handle_dialog':
        await this.browserManager.handleDialog(command.accept, command.promptText);
        return null;

      case 'browser_resize':
        await this.browserManager.resize(command.width, command.height);
        return null;

      case 'browser_tabs':
        return await this.browserManager.tabs(command.action, command.index);

      case 'start_screencast':
        await this.browserManager.startScreencast(command.options);
        return null;

      case 'stop_screencast':
        await this.browserManager.stopScreencast();
        return null;

      default:
        throw new Error(`Unknown command type: ${(command as { type: string }).type}`);
    }
  }

  /** Broadcast a message to all connected clients (for screencast frames, status updates) */
  private broadcast(message: BridgeMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.hostConnections) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /** Send a message to a specific client (for command responses) */
  private sendToClient(client: WebSocket, message: BridgeMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}
