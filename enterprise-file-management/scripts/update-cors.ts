
import * as dotenv from "dotenv";
dotenv.config();

import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { Client } from "pg";

// Dynamic import to ensure env is loaded first
(async () => {
    const { decrypt } = await import("../lib/encryption");

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();

        // 1. Get the bucket and account
        const bucketName = "storage-browser-test-7t8hu"; // Target bucket

        const query = `
            SELECT b.name, b.region, a."awsAccessKeyId", a."awsSecretAccessKey"
            FROM "Bucket" b
            JOIN "Account" a ON b."accountId" = a.id
            WHERE b.name = $1
        `;

        const res = await client.query(query, [bucketName]);

        if (res.rows.length === 0) {
            console.error("Bucket or account not found");
            return;
        }

        const row = res.rows[0];

        // 2. Initialize S3 Client
        const s3 = new S3Client({
            region: row.region,
            credentials: {
                accessKeyId: decrypt(row.awsAccessKeyId),
                secretAccessKey: decrypt(row.awsSecretAccessKey),
            },
        });

        // 3. Define CORS Rules
        const corsParams = {
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["PUT", "POST", "DELETE", "GET", "HEAD"],
                        AllowedOrigins: ["http://localhost:3000", "http://localhost:3001"],
                        ExposeHeaders: ["ETag", "x-amz-server-side-encryption"],
                        MaxAgeSeconds: 3000,
                    },
                ],
            },
        };

        // 4. Send Command
        console.log("Updating CORS for", bucketName);
        const data = await s3.send(new PutBucketCorsCommand(corsParams));
        console.log("Success", data);

    } catch (err) {
        console.error("Error", err);
    } finally {
        await client.end();
    }
})();
