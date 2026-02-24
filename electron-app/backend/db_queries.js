export const createTenantTable = `
            CREATE TABLE IF NOT EXISTS "Tenant" (
                "id" TEXT PRIMARY KEY,
                "name" TEXT NOT NULL,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

export const createAccountTable = `
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
        `;