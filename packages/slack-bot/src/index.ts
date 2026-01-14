import 'dotenv/config';
import { MessageBridge } from './message-bridge.js';
import { SlackSessionManager } from './slack-session-manager.js';
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
import { processAndUploadImages, uploadFile, processAndUploadBase64Image, extractBase64Image } from './file-uploader.js';

/**
 * Check if a tool result is trivial and should be skipped.
 * Trivial results: empty, {}, {"success":true}, etc.
 */
function isTrivialToolResult(content: string): boolean {
  try {
    // Parse as JSON array (tool_result format: [{"type":"text","text":"..."}])
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return true; // Empty array is trivial
    }

    // Extract text content
    for (const item of parsed) {
      if (item.type === 'text' && typeof item.text === 'string') {
        const text = item.text.trim();

        // Check for trivial patterns
        if (text === '' || text === '{}' || text === 'null' || text === 'undefined') {
          return true;
        }

        // Check for simple success responses
        try {
          const innerParsed = JSON.parse(text);
          if (typeof innerParsed === 'object' && innerParsed !== null) {
            const keys = Object.keys(innerParsed);
            // {"success": true} or similar single-key success objects
            if (keys.length === 1 && keys[0] === 'success') {
              return true;
            }
            // Empty object
            if (keys.length === 0) {
              return true;
            }
          }
        } catch {
          // Not JSON, check for short simple strings
          if (text.length < 20 && /^(ok|done|success|true)$/i.test(text)) {
            return true;
          }
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

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

  // Create Slack app and progress indicator
  const { app, progressIndicator } = createSlackApp({
    botToken: SLACK_BOT_TOKEN,
    appToken: SLACK_APP_TOKEN,
    bridge,
    sessionManager,
  });

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
          // Check if this is a base64 image (screenshot) - upload image only, skip message
          if (!message.isError && message.content) {
            const base64Image = extractBase64Image(message.content);
            if (base64Image) {
              console.log('[DEBUG] Detected base64 image, uploading...');
              const uploadedBase64 = await processAndUploadBase64Image(
                app.client,
                message.content,
                channel,
                threadTs
              );
              if (uploadedBase64) {
                console.log('Uploaded base64 screenshot to Slack');
              }
              break; // Skip posting the tool_result message
            }

            // Check if this is a trivial result (skip posting)
            if (isTrivialToolResult(message.content)) {
              console.log('[DEBUG] Skipping trivial tool result');
              break;
            }
          }

          // Post tool result message for non-trivial, non-image results
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

          // Upload screenshot file if path is provided
          if (message.screenshotFilename && !message.isError) {
            const result = await uploadFile(
              app.client,
              message.screenshotFilename,
              channel,
              threadTs
            );
            if (result.ok) {
              console.log(`Uploaded screenshot to Slack: ${message.screenshotFilename}`);
            } else {
              console.error('Failed to upload screenshot:', result.error);
            }
          } else if (!message.isError && message.content) {
            // Try to extract and upload file paths from content
            const uploadedImages = await processAndUploadImages(
              app.client,
              message.content,
              channel,
              threadTs
            );
            if (uploadedImages.length > 0) {
              console.log(`Uploaded ${uploadedImages.length} image(s) to Slack`);
            }
          }
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
          // Stop progress indicator when no longer running
          // (Starting is handled in slack-app.ts when user message is received)
          if (message.status !== 'running') {
            if (progressIndicator.isProcessing(channel, threadTs)) {
              await progressIndicator.stopProcessing(channel, threadTs);
            }
          }
          break;
        }

        case 'user_input': {
          // Only post to Slack if the input came from Web (not from Slack itself)
          if (message.source !== 'slack') {
            // Post with different icon and username to distinguish from bot
            // Requires "chat:write.customize" scope in Slack App settings
            await app.client.chat.postMessage({
              channel,
              thread_ts: threadTs,
              text: message.content,
              username: 'Web User',
              icon_emoji: ':computer:',
            });
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

    // Type assertion for button action
    const buttonAction = action as { action_id: string; value?: string };
    if (!buttonAction.action_id || !buttonAction.value) return;

    const parsedAction = parsePermissionAction(buttonAction.action_id, buttonAction.value);
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
    // Type assertion to match PermissionResult
    if (response.behavior === 'allow') {
      bridge.sendPermissionResponse(binding.agentDockSessionId, parsedAction.requestId, {
        behavior: 'allow',
        updatedInput: response.updatedInput,
        allowForSession: response.allowForSession,
        toolName: response.toolName,
      });
    } else {
      bridge.sendPermissionResponse(binding.agentDockSessionId, parsedAction.requestId, {
        behavior: 'deny',
        message: response.message || 'User denied permission',
      });
    }

    // Update the message to show result
    const userId = body.user?.id || 'unknown';
    const resultBlocks = buildPermissionResultBlocks(
      pending.toolName,
      response.behavior === 'allow' ? 'allowed' : 'denied',
      userId
    );

    try {
      // Update the original message
      const bodyWithMessage = body as { message?: { ts: string } };
      if (bodyWithMessage.message?.ts) {
        await client.chat.update({
          channel: pending.channel,
          ts: bodyWithMessage.message.ts,
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
  processAndUploadImages,
};
