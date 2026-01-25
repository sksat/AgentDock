#!/usr/bin/env node
/**
 * Test: Does mode change during vibing interrupt the response?
 *
 * Test cases:
 * 1. Send long prompt, wait for completion (baseline)
 * 2. Send long prompt, change mode during thinking, observe what happens
 * 3. After interruption, send new prompt to verify Claude is still alive
 */

import { spawn } from 'child_process';

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
let resultReceived = false;
let thinkingStarted = false;
let lastTextReceived = null;
let eventLog = [];

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
  eventLog.push({ ts, msg });
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
  log(`>>> user: ${text.substring(0, 40)}...`);
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
        log(`<<< control_response: ${JSON.stringify(event.response)}`);
      } else if (event.type === 'system') {
        log(`<<< system: ${event.subtype} permissionMode=${event.permissionMode}`);
      } else if (event.type === 'assistant') {
        const content = event.message?.content || [];
        for (const block of content) {
          if (block.type === 'text') {
            lastTextReceived = Date.now();
            log(`<<< text: ${block.text.substring(0, 60)}...`);
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
  // === Test 1: Baseline - complete without interruption ===
  log('=== TEST 1: Baseline (no interruption) ===');

  sendUserMessage('Count from 1 to 5, one number per line.');

  await waitFor(() => resultReceived, 30000, 'baseline result');
  log('TEST 1 PASSED: Got result without interruption\n');

  // Reset
  resultReceived = false;
  thinkingStarted = false;

  await sleep(1000);

  // === Test 2: Mode change during thinking ===
  log('=== TEST 2: Mode change during thinking ===');

  sendUserMessage('Think carefully and explain why the sky is blue in 3 paragraphs.');

  log('Waiting for thinking to start...');
  await waitFor(() => thinkingStarted, 30000, 'thinking');

  log('Thinking started! Waiting 1 second then changing mode...');
  await sleep(1000);

  sendControlRequest('plan');

  log('Mode change sent. Waiting up to 30s for result...');
  const gotResult = await waitFor(() => resultReceived, 30000, 'result after mode change', true);

  if (gotResult) {
    log('TEST 2 RESULT: Response completed after mode change');
  } else {
    log('TEST 2 RESULT: NO RESPONSE after mode change - INTERRUPTED!');
  }

  // Reset
  resultReceived = false;
  thinkingStarted = false;

  await sleep(1000);

  // === Test 3: Verify Claude is still alive ===
  log('\n=== TEST 3: Verify Claude is still alive ===');

  sendUserMessage('Say "ALIVE" and nothing else.');

  const stillAlive = await waitFor(() => resultReceived, 15000, 'alive check', true);

  if (stillAlive) {
    log('TEST 3 PASSED: Claude is still responsive');
  } else {
    log('TEST 3 FAILED: Claude is not responding');
  }

  // Summary
  log('\n=== SUMMARY ===');
  log('Test 1 (baseline): PASSED');
  log(`Test 2 (mode change during thinking): ${gotResult ? 'Response completed' : 'INTERRUPTED - no response'}`);
  log(`Test 3 (alive check): ${stillAlive ? 'PASSED' : 'FAILED'}`);

  if (!gotResult && stillAlive) {
    log('\n>>> HYPOTHESIS CONFIRMED: Mode change during thinking interrupts the response,');
    log('>>> but Claude remains alive and can handle new prompts.');
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
