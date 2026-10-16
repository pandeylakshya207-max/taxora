-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('DRAFT', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('PURCHASE_REGISTER', 'GSTR2B');

-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ReconStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB,
    "summary" JSONB,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "source" "SourceKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "sheetName" TEXT,
    "headerRowIndex" INTEGER NOT NULL,
    "dataStartIndex" INTEGER NOT NULL,
    "headers" JSONB NOT NULL,
    "mapping" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRow" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "importFileId" TEXT NOT NULL,
    "source" "SourceKind" NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "gstin" TEXT NOT NULL,
    "supplierName" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TEXT,
    "docType" "DocKind" NOT NULL,
    "taxable" BIGINT NOT NULL,
    "igst" BIGINT NOT NULL,
    "cgst" BIGINT NOT NULL,
    "sgst" BIGINT NOT NULL,
    "cess" BIGINT NOT NULL,
    "original" JSONB NOT NULL,

    CONSTRAINT "InvoiceRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prRowId" TEXT,
    "b2bRowId" TEXT,
    "flags" TEXT[],
    "reasons" TEXT[],
    "needsReview" BOOLEAN NOT NULL,
    "score" JSONB,
    "diffs" JSONB,
    "relatedIds" TEXT[],
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reconciliation_firmId_createdAt_idx" ON "Reconciliation"("firmId", "createdAt");

-- CreateIndex
CREATE INDEX "Reconciliation_firmId_clientId_period_idx" ON "Reconciliation"("firmId", "clientId", "period");

-- CreateIndex
CREATE INDEX "ImportFile_firmId_sha256_idx" ON "ImportFile"("firmId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_reconciliationId_source_key" ON "ImportFile"("reconciliationId", "source");

-- CreateIndex
CREATE INDEX "InvoiceRow_reconciliationId_source_idx" ON "InvoiceRow"("reconciliationId", "source");

-- CreateIndex
CREATE INDEX "InvoiceRow_firmId_gstin_idx" ON "InvoiceRow"("firmId", "gstin");

-- CreateIndex
CREATE INDEX "MatchResult_reconciliationId_category_idx" ON "MatchResult"("reconciliationId", "category");

-- CreateIndex
CREATE INDEX "MatchResult_reconciliationId_needsReview_idx" ON "MatchResult"("reconciliationId", "needsReview");

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRow" ADD CONSTRAINT "InvoiceRow_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRow" ADD CONSTRAINT "InvoiceRow_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
