#!/usr/bin/env node
/**
 * Mock Claude Code CLI for testing multi-turn conversations and control_request
 *
 * Usage: node mock-claude.mjs -p "" --input-format stream-json --output-format stream-json
 *
 * Simulates Claude Code behavior:
 * - Reads user messages from stdin
 * - Outputs system, assistant, and result events
 * - Handles control_request for permission mode changes
 * - Keeps stdin open for multiple turns
 */

import * as readline from 'readline';

let permissionMode = 'default';
let sessionId = 'mock-session-' + Date.now();
let turnCount = 0;

// Parse command line args
const args = process.argv.slice(2);
const permissionModeArg = args.indexOf('--permission-mode');
if (permissionModeArg !== -1 && args[permissionModeArg + 1]) {
  permissionMode = args[permissionModeArg + 1];
}

function output(event) {
  console.log(JSON.stringify(event));
}

function sendSystemInit() {
  output({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    permissionMode: permissionMode,
    tools: ['Bash', 'Read', 'Write'],
    model: 'claude-sonnet-4-20250514',
  });
}

async function handleUserMessage(message) {
  turnCount++;
  const text = message.message?.content?.[0]?.text || 'No text';

  // Send system init for each turn (like real Claude Code)
  sendSystemInit();

  // Small delay to simulate thinking
  await sleep(50);

  // Send assistant response
  output({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: `[Turn ${turnCount}] Mock response to: ${text.substring(0, 50)}` }
      ],
    },
  });

  // Small delay before result
  await sleep(50);

  // Send result
  output({
    type: 'result',
    result: `Turn ${turnCount} completed`,
    session_id: sessionId,
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function handleControlRequest(message) {
  const requestId = message.request_id;
  const request = message.request;

  if (request.subtype === 'set_permission_mode') {
    permissionMode = request.mode;

    // Send success response (Claude sends two: one with mode, one without)
    output({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: { mode: permissionMode },
      },
    });

    // Second response (without mode) - mimics real behavior
    setTimeout(() => {
      output({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: requestId,
        },
      });
    }, 10);
  }
}

// Set up stdin reading
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);

    if (message.type === 'user') {
      handleUserMessage(message);
    } else if (message.type === 'control_request') {
      handleControlRequest(message);
    }
  } catch (err) {
    // Ignore non-JSON lines
  }
});

rl.on('close', () => {
  process.exit(0);
});

// Keep process alive
process.stdin.resume();
