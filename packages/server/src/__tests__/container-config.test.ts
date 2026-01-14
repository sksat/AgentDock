import { describe, it, expect } from 'vitest';
import {
  ContainerConfig,
  buildPodmanArgs,
  expandPath,
} from '../container-config.js';

describe('container-config', () => {
  describe('expandPath', () => {
    it('should expand ~ to home directory', () => {
      const result = expandPath('~/.gitconfig');
      expect(result).toBe(`${process.env.HOME}/.gitconfig`);
    });

    it('should not modify absolute paths', () => {
      const result = expandPath('/absolute/path');
      expect(result).toBe('/absolute/path');
    });
  });

  describe('buildPodmanArgs', () => {
    const baseConfig: ContainerConfig = {
      enabled: true,
      runtime: 'podman',
      image: 'claude-container:v1',
      workdirOverlay: true,
      extraMounts: [],
      extraArgs: [],
    };

    it('should include basic podman run arguments', () => {
      const args = buildPodmanArgs(baseConfig, '/workspace', {});

      expect(args).toContain('run');
      expect(args).toContain('-it');
      expect(args).toContain('--rm');
      expect(args).toContain('claude-container:v1');
    });

    it('should include --userns=keep-id for UID mapping', () => {
      const args = buildPodmanArgs(baseConfig, '/workspace', {});

      expect(args).toContain('--userns=keep-id');
    });

    it('should include overlay mount for workdir with :O flag', () => {
      const args = buildPodmanArgs(baseConfig, '/host/workdir', {});

      expect(args).toContain('-v');
      const volumeIndex = args.indexOf('-v');
      const volumeArg = args[volumeIndex + 1];
      expect(volumeArg).toBe('/host/workdir:/workspace:O');
    });

    it('should use regular mount when workdirOverlay is false', () => {
      const config: ContainerConfig = {
        ...baseConfig,
        workdirOverlay: false,
      };
      const args = buildPodmanArgs(config, '/host/workdir', {});

      const volumeIndex = args.indexOf('-v');
      const volumeArg = args[volumeIndex + 1];
      expect(volumeArg).toBe('/host/workdir:/workspace:rw');
    });

    it('should pass environment variables with -e', () => {
      const env = {
        ANTHROPIC_API_KEY: 'test-key',
        MAX_THINKING_TOKENS: '31999',
      };
      const args = buildPodmanArgs(baseConfig, '/workspace', env);

      // Find all -e arguments
      const envArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-e' && args[i + 1]) {
          envArgs.push(args[i + 1]);
        }
      }

      expect(envArgs).toContain('ANTHROPIC_API_KEY=test-key');
      expect(envArgs).toContain('MAX_THINKING_TOKENS=31999');
    });

    it('should include extra mounts', () => {
      const config: ContainerConfig = {
        ...baseConfig,
        extraMounts: [
          { source: '~/.gitconfig', target: '/home/user/.gitconfig', options: 'ro' },
        ],
      };
      const args = buildPodmanArgs(config, '/workspace', {});

      // Find all -v arguments
      const volumeArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-v' && args[i + 1]) {
          volumeArgs.push(args[i + 1]);
        }
      }

      const gitconfigMount = volumeArgs.find((v) => v.includes('.gitconfig'));
      expect(gitconfigMount).toBeDefined();
      expect(gitconfigMount).toContain(':ro');
    });

    it('should include extra args', () => {
      const config: ContainerConfig = {
        ...baseConfig,
        extraArgs: ['--cpus=2', '--memory=4g'],
      };
      const args = buildPodmanArgs(config, '/workspace', {});

      expect(args).toContain('--cpus=2');
      expect(args).toContain('--memory=4g');
    });

    it('should set working directory inside container', () => {
      const args = buildPodmanArgs(baseConfig, '/workspace', {});

      expect(args).toContain('-w');
      const wIndex = args.indexOf('-w');
      expect(args[wIndex + 1]).toBe('/workspace');
    });

    it('should place image and command at the end', () => {
      const args = buildPodmanArgs(baseConfig, '/workspace', {});

      // Image should be near the end
      const imageIndex = args.indexOf('claude-container:v1');
      expect(imageIndex).toBeGreaterThan(args.length - 5);
    });
  });
});
