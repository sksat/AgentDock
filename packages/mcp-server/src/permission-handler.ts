import { WebSocket } from 'ws';
import { nanoid } from 'nanoid';

export interface PermissionRequest {
  sessionId: string;
  toolName: string;
  input: unknown;
}

export interface PermissionResponse {
  type: 'permission_response';
  sessionId: string;
  requestId: string;
  response: PermissionResult;
}

export type PermissionResult =
  | { behavior: 'allow'; updatedInput: unknown }
  | { behavior: 'deny'; message: string };

interface PendingRequest {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
}

export class PermissionHandler {
  private ws: WebSocket | null = null;
  private url: string;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private _isConnected = false;

  constructor(url: string) {
    this.url = url;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this._isConnected = true;
        resolve();
      });

      this.ws.on('error', (error) => {
        this._isConnected = false;
        reject(error);
      });

      this.ws.on('close', () => {
        this._isConnected = false;
      });

      this.ws.on('message', (data: Buffer | string) => {
        this.handleMessage(data.toString());
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      // Reject all pending requests
      for (const [requestId, pending] of this.pendingRequests) {
        pending.reject(new Error('Connection closed'));
        this.pendingRequests.delete(requestId);
      }

      this.ws.close();
      this.ws = null;
      this._isConnected = false;
    }
  }

  async requestPermission(request: PermissionRequest): Promise<PermissionResult> {
    if (!this.ws || !this._isConnected) {
      throw new Error('Not connected to server');
    }

    const requestId = nanoid();

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send permission request to bridge server
      const message = {
        type: 'permission_request',
        sessionId: request.sessionId,
        requestId,
        toolName: request.toolName,
        input: request.input,
      };

      this.ws!.send(JSON.stringify(message));
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as PermissionResponse;

      if (message.type === 'permission_response') {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          pending.resolve(message.response);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
}
