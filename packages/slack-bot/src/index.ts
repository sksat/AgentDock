import 'dotenv/config';
import { App } from '@slack/bolt';
import { MessageBridge } from './message-bridge.js';
import { SlackSessionManager } from './slack-session-manager.js';
import { ProgressIndicator } from './progress-indicator.js';
import { createSlackApp, setupMessageForwarding } from './slack-app.js';
import {
  formatTextOutput,
  formatToolUse,
  formatToolResult,
  formatError,
} from './message-formatter.js';
import {
  buildPermissionRequestBlocks,
  buildPermissionResultBlocks,
  parsePermissionAction,
  actionToPermissionResponse,
} from './permission-ui.js';

// Environment variables (loaded from .env file)
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const AGENTDOCK_WS_URL = process.env.AGENTDOCK_WS_URL || 'ws://localhost:3001/ws';
const SLACK_DEFAULT_WORKING_DIR = process.env.SLACK_DEFAULT_WORKING_DIR || process.cwd();

/**
 * Main entry point for the Slack Bot.
 */
async function main(): Promise<void> {
  // Validate required environment variables
  if (!SLACK_BOT_TOKEN) {
    console.error('Error: SLACK_BOT_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!SLACK_APP_TOKEN) {
    console.error('Error: SLACK_APP_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log('Starting AgentDock Slack Bot...');
  console.log(`AgentDock WebSocket URL: ${AGENTDOCK_WS_URL}`);
  console.log(`Default working directory: ${SLACK_DEFAULT_WORKING_DIR}`);

  // Create and connect to AgentDock server
  const bridge = new MessageBridge(AGENTDOCK_WS_URL);
  try {
    await bridge.connect();
    console.log('Connected to AgentDock server');
  } catch (error) {
    console.error('Failed to connect to AgentDock server:', error);
    process.exit(1);
  }

  // Create session manager
  const sessionManager = new SlackSessionManager(bridge, SLACK_DEFAULT_WORKING_DIR);

  // Create Slack app
  const app = createSlackApp({
    botToken: SLACK_BOT_TOKEN,
    appToken: SLACK_APP_TOKEN,
    bridge,
    sessionManager,
  });

  // Create progress indicator
  const progressIndicator = new ProgressIndicator(app.client);

  // Pending permission requests (requestId -> { channel, threadTs, input })
  const pendingPermissions = new Map<
    string,
    { channel: string; threadTs: string; toolName: string; input: unknown }
  >();

  // Set up message forwarding from AgentDock to Slack
  bridge.onMessage(async (message) => {
    if (!('sessionId' in message)) return;

    const sessionId = (message as { sessionId: string }).sessionId;
    const binding = sessionManager.getSessionById(sessionId);
    if (!binding) return;

    const { slackChannelId: channel, slackThreadTs: threadTs } = binding;

    try {
      switch (message.type) {
        case 'text_output': {
          // Stop progress indicator on first text output
          if (progressIndicator.isProcessing(channel, threadTs)) {
            await progressIndicator.stopProcessing(channel, threadTs);
          }

          const blocks = formatTextOutput(message.text);
          if (blocks.length > 0) {
            await app.client.chat.postMessage({
              channel,
              thread_ts: threadTs,
              blocks,
              text: message.text, // Fallback for notifications
            });
          }
          break;
        }

        case 'tool_use': {
          const blocks = formatToolUse(message.toolName, message.toolUseId, message.input);
          await app.client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            blocks,
            text: `Using tool: ${message.toolName}`,
          });
          break;
        }

        case 'tool_result': {
          const blocks = formatToolResult(
            message.toolUseId,
            message.content,
            message.isError || false
          );
          await app.client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            blocks,
            text: message.isError ? 'Tool error' : 'Tool completed',
          });
          break;
        }

        case 'permission_request': {
          // Store pending permission for later resolution
          pendingPermissions.set(message.requestId, {
            channel,
            threadTs,
            toolName: message.toolName,
            input: message.input,
          });

          // Build and send permission request UI
          const blocks = buildPermissionRequestBlocks(
            message.requestId,
            message.toolName,
            message.input
          );
          await app.client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            blocks,
            text: `Permission request for ${message.toolName}`,
          });
          break;
        }

        case 'error': {
          // Stop progress indicator on error
          if (progressIndicator.isProcessing(channel, threadTs)) {
            await progressIndicator.stopProcessing(channel, threadTs);
          }

          const blocks = formatError(message.message);
          await app.client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            blocks,
            text: `Error: ${message.message}`,
          });
          break;
        }

        case 'session_status_changed': {
          // Start/stop progress indicator based on status
          if (message.status === 'running') {
            if (!progressIndicator.isProcessing(channel, threadTs)) {
              await progressIndicator.startProcessing(channel, threadTs);
            }
          } else {
            if (progressIndicator.isProcessing(channel, threadTs)) {
              await progressIndicator.stopProcessing(channel, threadTs);
            }
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error forwarding message to Slack:', error);
    }
  });

  // Handle permission button clicks
  app.action(/^(allow|allow_session|deny)_/, async ({ action, ack, body, client }) => {
    await ack();

    if (action.type !== 'button') return;

    const parsedAction = parsePermissionAction(action.action_id, action.value);
    if (!parsedAction) {
      console.error('Failed to parse permission action');
      return;
    }

    const pending = pendingPermissions.get(parsedAction.requestId);
    if (!pending) {
      console.error('No pending permission found for requestId:', parsedAction.requestId);
      return;
    }

    // Get session ID from the pending permission's channel/thread
    const binding = sessionManager.getSessionByThread(
      body.team?.id || 'unknown',
      pending.channel,
      pending.threadTs
    );
    if (!binding) {
      console.error('No session binding found');
      return;
    }

    // Convert action to permission response
    const response = actionToPermissionResponse(parsedAction, pending.input);

    // Send permission response to AgentDock
    bridge.sendPermissionResponse(binding.agentDockSessionId, parsedAction.requestId, response);

    // Update the message to show result
    const userId = body.user?.id || 'unknown';
    const resultBlocks = buildPermissionResultBlocks(
      pending.toolName,
      response.behavior === 'allow' ? 'allowed' : 'denied',
      userId
    );

    try {
      // Update the original message
      if (body.message?.ts) {
        await client.chat.update({
          channel: pending.channel,
          ts: body.message.ts,
          blocks: resultBlocks,
          text:
            response.behavior === 'allow'
              ? `${pending.toolName} allowed`
              : `${pending.toolName} denied`,
        });
      }
    } catch (error) {
      console.error('Failed to update permission message:', error);
    }

    // Clean up
    pendingPermissions.delete(parsedAction.requestId);
  });

  // Start the Slack app
  await app.start();
  console.log('Slack Bot is running!');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    progressIndicator.cleanup();
    await bridge.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Export components for external use
export {
  MessageBridge,
  SlackSessionManager,
  ProgressIndicator,
  createSlackApp,
  setupMessageForwarding,
  formatTextOutput,
  formatToolUse,
  formatToolResult,
  formatError,
  buildPermissionRequestBlocks,
  buildPermissionResultBlocks,
  parsePermissionAction,
  actionToPermissionResponse,
};
