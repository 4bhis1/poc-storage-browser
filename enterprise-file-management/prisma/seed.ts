/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CloudVault Enterprise — Database Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * USAGE:
 *   npx prisma db seed
 * OR directly:
 *   npx tsx prisma/seed.ts
 *
 * IMPORTANT:
 *  - This script is IDEMPOTENT — safe to run multiple times.
 *    It uses upsert/findFirstOrCreate patterns to avoid duplicates.
 *  - It does NOT drop or clear existing data (no deleteMany calls).
 *  - It does NOT create real AWS S3 buckets — only database records.
 *  - Users created here must also be created in AWS Cognito
 *    (via the app's "Invite User" flow) before they can log in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Upsert a tenant by name. Returns existing or newly created tenant. */
async function upsertTenant(name: string) {
  let tenant = await prisma.tenant.findFirst({ where: { name } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name } });
    console.log(`  ✅ Created tenant: ${name}`);
  } else {
    console.log(`  ⏭️  Tenant already exists: ${name}`);
  }
  return tenant;
}

/** Upsert an account by name within a tenant. */
async function upsertAccount(name: string, tenantId: string) {
  let account = await prisma.account.findFirst({ where: { name, tenantId } });
  if (!account) {
    account = await prisma.account.create({ data: { name, tenantId } });
    console.log(`  ✅ Created account: ${name}`);
  } else {
    console.log(`  ⏭️  Account already exists: ${name}`);
  }
  return account;
}

/** Upsert a user by email. Role and tenantId are only set on creation. */
async function upsertUser(
  email: string,
  name: string,
  role: "PLATFORM_ADMIN" | "TENANT_ADMIN" | "TEAMMATE",
  tenantId?: string,
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  ⏭️  User already exists: ${email}`);
    return existing;
  }
  const user = await prisma.user.create({
    data: { email, name, role, tenantId },
  });
  console.log(`  ✅ Created user: ${email} (${role})`);
  return user;
}

/** Upsert a bucket by name within an account. Only creates DB record, NOT an S3 bucket. */
async function upsertBucket(
  name: string,
  region: string,
  accountId: string,
  tenantId: string,
) {
  let bucket = await prisma.bucket.findFirst({ where: { name } });
  if (!bucket) {
    bucket = await prisma.bucket.create({
      data: { name, region, accountId, tenantId, tags: ["seeded"] },
    });
    console.log(`  ✅ Created bucket record: ${name}`);
  } else {
    console.log(`  ⏭️  Bucket already exists: ${name}`);
  }
  return bucket;
}

/** Upsert a team by name within a tenant. */
async function upsertTeam(name: string, tenantId: string) {
  let team = await prisma.team.findFirst({
    where: { name, tenantId, isDeleted: false },
  });
  if (!team) {
    team = await prisma.team.create({ data: { name, tenantId } });
    console.log(`  ✅ Created team: ${name}`);
  } else {
    console.log(`  ⏭️  Team already exists: ${name}`);
  }
  return team;
}

/** Add a user to a team (resurrects soft-deleted membership if it exists). */
async function upsertTeamMembership(userId: string, teamId: string) {
  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId, teamId } },
    update: { isDeleted: false },
    create: { userId, teamId },
  });
}

/** Upsert a team-level resource policy for a specific bucket. */
async function upsertTeamBucketPolicy(
  teamId: string,
  bucketId: string,
  actions: string[],
) {
  const existing = await prisma.resourcePolicy.findFirst({
    where: { teamId, resourceType: "Bucket", resourceId: bucketId },
  });
  if (!existing) {
    await prisma.resourcePolicy.create({
      data: { teamId, resourceType: "Bucket", resourceId: bucketId, actions },
    });
    console.log(
      `  ✅ Created team policy for bucket: ${bucketId} → [${actions.join(", ")}]`,
    );
  } else {
    // Update actions in case they changed
    await prisma.resourcePolicy.update({
      where: { id: existing.id },
      data: { actions },
    });
    console.log(
      `  ⏭️  Updated team policy for bucket: ${bucketId} → [${actions.join(", ")}]`,
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱 CloudVault Enterprise — Seeding database...\n");

  // ── 1. Platform Admin (no tenant) ────────────────────────────────────────
  console.log("👤 Seeding platform admin...");
  await upsertUser("admin@fms.com", "Platform Admin", "PLATFORM_ADMIN");

  // ── 2. Demo Tenant ───────────────────────────────────────────────────────
  console.log("\n🏢 Seeding demo tenant...");
  const tenant = await upsertTenant("TestingTenant");
  const account = await upsertAccount("Default AWS Account", tenant.id);

  // ── 3. Tenant Users ───────────────────────────────────────────────────────
  console.log("\n👥 Seeding tenant users...");
  const tenantAdmin = await upsertUser(
    "absk8634@gmail.com",
    "Tenant Admin",
    "TENANT_ADMIN",
    tenant.id,
  );
  const teammate = await upsertUser(
    "kumar.abhishk2510@gmail.com",
    "Kumar Abhishek",
    "TEAMMATE",
    tenant.id,
  );

  // ── 4. Buckets (DB records only — real S3 buckets must exist separately) ─
  console.log("\n🪣 Seeding bucket records...");
  const bucket1 = await upsertBucket(
    "fms-testingtenet-bucket-test-permission-bucket",
    "ap-south-1",
    account.id,
    tenant.id,
  );
  const bucket2 = await upsertBucket(
    "file-managment-system-smc-web-app",
    "ap-south-1",
    account.id,
    tenant.id,
  );

  // ── 5. Teams ──────────────────────────────────────────────────────────────
  console.log("\n👨‍👩‍👦 Seeding teams...");
  const engineeringTeam = await upsertTeam("Engineering", tenant.id);

  // ── 6. Team Memberships ──────────────────────────────────────────────────
  console.log("\n🔗 Seeding team memberships...");
  await upsertTeamMembership(teammate.id, engineeringTeam.id);
  console.log(`  ✅ Added ${teammate.email} → Engineering`);

  // ── 7. Team Policies (granular bucket access) ─────────────────────────────
  console.log("\n🛡️  Seeding team policies...");
  // Engineering team: full access to bucket1, NO access to bucket2
  await upsertTeamBucketPolicy(engineeringTeam.id, bucket1.id, [
    "READ",
    "WRITE",
    "DELETE",
    "SHARE",
    "DOWNLOAD",
  ]);

  console.log(`
✨ Seeding complete!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEEDED ACCOUNTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Platform Admin  : admin@fms.com
 Tenant Admin    : absk8634@gmail.com
 Teammate        : kumar.abhishk2510@gmail.com

 NOTE: These users must also exist in AWS Cognito
       with the matching custom:role attribute.
       Use the app's "Invite User" flow to ensure
       Cognito and the database stay in sync.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEEDED STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Tenant          : TestingTenant
 Account         : Default AWS Account
 Buckets         : fms-testingtenet-bucket-test-permission-bucket
                   file-managment-system-smc-web-app
 Team            : Engineering
   Members       : kumar.abhishk2510@gmail.com
   Policies      : READ, WRITE, DELETE, SHARE, DOWNLOAD
                   → fms-testingtenet-bucket-test-permission-bucket
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
