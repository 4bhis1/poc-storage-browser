const { Pool } = require('pg');
const { createTenantTable, createAccountTable } = require('./db_queries');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'agent_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'agent_db',
  password: process.env.DB_PASSWORD || 'agent_password',
  port: parseInt(process.env.DB_PORT || '5434'),
});

const query = (text, params) => pool.query(text, params);

const initDB = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Tenants
        await client.query(createTenantTable);

        // Accounts
        await client.query(createAccountTable);
        // Handle migration if table already existed
        await client.query(`ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "awsAccessKeyId" TEXT;`);
        await client.query(`ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "awsSecretAccessKey" TEXT;`);

        // Buckets
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Bucket" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "region" TEXT NOT NULL,
                "accountId" TEXT NOT NULL REFERENCES "Account"("id"),
                "storageClass" TEXT DEFAULT 'STANDARD',
                "versioning" BOOLEAN DEFAULT false,
                "encryption" BOOLEAN DEFAULT false,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // FileObjects
        await client.query(`
            CREATE TABLE IF NOT EXISTS "FileObject" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "key" TEXT NOT NULL,
                "isFolder" BOOLEAN DEFAULT false,
                "size" BIGINT,
                "mimeType" TEXT,
                "bucketId" TEXT NOT NULL REFERENCES "Bucket"("id"),
                "parentId" TEXT REFERENCES "FileObject"("id"),
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "isSynced" BOOLEAN DEFAULT true, 
                "lastSyncedAt" TIMESTAMP
            );
        `);

        // Sync State
        await client.query(`
            CREATE TABLE IF NOT EXISTS "SyncState" (
                "id" TEXT PRIMARY KEY,
                "resourceId" TEXT UNIQUE NOT NULL,
                "lastSyncTimestamp" TIMESTAMP,
                "status" TEXT
            );
        `);

        // Local Sync Activity log — activities written here first, then flushed to Global DB
        await client.query(`
            CREATE TABLE IF NOT EXISTS "LocalSyncActivity" (
                "id" TEXT PRIMARY KEY,
                "action" TEXT NOT NULL,
                "fileName" TEXT NOT NULL,
                "status" TEXT NOT NULL,
                "error" TEXT,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "synced" BOOLEAN DEFAULT false,
                "syncJobId" TEXT,
                "configId" TEXT
            );
        `);
        await client.query(`ALTER TABLE "LocalSyncActivity" ADD COLUMN IF NOT EXISTS "syncJobId" TEXT;`);
        await client.query(`ALTER TABLE "LocalSyncActivity" ADD COLUMN IF NOT EXISTS "configId" TEXT;`);
        
        // Configurable Syncs
        await client.query(`
            CREATE TABLE IF NOT EXISTS "SyncConfig" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "intervalMinutes" INTEGER NOT NULL,
                "isActive" BOOLEAN DEFAULT true,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "lastSync" TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS "SyncMapping" (
                "id" TEXT PRIMARY KEY,
                "configId" TEXT NOT NULL REFERENCES "SyncConfig"("id") ON DELETE CASCADE,
                "localPath" TEXT NOT NULL,
                "bucketId" TEXT NOT NULL,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS "SyncJob" (
                "id" TEXT PRIMARY KEY,
                "configId" TEXT NOT NULL REFERENCES "SyncConfig"("id") ON DELETE CASCADE,
                "status" TEXT NOT NULL,
                "startTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "endTime" TIMESTAMP,
                "filesHandled" INTEGER DEFAULT 0,
                "error" TEXT
            );
        `);

        // Cleanup: remove SKIP entries (they are noise) and old duplicate failures
        await client.query(`DELETE FROM "LocalSyncActivity" WHERE action = 'SKIP';`);

        // Keep only the latest row per (action, fileName, status) — remove older duplicates
        await client.query(`
            DELETE FROM "LocalSyncActivity"
            WHERE id NOT IN (
                SELECT DISTINCT ON (action, "fileName", status) id
                FROM "LocalSyncActivity"
                ORDER BY action, "fileName", status, "createdAt" DESC
            );
        `);

        // Remove entries older than 7 days
        await client.query(`
            DELETE FROM "LocalSyncActivity"
            WHERE "createdAt" < NOW() - INTERVAL '7 days';
        `);

        await client.query('COMMIT');
        console.log('[Database] Initialized Successfully');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('[Database] Initialization Failed', e);
        throw e;
    } finally {
        client.release();
    }
};

const closeDB = async () => {
    await pool.end();
    console.log('[Database] Pool closed');
};

module.exports = { 
    query, 
    initDB, 
    closeDB,
    pool 
};
