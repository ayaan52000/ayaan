CREATE TYPE "ApprovalEntityType" AS ENUM ('CASH_ADVANCE', 'EXPENSE');
ALTER TABLE "CashAdvance" ADD COLUMN "approvalChain" JSONB;
ALTER TABLE "Expense" ADD COLUMN "approvalChain" JSONB;
CREATE TABLE "ApprovalRule" (
  "id" TEXT NOT NULL,
  "entityType" "ApprovalEntityType" NOT NULL,
  "level" INTEGER NOT NULL,
  "approverRole" "Role" NOT NULL,
  "branchId" TEXT,
  "categoryId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRule_level_check" CHECK ("level" > 0),
  CONSTRAINT "ApprovalRule_cash_advance_category_check" CHECK ("entityType" = 'EXPENSE' OR "categoryId" IS NULL)
);
CREATE INDEX "ApprovalRule_entityType_branchId_categoryId_isActive_level_idx" ON "ApprovalRule"("entityType", "branchId", "categoryId", "isActive", "level");
CREATE INDEX "ApprovalRule_branchId_idx" ON "ApprovalRule"("branchId");
CREATE INDEX "ApprovalRule_categoryId_idx" ON "ApprovalRule"("categoryId");
CREATE UNIQUE INDEX "ApprovalRule_active_scope_level_key" ON "ApprovalRule"("entityType", COALESCE("branchId", ''), COALESCE("categoryId", ''), "level") WHERE "isActive" = true;

INSERT INTO "ApprovalRule" ("id", "entityType", "level", "approverRole", "isActive", "createdAt", "updatedAt") VALUES
  ('default_cash_advance_level_1', 'CASH_ADVANCE', 1, 'ACCOUNTS_HEAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default_cash_advance_level_2', 'CASH_ADVANCE', 2, 'FINANCE_HEAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default_expense_level_1', 'EXPENSE', 1, 'BRANCH_MANAGER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default_expense_level_2', 'EXPENSE', 2, 'ACCOUNTS_HEAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
