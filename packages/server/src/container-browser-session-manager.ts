import { EventEmitter } from 'events';
import type { ScreencastMetadata } from '@agent-dock/shared';
import type { PersistentContainerManager } from './persistent-container-manager.js';

/**
 * Frame event data emitted by ContainerBrowserSessionManager
 */
export interface ContainerBrowserSessionFrame {
  sessionId: string;
  data: string;
  metadata: ScreencastMetadata;
}

/**
 * Status event data emitted by ContainerBrowserSessionManager
 */
export interface ContainerBrowserSessionStatus {
  sessionId: string;
  active: boolean;
  browserUrl?: string;
  browserTitle?: string;
}

/**
 * Error event data emitted by ContainerBrowserSessionManager
 */
export interface ContainerBrowserSessionError {
  sessionId: string;
  message: string;
}

/**
 * Events emitted by ContainerBrowserSessionManager
 */
export interface ContainerBrowserSessionManagerEvents {
  frame: (frame: ContainerBrowserSessionFrame) => void;
  status: (status: ContainerBrowserSessionStatus) => void;
  error: (error: ContainerBrowserSessionError) => void;
}

/**
 * A browser session with container manager reference
 */
interface ContainerBrowserSession {
  containerManager: PersistentContainerManager;
  pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>;
}

/**
 * ContainerBrowserSessionManager manages browser instances running inside containers.
 * It communicates with the browser bridge via WebSocket through PersistentContainerManager.
 *
 * This provides the same interface as BrowserSessionManager but delegates browser
 * operations to a container-based browser bridge.
 */
export class ContainerBrowserSessionManager extends EventEmitter {
  private sessions: Map<string, ContainerBrowserSession> = new Map();

  /**
   * Create a new container browser session
   *
   * @param sessionId - Unique session identifier
   * @param containerManager - The persistent container manager for this session
   */
  async createSession(sessionId: string, containerManager: PersistentContainerManager): Promise<void> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const pendingRequests = new Map<string, {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }>();

    // Set up event forwarding from container manager
    containerManager.on('bridge_message', (message: unknown) => {
      this.handleBridgeMessage(sessionId, message, pendingRequests);
    });

    containerManager.on('bridge_connected', () => {
      console.log(`[ContainerBrowserSession] Bridge connected for session ${sessionId}`);
    });

    containerManager.on('bridge_disconnected', () => {
      console.log(`[ContainerBrowserSession] Bridge disconnected for session ${sessionId}`);
      this.emit('status', {
        sessionId,
        active: false,
      } satisfies ContainerBrowserSessionStatus);
    });

    // Store session
    this.sessions.set(sessionId, { containerManager, pendingRequests });

    // Ensure container is running
    if (!containerManager.isRunning) {
      await containerManager.startContainer();
    }

    // Start browser bridge in container
    await containerManager.startBrowserBridge();

    // Launch browser via bridge
    await this.sendCommand(sessionId, { type: 'launch_browser', options: { headless: true } });

    // Start screencast
    await this.sendCommand(sessionId, {
      type: 'start_screencast',
      options: { format: 'jpeg', quality: 70 },
    });

    // Emit initial status
    this.emit('status', {
      sessionId,
      active: true,
    } satisfies ContainerBrowserSessionStatus);
  }

  /**
   * Handle messages from the browser bridge
   */
  private handleBridgeMessage(
    sessionId: string,
    message: unknown,
    pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>
  ): void {
    const msg = message as {
      type: string;
      requestId?: string;
      success?: boolean;
      result?: unknown;
      error?: string;
      message?: string;
      data?: string;
      metadata?: { deviceWidth: number; deviceHeight: number; timestamp: number };
      active?: boolean;
      url?: string;
      title?: string;
    };

    switch (msg.type) {
      case 'command_result': {
        // Response to a command request
        const pending = pendingRequests.get(msg.requestId!);
        if (pending) {
          pendingRequests.delete(msg.requestId!);
          if (!msg.success) {
            pending.reject(new Error(msg.error ?? 'Command failed'));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;
      }

      case 'screencast_frame': {
        // Screencast frame
        if (msg.data && msg.metadata) {
          this.emit('frame', {
            sessionId,
            data: msg.data,
            metadata: {
              deviceWidth: msg.metadata.deviceWidth,
              deviceHeight: msg.metadata.deviceHeight,
              timestamp: msg.metadata.timestamp,
            },
          } satisfies ContainerBrowserSessionFrame);
        }
        break;
      }

      case 'screencast_status': {
        // Browser status update
        this.emit('status', {
          sessionId,
          active: msg.active ?? false,
          browserUrl: msg.url,
          browserTitle: msg.title,
        } satisfies ContainerBrowserSessionStatus);
        break;
      }

      case 'browser_launched': {
        console.log(`[ContainerBrowserSession] Browser launched for session ${sessionId}`);
        break;
      }

      case 'browser_closed': {
        console.log(`[ContainerBrowserSession] Browser closed for session ${sessionId}`);
        this.emit('status', {
          sessionId,
          active: false,
        } satisfies ContainerBrowserSessionStatus);
        break;
      }

      case 'error': {
        this.emit('error', {
          sessionId,
          message: msg.message ?? 'Unknown error',
        } satisfies ContainerBrowserSessionError);
        break;
      }
    }
  }

  /**
   * Send a command to the browser bridge and wait for response
   */
  private async sendCommand(sessionId: string, command: unknown): Promise<unknown> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    return new Promise((resolve, reject) => {
      // Store pending request
      session.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout
      const timeout = setTimeout(() => {
        session.pendingRequests.delete(requestId);
        reject(new Error('Command timeout'));
      }, 30000);

      // Send command
      session.containerManager.sendBrowserCommand(requestId, command)
        .catch((error) => {
          clearTimeout(timeout);
          session.pendingRequests.delete(requestId);
          reject(error);
        });

      // Clear timeout on resolve/reject
      const originalResolve = resolve;
      const originalReject = reject;
      session.pendingRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      });
    });
  }

  /**
   * Execute a browser command (matching BrowserController interface)
   */
  async executeCommand(sessionId: string, commandName: string, params: Record<string, unknown> = {}): Promise<unknown> {
    // Map to bridge command format
    const commandMap: Record<string, string> = {
      'browser_navigate': 'navigate',
      'browser_navigate_back': 'navigate_back',
      'browser_click': 'click',
      'browser_hover': 'hover',
      'browser_type': 'type',
      'browser_press_key': 'press_key',
      'browser_select_option': 'select_option',
      'browser_drag': 'drag',
      'browser_fill_form': 'fill_form',
      'browser_snapshot': 'snapshot',
      'browser_take_screenshot': 'screenshot',
      'browser_console_messages': 'console_messages',
      'browser_network_requests': 'network_requests',
      'browser_evaluate': 'evaluate',
      'browser_wait_for': 'wait_for',
      'browser_handle_dialog': 'handle_dialog',
      'browser_resize': 'resize',
      'browser_tabs': 'tabs',
      'browser_close': 'close_browser',
    };

    const bridgeCommandType = commandMap[commandName] ?? commandName;

    return this.sendCommand(sessionId, {
      type: bridgeCommandType,
      ...params,
    });
  }

  // User interaction convenience methods

  async click(sessionId: string, x: number, y: number): Promise<void> {
    await this.sendCommand(sessionId, { type: 'browser_click', x, y });
  }

  async type(sessionId: string, text: string): Promise<void> {
    await this.sendCommand(sessionId, { type: 'browser_type', text });
  }

  async pressKey(sessionId: string, key: string): Promise<void> {
    await this.sendCommand(sessionId, { type: 'browser_press_key', key });
  }

  async scroll(sessionId: string, deltaX: number, deltaY: number): Promise<void> {
    await this.sendCommand(sessionId, { type: 'browser_scroll', deltaX, deltaY });
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    await this.sendCommand(sessionId, { type: 'browser_navigate', url });
  }

  async screenshot(sessionId: string, fullPage?: boolean): Promise<string> {
    return await this.sendCommand(sessionId, { type: 'browser_screenshot', fullPage }) as string;
  }

  async snapshot(sessionId: string): Promise<string> {
    return await this.sendCommand(sessionId, { type: 'browser_snapshot' }) as string;
  }

  /**
   * Destroy a browser session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      // Stop screencast
      await this.sendCommand(sessionId, { type: 'stop_screencast' }).catch(() => {});

      // Close browser
      await this.sendCommand(sessionId, { type: 'close_browser' }).catch(() => {});
    } catch {
      // Ignore errors during cleanup
    }

    // Clear pending requests
    for (const [, pending] of session.pendingRequests) {
      pending.reject(new Error('Session destroyed'));
    }
    session.pendingRequests.clear();

    // Remove from map
    this.sessions.delete(sessionId);

    // Emit status
    this.emit('status', {
      sessionId,
      active: false,
    } satisfies ContainerBrowserSessionStatus);
  }

  /**
   * Check if a session has a browser
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get the container manager for a session (for direct page access)
   */
  getContainerManager(sessionId: string): PersistentContainerManager | undefined {
    return this.sessions.get(sessionId)?.containerManager;
  }

  /**
   * Destroy all sessions
   */
  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.destroySession(id)));
  }

  // Type-safe event emitter methods
  override on<K extends keyof ContainerBrowserSessionManagerEvents>(
    event: K,
    listener: ContainerBrowserSessionManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof ContainerBrowserSessionManagerEvents>(
    event: K,
    ...args: Parameters<ContainerBrowserSessionManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
