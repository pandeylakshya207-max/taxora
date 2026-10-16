-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('DRAFT', 'SENT', 'RESOLVED');

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "matchResultIds" TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUp_firmId_supplierGstin_idx" ON "FollowUp"("firmId", "supplierGstin");

-- CreateIndex
CREATE INDEX "FollowUp_firmId_clientId_idx" ON "FollowUp"("firmId", "clientId");
