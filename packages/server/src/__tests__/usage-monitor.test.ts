import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UsageMonitor } from '../usage-monitor';
import type { BlockUsage, SessionUsageInfo } from '@agent-dock/shared';
import { spawn } from 'node:child_process';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('UsageMonitor', () => {
  let monitor: UsageMonitor;
  const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

  // Helper to create mock process
  function createMockProcess(stdout: string, exitCode = 0) {
    const mockProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(stdout));
          }
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(exitCode), 0);
        }
      }),
      kill: vi.fn(),
    };
    return mockProc;
  }

  // Mock daily data output
  const mockDailyOutput = JSON.stringify({
    daily: [
      {
        date: '2026-01-13',
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 100,
        cacheReadTokens: 200,
        totalTokens: 1800,
        totalCost: 0.05,
        modelsUsed: ['claude-sonnet-4-5-20250929'],
        modelBreakdowns: [
          {
            modelName: 'claude-sonnet-4-5-20250929',
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationTokens: 100,
            cacheReadTokens: 200,
            cost: 0.05,
          },
        ],
      },
    ],
    totals: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 100,
      cacheReadTokens: 200,
      totalCost: 0.05,
      totalTokens: 1800,
    },
  });

  // Mock blocks data output
  const mockBlocksOutput = JSON.stringify({
    blocks: [
      {
        id: '2026-01-13T09:00:00.000Z',
        startTime: '2026-01-13T09:00:00.000Z',
        endTime: '2026-01-13T14:00:00.000Z',
        isActive: false,
        isGap: false,
        tokenCounts: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: 100,
          cacheReadInputTokens: 200,
        },
        totalTokens: 1800,
        costUSD: 0.05,
        models: ['claude-sonnet-4-5-20250929'],
      },
      {
        id: '2026-01-13T14:00:00.000Z',
        startTime: '2026-01-13T14:00:00.000Z',
        endTime: '2026-01-13T19:00:00.000Z',
        isActive: true,
        isGap: false,
        tokenCounts: {
          inputTokens: 2000,
          outputTokens: 1000,
          cacheCreationInputTokens: 200,
          cacheReadInputTokens: 400,
        },
        totalTokens: 3600,
        costUSD: 0.10,
        models: ['claude-opus-4-5-20251101'],
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor?.stop();
  });

  describe('daily data', () => {
    it('should fetch and parse daily usage data', async () => {
      // Mock spawn to return daily data for first call, blocks for second
      mockSpawn
        .mockReturnValueOnce(createMockProcess(mockDailyOutput))
        .mockReturnValueOnce(createMockProcess(mockBlocksOutput));

      monitor = new UsageMonitor();
      const usagePromise = new Promise((resolve) => {
        monitor.on('usage', resolve);
      });

      monitor.start();
      const usage = await usagePromise;

      expect(usage).toHaveProperty('daily');
      expect(usage).toHaveProperty('totals');
      expect(usage).toHaveProperty('blocks');
      expect((usage as { daily: unknown[] }).daily).toHaveLength(1);
    });
  });

  describe('blocks data', () => {
    it('should fetch and parse blocks usage data', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess(mockDailyOutput))
        .mockReturnValueOnce(createMockProcess(mockBlocksOutput));

      monitor = new UsageMonitor();
      const usagePromise = new Promise((resolve) => {
        monitor.on('usage', resolve);
      });

      monitor.start();
      const usage = (await usagePromise) as { blocks: BlockUsage[] };

      expect(usage).toHaveProperty('blocks');
      expect(usage.blocks).toHaveLength(2);

      // First block
      expect(usage.blocks[0].id).toBe('2026-01-13T09:00:00.000Z');
      expect(usage.blocks[0].startTime).toBe('2026-01-13T09:00:00.000Z');
      expect(usage.blocks[0].endTime).toBe('2026-01-13T14:00:00.000Z');
      expect(usage.blocks[0].isActive).toBe(false);
      expect(usage.blocks[0].inputTokens).toBe(1000);
      expect(usage.blocks[0].outputTokens).toBe(500);
      expect(usage.blocks[0].totalCost).toBe(0.05);
      expect(usage.blocks[0].modelsUsed).toEqual(['claude-sonnet-4-5-20250929']);

      // Second block (active)
      expect(usage.blocks[1].isActive).toBe(true);
      expect(usage.blocks[1].totalCost).toBe(0.10);
    });

    it('should filter out gap blocks', async () => {
      const blocksWithGap = JSON.stringify({
        blocks: [
          {
            id: '2026-01-13T09:00:00.000Z',
            startTime: '2026-01-13T09:00:00.000Z',
            endTime: '2026-01-13T14:00:00.000Z',
            isActive: false,
            isGap: false,
            tokenCounts: {
              inputTokens: 1000,
              outputTokens: 500,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens: 0,
            },
            totalTokens: 1500,
            costUSD: 0.05,
            models: ['claude-sonnet-4-5-20250929'],
          },
          {
            id: 'gap-2026-01-13T14:00:00.000Z',
            startTime: '2026-01-13T14:00:00.000Z',
            endTime: '2026-01-13T19:00:00.000Z',
            isActive: false,
            isGap: true,
            tokenCounts: {
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens: 0,
            },
            totalTokens: 0,
            costUSD: 0,
            models: [],
          },
        ],
      });

      mockSpawn
        .mockReturnValueOnce(createMockProcess(mockDailyOutput))
        .mockReturnValueOnce(createMockProcess(blocksWithGap));

      monitor = new UsageMonitor();
      const usagePromise = new Promise((resolve) => {
        monitor.on('usage', resolve);
      });

      monitor.start();
      const usage = (await usagePromise) as { blocks: BlockUsage[] };

      // Should only have 1 block (gap filtered out)
      expect(usage.blocks).toHaveLength(1);
      expect(usage.blocks[0].isGap).toBe(false);
    });

    it('should sort blocks by startTime ascending', async () => {
      const unsortedBlocks = JSON.stringify({
        blocks: [
          {
            id: '2026-01-13T19:00:00.000Z',
            startTime: '2026-01-13T19:00:00.000Z',
            endTime: '2026-01-14T00:00:00.000Z',
            isActive: true,
            isGap: false,
            tokenCounts: {
              inputTokens: 100,
              outputTokens: 50,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens: 0,
            },
            totalTokens: 150,
            costUSD: 0.01,
            models: [],
          },
          {
            id: '2026-01-13T09:00:00.000Z',
            startTime: '2026-01-13T09:00:00.000Z',
            endTime: '2026-01-13T14:00:00.000Z',
            isActive: false,
            isGap: false,
            tokenCounts: {
              inputTokens: 200,
              outputTokens: 100,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens: 0,
            },
            totalTokens: 300,
            costUSD: 0.02,
            models: [],
          },
        ],
      });

      mockSpawn
        .mockReturnValueOnce(createMockProcess(mockDailyOutput))
        .mockReturnValueOnce(createMockProcess(unsortedBlocks));

      monitor = new UsageMonitor();
      const usagePromise = new Promise((resolve) => {
        monitor.on('usage', resolve);
      });

      monitor.start();
      const usage = (await usagePromise) as { blocks: BlockUsage[] };

      // Should be sorted ascending
      expect(usage.blocks[0].startTime).toBe('2026-01-13T09:00:00.000Z');
      expect(usage.blocks[1].startTime).toBe('2026-01-13T19:00:00.000Z');
    });
  });

  describe('error handling', () => {
    it('should return empty blocks array when blocks command fails', async () => {
      // Daily succeeds, blocks fails
      mockSpawn
        .mockReturnValueOnce(createMockProcess(mockDailyOutput))
        .mockReturnValueOnce(createMockProcess('', 1)); // Exit code 1 = failure

      monitor = new UsageMonitor();
      const usagePromise = new Promise((resolve) => {
        monitor.on('usage', resolve);
      });

      monitor.start();
      const usage = (await usagePromise) as { blocks: BlockUsage[] };

      expect(usage.blocks).toEqual([]);
    });
  });

  describe('session usage', () => {
    // Mock session data output
    const mockSessionOutput = JSON.stringify({
      sessions: [
        {
          sessionId: '-home-user-project-foo',
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 100,
          cacheReadTokens: 200,
          totalTokens: 1800,
          totalCost: 0.05,
          lastActivity: '2026-01-13',
          modelsUsed: ['claude-sonnet-4-5-20250929'],
          modelBreakdowns: [],
          projectPath: 'Unknown Project',
        },
        {
          sessionId: '-home-user-project-bar',
          inputTokens: 2000,
          outputTokens: 1000,
          cacheCreationTokens: 200,
          cacheReadTokens: 400,
          totalTokens: 3600,
          totalCost: 0.10,
          lastActivity: '2026-01-12',
          modelsUsed: ['claude-opus-4-5-20251101'],
          modelBreakdowns: [],
          projectPath: 'Unknown Project',
        },
      ],
    });

    it('should fetch and parse session usage data', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess(mockSessionOutput));

      monitor = new UsageMonitor();
      const sessions = await monitor.fetchSessionUsage();

      expect(sessions).toHaveLength(2);

      // First session
      expect(sessions[0].ccusageSessionId).toBe('-home-user-project-foo');
      expect(sessions[0].totalCost).toBe(0.05);
      expect(sessions[0].totalTokens).toBe(1800);
      expect(sessions[0].modelsUsed).toEqual(['claude-sonnet-4-5-20250929']);

      // Second session
      expect(sessions[1].ccusageSessionId).toBe('-home-user-project-bar');
      expect(sessions[1].totalCost).toBe(0.10);
    });

    it('should return empty array when session command fails', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', 1)); // Exit code 1 = failure

      monitor = new UsageMonitor();
      const sessions = await monitor.fetchSessionUsage();

      expect(sessions).toEqual([]);
    });

    it('should convert working directory to ccusage session ID', () => {
      monitor = new UsageMonitor();

      expect(monitor.workingDirToCcusageSessionId('/home/user/project'))
        .toBe('-home-user-project');
      expect(monitor.workingDirToCcusageSessionId('/home/sksat/prog/claude-bridge'))
        .toBe('-home-sksat-prog-claude-bridge');
      // Trailing slash should be handled
      expect(monitor.workingDirToCcusageSessionId('/home/user/project/'))
        .toBe('-home-user-project');
    });

    it('should get session usage by working directory', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess(mockSessionOutput));

      monitor = new UsageMonitor();
      const usage = await monitor.getSessionUsage('/home/user/project/foo');

      expect(usage).not.toBeNull();
      expect(usage!.ccusageSessionId).toBe('-home-user-project-foo');
      expect(usage!.totalCost).toBe(0.05);
    });

    it('should return null for unknown working directory', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess(mockSessionOutput));

      monitor = new UsageMonitor();
      const usage = await monitor.getSessionUsage('/unknown/path');

      expect(usage).toBeNull();
    });
  });
});
