import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logAction } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);
function accessScope(user) { return localRoles.has(user.role) ? { branchId: user.branchId ?? "__no_branch__" } : {}; }

router.use(authenticate);

router.get("/:id/reconciliation-summary", async (req, res, next) => {
  try {
    const advance = await prisma.cashAdvance.findFirst({
      where: { id: req.params.id, ...accessScope(req.user) },
      include: { expenses: { select: { id: true, amount: true, status: true, description: true } }, ledgerEntries: { orderBy: { createdAt: "asc" } }, branch: { select: { name: true, code: true } } },
    });
    if (!advance) return res.status(404).json({ error: "Cash advance not found" });
    const approvedTotal = advance.expenses.filter((item) => item.status === "APPROVED").reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    res.json({ id: advance.id, status: advance.status, branch: advance.branch, disbursedAmount: advance.amount, totalApprovedExpenses: approvedTotal, variance: new Prisma.Decimal(advance.amount).minus(approvedTotal), hasPendingExpenses: advance.expenses.some((item) => item.status === "PENDING"), expenses: advance.expenses, ledgerEntries: advance.ledgerEntries });
  } catch (error) { next(error); }
});

router.patch("/:id/settle", requirePermission("WRITE_LEDGER"), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const advance = await tx.cashAdvance.findUnique({ where: { id: req.params.id }, include: { expenses: true } });
      if (!advance) return null;
      if (advance.status !== "DISBURSED") throw Object.assign(new Error("Only disbursed advances can be settled"), { statusCode: 409 });
      if (advance.expenses.some((item) => item.status === "PENDING")) throw Object.assign(new Error("All linked expenses must be approved or rejected before settlement"), { statusCode: 409 });
      const approvedTotal = advance.expenses.filter((item) => item.status === "APPROVED").reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      const variance = new Prisma.Decimal(advance.amount).minus(approvedTotal);
      const latest = await tx.ledgerEntry.findFirst({ where: { branchId: advance.branchId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      let reconciliationEntry = null;
      if (!variance.isZero()) {
        const isRefund = variance.isPositive();
        const amount = variance.abs();
        const runningBalance = new Prisma.Decimal(latest?.runningBalance ?? 0)[isRefund ? "plus" : "minus"](amount);
        reconciliationEntry = await tx.ledgerEntry.create({ data: { type: isRefund ? "REFUND" : "ADJUSTMENT", amount, runningBalance, description: isRefund ? `Unspent cash returned: ${advance.purpose}` : `Overspend adjustment: ${advance.purpose}`, branchId: advance.branchId, createdById: req.user.id, cashAdvanceId: advance.id } });
      }
      const claimed = await tx.cashAdvance.updateMany({ where: { id: advance.id, status: "DISBURSED" }, data: { status: "SETTLED" } });
      if (claimed.count !== 1) throw Object.assign(new Error("Cash advance settlement state changed; retry"), { statusCode: 409 });
      await logAction(req.user.id, "CASH_ADVANCE_SETTLED", "CashAdvance", advance.id, { disbursedAmount: advance.amount.toString(), approvedExpenses: approvedTotal.toString(), variance: variance.toString(), ledgerEntryId: reconciliationEntry?.id ?? null }, tx);
      return { id: advance.id, status: "SETTLED", disbursedAmount: advance.amount, totalApprovedExpenses: approvedTotal, variance, ledgerEntry: reconciliationEntry };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result) return res.status(404).json({ error: "Cash advance not found" });
    res.json(result);
  } catch (error) { next(error); }
});

export default router;
