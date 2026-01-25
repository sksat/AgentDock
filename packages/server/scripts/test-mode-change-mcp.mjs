#!/usr/bin/env node
/**
 * Test control_request with MCP configuration (similar to AgentDock)
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Create temporary MCP config
const tmpDir = mkdtempSync(join(tmpdir(), 'test-mcp-'));
const mcpConfigPath = join(tmpDir, 'mcp-config.json');

const mcpConfig = {
  mcpServers: {
    // Empty MCP config - just to simulate having --mcp-config flag
  }
};

writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
console.log('[Test] MCP config created at:', mcpConfigPath);

const args = [
  '-p', '',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--mcp-config', mcpConfigPath,
];

console.log('[Test] Args:', args.join(' '));

const claude = spawn('claude', args, {
  stdio: ['pipe', 'pipe', 'pipe'],
});

console.log('[Test] Claude started with PID:', claude.pid);

let requestCounter = 0;
let resultReceived = false;
let thinkingStarted = false;

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
  console.log(`\n[Test] >>> Sending control_request: mode=${mode}`);
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
  console.log(`\n[Test] >>> Sending user message: ${text.substring(0, 50)}...`);
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
        console.log('[Claude] <<< control_response:', JSON.stringify(event.response));
      } else if (event.type === 'system') {
        console.log('[Claude] <<< system:', event.subtype, 'permissionMode:', event.permissionMode);
      } else if (event.type === 'assistant') {
        const content = event.message?.content || [];
        for (const block of content) {
          if (block.type === 'text') {
            console.log('[Claude] <<< text:', block.text.substring(0, 80) + (block.text.length > 80 ? '...' : ''));
          } else if (block.type === 'thinking') {
            if (!thinkingStarted) {
              thinkingStarted = true;
              console.log('[Claude] <<< thinking started');
            }
          }
        }
      } else if (event.type === 'result') {
        console.log('[Claude] <<< result received');
        resultReceived = true;
      }
    } catch {
      // Ignore non-JSON
    }
  }
});

claude.stderr.on('data', (data) => {
  const str = data.toString().trim();
  if (str) console.error('[Claude stderr]', str);
});

claude.on('exit', (code, signal) => {
  console.log('\n[Test] Claude exited:', code, signal);
  // Cleanup
  try { rmSync(tmpDir, { recursive: true }); } catch {}
  process.exit(0);
});

// Test sequence
async function runTest() {
  console.log('\n=== Test 1: Mode change during IDLE state (with MCP) ===');

  sendUserMessage('Say only "READY" and nothing else.');

  await waitFor(() => resultReceived, 30000, 'initial response');
  resultReceived = false;

  console.log('\n[Test] Claude is now IDLE. Changing mode...');
  await sleep(1000);
  sendControlRequest('plan');

  await sleep(2000);

  console.log('\n=== Test 2: Mode change during THINKING state (with MCP) ===');
  thinkingStarted = false;
  resultReceived = false;

  sendUserMessage('Think step by step and explain quantum entanglement in detail.');

  console.log('[Test] Waiting for thinking to start...');
  await waitFor(() => thinkingStarted, 30000, 'thinking to start');

  console.log('\n[Test] Claude is now THINKING. Changing mode...');
  await sleep(500);
  sendControlRequest('acceptEdits');

  console.log('[Test] Waiting for result after mode change during thinking...');
  const gotResult = await waitFor(() => resultReceived, 60000, 'result', true);

  if (gotResult) {
    console.log('\n[Test] SUCCESS: Got result after mode change during thinking');
  } else {
    console.log('\n[Test] TIMEOUT: No result - BUG REPRODUCED');
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
  console.error('[Test] Error:', err.message);
  claude.kill('SIGTERM');
  try { rmSync(tmpDir, { recursive: true }); } catch {}
  process.exit(1);
});
