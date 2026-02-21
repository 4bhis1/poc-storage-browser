const { Pool } = require('pg');
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
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Tenant" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Accounts
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Account" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "awsAccessKeyId" TEXT,
                "awsSecretAccessKey" TEXT,
                "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
                "isActive" BOOLEAN DEFAULT true,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
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
