import type { MessageBridge } from './message-bridge.js';
import type { SlackThreadBinding, ServerMessage, ThreadBindingsListMessage } from '@agent-dock/shared';

// Re-export SlackThreadBinding for backwards compatibility
export type { SlackThreadBinding } from '@agent-dock/shared';

/**
 * Generates a unique key for a Slack thread.
 */
function makeThreadKey(teamId: string, channelId: string, threadTs: string): string {
  return `${teamId}:${channelId}:${threadTs}`;
}

/**
 * Manages the mapping between Slack threads and AgentDock sessions.
 * Each Slack thread corresponds to one AgentDock session.
 */
export class SlackSessionManager {
  private bridge: MessageBridge;
  private defaultWorkingDir: string;

  // Thread key -> Binding
  private threadBindings: Map<string, SlackThreadBinding> = new Map();

  // Session ID -> Binding (for reverse lookup)
  private sessionBindings: Map<string, SlackThreadBinding> = new Map();

  // Track pending session creations to prevent race conditions
  // Thread key -> Promise that resolves when session is created
  private pendingCreations: Map<string, Promise<SlackThreadBinding>> = new Map();

  // Counter for generating unique session names
  private sessionCounter = 0;

  constructor(bridge: MessageBridge, defaultWorkingDir: string) {
    this.bridge = bridge;
    this.defaultWorkingDir = defaultWorkingDir;
  }

  /**
   * Initialize by loading existing bindings from the server.
   * Should be called after the bridge is connected.
   */
  async initialize(): Promise<void> {
    return new Promise((resolve) => {
      const listener = (message: ServerMessage) => {
        if (message.type === 'thread_bindings_list') {
          this.handleThreadBindingsList((message as ThreadBindingsListMessage).bindings);
          this.bridge.offMessage(listener);
          resolve();
        }
      };
      this.bridge.onMessage(listener);
      this.bridge.requestThreadBindings();
    });
  }

  /**
   * Handle the thread bindings list response from the server.
   */
  private handleThreadBindingsList(bindings: SlackThreadBinding[]): void {
    console.log(`[SlackSessionManager] Loaded ${bindings.length} thread bindings from server`);
    for (const binding of bindings) {
      const key = makeThreadKey(binding.slackTeamId, binding.slackChannelId, binding.slackThreadTs);
      this.threadBindings.set(key, binding);
      this.sessionBindings.set(binding.agentDockSessionId, binding);
    }
    // Adjust counter based on loaded bindings
    this.sessionCounter = bindings.length;
  }

  /**
   * Find an existing session for a thread, or create a new one.
   * Also attaches to the session to receive messages.
   *
   * This method handles concurrent requests for the same thread by tracking
   * pending creations. If a session is being created for a thread, subsequent
   * requests will wait for the same creation to complete.
   */
  async findOrCreateSession(
    teamId: string,
    channelId: string,
    threadTs: string
  ): Promise<SlackThreadBinding> {
    const key = makeThreadKey(teamId, channelId, threadTs);

    // Check if we already have a session for this thread
    const existing = this.threadBindings.get(key);
    if (existing) {
      // Re-attach to ensure we receive messages
      this.bridge.attachSession(existing.agentDockSessionId);
      return existing;
    }

    // Check if a session creation is already in progress for this thread
    const pending = this.pendingCreations.get(key);
    if (pending) {
      // Wait for the existing creation to complete
      return pending;
    }

    // Create a promise for this session creation
    const creationPromise = this.doCreateSession(teamId, channelId, threadTs, key);
    this.pendingCreations.set(key, creationPromise);

    try {
      return await creationPromise;
    } finally {
      // Clean up the pending creation
      this.pendingCreations.delete(key);
    }
  }

  /**
   * Internal method that performs the actual session creation.
   */
  private async doCreateSession(
    teamId: string,
    channelId: string,
    threadTs: string,
    key: string
  ): Promise<SlackThreadBinding> {
    // Create a new session in AgentDock
    const sessionName = this.generateSessionName();
    const session = await this.bridge.createSession(sessionName, this.defaultWorkingDir);

    // Attach to the session to receive messages
    this.bridge.attachSession(session.id);

    // Create the binding
    const binding: SlackThreadBinding = {
      slackTeamId: teamId,
      slackChannelId: channelId,
      slackThreadTs: threadTs,
      agentDockSessionId: session.id,
      createdAt: new Date().toISOString(),
    };

    // Store in both maps
    this.threadBindings.set(key, binding);
    this.sessionBindings.set(session.id, binding);

    // Persist to server
    this.bridge.saveThreadBinding(binding);

    return binding;
  }

  /**
   * Get the session binding for a Slack thread.
   * Returns undefined if no session exists for this thread.
   */
  getSessionByThread(
    teamId: string,
    channelId: string,
    threadTs: string
  ): SlackThreadBinding | undefined {
    const key = makeThreadKey(teamId, channelId, threadTs);
    return this.threadBindings.get(key);
  }

  /**
   * Get the session binding by AgentDock session ID.
   * Returns undefined if no binding exists for this session.
   */
  getSessionById(sessionId: string): SlackThreadBinding | undefined {
    return this.sessionBindings.get(sessionId);
  }

  /**
   * Check if a thread has an associated session (or a pending creation).
   * Use includePending=true to also check for sessions currently being created.
   */
  hasThread(teamId: string, channelId: string, threadTs: string, includePending = false): boolean {
    const key = makeThreadKey(teamId, channelId, threadTs);
    if (this.threadBindings.has(key)) {
      return true;
    }
    if (includePending && this.pendingCreations.has(key)) {
      return true;
    }
    return false;
  }

  /**
   * Check if a session creation is in progress for a thread.
   */
  hasPendingCreation(teamId: string, channelId: string, threadTs: string): boolean {
    const key = makeThreadKey(teamId, channelId, threadTs);
    return this.pendingCreations.has(key);
  }

  /**
   * Remove a session binding.
   */
  removeSession(sessionId: string): void {
    const binding = this.sessionBindings.get(sessionId);
    if (!binding) {
      return;
    }

    const key = makeThreadKey(
      binding.slackTeamId,
      binding.slackChannelId,
      binding.slackThreadTs
    );

    this.threadBindings.delete(key);
    this.sessionBindings.delete(sessionId);
  }

  /**
   * Get all session bindings.
   */
  getAllBindings(): SlackThreadBinding[] {
    return Array.from(this.threadBindings.values());
  }

  /**
   * Generate a unique session name.
   */
  private generateSessionName(): string {
    this.sessionCounter++;
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return `Slack #${this.sessionCounter} (${timestamp})`;
  }
}
