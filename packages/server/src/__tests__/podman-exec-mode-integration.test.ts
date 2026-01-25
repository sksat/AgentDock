/**
 * Integration tests for PodmanClaudeRunner exec mode (Issue #78: same-container).
 *
 * These tests verify that `podman exec` works correctly when running Claude
 * in an existing container. This is used for browser bridge integration where
 * Claude and the browser share localhost.
 *
 * Key test: Verifies that using `-i` (not `-it`) with node-pty doesn't cause
 * TTY allocation conflicts that would result in immediate exit code 1.
 *
 * Requirements:
 * - Podman installed and configured for rootless operation
 * - Container image localhost/claude-code:local
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
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
// Use lightweight test image (Dockerfile.test) instead of full claude-code image
const TEST_IMAGE = 'localhost/claude-code-test:local';
const IMAGE_AVAILABLE = PODMAN_AVAILABLE && isImageAvailable(TEST_IMAGE);

describe('PodmanClaudeRunner exec mode integration', () => {
  let containerId: string | null = null;
  let runner: PodmanClaudeRunner | null = null;

  beforeAll(
    () => {
      if (!PODMAN_AVAILABLE) {
        console.log('Skipping Podman exec mode tests: Podman not available');
        return;
      }
      if (!IMAGE_AVAILABLE) {
        console.log(`Skipping Podman exec mode tests: Image ${TEST_IMAGE} not found`);
        return;
      }

      // Start a persistent container for exec mode tests
      // Mount the scripts directory so mock-claude-wrapper.sh is accessible
      const result = execSync(
        `podman run -d --rm --userns=keep-id -v ${SCRIPTS_DIR}:${SCRIPTS_DIR}:ro ${TEST_IMAGE} sleep infinity`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      containerId = result;
      console.log(`Started test container: ${containerId}`);
    },
    30000 // 30s timeout for container startup
  );

  afterAll(
    () => {
      if (containerId) {
        try {
          // Use --time=1 to speed up container stop (sleep infinity ignores SIGTERM)
          execSync(`podman stop --time=1 ${containerId}`, { stdio: 'ignore' });
          console.log(`Stopped test container: ${containerId}`);
        } catch {
          // Container may have already been removed
        }
        containerId = null;
      }
    },
    15000 // 15s timeout for container cleanup
  );

  afterEach(() => {
    if (runner) {
      runner.stop();
      runner = null;
    }
  });

  function createExecRunner(): PodmanClaudeRunner {
    if (!containerId) {
      throw new Error('Container not started');
    }

    const containerConfig = createDefaultContainerConfig(TEST_IMAGE, {
      skipDefaultMounts: true,
    });

    const options: PodmanClaudeRunnerOptions = {
      workingDir: '/tmp',
      containerConfig,
      // Use exec mode by providing containerId
      containerId,
      // Use the wrapper script instead of real claude
      claudePath: MOCK_CLAUDE_WRAPPER,
    };

    return new PodmanClaudeRunner(options);
  }

  it.skipIf(!IMAGE_AVAILABLE)(
    'should start Claude in existing container via podman exec without TTY conflict',
    async () => {
      runner = createExecRunner();
      const events: { type: string; data: unknown }[] = [];
      let exitData: { code: number | null; signal: string | null } | null = null;

      runner.on('system', (data) => events.push({ type: 'system', data }));
      runner.on('text', (data) => events.push({ type: 'text', data }));
      runner.on('result', (data) => events.push({ type: 'result', data }));
      runner.on('exit', (data) => {
        exitData = data;
      });

      runner.start('Hello from exec mode');

      // Wait for result (should complete successfully, not exit immediately)
      await waitForEvent(events, 'result', 15000);

      // Verify we got expected events (not immediate exit with code 1)
      expect(events.some((e) => e.type === 'system')).toBe(true);
      expect(events.some((e) => e.type === 'text')).toBe(true);
      expect(events.some((e) => e.type === 'result')).toBe(true);

      // Verify response contains our message
      const textEvent = events.find((e) => e.type === 'text');
      expect((textEvent?.data as { text: string })?.text).toContain('[Turn 1]');
      expect((textEvent?.data as { text: string })?.text).toContain('Hello from exec mode');

      // If exit happened, it should be code 0 (success), not code 1 (TTY conflict)
      if (exitData) {
        expect(exitData.code).not.toBe(1);
      }
    },
    30000
  );

  it.skipIf(!IMAGE_AVAILABLE)(
    'should handle multi-turn conversation in exec mode',
    async () => {
      runner = createExecRunner();
      const events: { type: string; data: unknown }[] = [];

      runner.on('system', (data) => events.push({ type: 'system', data }));
      runner.on('text', (data) => events.push({ type: 'text', data }));
      runner.on('result', (data) => events.push({ type: 'result', data }));

      // First turn
      runner.start('First exec message');
      await waitForEvent(events, 'result', 15000);

      const firstText = events.find((e) => e.type === 'text');
      expect((firstText?.data as { text: string })?.text).toContain('[Turn 1]');

      // Clear events for second turn
      events.length = 0;

      // Second turn via sendUserMessage
      const sent = runner.sendUserMessage('Second exec message');
      expect(sent).toBe(true);

      // Wait for second result
      await waitForEvent(events, 'result', 15000);

      const secondText = events.find((e) => e.type === 'text');
      expect((secondText?.data as { text: string })?.text).toContain('[Turn 2]');
      expect((secondText?.data as { text: string })?.text).toContain('Second exec message');
    },
    60000
  );

  it.skipIf(!IMAGE_AVAILABLE)(
    'should handle control_request in exec mode',
    async () => {
      runner = createExecRunner();
      const events: { type: string; data: unknown }[] = [];

      runner.on('system', (data) => events.push({ type: 'system', data }));
      runner.on('control_response', (data) => events.push({ type: 'control_response', data }));
      runner.on('permission_mode_changed', (data) =>
        events.push({ type: 'permission_mode_changed', data })
      );

      runner.start('Test exec mode control');

      // Wait for system event
      await waitForEvent(events, 'system', 15000);

      expect(runner.permissionMode).toBe('default');

      // Send control_request to change mode
      const result = runner.requestPermissionModeChange('plan');
      expect(result).toBe(true);

      // Wait for permission mode change
      await waitForEvent(events, 'permission_mode_changed', 15000);

      expect(runner.permissionMode).toBe('plan');
    },
    30000
  );

  it.skipIf(!IMAGE_AVAILABLE)(
    'should be able to run multiple sequential Claude sessions in same container',
    async () => {
      // First session
      runner = createExecRunner();
      const events1: { type: string; data: unknown }[] = [];

      runner.on('result', (data) => events1.push({ type: 'result', data }));
      runner.start('Session 1');
      await waitForEvent(events1, 'result', 15000);
      runner.stop();
      runner = null;

      // Second session in same container
      runner = createExecRunner();
      const events2: { type: string; data: unknown }[] = [];

      runner.on('text', (data) => events2.push({ type: 'text', data }));
      runner.on('result', (data) => events2.push({ type: 'result', data }));
      runner.start('Session 2');
      await waitForEvent(events2, 'result', 15000);

      // Verify second session works
      const textEvent = events2.find((e) => e.type === 'text');
      expect((textEvent?.data as { text: string })?.text).toContain('Session 2');
    },
    60000
  );
});

async function waitForEvent(
  events: { type: string; data: unknown }[],
  eventType: string,
  timeoutMs: number
): Promise<void> {
  const startTime = Date.now();
  while (!events.some((e) => e.type === eventType)) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `Timeout waiting for ${eventType} event. Got: ${events.map((e) => e.type).join(', ')}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
