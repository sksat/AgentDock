#!/usr/bin/env node
/**
 * Test control_request message format discovered from Claude Agent SDK
 *
 * The SDK uses control_request messages to change settings during a session:
 * {
 *   "type": "control_request",
 *   "request_id": "<unique_id>",
 *   "request": {
 *     "subtype": "set_permission_mode",
 *     "mode": "plan"
 *   }
 * }
 */

import { spawn } from 'child_process';

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

function generateRequestId() {
  return Math.random().toString(36).substring(2, 15);
}

async function testControlRequest() {
  console.log('=== Test: control_request message for permission mode change ===\n');

  return new Promise((resolve) => {
    const proc = spawn(CLAUDE_PATH, [
      '-p', '',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'default',
    ], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('PID:', proc.pid);

    let buffer = '';
    let initReceived = false;
    let controlResponseReceived = false;
    let modeFromInit = null;
    let modeFromControlResponse = null;
    let resultCount = 0;

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);

          // Check init
          if (json.type === 'system' && json.subtype === 'init') {
            modeFromInit = json.permissionMode;
            console.log('INIT: permissionMode =', modeFromInit);
            initReceived = true;
          }

          // Check control_response
          if (json.type === 'control_response') {
            console.log('CONTROL_RESPONSE:', JSON.stringify(json.response));
            controlResponseReceived = true;
            if (json.response?.response?.mode) {
              modeFromControlResponse = json.response.response.mode;
            }
          }

          // Check result
          if (json.type === 'result') {
            resultCount++;
            console.log(`RESULT #${resultCount}:`, json.result?.slice(0, 50));

            if (resultCount === 1) {
              // After first result, send control_request to change mode
              const requestId = generateRequestId();
              const controlRequest = {
                type: 'control_request',
                request_id: requestId,
                request: {
                  subtype: 'set_permission_mode',
                  mode: 'plan',
                },
              };
              console.log('\n>>> Sending control_request:', JSON.stringify(controlRequest));
              proc.stdin.write(JSON.stringify(controlRequest) + '\n');

              // Then send another user message to see if mode changed
              setTimeout(() => {
                console.log('>>> Sending second user message');
                proc.stdin.write(JSON.stringify({
                  type: 'user',
                  message: { role: 'user', content: [{ type: 'text', text: 'What is 3+3?' }] },
                }) + '\n');
              }, 500);
            } else if (resultCount === 2) {
              // After second result, close stdin
              console.log('\n>>> Closing stdin');
              proc.stdin.end();
            }
          }

          // Check for assistant message with mode info
          if (json.type === 'assistant' && json.message?.content) {
            for (const block of json.message.content) {
              if (block.type === 'text') {
                console.log('ASSISTANT:', block.text.slice(0, 100));
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      if (str.includes('Error')) {
        console.log('STDERR:', str.trim());
      }
    });

    proc.on('exit', (code) => {
      console.log('\n=== Results ===');
      console.log('Exit code:', code);
      console.log('Init received:', initReceived);
      console.log('Mode from init:', modeFromInit);
      console.log('Control response received:', controlResponseReceived);
      console.log('Mode from control response:', modeFromControlResponse);
      console.log('Total results:', resultCount);

      if (controlResponseReceived && modeFromControlResponse === 'plan') {
        console.log('\n*** SUCCESS: control_request works for permission mode change! ***');
      } else {
        console.log('\n*** Control request may not have worked as expected ***');
      }

      resolve({
        initMode: modeFromInit,
        controlResponseMode: modeFromControlResponse,
        controlResponseReceived,
      });
    });

    // Send initial user message
    console.log('>>> Sending initial user message');
    proc.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'What is 2+2? Just the number.' }] },
    }) + '\n');

    setTimeout(() => {
      console.log('\nTimeout - killing process');
      proc.kill();
    }, 60000);
  });
}

testControlRequest().then((result) => {
  console.log('\nFinal result:', result);
  process.exit(0);
}).catch(console.error);
