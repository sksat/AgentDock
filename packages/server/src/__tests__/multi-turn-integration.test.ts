import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeRunner } from '../claude-runner.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mockClaudePath = join(__dirname, '../../scripts/mock-claude.mjs');

describe('Multi-turn conversation integration', () => {
  let runner: ClaudeRunner;

  beforeEach(() => {
    runner = new ClaudeRunner({
      claudePath: 'node',
    });
  });

  afterEach(() => {
    runner.stop();
  });

  it('should handle multiple turns via stdin', async () => {
    const events: { type: string; data: unknown }[] = [];

    runner.on('system', (data) => events.push({ type: 'system', data }));
    runner.on('text', (data) => events.push({ type: 'text', data }));
    runner.on('result', (data) => events.push({ type: 'result', data }));

    // Start with first message (using mock-claude.mjs as the command)
    // We pass the mock script path as an argument to node
    const originalBuildArgs = (runner as unknown as { buildArgs: (prompt: string, options: unknown) => string[] }).buildArgs;
    (runner as unknown as { buildArgs: (prompt: string, options: unknown) => string[] }).buildArgs = function(prompt: string, options: unknown) {
      // Return args for running mock-claude.mjs with node
      return [mockClaudePath, '-p', '', '--input-format', 'stream-json', '--output-format', 'stream-json'];
    };

    runner.start('First message');

    // Wait for first turn to complete
    await waitForEvent(events, 'result', 5000);

    expect(events.some(e => e.type === 'system')).toBe(true);
    expect(events.some(e => e.type === 'text')).toBe(true);
    expect(events.some(e => e.type === 'result')).toBe(true);

    // Verify first response
    const firstText = events.find(e => e.type === 'text');
    expect((firstText?.data as { text: string })?.text).toContain('[Turn 1]');

    // Clear events for second turn
    events.length = 0;

    // Send second message via stdin
    const sent = runner.sendUserMessage('Second message');
    expect(sent).toBe(true);

    // Wait for second turn to complete
    await waitForEvent(events, 'result', 5000);

    // Verify second response
    const secondText = events.find(e => e.type === 'text');
    expect((secondText?.data as { text: string })?.text).toContain('[Turn 2]');

    // Verify runner is still running (stdin open)
    expect(runner.isRunning).toBe(true);
  });

  it('should handle control_request for permission mode change', async () => {
    const events: { type: string; data: unknown }[] = [];

    runner.on('system', (data) => events.push({ type: 'system', data }));
    runner.on('control_response', (data) => events.push({ type: 'control_response', data }));
    runner.on('permission_mode_changed', (data) => events.push({ type: 'permission_mode_changed', data }));

    // Use mock-claude.mjs
    (runner as unknown as { buildArgs: (prompt: string, options: unknown) => string[] }).buildArgs = function() {
      return [mockClaudePath, '-p', '', '--input-format', 'stream-json', '--output-format', 'stream-json'];
    };

    runner.start('Test message');

    // Wait for system event
    await waitForEvent(events, 'system', 5000);

    expect(runner.permissionMode).toBe('default');

    // Send control_request to change mode
    runner.requestPermissionModeChange('plan');

    // Wait for control_response
    await waitForEvent(events, 'control_response', 5000);

    // Verify mode changed
    expect(runner.permissionMode).toBe('plan');
  });

  it('should handle mode change during active turn', async () => {
    const events: { type: string; data: unknown }[] = [];

    runner.on('text', (data) => events.push({ type: 'text', data }));
    runner.on('result', (data) => events.push({ type: 'result', data }));
    runner.on('control_response', (data) => events.push({ type: 'control_response', data }));

    // Use mock-claude.mjs
    (runner as unknown as { buildArgs: (prompt: string, options: unknown) => string[] }).buildArgs = function() {
      return [mockClaudePath, '-p', '', '--input-format', 'stream-json', '--output-format', 'stream-json'];
    };

    runner.start('Test message');

    // Immediately send mode change (during "vibing")
    runner.requestPermissionModeChange('acceptEdits');

    // Wait for both control_response and result
    await waitForEvent(events, 'result', 5000);

    // Verify we got the response despite mode change
    expect(events.some(e => e.type === 'text')).toBe(true);
    expect(events.some(e => e.type === 'result')).toBe(true);
    expect(events.some(e => e.type === 'control_response')).toBe(true);
  });
});

async function waitForEvent(
  events: { type: string; data: unknown }[],
  eventType: string,
  timeoutMs: number
): Promise<void> {
  const startTime = Date.now();
  while (!events.some(e => e.type === eventType)) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${eventType} event. Got: ${events.map(e => e.type).join(', ')}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
