/**
 * database.js — SQLite backend using better-sqlite3
 * 
 * Drop-in replacement for the old pg-based database module.
 * Exposes the same `query(sql, params) → { rows, rowCount }` interface
 * so all existing call sites work without structural changes.
 * 
 * Key design decisions:
 *   - WAL mode for concurrent read/write safety during sync
 *   - Foreign keys enabled
 *   - Boolean coercion layer: INTEGER 0/1 → true/false in returned rows
 *   - $1,$2... placeholder translation to ? for better-sqlite3
 */

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

// ── Boolean columns that need 0/1 → true/false coercion ─────────────────────
const BOOLEAN_COLUMNS = new Set([
  'isActive', 'isFolder', 'versioning', 'encryption',
  'isSynced', 'synced', 'useWatcher', 'isSyncing',
]);

function coerceRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (BOOLEAN_COLUMNS.has(key)) {
      if (out[key] === 1) out[key] = true;
      else if (out[key] === 0) out[key] = false;
    }
  }
  return out;
}

// ── Placeholder translation: $1, $2 ... → ? ─────────────────────────────────
function translatePlaceholders(sql) {
  return sql.replace(/\$\d+/g, '?');
}

// ── Detect if a statement is a SELECT / RETURNING / PRAGMA ───────────────────
function isReadQuery(sql) {
  const trimmed = sql.trimStart().toUpperCase();
  return (
    trimmed.startsWith('SELECT') ||
    trimmed.startsWith('PRAGMA') ||
    trimmed.includes('RETURNING')
  );
}

// ── Module state ─────────────────────────────────────────────────────────────
let db = null;

function getDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'cloudvault.db');
  } catch {
    return path.join(__dirname, '..', 'cloudvault.db');
  }
}

function getDb() {
  if (db) return db;
  const dbPath = getDbPath();
  console.log(`[Database] Opening SQLite at: ${dbPath}`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

/**
 * query(sql, params) → { rows: object[], rowCount: number }
 */
function query(sql, params = []) {
  const conn = getDb();
  const translated = translatePlaceholders(sql);

  try {
    if (isReadQuery(sql)) {
      const rows = conn.prepare(translated).all(...params).map(coerceRow);
      return { rows, rowCount: rows.length };
    } else {
      const info = conn.prepare(translated).run(...params);
      return { rows: [], rowCount: info.changes };
    }
  } catch (err) {
    console.error('[Database] Query error:', err.message);
    console.error('[Database] SQL:', sql);
    console.error('[Database] Params:', params);
    throw err;
  }
}

/**
 * queryWithArrayParam — handles ANY($1::text[]) → IN (?, ?, ...)
 */
function queryWithArrayParam(sql, arrayValues, prependParams = []) {
  const conn = getDb();
  const placeholders = arrayValues.map(() => '?').join(', ');
  let translated = sql.replace(/= ANY\(\$\d+::text\[\]\)/gi, `IN (${placeholders})`);
  translated = translatePlaceholders(translated);
  const allParams = [...prependParams, ...arrayValues];

  try {
    if (isReadQuery(sql)) {
      const rows = conn.prepare(translated).all(...allParams).map(coerceRow);
      return { rows, rowCount: rows.length };
    } else {
      const info = conn.prepare(translated).run(...allParams);
      return { rows: [], rowCount: info.changes };
    }
  } catch (err) {
    console.error('[Database] queryWithArrayParam error:', err.message);
    throw err;
  }
}

// ── Safe ALTER TABLE helper ──────────────────────────────────────────────────
function safeAddColumn(table, column, type, defaultVal) {
  const conn = getDb();
  try {
    const colDef = defaultVal !== undefined ? `${type} DEFAULT ${defaultVal}` : type;
    conn.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${colDef};`);
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
}

// ── initDB ───────────────────────────────────────────────────────────────────
const initDB = () => {
  const conn = getDb();
  conn.exec('BEGIN TRANSACTION;');
  try {
    conn.exec(`
      CREATE TABLE IF NOT EXISTS "Tenant" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "createdAt" TEXT DEFAULT (datetime('now')),
        "updatedAt" TEXT DEFAULT (datetime('now'))
      );
    `);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "Account" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "awsAccessKeyId" TEXT,
        "awsSecretAccessKey" TEXT,
        "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
        "isActive" INTEGER DEFAULT 1,
        "createdAt" TEXT DEFAULT (datetime('now')),
        "updatedAt" TEXT DEFAULT (datetime('now'))
      );
    `);
    safeAddColumn('Account', 'awsAccessKeyId', 'TEXT');
    safeAddColumn('Account', 'awsSecretAccessKey', 'TEXT');

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "Bucket" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "region" TEXT NOT NULL,
        "accountId" TEXT NOT NULL REFERENCES "Account"("id"),
        "storageClass" TEXT DEFAULT 'STANDARD',
        "versioning" INTEGER DEFAULT 0,
        "encryption" INTEGER DEFAULT 0,
        "createdAt" TEXT DEFAULT (datetime('now')),
        "updatedAt" TEXT DEFAULT (datetime('now'))
      );
    `);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "FileObject" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "isFolder" INTEGER DEFAULT 0,
        "size" INTEGER,
        "mimeType" TEXT,
        "bucketId" TEXT NOT NULL REFERENCES "Bucket"("id"),
        "parentId" TEXT REFERENCES "FileObject"("id"),
        "createdAt" TEXT DEFAULT (datetime('now')),
        "updatedAt" TEXT DEFAULT (datetime('now')),
        "isSynced" INTEGER DEFAULT 1,
        "lastSyncedAt" TEXT,
        "remoteEtag" TEXT,
        "localEtag" TEXT,
        "syncStatus" TEXT DEFAULT 'Synced',
        "lastModifiedOs" TEXT
      );
    `);
    safeAddColumn('FileObject', 'remoteEtag', 'TEXT');
    safeAddColumn('FileObject', 'localEtag', 'TEXT');
    safeAddColumn('FileObject', 'syncStatus', 'TEXT', "'Synced'");
    safeAddColumn('FileObject', 'lastModifiedOs', 'TEXT');

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "SyncState" (
        "id" TEXT PRIMARY KEY,
        "resourceId" TEXT UNIQUE NOT NULL,
        "lastSyncTimestamp" TEXT,
        "status" TEXT
      );
    `);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "LocalSyncActivity" (
        "id" TEXT PRIMARY KEY,
        "action" TEXT NOT NULL,
        "fileName" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "error" TEXT,
        "createdAt" TEXT DEFAULT (datetime('now')),
        "synced" INTEGER DEFAULT 0,
        "syncJobId" TEXT,
        "configId" TEXT
      );
    `);
    safeAddColumn('LocalSyncActivity', 'syncJobId', 'TEXT');
    safeAddColumn('LocalSyncActivity', 'configId', 'TEXT');

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "SyncConfig" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "intervalMinutes" INTEGER NOT NULL,
        "isActive" INTEGER DEFAULT 1,
        "useWatcher" INTEGER DEFAULT 1,
        "createdAt" TEXT DEFAULT (datetime('now')),
        "updatedAt" TEXT DEFAULT (datetime('now')),
        "lastSync" TEXT,
        "direction" TEXT DEFAULT 'DOWNLOAD',
        "isSyncing" INTEGER DEFAULT 0
      );
    `);
    safeAddColumn('SyncConfig', 'useWatcher', 'INTEGER', '1');
    safeAddColumn('SyncConfig', 'direction', 'TEXT', "'DOWNLOAD'");
    safeAddColumn('SyncConfig', 'isSyncing', 'INTEGER', '0');

    conn.exec(`UPDATE "SyncConfig" SET "isSyncing" = 0 WHERE "isSyncing" = 1;`);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "SyncMapping" (
        "id" TEXT PRIMARY KEY,
        "configId" TEXT NOT NULL REFERENCES "SyncConfig"("id") ON DELETE CASCADE,
        "localPath" TEXT NOT NULL,
        "bucketId" TEXT NOT NULL,
        "createdAt" TEXT DEFAULT (datetime('now'))
      );
    `);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS "SyncJob" (
        "id" TEXT PRIMARY KEY,
        "configId" TEXT NOT NULL REFERENCES "SyncConfig"("id") ON DELETE CASCADE,
        "status" TEXT NOT NULL,
        "startTime" TEXT DEFAULT (datetime('now')),
        "endTime" TEXT,
        "filesHandled" INTEGER DEFAULT 0,
        "error" TEXT
      );
    `);

    conn.exec(`DELETE FROM "LocalSyncActivity" WHERE action = 'SKIP';`);

    conn.exec(`
      DELETE FROM "LocalSyncActivity"
      WHERE rowid NOT IN (
        SELECT rowid FROM (
          SELECT rowid, ROW_NUMBER() OVER (
            PARTITION BY action, "fileName", status
            ORDER BY "createdAt" DESC
          ) AS rn
          FROM "LocalSyncActivity"
        ) WHERE rn = 1
      );
    `);

    conn.exec(`
      DELETE FROM "LocalSyncActivity"
      WHERE "createdAt" < datetime('now', '-7 days');
    `);

    // ── HeartbeatLog table for Doctor Tab ───────────────────────────────────
    conn.exec(`
      CREATE TABLE IF NOT EXISTS "HeartbeatLog" (
        "id" TEXT PRIMARY KEY,
        "timestamp" TEXT DEFAULT (datetime('now')),
        "status" TEXT NOT NULL,
        "latencyMs" INTEGER,
        "error" TEXT,
        "serverTime" TEXT
      );
    `);

    // ── AgentHeartbeatLog table for local agent health checks ────────────
    conn.exec(`
      CREATE TABLE IF NOT EXISTS "AgentHeartbeatLog" (
        "id" TEXT PRIMARY KEY,
        "timestamp" TEXT DEFAULT (datetime('now')),
        "status" TEXT NOT NULL,
        "latencyMs" INTEGER,
        "error" TEXT
      );
    `);

    // Prune agent heartbeat logs older than 24 hours
    conn.exec(`
      DELETE FROM "AgentHeartbeatLog"
      WHERE "timestamp" < datetime('now', '-24 hours');
    `);

    // Prune heartbeat logs older than 24 hours
    conn.exec(`
      DELETE FROM "HeartbeatLog"
      WHERE "timestamp" < datetime('now', '-24 hours');
    `);

    // ── DiagnosticsLog table — persists last run results ─────────────────────
    conn.exec(`
      CREATE TABLE IF NOT EXISTS "DiagnosticsLog" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "detail" TEXT,
        "durationMs" INTEGER,
        "data" TEXT,
        "ranAt" TEXT DEFAULT (datetime('now'))
      );
    `);

    // ── KVStore — generic key/value store for agent state ────────────────────
    // Used for: lastFullSyncAt (incremental sync cursor), etc.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS "KVStore" (
        "key" TEXT PRIMARY KEY,
        "value" TEXT NOT NULL,
        "updatedAt" TEXT DEFAULT (datetime('now'))
      );
    `);

    conn.exec('COMMIT;');
    console.log('[Database] SQLite initialized successfully');
  } catch (e) {
    conn.exec('ROLLBACK;');
    console.error('[Database] Initialization failed:', e);
    throw e;
  }
};

const closeDB = () => {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] Connection closed');
  }
};

/**
 * Wipe all user data tables on logout.
 * Preserves schema (tables remain), just deletes all rows.
 * Order respects FK constraints (children before parents).
 */
const wipeAllData = () => {
  const conn = getDb();
  conn.exec('BEGIN TRANSACTION;');
  try {
    const tables = [
      'LocalSyncActivity', 'SyncJob', 'SyncMapping', 'SyncConfig',
      'SyncState', 'FileObject', 'Bucket', 'Account', 'Tenant',
    ];
    for (const t of tables) {
      conn.exec(`DELETE FROM "${t}";`);
    }
    conn.exec('COMMIT;');
    console.log('[Database] All data wiped on logout');
  } catch (e) {
    conn.exec('ROLLBACK;');
    console.error('[Database] Wipe failed:', e);
    throw e;
  }
};

module.exports = {
  query,
  queryWithArrayParam,
  initDB,
  closeDB,
  wipeAllData,
  getDb,
};
