/**
 * Integration tests for Podman container mode.
 *
 * These tests require:
 * - Podman installed and configured for rootless operation
 * - The container image built: podman build -t claude-code:local -f Dockerfile.claude .
 *
 * Tests are skipped if Podman is not available.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawn, spawnSync } from 'child_process';
import { buildPodmanArgs, createDefaultContainerConfig } from '../container-config.js';

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

describe('Podman integration', () => {
  beforeAll(() => {
    if (!PODMAN_AVAILABLE) {
      console.log('Skipping Podman integration tests: Podman not available');
    } else if (!IMAGE_AVAILABLE) {
      console.log(`Skipping Podman integration tests: Image ${TEST_IMAGE} not found`);
      console.log('Build the image with: podman build -t claude-code:local -f Dockerfile.claude .');
    }
  });

  describe('Podman availability', () => {
    it.skipIf(!PODMAN_AVAILABLE)('should have Podman installed', () => {
      const version = execSync('podman --version', { encoding: 'utf-8' }).trim();
      expect(version).toMatch(/podman version/);
    });

    it.skipIf(!PODMAN_AVAILABLE)('should support rootless mode', () => {
      const info = execSync('podman info --format json', { encoding: 'utf-8' });
      const parsed = JSON.parse(info);
      // In rootless mode, host.security.rootless should be true
      expect(parsed.host?.security?.rootless).toBe(true);
    });
  });

  describe('Container image', () => {
    it.skipIf(!IMAGE_AVAILABLE)('should have the test image available', () => {
      const result = execSync(`podman image exists ${TEST_IMAGE}`, { encoding: 'utf-8' });
      // Command succeeds (no output) if image exists
      expect(result).toBe('');
    });

    it.skipIf(!IMAGE_AVAILABLE)('should have Claude Code installed in image', () => {
      const result = execSync(
        `podman run --rm ${TEST_IMAGE} claude --version`,
        { encoding: 'utf-8' }
      ).trim();
      expect(result).toMatch(/Claude Code/);
    });

    it.skipIf(!IMAGE_AVAILABLE)('should have correct user (node) in image', () => {
      const result = execSync(
        `podman run --rm ${TEST_IMAGE} whoami`,
        { encoding: 'utf-8' }
      ).trim();
      expect(result).toBe('node');
    });
  });

  describe('buildPodmanArgs', () => {
    it.skipIf(!IMAGE_AVAILABLE)('should generate valid podman run command', () => {
      const config = createDefaultContainerConfig(TEST_IMAGE, {
        skipDefaultMounts: true, // Skip mounts for this test
      });
      const args = buildPodmanArgs(config, '/tmp/test-workspace', {});

      // Verify the args can be used with podman (dry run style check)
      expect(args[0]).toBe('run');
      expect(args).toContain('-it');
      expect(args).toContain('--rm');
      expect(args).toContain('--userns=keep-id');
      expect(args).toContain(TEST_IMAGE);
    });

    it.skipIf(!IMAGE_AVAILABLE)('should run a simple command in container', () => {
      const config = createDefaultContainerConfig(TEST_IMAGE, {
        skipDefaultMounts: true,
      });
      const args = buildPodmanArgs(config, '/tmp', {});

      // Replace -it with just -i for non-interactive test (before adding command)
      const itIndex = args.indexOf('-it');
      if (itIndex !== -1) {
        args[itIndex] = '-i';
      }

      // Add a simple echo command (after image, which is already at the end)
      args.push('echo', 'hello-from-container');

      const result = execSync(`podman ${args.join(' ')}`, { encoding: 'utf-8' }).trim();
      expect(result).toBe('hello-from-container');
    });
  });

  describe('Environment variables', () => {
    it.skipIf(!IMAGE_AVAILABLE)('should pass environment variables to container', () => {
      const config = createDefaultContainerConfig(TEST_IMAGE, {
        skipDefaultMounts: true,
      });
      const args = buildPodmanArgs(config, '/tmp', {
        TEST_VAR: 'test-value-123',
      });

      // Replace -it with just -i for non-interactive test
      const itIndex = args.indexOf('-it');
      if (itIndex !== -1) {
        args[itIndex] = '-i';
      }

      // Add command to print the env var (after image)
      args.push('sh', '-c', 'echo $TEST_VAR');

      // Use spawnSync to avoid shell quoting issues with args.join()
      const proc = spawnSync('podman', args, { encoding: 'utf-8' });
      expect(proc.stdout.trim()).toBe('test-value-123');
    });
  });

  describe('Overlay mount', () => {
    it.skipIf(!IMAGE_AVAILABLE)('should support overlay mount option', async () => {
      // Test that overlay mount syntax is accepted by Podman
      const result = execSync(
        `podman run --rm -v /tmp:/workspace:O ${TEST_IMAGE} ls /workspace`,
        { encoding: 'utf-8' }
      );
      // Should not throw, meaning overlay mount is supported
      expect(result).toBeDefined();
    });
  });

  describe('PTY and stream-json output', () => {
    it.skipIf(!IMAGE_AVAILABLE)('should capture stdout from container', async () => {
      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn('podman', [
          'run', '--rm', TEST_IMAGE,
          'echo', '{"type":"test","message":"hello"}'
        ]);

        let stdout = '';
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });

        proc.on('error', reject);
      });

      // Verify JSON can be parsed
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('test');
      expect(parsed.message).toBe('hello');
    });
  });
});
