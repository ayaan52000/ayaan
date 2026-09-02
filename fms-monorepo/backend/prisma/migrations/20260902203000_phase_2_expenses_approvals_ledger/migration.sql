-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "cashAdvanceId" TEXT,
ADD COLUMN "receiptUrl" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_cashAdvanceId_level_key" ON "ApprovalStep"("cashAdvanceId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_expenseId_level_key" ON "ApprovalStep"("expenseId", "level");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashAdvanceId_fkey"
FOREIGN KEY ("cashAdvanceId") REFERENCES "CashAdvance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
