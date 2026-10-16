-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "finalNote" TEXT,
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "finalizedById" TEXT;
