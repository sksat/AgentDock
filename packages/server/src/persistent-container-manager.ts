import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import { WebSocket } from 'ws';
import type { ContainerConfig } from './container-config.js';
import { buildPodmanArgs } from './container-config.js';

export interface PersistentContainerOptions {
  containerConfig: ContainerConfig;
  workingDir: string;
  bridgePort: number;
}

export interface PersistentContainerEvents {
  bridge_message: (message: unknown) => void;
  bridge_connected: () => void;
  bridge_disconnected: () => void;
  container_started: (containerId: string) => void;
  container_stopped: () => void;
  error: (error: Error) => void;
}

/**
 * Manages a persistent Podman container for a session.
 * The container stays alive across multiple Claude invocations
 * and can run the browser bridge service.
 */
export class PersistentContainerManager extends EventEmitter {
  private options: PersistentContainerOptions;
  private containerId: string | null = null;
  private containerProcess: ChildProcess | null = null;
  private bridgeWs: WebSocket | null = null;
  private bridgeReconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(options: PersistentContainerOptions) {
    super();
    this.options = options;
  }

  get isRunning(): boolean {
    return this.containerId !== null;
  }

  get isBridgeConnected(): boolean {
    return this.bridgeWs?.readyState === WebSocket.OPEN;
  }

  /**
   * Start the persistent container in the background
   */
  async startContainer(): Promise<string> {
    if (this.containerId) {
      return this.containerId;
    }

    const { containerConfig, workingDir } = this.options;

    // Build podman args for a detached container that stays running
    const baseArgs = buildPodmanArgs(containerConfig, workingDir, {});

    // Replace 'run' with 'run -d' for detached mode and add sleep infinity
    // baseArgs structure: ['run', '-it', '--rm', '--userns=keep-id', ...mounts..., image]
    // We need to:
    // 1. Skip first 4 args (run, -it, --rm, --userns=keep-id) - we add our own
    // 2. Skip last element (image) - we add it after port mapping
    const mountArgs = baseArgs.slice(4, -1);
    const args = [
      'run',
      '-d', // detached
      '--rm',
      '--userns=keep-id',
      ...mountArgs,
      '-p', `${this.options.bridgePort}:3002`, // Expose bridge port
      containerConfig.image,
      'sleep', 'infinity', // Keep container running
    ];

    console.log(`[PersistentContainer] Starting container: podman ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('podman', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.containerId = stdout.trim().substring(0, 12);
          console.log(`[PersistentContainer] Started container: ${this.containerId}`);
          this.emit('container_started', this.containerId);
          resolve(this.containerId);
        } else {
          const error = new Error(`Failed to start container: ${stderr}`);
          this.emit('error', error);
          reject(error);
        }
      });

      proc.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });
    });
  }

  /**
   * Start the browser bridge service inside the container
   */
  async startBrowserBridge(): Promise<void> {
    if (!this.containerId) {
      throw new Error('Container not started');
    }

    // Execute browser bridge inside the running container
    const proc = spawn('podman', [
      'exec',
      '-d', // detached
      this.containerId,
      'node',
      '/home/node/browser-bridge/dist/index.js',
    ]);

    return new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`[PersistentContainer] Browser bridge started in container`);
          // Wait a bit for the bridge to be ready, then connect
          setTimeout(() => {
            this.connectToBridge().then(resolve).catch(reject);
          }, 1000);
        } else {
          reject(new Error(`Failed to start browser bridge: exit code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Connect to the browser bridge WebSocket
   */
  private async connectToBridge(): Promise<void> {
    if (this.bridgeWs) {
      return;
    }

    const url = `ws://localhost:${this.options.bridgePort}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Bridge connection timeout'));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.bridgeWs = ws;
        console.log(`[PersistentContainer] Connected to bridge at ${url}`);
        this.emit('bridge_connected');
        resolve();
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.emit('bridge_message', message);
        } catch (error) {
          console.error('[PersistentContainer] Failed to parse bridge message:', error);
        }
      });

      ws.on('close', () => {
        this.bridgeWs = null;
        this.emit('bridge_disconnected');

        // Attempt reconnect if not shutting down
        if (!this.isShuttingDown && this.containerId) {
          this.scheduleReconnect();
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.error('[PersistentContainer] Bridge WebSocket error:', error);
        if (!this.bridgeWs) {
          reject(error);
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.bridgeReconnectTimer) return;

    this.bridgeReconnectTimer = setTimeout(() => {
      this.bridgeReconnectTimer = null;
      if (!this.isShuttingDown && this.containerId) {
        this.connectToBridge().catch((error) => {
          console.error('[PersistentContainer] Reconnect failed:', error);
          this.scheduleReconnect();
        });
      }
    }, 2000);
  }

  /**
   * Send a command to the browser bridge
   */
  async sendBrowserCommand(requestId: string, command: unknown): Promise<void> {
    if (!this.bridgeWs || this.bridgeWs.readyState !== WebSocket.OPEN) {
      throw new Error('Bridge not connected');
    }

    this.bridgeWs.send(JSON.stringify({ requestId, command }));
  }

  /**
   * Execute a command inside the running container (for Claude)
   */
  exec(command: string[], options: { env?: Record<string, string> } = {}): ChildProcess {
    if (!this.containerId) {
      throw new Error('Container not started');
    }

    const args = ['exec', '-it'];

    // Add environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    args.push(this.containerId, ...command);

    return spawn('podman', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /**
   * Stop the container
   */
  async stopContainer(): Promise<void> {
    this.isShuttingDown = true;

    // Clear reconnect timer
    if (this.bridgeReconnectTimer) {
      clearTimeout(this.bridgeReconnectTimer);
      this.bridgeReconnectTimer = null;
    }

    // Close bridge connection
    if (this.bridgeWs) {
      this.bridgeWs.close();
      this.bridgeWs = null;
    }

    // Stop container
    if (this.containerId) {
      const containerId = this.containerId;
      this.containerId = null;

      return new Promise((resolve) => {
        const proc = spawn('podman', ['stop', '-t', '2', containerId]);
        proc.on('close', () => {
          console.log(`[PersistentContainer] Stopped container: ${containerId}`);
          this.emit('container_stopped');
          resolve();
        });
        proc.on('error', () => {
          resolve(); // Ignore errors during cleanup
        });
      });
    }

    this.emit('container_stopped');
  }
}
