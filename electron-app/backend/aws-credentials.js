/**
 * backend/aws-credentials.js
 * Manages short-lived AWS credentials from the enterprise backend.
 * 
 * Replaces the old pattern of:
 *   - Storing long-term IAM credentials in DB
 *   - Decrypting them locally
 * 
 * With:
 *   - Requesting temporary STS credentials from /api/agent/credentials
 *   - Caching them until 5 minutes before expiry
 *   - Auto-refreshing when needed
 */

const axios = require('axios');
const authManager = require('./auth');

const API_URL = require('./config').ENTERPRISE_URL;

class CredentialManager {
    constructor() {
        // Map: accountId → { credentials, expiration }
        this.cache = new Map();
    }

    /**
     * Get AWS credentials for a specific account.
     * Returns cached credentials if still valid (>5 min remaining).
     * Otherwise fetches fresh credentials from the backend.
     * 
     * @param {string} accountId - Account ID (optional, backend auto-detects if omitted)
     * @returns {Promise<{accessKeyId, secretAccessKey, sessionToken, region}>}
     */
    async getCredentials(accountId = null) {
        const cacheKey = accountId || 'default';
        const cached = this.cache.get(cacheKey);

        // Return cached if valid for >5 minutes
        if (cached && cached.expiration - Date.now() > 5 * 60 * 1000) {
            console.log(`[CredentialManager] Using cached credentials for ${cacheKey} (expires in ${Math.round((cached.expiration - Date.now()) / 60000)} min)`);
            return cached.credentials;
        }

        // Fetch fresh credentials
        console.log(`[CredentialManager] Fetching fresh credentials for ${cacheKey}...`);
        const token = authManager.getToken();
        
        if (!token) {
            throw new Error('No authentication token available. Please log in first.');
        }

        try {
            const response = await axios.post(
                `${API_URL}/api/agent/credentials`,
                accountId ? { accountId } : {},
                {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 15000,
                }
            );

            const { accessKeyId, secretAccessKey, sessionToken, region, expiration, accountName } = response.data;

            console.log(`[CredentialManager] Received credentials for account: ${accountName} (expires: ${expiration})`);

            // Cache credentials
            this.cache.set(cacheKey, {
                credentials: { accessKeyId, secretAccessKey, sessionToken, region },
                expiration: new Date(expiration).getTime(),
            });

            return this.cache.get(cacheKey).credentials;

        } catch (error) {
            if (error.response?.status === 401) {
                console.error('[CredentialManager] Authentication failed - token may be expired');
                throw new Error('Authentication expired. Please log in again.');
            } else if (error.response?.status === 403) {
                console.error('[CredentialManager] Access denied - bot may be revoked');
                throw new Error('Access denied. Your bot may have been revoked.');
            } else if (error.response?.status === 404) {
                console.error('[CredentialManager] No AWS account found');
                throw new Error('No AWS account configured for your tenant.');
            } else {
                console.error('[CredentialManager] Failed to fetch credentials:', error.message);
                throw new Error(`Failed to fetch AWS credentials: ${error.message}`);
            }
        }
    }

    /**
     * Clear all cached credentials (e.g., on logout)
     */
    clear() {
        this.cache.clear();
        console.log('[CredentialManager] Credential cache cleared');
    }

    /**
     * Get credentials for a specific bucket by looking up its account
     * @param {string} bucketId - Bucket ID from local DB
     * @returns {Promise<{accessKeyId, secretAccessKey, sessionToken, region}>}
     */
    async getCredentialsForBucket(bucketId) {
        const database = require('./database');
        const result = await database.query(
            'SELECT b."accountId", a.name FROM "Bucket" b JOIN "Account" a ON b."accountId" = a.id WHERE b.id = $1',
            [bucketId]
        );

        if (result.rows.length === 0) {
            throw new Error(`Bucket ${bucketId} not found in local database`);
        }

        const accountId = result.rows[0].accountId;
        return await this.getCredentials(accountId);
    }
}

module.exports = new CredentialManager();
