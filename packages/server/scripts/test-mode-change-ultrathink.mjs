#!/usr/bin/env node
/**
 * Test mode change during ultrathink (extended thinking)
 */

import { spawn } from 'child_process';

const claude = spawn('claude', [
  '-p', '',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    MAX_THINKING_TOKENS: '31999', // Enable extended thinking
  },
});

console.log('[Test] Claude started with PID:', claude.pid);
console.log('[Test] MAX_THINKING_TOKENS=31999 (extended thinking enabled)');

let requestCounter = 0;
let resultReceived = false;
let thinkingStarted = false;
let thinkingChunks = 0;

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function sendControlRequest(mode) {
  const requestId = `test_${++requestCounter}`;
  const msg = {
    type: 'control_request',
    request_id: requestId,
    request: { subtype: 'set_permission_mode', mode },
  };
  log(`>>> control_request: mode=${mode}`);
  claude.stdin.write(JSON.stringify(msg) + '\n');
  return requestId;
}

function sendUserMessage(text) {
  const msg = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
  log(`>>> user: ${text.substring(0, 50)}...`);
  claude.stdin.write(JSON.stringify(msg) + '\n');
}

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
        log(`<<< control_response: ${JSON.stringify(event.response)}`);
      } else if (event.type === 'system') {
        log(`<<< system: ${event.subtype} permissionMode=${event.permissionMode}`);
      } else if (event.type === 'assistant') {
        const content = event.message?.content || [];
        for (const block of content) {
          if (block.type === 'text') {
            log(`<<< text: ${block.text.substring(0, 60)}...`);
          } else if (block.type === 'thinking') {
            thinkingChunks++;
            if (!thinkingStarted) {
              thinkingStarted = true;
              log(`<<< thinking started (extended thinking)`);
            } else if (thinkingChunks % 10 === 0) {
              log(`<<< thinking... (${thinkingChunks} chunks received)`);
            }
          }
        }
      } else if (event.type === 'result') {
        log(`<<< result received (${thinkingChunks} thinking chunks total)`);
        resultReceived = true;
      }
    } catch {}
  }
});

claude.stderr.on('data', (data) => {
  const str = data.toString().trim();
  if (str) log(`[stderr] ${str}`);
});

claude.on('exit', (code, signal) => {
  log(`Claude exited: code=${code} signal=${signal}`);
  process.exit(0);
});

async function runTest() {
  log('=== TEST: Mode change during ultrathink ===');

  // Send prompt that triggers extended thinking
  sendUserMessage('ultrathink: Solve this step by step - what is the 15th prime number? Show your reasoning.');

  log('Waiting for extended thinking to start...');
  await waitFor(() => thinkingStarted, 60000, 'thinking');

  // Wait for some thinking chunks to accumulate
  log('Waiting for thinking to progress (5 seconds)...');
  await sleep(5000);
  log(`Current thinking chunks: ${thinkingChunks}`);

  // Change mode during extended thinking
  log('Changing mode during extended thinking...');
  sendControlRequest('plan');

  log('Mode change sent. Waiting up to 60s for result...');
  const gotResult = await waitFor(() => resultReceived, 60000, 'result', true);

  if (gotResult) {
    log('RESULT: Response completed after mode change during ultrathink');
  } else {
    log('RESULT: NO RESPONSE - Mode change interrupted ultrathink!');

    // Try a new prompt to check if Claude is alive
    log('\nChecking if Claude is still alive...');
    resultReceived = false;
    sendUserMessage('Say "ALIVE"');
    const alive = await waitFor(() => resultReceived, 15000, 'alive', true);
    log(alive ? 'Claude is still alive' : 'Claude is not responding');
  }

  claude.kill('SIGTERM');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(condition, timeoutMs, description, allowTimeout = false) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      if (allowTimeout) return false;
      throw new Error(`Timeout waiting for ${description}`);
    }
    await sleep(100);
  }
  return true;
}

runTest().catch(err => {
  log(`Error: ${err.message}`);
  claude.kill('SIGTERM');
  process.exit(1);
});
