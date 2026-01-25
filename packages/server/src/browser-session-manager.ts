import { EventEmitter } from 'events';
import { BrowserStreamer, type FrameData } from '@anthropic/browser-streamer';
import { BrowserController } from '@anthropic/playwright-mcp';
import type { ScreencastMetadata } from '@agent-dock/shared';

/**
 * A browser session containing a controller and streamer
 */
interface BrowserSession {
  controller: BrowserController;
  streamer: BrowserStreamer;
}

/**
 * Frame event data emitted by BrowserSessionManager
 */
export interface BrowserSessionFrame {
  sessionId: string;
  data: string;
  metadata: ScreencastMetadata;
}

/**
 * Status event data emitted by BrowserSessionManager
 */
export interface BrowserSessionStatus {
  sessionId: string;
  active: boolean;
  browserUrl?: string;
  browserTitle?: string;
}

/**
 * Error event data emitted by BrowserSessionManager
 */
export interface BrowserSessionError {
  sessionId: string;
  message: string;
}

/**
 * Events emitted by BrowserSessionManager
 */
export interface BrowserSessionManagerEvents {
  frame: (frame: BrowserSessionFrame) => void;
  status: (status: BrowserSessionStatus) => void;
  error: (error: BrowserSessionError) => void;
}

/**
 * BrowserSessionManager manages browser instances for each AgentDock session.
 * It combines the browser-streamer and playwright-mcp libraries to provide
 * screen streaming and browser automation capabilities.
 *
 * @example
 * ```typescript
 * const manager = new BrowserSessionManager();
 *
 * manager.on('frame', (frame) => {
 *   // Send frame to client via WebSocket
 *   sendToClient(frame.sessionId, frame.data);
 * });
 *
 * manager.on('status', (status) => {
 *   // Update client with browser status
 *   sendToClient(status.sessionId, status);
 * });
 *
 * // Create a browser session (automatically starts screencast)
 * await manager.createSession('session-123');
 *
 * // Access the controller for browser operations
 * const controller = manager.getController('session-123');
 * await controller.navigate('https://example.com');
 *
 * // Clean up
 * await manager.destroySession('session-123');
 * ```
 */
export class BrowserSessionManager extends EventEmitter {
  private sessions: Map<string, BrowserSession> = new Map();

  /**
   * Create a new browser session
   *
   * @param sessionId - Unique session identifier
   */
  async createSession(sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    // Create browser controller
    const controller = new BrowserController();
    await controller.launch({ headless: true });

    // Get the page and create streamer
    const page = controller.getPage();
    if (!page) {
      throw new Error('Failed to get page from controller');
    }

    const streamer = new BrowserStreamer(page);

    // Set up event forwarding
    streamer.on('frame', (frame: FrameData) => {
      this.emit('frame', {
        sessionId,
        data: frame.data,
        metadata: {
          deviceWidth: frame.metadata.deviceWidth,
          deviceHeight: frame.metadata.deviceHeight,
          timestamp: frame.metadata.timestamp,
        },
      } satisfies BrowserSessionFrame);
    });

    streamer.on('error', (error: Error) => {
      this.emit('error', {
        sessionId,
        message: error.message,
      } satisfies BrowserSessionError);
    });

    // Store session
    this.sessions.set(sessionId, { controller, streamer });

    // Set up page event listeners for URL/title changes
    page.on('framenavigated', async (frame) => {
      // Only care about main frame
      if (frame === page.mainFrame()) {
        const session = this.sessions.get(sessionId);
        if (session) {
          this.emit('status', {
            sessionId,
            active: session.streamer.isActive(),
            browserUrl: page.url(),
            browserTitle: await page.title(),
          } satisfies BrowserSessionStatus);
        }
      }
    });

    // Emit initial status
    this.emit('status', {
      sessionId,
      active: false,
      browserUrl: page.url(),
      browserTitle: await page.title(),
    } satisfies BrowserSessionStatus);

    // Start screencast automatically
    try {
      await streamer.start({ format: 'jpeg', quality: 70 });
      this.emit('status', {
        sessionId,
        active: true,
        browserUrl: page.url(),
        browserTitle: await page.title(),
      } satisfies BrowserSessionStatus);
    } catch (error) {
      this.emit('error', {
        sessionId,
        message: `Failed to start screencast: ${error instanceof Error ? error.message : String(error)}`,
      } satisfies BrowserSessionError);
    }
  }

  /**
   * Destroy a browser session
   *
   * @param sessionId - Session identifier to destroy
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Stop streamer
    try {
      await session.streamer.stop();
    } catch {
      // Ignore errors during cleanup
    }

    // Close browser
    try {
      await session.controller.close();
    } catch {
      // Ignore errors during cleanup
    }

    // Remove from map
    this.sessions.delete(sessionId);

    // Emit status
    this.emit('status', {
      sessionId,
      active: false,
    } satisfies BrowserSessionStatus);
  }

  /**
   * Get the browser controller for a session
   *
   * @param sessionId - Session identifier
   * @returns BrowserController or undefined if session doesn't exist
   */
  getController(sessionId: string): BrowserController | undefined {
    return this.sessions.get(sessionId)?.controller;
  }

  /**
   * Get the current status of a session
   *
   * @param sessionId - Session identifier
   * @returns Current session status or undefined if session doesn't exist
   */
  async getStatus(sessionId: string): Promise<BrowserSessionStatus | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const page = session.controller.getPage();
    return {
      sessionId,
      active: session.streamer.isActive(),
      browserUrl: page?.url(),
      browserTitle: page ? await page.title() : undefined,
    };
  }

  /**
   * Destroy all sessions
   */
  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.destroySession(id)));
  }

  // Type-safe event emitter methods
  override on<K extends keyof BrowserSessionManagerEvents>(
    event: K,
    listener: BrowserSessionManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof BrowserSessionManagerEvents>(
    event: K,
    ...args: Parameters<BrowserSessionManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
