import Database from 'better-sqlite3';

const SCHEMA_VERSION = 4;

/**
 * Initialize the SQLite database with the required schema.
 * Creates tables if they don't exist and runs migrations if needed.
 */
export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create schema version table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  // Get current schema version
  const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    runMigrations(db, currentVersion, SCHEMA_VERSION);
  }

  return db;
}

function runMigrations(db: Database.Database, from: number, to: number): void {
  const migrations: Record<number, () => void> = {
    1: () => migrateToV1(db),
    2: () => migrateToV2(db),
    3: () => migrateToV3(db),
    4: () => migrateToV4(db),
  };

  db.transaction(() => {
    for (let version = from + 1; version <= to; version++) {
      const migrate = migrations[version];
      if (migrate) {
        migrate();
      }
    }

    // Update schema version
    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(to);
  })();
}

function migrateToV1(db: Database.Database): void {
  // Sessions table (includes usage columns from v2 for new databases)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      working_dir TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      claude_session_id TEXT,
      permission_mode TEXT,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(session_id, timestamp);
  `);

  // Session model usage table (for tracking usage per model)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_model_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, model_name)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_session_model_usage_session_id ON session_model_usage(session_id);
  `);
}

function migrateToV2(db: Database.Database): void {
  // Add usage columns to sessions table if they don't exist
  // Check if columns exist first
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const columns = new Set(tableInfo.map(col => col.name));

  if (!columns.has('input_tokens')) {
    db.exec('ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0');
  }
  if (!columns.has('output_tokens')) {
    db.exec('ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0');
  }
  if (!columns.has('cache_creation_tokens')) {
    db.exec('ALTER TABLE sessions ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0');
  }
  if (!columns.has('cache_read_tokens')) {
    db.exec('ALTER TABLE sessions ADD COLUMN cache_read_tokens INTEGER DEFAULT 0');
  }
}

function migrateToV3(db: Database.Database): void {
  // Add session_model_usage table if it doesn't exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_model_usage'").all();
  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE session_model_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_creation_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, model_name)
      )
    `);

    db.exec(`
      CREATE INDEX idx_session_model_usage_session_id ON session_model_usage(session_id);
    `);
  }
}

function migrateToV4(db: Database.Database): void {
  // Add ccusage_cache table for caching ccusage command outputs
  db.exec(`
    CREATE TABLE IF NOT EXISTS ccusage_cache (
      cache_type TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Add ccusage_session_usage table for per-session usage data
  db.exec(`
    CREATE TABLE IF NOT EXISTS ccusage_session_usage (
      ccusage_session_id TEXT PRIMARY KEY,
      total_cost REAL NOT NULL,
      total_tokens INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_creation_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      last_activity TEXT NOT NULL,
      models_used TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export type { Database };
