import { WebSocket } from 'ws';
import type {
  ClientMessage,
  ServerMessage,
  SessionInfo,
  PermissionResult,
  SlackThreadBinding,
} from '@agent-dock/shared';

export type MessageListener = (message: ServerMessage) => void;

export interface SlackContext {
  channelId: string;
  threadTs: string;
  userId: string;
}

export interface SendUserMessageOptions {
  source?: 'web' | 'slack';
  slackContext?: SlackContext;
}

/**
 * Handles WebSocket communication with AgentDock server.
 * Provides methods for sending/receiving messages and managing sessions.
 * Automatically reconnects when connection is lost.
 */
export class MessageBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Set<MessageListener> = new Set();
  private pendingSessionCreate: {
    resolve: (session: SessionInfo) => void;
    reject: (error: Error) => void;
  } | null = null;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Whether the bridge is currently connected to the server.
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to AgentDock server with automatic retry on failure.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected');
    }

    this.shouldReconnect = true;
    this.reconnectAttempts = 0;

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      try {
        await this.doConnect();
        return; // Connection successful
      } catch (error) {
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          throw new Error(
            `Failed to connect after ${this.maxReconnectAttempts} attempts: ${(error as Error).message}`
          );
        }
        const delay = Math.min(
          this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
          30000
        );
        console.log(
          `Connection failed: ${(error as Error).message}. Retrying in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let connected = false;
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        connected = true;
        console.log('Connected to AgentDock server');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        resolve();
      });

      this.ws.on('error', (error) => {
        // Only reject if not yet connected (initial connection failure)
        if (!connected) {
          reject(error);
        }
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.ws = null;
        // Only schedule reconnect if connection was established
        // Initial connection retries are handled by connect() method
        if (connected) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);

    console.log(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      if (this.shouldReconnect && !this.isConnected) {
        this.doConnect().catch((err) => {
          console.error('Reconnection failed:', err.message);
        });
      }
    }, delay);
  }

  /**
   * Disconnect from AgentDock server.
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a raw client message to the server.
   */
  send(message: ClientMessage): void {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }
    this.ws!.send(JSON.stringify(message));
  }

  /**
   * Register a listener for server messages.
   */
  onMessage(listener: MessageListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a message listener.
   */
  offMessage(listener: MessageListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Create a new session and wait for the server response.
   */
  async createSession(name: string, workingDir: string): Promise<SessionInfo> {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    return new Promise((resolve, reject) => {
      this.pendingSessionCreate = { resolve, reject };

      this.send({
        type: 'create_session',
        name,
        workingDir,
      });
    });
  }

  /**
   * Send a user message to a session.
   */
  sendUserMessage(
    sessionId: string,
    content: string,
    options?: SendUserMessageOptions
  ): void {
    // Note: The server currently expects UserMessageMessage type
    // We'll need to extend the shared types to include source and slackContext
    const message: ClientMessage & { source?: string; slackContext?: SlackContext } = {
      type: 'user_message',
      sessionId,
      content,
    };

    if (options?.source) {
      message.source = options.source;
    }
    if (options?.slackContext) {
      message.slackContext = options.slackContext;
    }

    this.send(message as ClientMessage);
  }

  /**
   * Send a permission response to the server.
   */
  sendPermissionResponse(
    sessionId: string,
    requestId: string,
    response: PermissionResult
  ): void {
    this.send({
      type: 'permission_response',
      sessionId,
      requestId,
      response,
    });
  }

  /**
   * Attach to an existing session.
   */
  attachSession(sessionId: string): void {
    this.send({
      type: 'attach_session',
      sessionId,
    });
  }

  // ==================== Thread Binding Operations ====================

  /**
   * Save a thread binding to the server.
   * The server will persist it to the database.
   */
  saveThreadBinding(binding: SlackThreadBinding): void {
    this.send({
      type: 'save_thread_binding',
      binding,
    });
  }

  /**
   * Request all thread bindings from the server.
   * The response will come via a 'thread_bindings_list' message to listeners.
   */
  requestThreadBindings(): void {
    this.send({
      type: 'load_thread_bindings',
    });
  }

  private handleMessage(data: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(data);
    } catch {
      // Invalid JSON, ignore
      return;
    }

    // Handle pending session creation
    if (message.type === 'session_created' && this.pendingSessionCreate) {
      this.pendingSessionCreate.resolve(message.session);
      this.pendingSessionCreate = null;
    }

    // Notify all listeners
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}
