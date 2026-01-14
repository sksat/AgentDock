import type { MessageBridge } from './message-bridge.js';

/**
 * Represents a binding between a Slack thread and an AgentDock session.
 */
export interface SlackThreadBinding {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  agentDockSessionId: string;
  createdAt: string;
}

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

  // Counter for generating unique session names
  private sessionCounter = 0;

  constructor(bridge: MessageBridge, defaultWorkingDir: string) {
    this.bridge = bridge;
    this.defaultWorkingDir = defaultWorkingDir;
  }

  /**
   * Find an existing session for a thread, or create a new one.
   * Also attaches to the session to receive messages.
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
   * Check if a thread has an associated session.
   */
  hasThread(teamId: string, channelId: string, threadTs: string): boolean {
    const key = makeThreadKey(teamId, channelId, threadTs);
    return this.threadBindings.has(key);
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
