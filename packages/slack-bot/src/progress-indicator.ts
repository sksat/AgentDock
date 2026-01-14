import type { WebClient } from '@slack/web-api';

// Progress phases to rotate through
const PROGRESS_PHASES = [
  ':robot_face: Processing...',
  ':robot_face: Analyzing...',
  ':robot_face: Working...',
  ':robot_face: Almost there...',
];

// Update interval in milliseconds
const UPDATE_INTERVAL = 5000;

// Reaction to use for processing indication
const PROCESSING_REACTION = 'hourglass_flowing_sand';

interface ProcessingState {
  messageTs: string | null;
  reactionTs: string; // The message to add reaction to
  intervalId: NodeJS.Timeout | null;
  phaseIndex: number;
}

/**
 * Generates a unique key for a channel/thread combination.
 */
function makeKey(channel: string, threadTs: string): string {
  return `${channel}:${threadTs}`;
}

/**
 * Manages processing indicators in Slack.
 * Shows a reaction and rotating message while AgentDock is processing.
 */
export class ProgressIndicator {
  private client: WebClient;
  private processing: Map<string, ProcessingState> = new Map();

  constructor(client: WebClient) {
    this.client = client;
  }

  /**
   * Start showing a processing indicator for a thread.
   * @param channel - The Slack channel ID
   * @param threadTs - The thread timestamp (used for posting replies and as the key)
   * @param reactionTs - The message timestamp to add the reaction to (defaults to threadTs)
   */
  async startProcessing(
    channel: string,
    threadTs: string,
    reactionTs?: string
  ): Promise<void> {
    const key = makeKey(channel, threadTs);

    // Don't start if already processing
    if (this.processing.has(key)) {
      return;
    }

    // Use reactionTs if provided, otherwise use threadTs
    const targetReactionTs = reactionTs || threadTs;

    const state: ProcessingState = {
      messageTs: null,
      reactionTs: targetReactionTs,
      intervalId: null,
      phaseIndex: 0,
    };

    this.processing.set(key, state);

    // Add reaction to the target message
    try {
      await this.client.reactions.add({
        channel,
        timestamp: targetReactionTs,
        name: PROCESSING_REACTION,
      });
    } catch (error) {
      // Ignore errors (reaction may already exist or permissions issue)
      console.error('Failed to add reaction:', error);
    }

    // Post initial processing message
    try {
      const result = await this.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: PROGRESS_PHASES[0],
      });

      state.messageTs = result.ts || null;
    } catch (error) {
      console.error('Failed to post processing message:', error);
    }

    // Set up periodic updates
    state.intervalId = setInterval(async () => {
      await this.updatePhase(channel, threadTs);
    }, UPDATE_INTERVAL);
  }

  /**
   * Stop showing the processing indicator for a thread.
   */
  async stopProcessing(channel: string, threadTs: string): Promise<void> {
    const key = makeKey(channel, threadTs);
    const state = this.processing.get(key);

    if (!state) {
      return;
    }

    // Immediately remove from map to prevent duplicate cleanup
    this.processing.delete(key);

    // Clear the interval
    if (state.intervalId) {
      clearInterval(state.intervalId);
    }

    // Remove reaction from the target message (ignore errors - may already be removed)
    try {
      await this.client.reactions.remove({
        channel,
        timestamp: state.reactionTs,
        name: PROCESSING_REACTION,
      });
    } catch {
      // Ignore - reaction may not exist or already removed
    }

    // Delete the processing message (ignore errors - may already be deleted)
    if (state.messageTs) {
      try {
        await this.client.chat.delete({
          channel,
          ts: state.messageTs,
        });
      } catch {
        // Ignore - message may not exist or already deleted
      }
    }
  }

  /**
   * Check if a thread is currently being processed.
   */
  isProcessing(channel: string, threadTs: string): boolean {
    const key = makeKey(channel, threadTs);
    return this.processing.has(key);
  }

  /**
   * Update the processing message to the next phase.
   */
  private async updatePhase(channel: string, threadTs: string): Promise<void> {
    const key = makeKey(channel, threadTs);
    const state = this.processing.get(key);

    if (!state || !state.messageTs) {
      return;
    }

    // Advance to next phase
    state.phaseIndex = (state.phaseIndex + 1) % PROGRESS_PHASES.length;
    const newText = PROGRESS_PHASES[state.phaseIndex];

    try {
      await this.client.chat.update({
        channel,
        ts: state.messageTs,
        text: newText,
      });
    } catch (error) {
      console.error('Failed to update processing message:', error);
    }
  }

  /**
   * Clean up all processing indicators.
   * Call this when shutting down the application.
   */
  cleanup(): void {
    for (const [key, state] of this.processing) {
      if (state.intervalId) {
        clearInterval(state.intervalId);
      }
    }
    this.processing.clear();
  }
}
