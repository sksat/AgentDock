import type Database from 'better-sqlite3';

export interface GlobalSettings {
  defaultThinkingEnabled: boolean;
  defaultModel: string;
  defaultPermissionMode: string;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  defaultThinkingEnabled: false,
  defaultModel: 'claude-opus-4-5-20250514',
  defaultPermissionMode: 'ask',
};

export class SettingsManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get a single setting value
   */
  get<K extends keyof GlobalSettings>(key: K): GlobalSettings[K] {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;

    if (!row) {
      return DEFAULT_SETTINGS[key];
    }

    try {
      return JSON.parse(row.value) as GlobalSettings[K];
    } catch {
      return DEFAULT_SETTINGS[key];
    }
  }

  /**
   * Set a single setting value
   */
  set<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
      )
      .run(key, JSON.stringify(value), now, JSON.stringify(value), now);
  }

  /**
   * Get all settings
   */
  getAll(): GlobalSettings {
    const settings = { ...DEFAULT_SETTINGS };

    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;

    for (const row of rows) {
      if (row.key in DEFAULT_SETTINGS) {
        try {
          (settings as Record<string, unknown>)[row.key] = JSON.parse(row.value);
        } catch {
          // Keep default value on parse error
        }
      }
    }

    return settings;
  }

  /**
   * Update multiple settings at once
   */
  updateAll(updates: Partial<GlobalSettings>): GlobalSettings {
    const now = new Date().toISOString();

    this.db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (key in DEFAULT_SETTINGS) {
          this.db
            .prepare(
              `INSERT INTO settings (key, value, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
            )
            .run(key, JSON.stringify(value), now, JSON.stringify(value), now);
        }
      }
    })();

    return this.getAll();
  }
}
