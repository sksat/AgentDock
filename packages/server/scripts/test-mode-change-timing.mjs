#!/usr/bin/env node
/**
 * Test script to verify control_request behavior during different states:
 * 1. During thinking (vibing)
 * 2. During idle (waiting for next prompt)
 */

import { spawn } from 'child_process';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Start Claude with stream-json input
const claude = spawn('claude', [
  '-p', '',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

console.log('[Test] Claude started with PID:', claude.pid);

let requestCounter = 0;

function sendControlRequest(mode) {
  const requestId = `test_${++requestCounter}`;
  const msg = {
    type: 'control_request',
    request_id: requestId,
    request: {
      subtype: 'set_permission_mode',
      mode: mode,
    },
  };
  console.log(`\n[Test] Sending control_request: ${JSON.stringify(msg)}`);
  claude.stdin.write(JSON.stringify(msg) + '\n');
  return requestId;
}

function sendUserMessage(text) {
  const msg = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  };
  console.log(`\n[Test] Sending user message: ${text}`);
  claude.stdin.write(JSON.stringify(msg) + '\n');
}

// Parse stdout
let buffer = '';
claude.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'control_response') {
        console.log('[Claude] control_response:', JSON.stringify(event.response));
      } else if (event.type === 'system') {
        console.log('[Claude] system:', event.subtype, 'permissionMode:', event.permissionMode);
      } else if (event.type === 'assistant') {
        const content = event.message?.content || [];
        for (const block of content) {
          if (block.type === 'text') {
            console.log('[Claude] text:', block.text.substring(0, 100) + (block.text.length > 100 ? '...' : ''));
          } else if (block.type === 'thinking') {
            console.log('[Claude] thinking:', block.thinking.substring(0, 50) + '...');
          }
        }
      } else if (event.type === 'result') {
        console.log('[Claude] result received');
      }
    } catch {
      // Ignore non-JSON
    }
  }
});

claude.stderr.on('data', (data) => {
  console.error('[Claude stderr]', data.toString());
});

claude.on('exit', (code, signal) => {
  console.log('[Test] Claude exited:', code, signal);
  rl.close();
  process.exit(0);
});

// Interactive menu
async function menu() {
  console.log('\n--- Commands ---');
  console.log('1: Send simple prompt (quick response)');
  console.log('2: Send long prompt (triggers thinking/vibing)');
  console.log('3: Change mode to plan');
  console.log('4: Change mode to acceptEdits');
  console.log('5: Change mode to default');
  console.log('q: Quit');

  const choice = await prompt('\nChoice: ');

  switch (choice.trim()) {
    case '1':
      sendUserMessage('Say "Hello" and nothing else.');
      break;
    case '2':
      sendUserMessage('ultrathink: Explain the theory of relativity in detail, including special and general relativity, with mathematical formulas.');
      break;
    case '3':
      sendControlRequest('plan');
      break;
    case '4':
      sendControlRequest('acceptEdits');
      break;
    case '5':
      sendControlRequest('default');
      break;
    case 'q':
      console.log('[Test] Quitting...');
      claude.kill('SIGTERM');
      return;
    default:
      console.log('Unknown command');
  }

  // Continue menu after a short delay
  setTimeout(menu, 500);
}

// Start with initial message
console.log('\n[Test] Sending initial prompt...');
sendUserMessage('Say "Ready" and wait for further instructions.');

// Start menu after initial response
setTimeout(menu, 3000);
