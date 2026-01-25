#!/usr/bin/env node
/**
 * Test aggressive/frequent mode changes during thinking
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
    request_id: `test_${modeChangeCount}`,
    request: { subtype: 'set_permission_mode', mode },
  };
  claude.stdin.write(JSON.stringify(msg) + '\n');
  return modeChangeCount;
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
let controlResponseCount = 0;
claude.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'control_response') {
        controlResponseCount++;
        // Only log occasionally to avoid spam
        if (controlResponseCount <= 5 || controlResponseCount % 10 === 0) {
          log(`<<< control_response #${controlResponseCount}`);
        }
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
  log('=== TEST: Aggressive frequent mode changes ===\n');

  sendUserMessage('ultrathink: Write a comprehensive essay about artificial intelligence.');

  log('Waiting for thinking to start...');
  await waitFor(() => thinkingStarted, 60000, 'thinking');

  log('\n>>> Starting aggressive mode changes (every 50ms for 5 seconds)...');

  const modes = ['default', 'acceptEdits', 'plan'];
  const startTime = Date.now();
  const duration = 5000; // 5 seconds of mode changes

  while (Date.now() - startTime < duration) {
    const mode = modes[modeChangeCount % 3];
    sendControlRequest(mode);
    await sleep(50); // 50ms between changes = 20 changes per second
  }

  log(`\n>>> Sent ${modeChangeCount} mode changes in ${duration}ms`);
  log(`>>> Received ${controlResponseCount} control_responses so far`);

  log('\nWaiting for result (60s timeout)...');
  const gotResult = await waitFor(() => resultReceived, 60000, 'result', true);

  log(`\n>>> Final: ${controlResponseCount} control_responses received`);

  if (gotResult) {
    log('\n=== RESULT: Response completed despite aggressive mode changes ===');
  } else {
    log('\n=== RESULT: NO RESPONSE - Aggressive mode changes caused interruption! ===');

    log('\nChecking if Claude is alive...');
    resultReceived = false;
    thinkingStarted = false;
    sendUserMessage('Say "ALIVE"');
    const alive = await waitFor(() => resultReceived, 15000, 'alive', true);
    log(alive ? 'Claude is still alive' : 'Claude is NOT responding');
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
