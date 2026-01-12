import { spawn } from 'node:child_process';
import { EventEmitter } from 'events';
import type Database from 'better-sqlite3';
import type { DailyUsage, UsageTotals, BlockUsage, SessionUsageInfo } from '@agent-dock/shared';

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

interface CcusageSessionOutput {
  sessions: Array<{
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    lastActivity: string;
    modelsUsed: string[];
    modelBreakdowns: Array<{
      modelName: string;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      cost: number;
    }>;
    projectPath: string;
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
  /** Arguments for ccusage session (default: ['ccusage', 'session', '--json']) */
  sessionArgs?: string[];
  /** Database instance for caching (optional) */
  db?: Database.Database;
  /** Cache TTL in milliseconds (default: 30000 = 30 seconds) */
  cacheTtl?: number;
}

interface CacheRow {
  cache_type: string;
  data: string;
  updated_at: string;
}

interface SessionUsageCacheRow {
  ccusage_session_id: string;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  last_activity: string;
  models_used: string;
  updated_at: string;
}

export class UsageMonitor extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private options: Omit<Required<UsageMonitorOptions>, 'db'> & { db: Database.Database | null };
  private lastUsage: UsageData | null = null;
  private isRunning: boolean = false;
  private sessionUsageCache: SessionUsageInfo[] = [];
  private sessionUsageCacheTime: number = 0;

  constructor(options: UsageMonitorOptions = {}) {
    super();
    this.options = {
      interval: options.interval ?? 30000,
      command: options.command ?? 'npx',
      dailyArgs: options.dailyArgs ?? ['ccusage', 'daily', '--json', '--breakdown'],
      blocksArgs: options.blocksArgs ?? ['ccusage', 'blocks', '--json', '--recent'],
      sessionArgs: options.sessionArgs ?? ['ccusage', 'session', '--json'],
      db: options.db ?? null,
      cacheTtl: options.cacheTtl ?? 30000,
    };
  }

  /**
   * Start monitoring usage
   */
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    // Load cached data from DB immediately (fast)
    this.loadCachedUsage();
    this.loadCachedSessionUsage();

    // Fetch fresh data in background
    this.fetchUsage();

    // Then periodically
    this.intervalId = setInterval(() => {
      this.fetchUsage();
    }, this.options.interval);
  }

  /**
   * Load cached usage data from database
   */
  private loadCachedUsage(): void {
    if (!this.options.db) return;

    try {
      const row = this.options.db
        .prepare('SELECT data, updated_at FROM ccusage_cache WHERE cache_type = ?')
        .get('usage') as CacheRow | undefined;

      if (row) {
        const cached = JSON.parse(row.data) as UsageData;
        this.lastUsage = cached;
        this.emit('usage', cached);
      }
    } catch (error) {
      console.error('[UsageMonitor] Failed to load cached usage:', error);
    }
  }

  /**
   * Save usage data to database cache
   */
  private saveCachedUsage(data: UsageData): void {
    if (!this.options.db) return;

    try {
      this.options.db
        .prepare(
          'INSERT OR REPLACE INTO ccusage_cache (cache_type, data, updated_at) VALUES (?, ?, ?)'
        )
        .run('usage', JSON.stringify(data), new Date().toISOString());
    } catch (error) {
      console.error('[UsageMonitor] Failed to save cached usage:', error);
    }
  }

  /**
   * Load cached session usage from database
   */
  private loadCachedSessionUsage(): void {
    if (!this.options.db) return;

    try {
      const rows = this.options.db
        .prepare('SELECT * FROM ccusage_session_usage')
        .all() as SessionUsageCacheRow[];

      this.sessionUsageCache = rows.map((row) => ({
        ccusageSessionId: row.ccusage_session_id,
        totalCost: row.total_cost,
        totalTokens: row.total_tokens,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheCreationTokens: row.cache_creation_tokens,
        cacheReadTokens: row.cache_read_tokens,
        lastActivity: row.last_activity,
        modelsUsed: JSON.parse(row.models_used),
      }));
      this.sessionUsageCacheTime = Date.now();
    } catch (error) {
      console.error('[UsageMonitor] Failed to load cached session usage:', error);
    }
  }

  /**
   * Save session usage to database cache
   */
  private saveCachedSessionUsage(sessions: SessionUsageInfo[]): void {
    if (!this.options.db) return;

    try {
      const now = new Date().toISOString();
      const stmt = this.options.db.prepare(`
        INSERT OR REPLACE INTO ccusage_session_usage
        (ccusage_session_id, total_cost, total_tokens, input_tokens, output_tokens,
         cache_creation_tokens, cache_read_tokens, last_activity, models_used, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.options.db.transaction((items: SessionUsageInfo[]) => {
        for (const s of items) {
          stmt.run(
            s.ccusageSessionId,
            s.totalCost,
            s.totalTokens,
            s.inputTokens,
            s.outputTokens,
            s.cacheCreationTokens,
            s.cacheReadTokens,
            s.lastActivity,
            JSON.stringify(s.modelsUsed),
            now
          );
        }
      });

      insertMany(sessions);
    } catch (error) {
      console.error('[UsageMonitor] Failed to save cached session usage:', error);
    }
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
      this.saveCachedUsage(usageData);
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

  /**
   * Convert a working directory path to ccusage session ID format.
   * Example: '/home/user/project' -> '-home-user-project'
   */
  workingDirToCcusageSessionId(workingDir: string): string {
    // Remove trailing slash if present
    const normalized = workingDir.endsWith('/') ? workingDir.slice(0, -1) : workingDir;
    // Replace all forward slashes with dashes
    return normalized.replace(/\//g, '-');
  }

  /**
   * Fetch session usage data from ccusage (with caching)
   */
  async fetchSessionUsage(): Promise<SessionUsageInfo[]> {
    // Return in-memory cache if fresh
    const now = Date.now();
    if (this.sessionUsageCache.length > 0 && now - this.sessionUsageCacheTime < this.options.cacheTtl) {
      return this.sessionUsageCache;
    }

    try {
      const output = await this.runCcusage(this.options.sessionArgs);
      const data = JSON.parse(output) as CcusageSessionOutput;

      const sessions = data.sessions.map((s) => ({
        ccusageSessionId: s.sessionId,
        totalCost: s.totalCost,
        totalTokens: s.totalTokens,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheCreationTokens: s.cacheCreationTokens,
        cacheReadTokens: s.cacheReadTokens,
        lastActivity: s.lastActivity,
        modelsUsed: s.modelsUsed,
      }));

      // Update caches
      this.sessionUsageCache = sessions;
      this.sessionUsageCacheTime = now;
      this.saveCachedSessionUsage(sessions);

      return sessions;
    } catch {
      // Return stale cache on error
      return this.sessionUsageCache;
    }
  }

  /**
   * Get cached session usage (synchronous, for fast access)
   */
  getCachedSessionUsage(): SessionUsageInfo[] {
    return this.sessionUsageCache;
  }

  /**
   * Get session usage for a specific working directory
   */
  async getSessionUsage(workingDir: string): Promise<SessionUsageInfo | null> {
    const ccusageSessionId = this.workingDirToCcusageSessionId(workingDir);
    const sessions = await this.fetchSessionUsage();
    return sessions.find((s) => s.ccusageSessionId === ccusageSessionId) ?? null;
  }

  /**
   * Get session usage from cache (synchronous)
   */
  getSessionUsageFromCache(workingDir: string): SessionUsageInfo | null {
    const ccusageSessionId = this.workingDirToCcusageSessionId(workingDir);
    return this.sessionUsageCache.find((s) => s.ccusageSessionId === ccusageSessionId) ?? null;
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
