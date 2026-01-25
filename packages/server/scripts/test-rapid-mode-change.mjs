#!/usr/bin/env node
/**
 * Test rapid consecutive mode changes during thinking
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
let modeChangeCount = 0;

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function sendControlRequest(mode) {
  modeChangeCount++;
  const msg = {
    type: 'control_request',
    request_id: `test_${modeChangeCount}_${Date.now()}`,
    request: { subtype: 'set_permission_mode', mode },
  };
  log(`>>> control_request #${modeChangeCount}: mode=${mode}`);
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
            log(`<<< text: ${block.text.substring(0, 50)}...`);
          } else if (block.type === 'thinking') {
            if (!thinkingStarted) {
              thinkingStarted = true;
              log(`<<< thinking started`);
            }
          }
        }
      } else if (event.type === 'result') {
        log(`<<< result received`);
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
  log('=== TEST: Rapid consecutive mode changes during thinking ===\n');

  sendUserMessage('ultrathink: Explain quantum computing in detail.');

  log('Waiting for thinking to start...');
  await waitFor(() => thinkingStarted, 60000, 'thinking');

  // Rapid consecutive mode changes (simulating user clicking through modes quickly)
  log('\n>>> Sending RAPID mode changes (like user clicking through modes):');

  await sleep(100);
  sendControlRequest('acceptEdits');  // default -> acceptEdits

  await sleep(200);  // Small delay
  sendControlRequest('plan');  // acceptEdits -> plan

  await sleep(200);
  sendControlRequest('default');  // plan -> default

  log('\nWaiting for result...');
  const gotResult = await waitFor(() => resultReceived, 60000, 'result', true);

  if (gotResult) {
    log('\n=== RESULT: Response completed despite rapid mode changes ===');
  } else {
    log('\n=== RESULT: NO RESPONSE - Rapid mode changes caused interruption! ===');

    log('\nChecking if Claude is alive...');
    resultReceived = false;
    thinkingStarted = false;
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
