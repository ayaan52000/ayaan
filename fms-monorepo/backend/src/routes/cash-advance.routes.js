import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertNextApprover, getApprovalChain, getEffectiveApprovalChain, nextApproval } from "../lib/approvalChains.js";
import { logAction } from "../lib/audit.js";
import { createNotification, notifyRole } from "../lib/notify.js";
import { fundTotals, notifyFundThreshold } from "../lib/funds.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);
const createSchema = z.object({
  branchId: z.string().min(1),
  amount: z.coerce.number().positive().max(999999999999.99),
  purpose: z.string().trim().min(3).max(500),
  fundId: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
});
const decisionSchema = z.object({ comment: z.string().trim().max(500).optional() });
const includeDetails = {
  branch: { select: { id: true, name: true, code: true } },
  requester: { select: { id: true, name: true, email: true } },
  approvalSteps: {
    orderBy: { level: "asc" },
    include: { approver: { select: { id: true, name: true, role: true } } },
  },
  fund: { select: { id: true, donorName: true, grantName: true, currency: true, status: true } },
};

function scopeFor(user) {
  return localRoles.has(user.role) ? { branchId: user.branchId ?? "__no_branch__" } : {};
}

router.use(authenticate);

router.post("/", requirePermission("CREATE_CASH_ADVANCE"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid cash advance data", details: parsed.error.flatten() });
    if (!req.user.branchId || parsed.data.branchId !== req.user.branchId) {
      return res.status(403).json({ error: "You can only request an advance for your own branch" });
    }
    const branch = await prisma.branch.findFirst({ where: { id: parsed.data.branchId, isActive: true } });
    if (!branch) return res.status(404).json({ error: "Active branch not found" });
    let warning = null;
    if (parsed.data.fundId) {
      const fund = await prisma.fund.findFirst({ where: { id: parsed.data.fundId, status: "ACTIVE", allocations: { some: { branchId: parsed.data.branchId } } } });
      if (!fund) return res.status(400).json({ error: "Selected fund must be active and allocated to your branch" });
      const totals = await fundTotals(prisma, fund.id, parsed.data.branchId);
      if (totals.remaining.lt(parsed.data.amount)) warning = `Warning: requested amount exceeds this branch's remaining fund balance (${fund.currency} ${totals.remaining.toFixed(2)}).`;
    }
    const advance = await prisma.$transaction(async (tx) => {
      const chain = await getApprovalChain("CASH_ADVANCE", parsed.data.branchId, null, tx);
      const created = await tx.cashAdvance.create({ data: { branchId: parsed.data.branchId, amount: parsed.data.amount, purpose: parsed.data.purpose, fundId: parsed.data.fundId, requesterId: req.user.id, status: "REQUESTED", approvalChain: chain.map((rule) => rule.approverRole) }, include: includeDetails });
      await logAction(req.user.id, "CASH_ADVANCE_CREATED", "CashAdvance", created.id, { branchId: created.branchId, amount: created.amount.toString(), purpose: created.purpose }, tx);
      await notifyRole(chain[0].approverRole, `Cash advance ${created.amount} from ${created.branch.name} needs level 1 approval.`, "APPROVAL_PENDING", "CashAdvance", created.id, localRoles.has(chain[0].approverRole) ? created.branchId : null, tx);
      return created;
    });
    res.status(201).json({ ...advance, warning });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const advances = await prisma.cashAdvance.findMany({ where: scopeFor(req.user), include: includeDetails, orderBy: { createdAt: "desc" } });
    res.json(await Promise.all(advances.map(async (advance) => ({ ...advance, nextRequiredRole: advance.status === "REQUESTED" ? nextApproval(await getEffectiveApprovalChain("CASH_ADVANCE", advance.branchId, null, advance.approvalSteps, advance.approvalChain), advance.approvalSteps).requiredRole : null }))));
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const advance = await prisma.cashAdvance.findFirst({ where: { id: req.params.id, ...scopeFor(req.user) }, include: includeDetails });
    if (!advance) return res.status(404).json({ error: "Cash advance not found" });
    const chain = await getEffectiveApprovalChain("CASH_ADVANCE", advance.branchId, null, advance.approvalSteps, advance.approvalChain); res.json({ ...advance, nextRequiredRole: advance.status === "REQUESTED" ? nextApproval(chain, advance.approvalSteps).requiredRole : null });
  } catch (error) { next(error); }
});

router.patch("/:id/approve", requirePermission("APPROVE_CASH_ADVANCE"), async (req, res, next) => {
  try {
    const parsed = decisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid approval data" });
    const result = await prisma.$transaction(async (tx) => {
      const advance = await tx.cashAdvance.findUnique({ where: { id: req.params.id }, include: { approvalSteps: { orderBy: { level: "asc" } } } });
      if (!advance) return null;
      if (localRoles.has(req.user.role) && req.user.branchId !== advance.branchId) throw Object.assign(new Error("You can only approve requests for your own branch"), { statusCode: 403 });
      if (advance.status !== "REQUESTED") throw Object.assign(new Error("Only requested advances can be approved"), { statusCode: 409 });
      const chain = await getEffectiveApprovalChain("CASH_ADVANCE", advance.branchId, null, advance.approvalSteps, advance.approvalChain, tx);
      const progress = assertNextApprover(chain, advance.approvalSteps, req.user.role);
      await tx.approvalStep.create({ data: { cashAdvanceId: advance.id, approverId: req.user.id, status: "APPROVED", level: progress.level, comments: parsed.data.comment, actedAt: new Date() } });
      const updated = await tx.cashAdvance.update({ where: { id: advance.id }, data: { status: progress.isFinal ? "APPROVED" : "REQUESTED", ...(!advance.approvalChain ? { approvalChain: chain.map((rule) => rule.approverRole) } : {}) }, include: includeDetails });
      await logAction(req.user.id, "CASH_ADVANCE_APPROVED", "CashAdvance", advance.id, { level: progress.level, final: progress.isFinal, comment: parsed.data.comment ?? null }, tx);
      if (progress.isFinal) await createNotification(advance.requesterId, `Your cash advance for ${advance.amount} was fully approved.`, "APPROVED", "CashAdvance", advance.id, tx);
      else { const nextRole = nextApproval(chain, [...advance.approvalSteps, { status: "APPROVED", level: progress.level }]).requiredRole; await notifyRole(nextRole, `Cash advance ${advance.amount} needs level ${progress.level + 1} approval.`, "APPROVAL_PENDING", "CashAdvance", advance.id, localRoles.has(nextRole) ? advance.branchId : null, tx); }
      return { cashAdvance: updated, nextRequiredRole: progress.isFinal ? null : nextApproval(chain, [...advance.approvalSteps, { status: "APPROVED", level: progress.level }]).requiredRole };
    });
    if (!result) return res.status(404).json({ error: "Cash advance not found" });
    res.json(result);
  } catch (error) { next(error); }
});

router.patch("/:id/reject", requirePermission("APPROVE_CASH_ADVANCE"), async (req, res, next) => {
  try {
    const parsed = decisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid rejection data" });
    const result = await prisma.$transaction(async (tx) => {
      const advance = await tx.cashAdvance.findUnique({ where: { id: req.params.id }, include: { approvalSteps: { orderBy: { level: "asc" } } } });
      if (!advance) return null;
      if (localRoles.has(req.user.role) && req.user.branchId !== advance.branchId) throw Object.assign(new Error("You can only review requests for your own branch"), { statusCode: 403 });
      if (advance.status !== "REQUESTED") throw Object.assign(new Error("Only requested advances can be rejected"), { statusCode: 409 });
      const chain = await getEffectiveApprovalChain("CASH_ADVANCE", advance.branchId, null, advance.approvalSteps, advance.approvalChain, tx);
      const progress = assertNextApprover(chain, advance.approvalSteps, req.user.role);
      await tx.approvalStep.create({ data: { cashAdvanceId: advance.id, approverId: req.user.id, status: "REJECTED", level: progress.level, comments: parsed.data.comment, actedAt: new Date() } });
      const updated = await tx.cashAdvance.update({ where: { id: advance.id }, data: { status: "REJECTED" }, include: includeDetails });
      await logAction(req.user.id, "CASH_ADVANCE_REJECTED", "CashAdvance", advance.id, { level: progress.level, comment: parsed.data.comment ?? null }, tx);
      await createNotification(advance.requesterId, `Your cash advance for ${advance.amount} was rejected.`, "REJECTED", "CashAdvance", advance.id, tx);
      return { cashAdvance: updated, nextRequiredRole: null };
    });
    if (!result) return res.status(404).json({ error: "Cash advance not found" });
    res.json(result);
  } catch (error) { next(error); }
});

router.patch("/:id/disburse", requirePermission("WRITE_LEDGER"), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const advance = await tx.cashAdvance.findUnique({ where: { id: req.params.id } });
      if (!advance) return null;
      if (advance.fundId) {
        const fund = await tx.fund.findUnique({ where: { id: advance.fundId } });
        if (!fund || fund.status !== "ACTIVE") throw Object.assign(new Error("Linked fund is closed or unavailable"), { statusCode: 409 });
        const totals = await fundTotals(tx, fund.id, advance.branchId);
        if (totals.remaining.lt(advance.amount)) throw Object.assign(new Error(`Insufficient allocated fund balance. Remaining: ${fund.currency} ${totals.remaining.toFixed(2)}`), { statusCode: 409 });
      }
      const claimed = await tx.cashAdvance.updateMany({ where: { id: advance.id, status: "APPROVED" }, data: { status: "DISBURSED", disbursedAt: new Date() } });
      if (claimed.count !== 1) throw Object.assign(new Error("Only approved advances can be disbursed"), { statusCode: 409 });
      const previous = await tx.ledgerEntry.findFirst({ where: { branchId: advance.branchId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const runningBalance = new Prisma.Decimal(previous?.runningBalance ?? 0).minus(advance.amount);
      const ledgerEntry = await tx.ledgerEntry.create({ data: { type: "DISBURSEMENT", amount: advance.amount, runningBalance, description: `Cash advance: ${advance.purpose}`, branchId: advance.branchId, createdById: req.user.id, cashAdvanceId: advance.id, fundId: advance.fundId } });
      await logAction(req.user.id, "CASH_ADVANCE_DISBURSED", "CashAdvance", advance.id, { amount: advance.amount.toString(), ledgerEntryId: ledgerEntry.id, runningBalance: runningBalance.toString() }, tx);
      await createNotification(advance.requesterId, `Your approved cash advance for ${advance.amount} was disbursed.`, "DISBURSED", "CashAdvance", advance.id, tx);
      if (advance.fundId) await notifyFundThreshold(tx, advance.fundId);
      return tx.cashAdvance.findUnique({ where: { id: advance.id }, include: includeDetails });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result) return res.status(404).json({ error: "Cash advance not found" });
    res.json(result);
  } catch (error) { next(error); }
});

export default router;
