#!/usr/bin/env node
/**
 * Test mode change during long thinking - change mode immediately after thinking starts
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
    MAX_THINKING_TOKENS: '31999',
  },
});

console.log('[Test] Claude started with PID:', claude.pid);

let resultReceived = false;
let thinkingStarted = false;
let thinkingChunks = 0;
let modeChangeSent = false;

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function sendControlRequest(mode) {
  const msg = {
    type: 'control_request',
    request_id: `test_${Date.now()}`,
    request: { subtype: 'set_permission_mode', mode },
  };
  log(`>>> control_request: mode=${mode}`);
  claude.stdin.write(JSON.stringify(msg) + '\n');
}

function sendUserMessage(text) {
  const msg = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
  log(`>>> user: ${text.substring(0, 60)}...`);
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
            log(`<<< text (${block.text.length} chars): ${block.text.substring(0, 50)}...`);
          } else if (block.type === 'thinking') {
            thinkingChunks++;
            if (!thinkingStarted) {
              thinkingStarted = true;
              log(`<<< thinking started`);
              // Immediately change mode when thinking starts
              if (!modeChangeSent) {
                modeChangeSent = true;
                log('>>> Immediately changing mode!');
                sendControlRequest('plan');
              }
            }
            if (thinkingChunks % 5 === 0) {
              log(`<<< thinking... (${thinkingChunks} chunks, ${block.thinking.length} chars in this chunk)`);
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
  log('=== TEST: Mode change IMMEDIATELY when thinking starts ===');
  log('This simulates changing mode right as vibing begins\n');

  // Complex prompt that requires extended thinking
  sendUserMessage('ultrathink: Write a detailed proof of the Pythagorean theorem using at least 3 different methods. Include diagrams descriptions and historical context.');

  log('Waiting for result (mode will be changed when thinking starts)...');
  const gotResult = await waitFor(() => resultReceived, 90000, 'result', true);

  if (gotResult) {
    log('\n=== RESULT: Response completed despite immediate mode change ===');
  } else {
    log('\n=== RESULT: NO RESPONSE - Mode change interrupted! ===');

    log('\nChecking if Claude is alive...');
    resultReceived = false;
    thinkingStarted = false;
    modeChangeSent = true; // Don't change mode again
    sendUserMessage('Say "ALIVE"');
    const alive = await waitFor(() => resultReceived, 15000, 'alive', true);
    log(alive ? 'Claude is still alive' : 'Claude is dead');
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
