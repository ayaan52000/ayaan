CREATE TYPE "FundStatus" AS ENUM ('ACTIVE', 'CLOSED');
ALTER TYPE "LedgerEntryType" ADD VALUE 'FUND_DEPOSIT';
ALTER TYPE "NotificationType" ADD VALUE 'FUND_THRESHOLD';

CREATE TABLE "Fund" (
  "id" TEXT NOT NULL,
  "donorName" TEXT NOT NULL,
  "grantName" TEXT NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "FundStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FundAllocation" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "allocatedAmount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundAllocation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CashAdvance" ADD COLUMN "fundId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "fundId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "fundId" TEXT;
CREATE UNIQUE INDEX "FundAllocation_fundId_branchId_key" ON "FundAllocation"("fundId", "branchId");
CREATE INDEX "Fund_status_startDate_endDate_idx" ON "Fund"("status", "startDate", "endDate");
CREATE INDEX "Fund_donorName_idx" ON "Fund"("donorName");
CREATE INDEX "Fund_createdById_idx" ON "Fund"("createdById");
CREATE INDEX "FundAllocation_branchId_idx" ON "FundAllocation"("branchId");
CREATE INDEX "CashAdvance_fundId_idx" ON "CashAdvance"("fundId");
CREATE INDEX "Expense_fundId_idx" ON "Expense"("fundId");
CREATE INDEX "LedgerEntry_fundId_idx" ON "LedgerEntry"("fundId");
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundAllocation" ADD CONSTRAINT "FundAllocation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundAllocation" ADD CONSTRAINT "FundAllocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvance" ADD CONSTRAINT "CashAdvance_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
