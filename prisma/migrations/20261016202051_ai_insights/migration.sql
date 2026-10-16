-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInsight_firmId_scope_targetId_createdAt_idx" ON "AiInsight"("firmId", "scope", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInsight_firmId_createdAt_idx" ON "AiInsight"("firmId", "createdAt");
