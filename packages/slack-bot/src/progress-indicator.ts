import type { WebClient } from '@slack/bolt';

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
   */
  async startProcessing(channel: string, threadTs: string): Promise<void> {
    const key = makeKey(channel, threadTs);

    // Don't start if already processing
    if (this.processing.has(key)) {
      return;
    }

    const state: ProcessingState = {
      messageTs: null,
      intervalId: null,
      phaseIndex: 0,
    };

    this.processing.set(key, state);

    // Add reaction to the original message
    try {
      await this.client.reactions.add({
        channel,
        timestamp: threadTs,
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

    // Clear the interval
    if (state.intervalId) {
      clearInterval(state.intervalId);
    }

    // Remove reaction
    try {
      await this.client.reactions.remove({
        channel,
        timestamp: threadTs,
        name: PROCESSING_REACTION,
      });
    } catch (error) {
      // Ignore errors (reaction may not exist)
      console.error('Failed to remove reaction:', error);
    }

    // Delete the processing message
    if (state.messageTs) {
      try {
        await this.client.chat.delete({
          channel,
          ts: state.messageTs,
        });
      } catch (error) {
        // Ignore errors (message may not exist or permissions issue)
        console.error('Failed to delete processing message:', error);
      }
    }

    this.processing.delete(key);
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
