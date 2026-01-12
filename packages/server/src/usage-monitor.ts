import { spawn } from 'node:child_process';
import { EventEmitter } from 'events';
import type { DailyUsage, UsageTotals, BlockUsage } from '@agent-dock/shared';

export interface UsageData {
  today: DailyUsage | null;
  totals: UsageTotals;
  /** Daily usage history (sorted by date ascending) */
  daily: DailyUsage[];
  /** Block usage history for finer granularity (sorted by startTime ascending) */
  blocks: BlockUsage[];
}

interface CcusageOutput {
  daily: Array<{
    date: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    modelBreakdowns: Array<{
      modelName: string;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      cost: number;
    }>;
  }>;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number;
    totalTokens: number;
  };
  blocks?: Array<{
    id: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
    isGap: boolean;
    tokenCounts: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    };
    totalTokens: number;
    costUSD: number;
    models: string[];
  }>;
}

export interface UsageMonitorEvents {
  usage: (data: UsageData) => void;
  error: (error: Error) => void;
}

export interface UsageMonitorOptions {
  /** Interval in milliseconds between usage checks (default: 30000 = 30 seconds) */
  interval?: number;
  /** Command to run ccusage (default: 'npx') */
  command?: string;
  /** Arguments for ccusage daily (default: ['ccusage', 'daily', '--json', '--breakdown']) */
  dailyArgs?: string[];
  /** Arguments for ccusage blocks (default: ['ccusage', 'blocks', '--json', '--recent']) */
  blocksArgs?: string[];
}

export class UsageMonitor extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private options: Required<UsageMonitorOptions>;
  private lastUsage: UsageData | null = null;
  private isRunning: boolean = false;

  constructor(options: UsageMonitorOptions = {}) {
    super();
    this.options = {
      interval: options.interval ?? 30000,
      command: options.command ?? 'npx',
      dailyArgs: options.dailyArgs ?? ['ccusage', 'daily', '--json', '--breakdown'],
      blocksArgs: options.blocksArgs ?? ['ccusage', 'blocks', '--json', '--recent'],
    };
  }

  /**
   * Start monitoring usage
   */
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    // Fetch immediately on start
    this.fetchUsage();

    // Then periodically
    this.intervalId = setInterval(() => {
      this.fetchUsage();
    }, this.options.interval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get the last fetched usage data
   */
  getLastUsage(): UsageData | null {
    return this.lastUsage;
  }

  /**
   * Force a refresh of usage data
   */
  async refresh(): Promise<UsageData | null> {
    return this.fetchUsage();
  }

  private async fetchUsage(): Promise<UsageData | null> {
    if (this.isRunning) {
      return this.lastUsage;
    }

    this.isRunning = true;

    try {
      // Fetch daily and blocks data in parallel
      const [dailyOutput, blocksOutput] = await Promise.all([
        this.runCcusage(this.options.dailyArgs),
        this.runCcusage(this.options.blocksArgs).catch(() => '{"blocks":[]}'), // Blocks may fail, default to empty
      ]);

      const dailyData = JSON.parse(dailyOutput) as CcusageOutput;
      const blocksData = JSON.parse(blocksOutput) as { blocks?: CcusageOutput['blocks'] };

      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];

      // Find today's usage
      const todayUsage = dailyData.daily.find((d) => d.date === today) ?? null;

      // Sort daily data by date ascending
      const sortedDaily = [...dailyData.daily].sort((a, b) => a.date.localeCompare(b.date));

      // Process blocks data
      const blocks: BlockUsage[] = (blocksData.blocks ?? [])
        .filter((b) => !b.isGap) // Filter out gap blocks
        .map((b) => ({
          id: b.id,
          startTime: b.startTime,
          endTime: b.endTime,
          isActive: b.isActive,
          isGap: b.isGap,
          inputTokens: b.tokenCounts.inputTokens,
          outputTokens: b.tokenCounts.outputTokens,
          cacheCreationTokens: b.tokenCounts.cacheCreationInputTokens,
          cacheReadTokens: b.tokenCounts.cacheReadInputTokens,
          totalTokens: b.totalTokens,
          totalCost: b.costUSD,
          modelsUsed: b.models,
        }))
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      const usageData: UsageData = {
        today: todayUsage,
        totals: dailyData.totals,
        daily: sortedDaily,
        blocks,
      };

      this.lastUsage = usageData;
      this.emit('usage', usageData);

      return usageData;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  private runCcusage(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.options.command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`ccusage exited with code ${code}: ${stderr}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error('ccusage timeout'));
      }, 30000);
    });
  }

  // Type-safe event emitter methods
  override on<K extends keyof UsageMonitorEvents>(
    event: K,
    listener: UsageMonitorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof UsageMonitorEvents>(
    event: K,
    ...args: Parameters<UsageMonitorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
