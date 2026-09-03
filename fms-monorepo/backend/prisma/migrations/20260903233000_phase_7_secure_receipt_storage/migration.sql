-- Preserve existing values while changing their meaning from a public URL to a private storage key.
ALTER TABLE "Expense" RENAME COLUMN "receiptUrl" TO "receiptKey";
