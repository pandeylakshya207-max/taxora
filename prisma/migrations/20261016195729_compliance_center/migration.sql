-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "DueDateSource" AS ENUM ('RULE', 'MANUAL');

-- CreateTable
CREATE TABLE "DueDateRule" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "monthOffset" INTEGER NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DueDateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceTask" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "period" TEXT,
    "dueDate" TEXT NOT NULL,
    "dueDateSource" "DueDateSource" NOT NULL,
    "sourceNote" TEXT,
    "ruleId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "notes" TEXT,
    "reconciliationId" TEXT,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DueDateRule_firmId_active_idx" ON "DueDateRule"("firmId", "active");

-- CreateIndex
CREATE INDEX "ComplianceTask_firmId_status_dueDate_idx" ON "ComplianceTask"("firmId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ComplianceTask_firmId_clientId_idx" ON "ComplianceTask"("firmId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceTask_firmId_ruleId_clientId_period_key" ON "ComplianceTask"("firmId", "ruleId", "clientId", "period");

-- AddForeignKey
ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DueDateRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
