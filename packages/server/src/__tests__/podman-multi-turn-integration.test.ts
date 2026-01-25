/**
 * Integration tests for PodmanClaudeRunner multi-turn conversation support.
 *
 * These tests use mock-claude.mjs inside a container to verify that:
 * - Initial messages are sent via PTY in stream-json format
 * - Follow-up messages work correctly
 * - control_request for permission mode changes works
 *
 * Requirements:
 * - Podman installed and configured for rootless operation
 * - Container image with Node.js (claude-code:local has Node.js)
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { PodmanClaudeRunner } from '../podman-claude-runner.js';
import type { PodmanClaudeRunnerOptions } from '../podman-claude-runner.js';
import { createDefaultContainerConfig } from '../container-config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to mock-claude wrapper script
const MOCK_CLAUDE_WRAPPER = join(__dirname, '../../scripts/mock-claude-wrapper.sh');
// Path to scripts directory (for mounting into container)
const SCRIPTS_DIR = join(__dirname, '../../scripts');

// Check if Podman is available
function isPodmanAvailable(): boolean {
  try {
    execSync('podman --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if the container image exists
function isImageAvailable(image: string): boolean {
  try {
    execSync(`podman image exists ${image}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const PODMAN_AVAILABLE = isPodmanAvailable();
const TEST_IMAGE = 'localhost/claude-code:local';
const IMAGE_AVAILABLE = PODMAN_AVAILABLE && isImageAvailable(TEST_IMAGE);

describe('PodmanClaudeRunner multi-turn integration', () => {
  let runner: PodmanClaudeRunner | null = null;

  beforeAll(() => {
    if (!PODMAN_AVAILABLE) {
      console.log('Skipping Podman multi-turn tests: Podman not available');
    } else if (!IMAGE_AVAILABLE) {
      console.log(`Skipping Podman multi-turn tests: Image ${TEST_IMAGE} not found`);
    }
  });

  afterEach(() => {
    if (runner) {
      runner.stop();
      runner = null;
    }
  });

  function createRunner(): PodmanClaudeRunner {
    const containerConfig = createDefaultContainerConfig(TEST_IMAGE, {
      skipDefaultMounts: true,
    });

    // Mount the scripts directory so mock-claude-wrapper.sh is accessible
    containerConfig.extraMounts.push({
      source: SCRIPTS_DIR,
      target: SCRIPTS_DIR,
      options: 'ro',
    });

    const options: PodmanClaudeRunnerOptions = {
      workingDir: '/tmp',
      containerConfig,
      // Use the wrapper script instead of real claude
      claudePath: MOCK_CLAUDE_WRAPPER,
    };

    return new PodmanClaudeRunner(options);
  }

  it.skipIf(!IMAGE_AVAILABLE)('should handle initial message via PTY', async () => {
    runner = createRunner();
    const events: { type: string; data: unknown }[] = [];

    runner.on('system', (data) => events.push({ type: 'system', data }));
    runner.on('text', (data) => events.push({ type: 'text', data }));
    runner.on('result', (data) => events.push({ type: 'result', data }));

    runner.start('Hello from container');

    // Wait for result
    await waitForEvent(events, 'result', 15000);

    expect(events.some(e => e.type === 'system')).toBe(true);
    expect(events.some(e => e.type === 'text')).toBe(true);
    expect(events.some(e => e.type === 'result')).toBe(true);

    // Verify response contains our message
    const textEvent = events.find(e => e.type === 'text');
    expect((textEvent?.data as { text: string })?.text).toContain('[Turn 1]');
    expect((textEvent?.data as { text: string })?.text).toContain('Hello from container');
  }, 30000);

  it.skipIf(!IMAGE_AVAILABLE)('should handle multi-turn conversation via sendUserMessage', async () => {
    runner = createRunner();
    const events: { type: string; data: unknown }[] = [];

    runner.on('system', (data) => events.push({ type: 'system', data }));
    runner.on('text', (data) => events.push({ type: 'text', data }));
    runner.on('result', (data) => events.push({ type: 'result', data }));

    // First turn
    runner.start('First message');
    await waitForEvent(events, 'result', 15000);

    const firstText = events.find(e => e.type === 'text');
    expect((firstText?.data as { text: string })?.text).toContain('[Turn 1]');

    // Clear events for second turn
    events.length = 0;

    // Second turn via sendUserMessage
    const sent = runner.sendUserMessage('Second message');
    expect(sent).toBe(true);

    // Wait for second result
    await waitForEvent(events, 'result', 15000);

    const secondText = events.find(e => e.type === 'text');
    expect((secondText?.data as { text: string })?.text).toContain('[Turn 2]');
    expect((secondText?.data as { text: string })?.text).toContain('Second message');
  }, 60000);

  it.skipIf(!IMAGE_AVAILABLE)('should handle control_request for permission mode change', async () => {
    runner = createRunner();
    const events: { type: string; data: unknown }[] = [];

    runner.on('system', (data) => events.push({ type: 'system', data }));
    runner.on('control_response', (data) => events.push({ type: 'control_response', data }));
    runner.on('permission_mode_changed', (data) => events.push({ type: 'permission_mode_changed', data }));

    runner.start('Test message');

    // Wait for system event
    await waitForEvent(events, 'system', 15000);

    expect(runner.permissionMode).toBe('default');

    // Send control_request to change mode
    const result = runner.requestPermissionModeChange('plan');
    expect(result).toBe(true);

    // Wait for permission mode change
    await waitForEvent(events, 'permission_mode_changed', 15000);

    expect(runner.permissionMode).toBe('plan');
  }, 30000);
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
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
