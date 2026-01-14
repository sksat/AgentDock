import 'dotenv/config';
import { MessageBridge } from './message-bridge.js';
import { SlackSessionManager } from './slack-session-manager.js';
import { createSlackApp, setupMessageForwarding } from './slack-app.js';
import { ProgressIndicator } from './progress-indicator.js';
import {
  formatTextOutput,
  formatToolUse,
  formatToolResult,
  formatError,
  isBrowserSnapshot,
  extractToolResultText,
  formatToolUseWithResult,
  type ToolResultStatus,
} from './message-formatter.js';
import {
  buildPermissionRequestBlocks,
  buildPermissionResultBlocks,
  parsePermissionAction,
  actionToPermissionResponse,
} from './permission-ui.js';
import { processAndUploadImages, uploadFile, processAndUploadBase64Image, extractBase64Image, uploadTextSnippet } from './file-uploader.js';

/**
 * Check if a tool result is trivial and should be skipped entirely.
 * Trivial results: empty, {}, {"success":true}, etc.
 * Note: Long results and browser snapshots are NOT skipped - they get abbreviated display.
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

  // Create session manager and load existing bindings
  const sessionManager = new SlackSessionManager(bridge, SLACK_DEFAULT_WORKING_DIR);
  await sessionManager.initialize();
  console.log('Session manager initialized with existing bindings');

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

  // Pending tool uses (toolUseId -> { messageTs, channel, threadTs, toolName, input })
  // Used to update tool_use messages when tool_result comes in
  const pendingToolUses = new Map<
    string,
    { messageTs: string; channel: string; threadTs: string; toolName: string; input: unknown }
  >();

  // Cached long results for modal display (toolUseId -> full result text)
  // Cleaned up after 10 minutes
  const cachedResults = new Map<string, { text: string; timestamp: number }>();
  const RESULT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  // Periodically clean up old cached results
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cachedResults) {
      if (now - value.timestamp > RESULT_CACHE_TTL) {
        cachedResults.delete(key);
      }
    }
  }, 60 * 1000); // Check every minute


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
          const postResult = await app.client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            blocks,
            text: `Using tool: ${message.toolName}`,
          });

          // Save message ts for later update when tool_result comes
          if (postResult.ts) {
            console.log(`[DEBUG] Saved pending tool_use: ${message.toolUseId} -> ts=${postResult.ts}`);
            pendingToolUses.set(message.toolUseId, {
              messageTs: postResult.ts,
              channel,
              threadTs,
              toolName: message.toolName,
              input: message.input,
            });
          } else {
            console.log(`[DEBUG] Failed to get ts from postResult for tool_use: ${message.toolUseId}`);
          }
          break;
        }

        case 'tool_result': {
          // Get the pending tool_use message to update
          // Sometimes tool_result arrives before tool_use due to async processing
          // Wait and retry if not found
          let pendingToolUse = pendingToolUses.get(message.toolUseId);
          if (!pendingToolUse) {
            // Wait up to 500ms for tool_use to be saved
            for (let i = 0; i < 5; i++) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              pendingToolUse = pendingToolUses.get(message.toolUseId);
              if (pendingToolUse) {
                console.log(`[DEBUG] Found pendingToolUse after ${(i + 1) * 100}ms retry`);
                break;
              }
            }
          }

          // Check if this is a base64 image (screenshot) - upload image only
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

              // Update tool_use message with success indicator (no link for images)
              if (pendingToolUse) {
                const updatedBlocks = formatToolUseWithResult(
                  pendingToolUse.toolName,
                  message.toolUseId,
                  pendingToolUse.input,
                  { type: 'success', summary: '(screenshot uploaded)' }
                );
                await app.client.chat.update({
                  channel: pendingToolUse.channel,
                  ts: pendingToolUse.messageTs,
                  blocks: updatedBlocks,
                  text: `${pendingToolUse.toolName} completed`,
                });
                pendingToolUses.delete(message.toolUseId);
              }
              break;
            }

            const resultText = extractToolResultText(message.content);
            const LONG_RESULT_THRESHOLD = 1000;

            // Check if this is a trivial result
            if (isTrivialToolResult(message.content)) {
              console.log('[DEBUG] Skipping trivial tool result');
              // Update tool_use message with just a checkmark
              if (pendingToolUse) {
                const updatedBlocks = formatToolUseWithResult(
                  pendingToolUse.toolName,
                  message.toolUseId,
                  pendingToolUse.input,
                  { type: 'skipped' }
                );
                await app.client.chat.update({
                  channel: pendingToolUse.channel,
                  ts: pendingToolUse.messageTs,
                  blocks: updatedBlocks,
                  text: `${pendingToolUse.toolName} completed`,
                });
                pendingToolUses.delete(message.toolUseId);
              }
              break;
            }

            // Check if this is a long result - add "View details" button
            if (resultText.length > LONG_RESULT_THRESHOLD) {
              console.log(`[DEBUG] Long result detected (${resultText.length} chars), adding view button...`);
              console.log(`[DEBUG] toolUseId: ${message.toolUseId}, pendingToolUse found: ${!!pendingToolUse}`);

              // Cache the result for modal display
              cachedResults.set(message.toolUseId, {
                text: resultText,
                timestamp: Date.now(),
              });

              // Check if it's a browser snapshot for a more specific summary
              const snapshot = isBrowserSnapshot(resultText);
              const summary = snapshot.isSnapshot
                ? `Snapshot (${snapshot.elementCount} elements)`
                : `${resultText.length} chars`;

              // Update tool_use message with view button
              if (pendingToolUse) {
                const updatedBlocks = formatToolUseWithResult(
                  pendingToolUse.toolName,
                  message.toolUseId,
                  pendingToolUse.input,
                  { type: 'success', summary }
                );

                // Add "View details" button
                updatedBlocks.push({
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: {
                        type: 'plain_text',
                        text: 'View details',
                        emoji: true,
                      },
                      action_id: `view_result_${message.toolUseId}`,
                      value: message.toolUseId,
                    },
                  ],
                } as any);

                try {
                  const updateResult = await app.client.chat.update({
                    channel: pendingToolUse.channel,
                    ts: pendingToolUse.messageTs,
                    blocks: updatedBlocks,
                    text: `${pendingToolUse.toolName} completed - ${summary}`,
                  });
                  console.log(`[DEBUG] chat.update result: ok=${updateResult.ok}`);
                } catch (updateError) {
                  console.error('[DEBUG] chat.update failed:', updateError);
                }
                pendingToolUses.delete(message.toolUseId);
              } else {
                console.log('[DEBUG] No pendingToolUse found, cannot update message');
              }
              break;
            }
          }

          // Short result or error - update tool_use message with inline result
          if (pendingToolUse) {
            const resultText = message.content ? extractToolResultText(message.content) : '';
            const resultStatus: ToolResultStatus = message.isError
              ? { type: 'error', message: resultText.slice(0, 100) }
              : { type: 'success', summary: resultText.length > 100 ? `${resultText.slice(0, 100)}...` : resultText };

            const updatedBlocks = formatToolUseWithResult(
              pendingToolUse.toolName,
              message.toolUseId,
              pendingToolUse.input,
              resultStatus
            );

            await app.client.chat.update({
              channel: pendingToolUse.channel,
              ts: pendingToolUse.messageTs,
              blocks: updatedBlocks,
              text: message.isError ? `${pendingToolUse.toolName} error` : `${pendingToolUse.toolName} completed`,
            });
            pendingToolUses.delete(message.toolUseId);
          } else {
            // Fallback: post as separate message if no pending tool_use found
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
          }

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

  // Handle "View details" button clicks - open modal with full result
  app.action(/^view_result_/, async ({ action, ack, body, client }) => {
    await ack();

    if (action.type !== 'button') return;

    const buttonAction = action as { action_id: string; value?: string };
    const toolUseId = buttonAction.value;
    if (!toolUseId) return;

    // Get cached result
    const cached = cachedResults.get(toolUseId);
    if (!cached) {
      console.error('No cached result found for toolUseId:', toolUseId);
      return;
    }

    // Truncate for modal (modal has 3000 char limit per text block)
    // Split into multiple blocks if needed
    const maxBlockTextLength = 2900;
    const textBlocks: any[] = [];
    let remaining = cached.text;

    while (remaining.length > 0) {
      const chunk = remaining.slice(0, maxBlockTextLength);
      remaining = remaining.slice(maxBlockTextLength);

      textBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`\n${chunk}\n\`\`\``,
        },
      });

      // Slack modal has 100 block limit
      if (textBlocks.length >= 50) {
        textBlocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '_... content truncated (too long for modal)_',
          },
        });
        break;
      }
    }

    try {
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Tool Result',
            emoji: true,
          },
          close: {
            type: 'plain_text',
            text: 'Close',
            emoji: true,
          },
          blocks: textBlocks,
        },
      });
    } catch (error) {
      console.error('Failed to open modal:', error);
    }
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
  isBrowserSnapshot,
  extractToolResultText,
  buildPermissionRequestBlocks,
  buildPermissionResultBlocks,
  parsePermissionAction,
  actionToPermissionResponse,
  processAndUploadImages,
  uploadTextSnippet,
};
