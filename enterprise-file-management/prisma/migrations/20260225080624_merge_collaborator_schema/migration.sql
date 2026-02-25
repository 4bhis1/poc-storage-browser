/*
  Warnings:

  - You are about to drop the column `createdBy` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[cognitoSub]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEAM_ADMIN';

-- DropForeignKey
ALTER TABLE "ResourcePolicy" DROP CONSTRAINT "ResourcePolicy_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_updatedBy_fkey";

-- AlterTable
ALTER TABLE "ResourcePolicy" ADD COLUMN     "teamId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy",
ADD COLUMN     "cognitoSub" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncHistory" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "syncedFiles" INTEGER NOT NULL DEFAULT 0,
    "failedFiles" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncActivity" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_userId_teamId_key" ON "TeamMembership"("userId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "User_cognitoSub_key" ON "User"("cognitoSub");

-- AddForeignKey
ALTER TABLE "ResourcePolicy" ADD CONSTRAINT "ResourcePolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePolicy" ADD CONSTRAINT "ResourcePolicy_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncActivity" ADD CONSTRAINT "SyncActivity_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "SyncHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
