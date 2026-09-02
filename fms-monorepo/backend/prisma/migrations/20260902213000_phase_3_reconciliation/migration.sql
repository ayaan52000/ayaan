-- Add reconciliation ledger entry types.
ALTER TYPE "LedgerEntryType" ADD VALUE 'REFUND';
ALTER TYPE "LedgerEntryType" ADD VALUE 'ADJUSTMENT';
