CREATE TYPE "NotificationType" AS ENUM ('APPROVAL_PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'SETTLED');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");
CREATE INDEX "ApprovalStep_approverId_idx" ON "ApprovalStep"("approverId");
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");
CREATE INDEX "CashAdvance_branchId_status_idx" ON "CashAdvance"("branchId", "status");
CREATE INDEX "CashAdvance_createdAt_idx" ON "CashAdvance"("createdAt");
CREATE INDEX "CashAdvance_requesterId_idx" ON "CashAdvance"("requesterId");
CREATE INDEX "Expense_branchId_status_idx" ON "Expense"("branchId", "status");
CREATE INDEX "Expense_categoryId_expenseDate_status_idx" ON "Expense"("categoryId", "expenseDate", "status");
CREATE INDEX "Expense_cashAdvanceId_idx" ON "Expense"("cashAdvanceId");
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");
CREATE INDEX "ExpenseCategory_isActive_idx" ON "ExpenseCategory"("isActive");
CREATE INDEX "LedgerEntry_branchId_createdAt_idx" ON "LedgerEntry"("branchId", "createdAt");
CREATE INDEX "LedgerEntry_cashAdvanceId_idx" ON "LedgerEntry"("cashAdvanceId");
CREATE INDEX "LedgerEntry_expenseId_idx" ON "LedgerEntry"("expenseId");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
