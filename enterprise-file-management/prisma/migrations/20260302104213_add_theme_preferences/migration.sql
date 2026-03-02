-- AlterTable
ALTER TABLE "User" ADD COLUMN     "themeColor" TEXT NOT NULL DEFAULT 'blue',
ADD COLUMN     "themeFont" TEXT NOT NULL DEFAULT 'inter',
ADD COLUMN     "themeMode" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "themeRadius" TEXT NOT NULL DEFAULT '0.3';
