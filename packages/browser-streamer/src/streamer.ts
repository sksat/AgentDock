import { EventEmitter } from 'events';
import type { Page, CDPSession } from 'playwright';
import type { ScreencastOptions, FrameData, BrowserStreamerEvents } from './types';

/**
 * BrowserStreamer provides real-time screen streaming from a Playwright page
 * using the CDP (Chrome DevTools Protocol) Screencast API.
 *
 * @example
 * ```typescript
 * const streamer = new BrowserStreamer(page);
 * streamer.on('frame', (frame) => {
 *   console.log('Got frame:', frame.data.length, 'bytes');
 * });
 * await streamer.start();
 * // ... later
 * await streamer.stop();
 * ```
 */
export class BrowserStreamer extends EventEmitter {
  private cdpSession: CDPSession | null = null;
  private streaming = false;
  private page: Page;

  constructor(page: Page) {
    super();
    this.page = page;
  }

  /**
   * Check if the streamer is currently active
   */
  isActive(): boolean {
    return this.streaming;
  }

  /**
   * Start the screencast streaming
   *
   * @param options - Configuration options for the screencast
   * @throws Error if already streaming
   */
  async start(options?: ScreencastOptions): Promise<void> {
    if (this.streaming) {
      throw new Error('Already streaming');
    }

    try {
      // Create CDP session via browser context
      const context = this.page.context();
      this.cdpSession = await context.newCDPSession(this.page);

      // Set up frame handler
      this.cdpSession.on('Page.screencastFrame', async (event: {
        data: string;
        metadata: {
          offsetTop: number;
          pageScaleFactor: number;
          deviceWidth: number;
          deviceHeight: number;
          scrollOffsetX: number;
          scrollOffsetY: number;
          timestamp?: number;
        };
        sessionId: number;
      }) => {
        if (!this.streaming || !this.cdpSession) {
          return;
        }

        const frameData: FrameData = {
          data: event.data,
          metadata: {
            deviceWidth: event.metadata.deviceWidth,
            deviceHeight: event.metadata.deviceHeight,
            offsetTop: event.metadata.offsetTop,
            pageScaleFactor: event.metadata.pageScaleFactor,
            scrollOffsetX: event.metadata.scrollOffsetX,
            scrollOffsetY: event.metadata.scrollOffsetY,
            timestamp: event.metadata.timestamp ?? Date.now(),
          },
        };

        this.emit('frame', frameData);

        // Acknowledge the frame to receive the next one
        try {
          await this.cdpSession.send('Page.screencastFrameAck', {
            sessionId: event.sessionId,
          });
        } catch {
          // Session might be closed, ignore ack errors
        }
      });

      // Handle page close
      this.page.on('close', () => {
        if (this.streaming) {
          this.emit('error', new Error('Page closed while streaming'));
          this.streaming = false;
          this.cdpSession = null;
        }
      });

      // Start the screencast
      await this.cdpSession.send('Page.startScreencast', {
        format: options?.format ?? 'jpeg',
        quality: options?.quality ?? 80,
        maxWidth: options?.maxWidth,
        maxHeight: options?.maxHeight,
        everyNthFrame: options?.everyNthFrame ?? 1,
      });

      this.streaming = true;
    } catch (error) {
      this.cdpSession = null;
      this.streaming = false;
      throw error;
    }
  }

  /**
   * Stop the screencast streaming
   */
  async stop(): Promise<void> {
    if (!this.streaming || !this.cdpSession) {
      return;
    }

    try {
      await this.cdpSession.send('Page.stopScreencast');
      await this.cdpSession.detach();
    } catch {
      // Ignore errors during cleanup
    }

    this.streaming = false;
    this.cdpSession = null;
  }

  // Type-safe event emitter methods
  override on<K extends keyof BrowserStreamerEvents>(
    event: K,
    listener: BrowserStreamerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof BrowserStreamerEvents>(
    event: K,
    ...args: Parameters<BrowserStreamerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
