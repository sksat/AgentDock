import { App } from '@slack/bolt';
import type { AppMentionEvent, GenericMessageEvent } from '@slack/types';
import type { MessageBridge } from './message-bridge.js';
import type { SlackSessionManager } from './slack-session-manager.js';
import { ProgressIndicator } from './progress-indicator.js';

/**
 * Check if a message should be ignored (e.g., marked as aside).
 * Messages starting with (aside) are not sent to AgentDock.
 */
export function shouldIgnoreMessage(text: string): boolean {
  if (!text || text.trim() === '') {
    return false;
  }
  return /^\s*\(aside\)/i.test(text);
}

/**
 * Extract the message text after removing the bot mention.
 */
export function extractMentionText(text: string, botUserId: string): string {
  // Remove the bot mention from the text
  const mentionPattern = new RegExp(`<@${botUserId}>`, 'g');
  return text.replace(mentionPattern, '').trim();
}

/**
 * Parse a Slack message and extract useful information.
 */
export function parseSlackMessage(text: string): {
  text: string;
  mentions: string[];
} {
  const mentions: string[] = [];

  // Extract user mentions
  const mentionPattern = /<@([A-Z0-9]+)>/g;
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return {
    text,
    mentions,
  };
}

export interface SlackAppOptions {
  botToken: string;
  appToken: string;
  bridge: MessageBridge;
  sessionManager: SlackSessionManager;
  botUserId?: string;
}

export interface SlackAppResult {
  app: App;
  progressIndicator: ProgressIndicator;
}

/**
 * Creates and configures the Slack Bolt App with event handlers.
 * Returns both the app and the progress indicator.
 */
export function createSlackApp(options: SlackAppOptions): SlackAppResult {
  const { botToken, appToken, bridge, sessionManager, botUserId } = options;

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
  });

  // Create progress indicator with the app's client
  const progressIndicator = new ProgressIndicator(app.client);

  // Handle app_mention events (when bot is mentioned)
  app.event('app_mention', async ({ event, client, say }) => {
    console.log('[DEBUG] app_mention event received:', JSON.stringify(event, null, 2));
    const mentionEvent = event as AppMentionEvent;
    const { text, channel, ts, thread_ts, user, team } = mentionEvent;

    // Use thread_ts if this is a reply, otherwise use the message ts as thread root
    const threadTs = thread_ts || ts;

    // Extract the actual message text (remove bot mention)
    const actualBotUserId = botUserId || (await getBotUserId(client));
    const messageText = extractMentionText(text, actualBotUserId);

    // Check if this should be ignored
    if (shouldIgnoreMessage(messageText)) {
      return;
    }

    // Check if message is empty after extracting mention
    if (!messageText.trim()) {
      await say({
        text: 'Hello! How can I help you? Please include your request after mentioning me.',
        thread_ts: threadTs,
      });
      return;
    }

    try {
      console.log('[DEBUG] Finding or creating session for thread:', threadTs);
      // Find or create a session for this thread
      const binding = await sessionManager.findOrCreateSession(
        team || 'unknown',
        channel,
        threadTs
      );
      console.log('[DEBUG] Session binding:', JSON.stringify(binding, null, 2));

      // Start progress indicator on the specific message
      // ts is the timestamp of this message (for reaction)
      // threadTs is the thread root (for tracking)
      await progressIndicator.startProcessing(channel, threadTs, ts);

      // Send the user message to AgentDock
      console.log('[DEBUG] Sending user message to AgentDock:', messageText);
      bridge.sendUserMessage(binding.agentDockSessionId, messageText, {
        source: 'slack',
        slackContext: {
          channelId: channel,
          threadTs,
          userId: user || 'unknown',
        },
      });
      console.log('[DEBUG] User message sent successfully');
    } catch (error) {
      console.error('Error handling app_mention:', error);
      // Stop progress indicator on error
      await progressIndicator.stopProcessing(channel, threadTs);
      await say({
        text: 'Sorry, I encountered an error. Please try again.',
        thread_ts: threadTs,
      });
    }
  });

  // Handle message events (for thread replies)
  app.event('message', async ({ event, client, say }) => {
    const messageEvent = event as GenericMessageEvent;

    // Skip bot messages to avoid loops
    if (messageEvent.subtype === 'bot_message' || messageEvent.bot_id) {
      return;
    }

    // Only handle thread replies (messages with thread_ts)
    if (!messageEvent.thread_ts || messageEvent.thread_ts === messageEvent.ts) {
      return;
    }

    const { text, channel, thread_ts, user, team } = messageEvent;

    // Check if we have a session for this thread
    const teamId = team || 'unknown';
    if (!sessionManager.hasThread(teamId, channel, thread_ts)) {
      // Not a tracked thread, ignore
      return;
    }

    // Check if this should be ignored
    if (shouldIgnoreMessage(text || '')) {
      return;
    }

    // Don't process empty messages
    if (!text?.trim()) {
      return;
    }

    try {
      const binding = sessionManager.getSessionByThread(teamId, channel, thread_ts);
      if (!binding) {
        return;
      }

      // Start progress indicator on this specific reply message
      // messageEvent.ts is the timestamp of this reply (for reaction)
      // thread_ts is the thread root (for tracking)
      await progressIndicator.startProcessing(channel, thread_ts, messageEvent.ts);

      // Send the user message to AgentDock
      bridge.sendUserMessage(binding.agentDockSessionId, text, {
        source: 'slack',
        slackContext: {
          channelId: channel,
          threadTs: thread_ts,
          userId: user || 'unknown',
        },
      });
    } catch (error) {
      console.error('Error handling message:', error);
      // Stop progress indicator on error
      await progressIndicator.stopProcessing(channel, thread_ts);
    }
  });

  return { app, progressIndicator };
}

/**
 * Get the bot's user ID from the Slack API.
 */
async function getBotUserId(client: any): Promise<string> {
  try {
    const result = await client.auth.test();
    return result.user_id || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Set up message forwarding from AgentDock to Slack.
 * This handles text_output, tool_use, permission_request, etc.
 */
export function setupMessageForwarding(
  app: App,
  bridge: MessageBridge,
  sessionManager: SlackSessionManager
): void {
  bridge.onMessage(async (message) => {
    // Only handle messages that have a sessionId
    if (!('sessionId' in message)) {
      return;
    }

    const sessionId = (message as { sessionId: string }).sessionId;
    const binding = sessionManager.getSessionById(sessionId);
    if (!binding) {
      return;
    }

    const { slackChannelId, slackThreadTs } = binding;

    try {
      switch (message.type) {
        case 'text_output': {
          // Note: For streaming, we'd need to implement message accumulation
          // and periodic updates. For now, we'll handle it in a basic way.
          // The actual implementation will be in MessageFormatter
          break;
        }

        case 'permission_request': {
          // Permission requests will be handled by PermissionUI
          break;
        }

        case 'result': {
          // Final result - handled by MessageFormatter
          break;
        }

        case 'error': {
          await app.client.chat.postMessage({
            channel: slackChannelId,
            thread_ts: slackThreadTs,
            text: `:x: Error: ${message.message}`,
          });
          break;
        }

        default:
          // Other message types can be handled as needed
          break;
      }
    } catch (error) {
      console.error('Error forwarding message to Slack:', error);
    }
  });
}
