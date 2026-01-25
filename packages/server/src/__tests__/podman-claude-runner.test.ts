import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock node-pty before importing PodmanClaudeRunner
const mockPty = {
  pid: 12345,
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  kill: vi.fn(),
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPty),
}));

import * as pty from 'node-pty';
import { PodmanClaudeRunner } from '../podman-claude-runner.js';
import type { PodmanClaudeRunnerOptions } from '../podman-claude-runner.js';
import type { ContainerConfig } from '../container-config.js';

describe('PodmanClaudeRunner', () => {
  let runner: PodmanClaudeRunner;
  let dataHandler: (data: string) => void;
  let exitHandler: (exitData: { exitCode: number; signal?: number }) => void;

  const defaultContainerConfig: ContainerConfig = {
    enabled: true,
    runtime: 'podman',
    image: 'claude-container:v1',
    workdirOverlay: true,
    extraMounts: [],
    extraArgs: [],
  };

  const defaultOptions: PodmanClaudeRunnerOptions = {
    workingDir: '/host/workspace',
    containerConfig: defaultContainerConfig,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture handlers when onData/onExit are called
    mockPty.onData.mockImplementation((handler) => {
      dataHandler = handler;
    });
    mockPty.onExit.mockImplementation((handler) => {
      exitHandler = handler;
    });
  });

  afterEach(() => {
    if (runner) {
      runner.removeAllListeners();
    }
  });

  describe('start', () => {
    it('should spawn podman instead of claude directly', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');

      expect(pty.spawn).toHaveBeenCalledWith(
        'podman',
        expect.arrayContaining(['run']),
        expect.any(Object)
      );
    });

    it('should include container image in podman args', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).toContain('claude-container:v1');
    });

    it('should include overlay mount for workdir', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // Find the -v argument for workdir
      const vIndex = args.indexOf('-v');
      expect(vIndex).toBeGreaterThan(-1);
      expect(args[vIndex + 1]).toBe('/host/workspace:/workspace:O');
    });

    it('should include claude command and prompt after image', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello Claude');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // After the image, should have claude command with args
      const imageIndex = args.indexOf('claude-container:v1');
      expect(imageIndex).toBeGreaterThan(-1);

      // claude command should come after image
      const claudeIndex = args.indexOf('claude', imageIndex);
      expect(claudeIndex).toBeGreaterThan(imageIndex);

      // -p flag with empty prompt (message sent via PTY in stream-json format)
      const pIndex = args.indexOf('-p', claudeIndex);
      expect(pIndex).toBeGreaterThan(claudeIndex);
      expect(args[pIndex + 1]).toBe('');

      // Verify message was sent via PTY write
      expect(mockPty.write).toHaveBeenCalled();
      const writeCall = vi.mocked(mockPty.write).mock.calls[0][0];
      const parsed = JSON.parse(writeCall.replace('\n', ''));
      expect(parsed.type).toBe('user');
      expect(parsed.message.content[0].text).toBe('Hello Claude');
    });

    it('should include --userns=keep-id for rootless mode', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).toContain('--userns=keep-id');
    });

    it('should emit started event with PID', async () => {
      runner = new PodmanClaudeRunner(defaultOptions);

      const startedPromise = new Promise<{ pid: number }>((resolve) => {
        runner.on('started', resolve);
      });

      runner.start('Hello');

      const data = await startedPromise;
      expect(data.pid).toBe(12345);
    });

    it('should pass environment variables to container', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello', { thinkingEnabled: true });

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // Find -e arguments
      const envArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-e' && args[i + 1]) {
          envArgs.push(args[i + 1]);
        }
      }

      expect(envArgs).toContain('MAX_THINKING_TOKENS=31999');
    });

    it('should include --session flag when sessionId provided', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello', { sessionId: 'abc123' });

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).toContain('--resume');
      const resumeIndex = args.indexOf('--resume');
      expect(args[resumeIndex + 1]).toBe('abc123');
    });
  });

  describe('stream-json parsing', () => {
    it('should emit text event for assistant message', async () => {
      runner = new PodmanClaudeRunner(defaultOptions);

      const textPromise = new Promise<{ text: string }>((resolve) => {
        runner.on('text', resolve);
      });

      runner.start('Hello');

      // Simulate Claude output (assistant event with text content)
      dataHandler('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello!"}]}}\n');

      const data = await textPromise;
      expect(data.text).toBe('Hello!');
    });

    it('should emit exit event when process exits', async () => {
      runner = new PodmanClaudeRunner(defaultOptions);

      const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
        runner.on('exit', resolve);
      });

      runner.start('Hello');
      exitHandler({ exitCode: 0 });

      const data = await exitPromise;
      expect(data.code).toBe(0);
    });
  });

  describe('stop', () => {
    it('should kill the PTY process', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');
      runner.stop();

      expect(mockPty.kill).toHaveBeenCalled();
    });
  });

  describe('sendInput', () => {
    it('should write input to PTY process', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');
      runner.sendInput('additional input');

      expect(mockPty.write).toHaveBeenCalledWith('additional input');
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      expect(runner.isRunning).toBe(false);
    });

    it('should return true after start', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');
      expect(runner.isRunning).toBe(true);
    });

    it('should return false after exit', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');
      exitHandler({ exitCode: 0 });
      expect(runner.isRunning).toBe(false);
    });
  });

  describe('extra mounts', () => {
    it('should include extra mounts in podman args', () => {
      const configWithMounts: ContainerConfig = {
        ...defaultContainerConfig,
        extraMounts: [
          { source: '/home/user/.gitconfig', target: '/home/user/.gitconfig', options: 'ro' },
        ],
      };

      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        containerConfig: configWithMounts,
      });
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

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
  });

  describe('MCP configuration', () => {
    it('should mount MCP config directory when mcpConfigPath is provided', () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        mcpConfigPath: '/tmp/agent-dock-mcp/mcp-config-test123.json',
        permissionToolName: 'mcp__bridge__permission_prompt',
      });
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // Find all -v arguments
      const volumeArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-v' && args[i + 1]) {
          volumeArgs.push(args[i + 1]);
        }
      }

      // MCP config directory should be mounted
      const mcpConfigMount = volumeArgs.find((v) => v.includes('/tmp/agent-dock-mcp'));
      expect(mcpConfigMount).toBeDefined();
      expect(mcpConfigMount).toContain(':ro');
    });

    it('should mount project root for MCP server access when mcpConfigPath is provided', () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        mcpConfigPath: '/tmp/agent-dock-mcp/mcp-config-test123.json',
        permissionToolName: 'mcp__bridge__permission_prompt',
      });
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // Find all -v arguments
      const volumeArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-v' && args[i + 1]) {
          volumeArgs.push(args[i + 1]);
        }
      }

      // Project root should be mounted (contains packages/mcp-server)
      // The exact path depends on cwd, but there should be more than just workdir and mcp config
      expect(volumeArgs.length).toBeGreaterThanOrEqual(3);
    });

    it('should add --network=host when mcpConfigPath is provided', () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        mcpConfigPath: '/tmp/agent-dock-mcp/mcp-config-test123.json',
        permissionToolName: 'mcp__bridge__permission_prompt',
      });
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // --network=host should be included for localhost WebSocket access
      expect(args).toContain('--network=host');
    });

    it('should NOT add --network=host when mcpConfigPath is not provided', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // --network=host should NOT be included
      expect(args).not.toContain('--network=host');
    });
  });

  describe('exec mode (Issue #78: same-container)', () => {
    it('should use podman exec when containerId is provided', () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        containerId: 'abc123def456',
      });
      runner.start('Hello');

      expect(pty.spawn).toHaveBeenCalledWith(
        'podman',
        expect.arrayContaining(['exec', '-it', 'abc123def456', 'claude']),
        expect.any(Object)
      );
    });

    it('should NOT include run command when containerId is provided', () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        containerId: 'abc123def456',
      });
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).not.toContain('run');
    });

    it('should include empty prompt in exec mode (message sent via PTY)', () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        containerId: 'abc123def456',
      });
      runner.start('Hello Claude');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      // -p flag with empty prompt
      expect(args).toContain('-p');
      const pIndex = args.indexOf('-p');
      expect(args[pIndex + 1]).toBe('');

      // Verify message was sent via PTY write
      expect(mockPty.write).toHaveBeenCalled();
      const writeCall = vi.mocked(mockPty.write).mock.calls[0][0];
      const parsed = JSON.parse(writeCall.replace('\n', ''));
      expect(parsed.type).toBe('user');
      expect(parsed.message.content[0].text).toBe('Hello Claude');
    });

    it('should pass environment variables in exec mode', () => {
      // Set up environment variable
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      try {
        runner = new PodmanClaudeRunner({
          ...defaultOptions,
          containerId: 'abc123def456',
        });
        runner.start('Hello', { thinkingEnabled: true });

        const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];

        // Find -e arguments for environment variables
        const envArgs: string[] = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '-e' && args[i + 1]) {
            envArgs.push(args[i + 1]);
          }
        }

        expect(envArgs).toContain('MAX_THINKING_TOKENS=31999');
        expect(envArgs.some(e => e.startsWith('ANTHROPIC_API_KEY='))).toBe(true);
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalEnv;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
      }
    });

    it('should include MCP config in exec mode', () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        containerId: 'abc123def456',
        mcpConfigPath: '/tmp/agent-dock-mcp/mcp-config-test123.json',
        permissionToolName: 'mcp__bridge__permission_prompt',
      });
      runner.start('Hello');

      const spawnCall = vi.mocked(pty.spawn).mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).toContain('--mcp-config');
      expect(args).toContain('/tmp/agent-dock-mcp/mcp-config-test123.json');
      expect(args).toContain('--permission-prompt-tool');
      expect(args).toContain('mcp__bridge__permission_prompt');
    });

    it('should emit started event with PID in exec mode', async () => {
      runner = new PodmanClaudeRunner({
        ...defaultOptions,
        containerId: 'abc123def456',
      });

      const startedPromise = new Promise<{ pid: number }>((resolve) => {
        runner.on('started', resolve);
      });

      runner.start('Hello');

      const data = await startedPromise;
      expect(data.pid).toBe(12345);
    });

    it('should still use podman run when containerId is NOT provided', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      runner.start('Hello');

      expect(pty.spawn).toHaveBeenCalledWith(
        'podman',
        expect.arrayContaining(['run']),
        expect.any(Object)
      );
    });
  });

  describe('tool name validation', () => {
    it('should accept valid tool names', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      expect(() => {
        runner.start('Hello', {
          allowedTools: ['Bash', 'Read', 'mcp__server:tool', 'plugin@namespace'],
        });
      }).not.toThrow();
    });

    it('should reject tool names with special characters', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      expect(() => {
        runner.start('Hello', {
          allowedTools: ['Bash; rm -rf /', 'Read'],
        });
      }).toThrow('Invalid tool name');
    });

    it('should reject tool names starting with hyphen', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      expect(() => {
        runner.start('Hello', {
          allowedTools: ['--version', 'Bash'],
        });
      }).toThrow('cannot start with a hyphen');
    });

    it('should validate disallowedTools as well', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      expect(() => {
        runner.start('Hello', {
          disallowedTools: ['$(whoami)', 'Bash'],
        });
      }).toThrow('Invalid tool name');
    });

    it('should accept tool names with underscores and colons', () => {
      runner = new PodmanClaudeRunner(defaultOptions);
      expect(() => {
        runner.start('Hello', {
          allowedTools: ['mcp__bridge__tool', 'scope:action'],
        });
      }).not.toThrow();
    });
  });
});
