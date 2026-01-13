import { WebSocket } from 'ws';
import type {
  ClientMessage,
  ServerMessage,
  SessionInfo,
  PermissionResult,
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
 */
export class MessageBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Set<MessageListener> = new Set();
  private pendingSessionCreate: {
    resolve: (session: SessionInfo) => void;
    reject: (error: Error) => void;
  } | null = null;

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
   * Connect to AgentDock server.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected');
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.ws = null;
      });
    });
  }

  /**
   * Disconnect from AgentDock server.
   */
  async disconnect(): Promise<void> {
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
