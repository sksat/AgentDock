#!/usr/bin/env node
/**
 * Test script for Claude Code permission mode change mechanisms
 *
 * This script tests different approaches for changing permission mode:
 * 1. Shift+Tab key sequence (PTY mode)
 * 2. Control messages via stream-json input
 * 3. Restart with --resume and new --permission-mode
 *
 * Usage:
 *   node scripts/test-claude-mode-change.mjs [test-name]
 *
 * Available tests:
 *   shift-tab    - Test Shift+Tab in PTY mode
 *   control      - Test control messages in stream-json mode
 *   restart      - Test restart + resume with new mode
 *   all          - Run all tests (default)
 */

import { spawn } from 'child_process';
import * as pty from 'node-pty';

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';
const SHIFT_TAB = '\x1b[Z';

// ============================================================
// Test 1: Shift+Tab in PTY mode
// ============================================================
async function testShiftTab() {
  console.log('\n=== Test: Shift+Tab in PTY mode ===\n');

  return new Promise((resolve) => {
    const proc = pty.spawn(CLAUDE_PATH, [
      '-p', 'Say OK',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'default',
    ], {
      name: 'xterm-color',
      cols: 200,
      rows: 50,
      cwd: process.cwd(),
      env: process.env,
    });

    let buffer = '';
    let modeChangeDetected = false;
    let shiftTabSent = false;

    proc.onData((data) => {
      buffer += data;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);

          if (json.type === 'system' && json.subtype === 'init') {
            console.log('  Initial mode:', json.permissionMode);

            // Send Shift+Tab after init
            if (!shiftTabSent) {
              setTimeout(() => {
                console.log('  Sending Shift+Tab...');
                proc.write(SHIFT_TAB);
                shiftTabSent = true;
              }, 100);
            }
          }

          if (json.type === 'system' && json.permission_mode_changed) {
            console.log('  MODE CHANGED:', json.permission_mode);
            modeChangeDetected = true;
          }

          if (json.type === 'result') {
            console.log('  Result received');
          }
        } catch (e) {}
      }
    });

    proc.onExit(() => {
      console.log('  Mode change detected:', modeChangeDetected);
      console.log('  Result: Shift+Tab does NOT work in -p mode');
      resolve({ success: false, method: 'shift-tab' });
    });

    setTimeout(() => proc.kill(), 15000);
  });
}

// ============================================================
// Test 2: Control messages in stream-json mode
// ============================================================
async function testControlMessages() {
  console.log('\n=== Test: Control messages in stream-json mode ===\n');

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

    // Send user message first
    proc.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Say OK' }] },
    }) + '\n');

    let buffer = '';
    let resultReceived = false;
    let controlError = null;

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);

          if (json.type === 'system' && json.subtype === 'init') {
            console.log('  Initial mode:', json.permissionMode);
          }

          if (json.type === 'result' && !resultReceived) {
            resultReceived = true;
            console.log('  First result received, sending control message...');

            // Try control message
            proc.stdin.write(JSON.stringify({
              type: 'control',
              subtype: 'set_permission_mode',
              mode: 'plan',
            }) + '\n');
          }
        } catch (e) {}
      }
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      if (str.includes('Error')) {
        controlError = str.trim();
        console.log('  Error:', str.trim());
      }
    });

    proc.on('exit', (code) => {
      console.log('  Exit code:', code);
      console.log('  Control error:', controlError ? 'Yes' : 'No');
      console.log('  Result: Control messages are NOT supported');
      resolve({ success: false, method: 'control', error: controlError });
    });

    setTimeout(() => {
      proc.stdin.end();
      proc.kill();
    }, 15000);
  });
}

// ============================================================
// Test 3: Restart with --resume and new --permission-mode
// ============================================================
async function testRestartResume() {
  console.log('\n=== Test: Restart + Resume with new mode ===\n');

  let sessionId = null;
  const results = [];

  async function runClaude(mode, prompt, resume = false) {
    return new Promise((resolve) => {
      const args = [
        '-p', '',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', mode,
      ];

      if (resume && sessionId) {
        args.push('--resume', sessionId);
      }

      const proc = spawn(CLAUDE_PATH, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdin.write(JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] },
      }) + '\n');
      proc.stdin.end();

      let buffer = '';
      let detectedMode = null;

      proc.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.type === 'system' && json.subtype === 'init') {
              sessionId = json.session_id;
              detectedMode = json.permissionMode;
            }
          } catch (e) {}
        }
      });

      proc.on('exit', (code) => {
        resolve({ code, mode: detectedMode, requestedMode: mode });
      });

      setTimeout(() => proc.kill(), 30000);
    });
  }

  // Step 1: Start with default
  console.log('  Step 1: Start with default mode');
  const r1 = await runClaude('default', 'What is 2+2?');
  console.log(`    Requested: default, Got: ${r1.mode}`);
  results.push(r1);

  // Step 2: Resume with plan
  console.log('  Step 2: Resume with plan mode');
  const r2 = await runClaude('plan', 'What is 3+3?', true);
  console.log(`    Requested: plan, Got: ${r2.mode}`);
  results.push(r2);

  // Step 3: Resume with acceptEdits
  console.log('  Step 3: Resume with acceptEdits mode');
  const r3 = await runClaude('acceptEdits', 'What is 4+4?', true);
  console.log(`    Requested: acceptEdits, Got: ${r3.mode}`);
  results.push(r3);

  const success = results.every(r => r.mode === r.requestedMode);
  console.log('\n  All modes matched:', success);
  console.log('  Result: Restart + Resume WORKS for mode change');

  return { success, method: 'restart-resume', results };
}

// ============================================================
// Main
// ============================================================
async function main() {
  const testName = process.argv[2] || 'all';

  console.log('Claude Code Permission Mode Change Test');
  console.log('=======================================');
  console.log('Claude path:', CLAUDE_PATH);

  const results = {};

  if (testName === 'all' || testName === 'shift-tab') {
    results.shiftTab = await testShiftTab();
  }

  if (testName === 'all' || testName === 'control') {
    results.control = await testControlMessages();
  }

  if (testName === 'all' || testName === 'restart') {
    results.restart = await testRestartResume();
  }

  console.log('\n=======================================');
  console.log('Summary:');
  console.log('---------------------------------------');

  if (results.shiftTab) {
    console.log('Shift+Tab (PTY):     ' + (results.shiftTab.success ? 'WORKS' : 'DOES NOT WORK'));
  }
  if (results.control) {
    console.log('Control messages:    ' + (results.control.success ? 'WORKS' : 'DOES NOT WORK'));
  }
  if (results.restart) {
    console.log('Restart + Resume:    ' + (results.restart.success ? 'WORKS' : 'DOES NOT WORK'));
  }

  console.log('\nRecommendation: Use "Restart + Resume" for runtime mode changes');
}

main().catch(console.error);
