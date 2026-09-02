import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertNextApprover, nextApproval } from "../lib/approvalChains.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);
const createSchema = z.object({
  branchId: z.string().min(1),
  amount: z.coerce.number().positive().max(999999999999.99),
  purpose: z.string().trim().min(3).max(500),
});
const decisionSchema = z.object({ comment: z.string().trim().max(500).optional() });
const includeDetails = {
  branch: { select: { id: true, name: true, code: true } },
  requester: { select: { id: true, name: true, email: true } },
  approvalSteps: {
    orderBy: { level: "asc" },
    include: { approver: { select: { id: true, name: true, role: true } } },
  },
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
    const advance = await prisma.cashAdvance.create({
      data: { branchId: parsed.data.branchId, amount: parsed.data.amount, purpose: parsed.data.purpose, requesterId: req.user.id, status: "REQUESTED" },
      include: includeDetails,
    });
    res.status(201).json(advance);
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const advances = await prisma.cashAdvance.findMany({ where: scopeFor(req.user), include: includeDetails, orderBy: { createdAt: "desc" } });
    res.json(advances);
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const advance = await prisma.cashAdvance.findFirst({ where: { id: req.params.id, ...scopeFor(req.user) }, include: includeDetails });
    if (!advance) return res.status(404).json({ error: "Cash advance not found" });
    res.json(advance);
  } catch (error) { next(error); }
});

router.patch("/:id/approve", requirePermission("APPROVE_CASH_ADVANCE"), async (req, res, next) => {
  try {
    const parsed = decisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid approval data" });
    const result = await prisma.$transaction(async (tx) => {
      const advance = await tx.cashAdvance.findUnique({ where: { id: req.params.id }, include: { approvalSteps: { orderBy: { level: "asc" } } } });
      if (!advance) return null;
      if (advance.status !== "REQUESTED") throw Object.assign(new Error("Only requested advances can be approved"), { statusCode: 409 });
      const progress = assertNextApprover("CASH_ADVANCE", advance.approvalSteps, req.user.role);
      await tx.approvalStep.create({ data: { cashAdvanceId: advance.id, approverId: req.user.id, status: "APPROVED", level: progress.level, comments: parsed.data.comment, actedAt: new Date() } });
      const updated = await tx.cashAdvance.update({ where: { id: advance.id }, data: { status: progress.isFinal ? "APPROVED" : "REQUESTED" }, include: includeDetails });
      return { cashAdvance: updated, nextRequiredRole: progress.isFinal ? null : nextApproval("CASH_ADVANCE", [...advance.approvalSteps, { status: "APPROVED" }]).requiredRole };
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
      if (advance.status !== "REQUESTED") throw Object.assign(new Error("Only requested advances can be rejected"), { statusCode: 409 });
      const progress = assertNextApprover("CASH_ADVANCE", advance.approvalSteps, req.user.role);
      await tx.approvalStep.create({ data: { cashAdvanceId: advance.id, approverId: req.user.id, status: "REJECTED", level: progress.level, comments: parsed.data.comment, actedAt: new Date() } });
      const updated = await tx.cashAdvance.update({ where: { id: advance.id }, data: { status: "REJECTED" }, include: includeDetails });
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
      const claimed = await tx.cashAdvance.updateMany({ where: { id: advance.id, status: "APPROVED" }, data: { status: "DISBURSED", disbursedAt: new Date() } });
      if (claimed.count !== 1) throw Object.assign(new Error("Only approved advances can be disbursed"), { statusCode: 409 });
      const previous = await tx.ledgerEntry.findFirst({ where: { branchId: advance.branchId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const runningBalance = new Prisma.Decimal(previous?.runningBalance ?? 0).minus(advance.amount);
      await tx.ledgerEntry.create({ data: { type: "DISBURSEMENT", amount: advance.amount, runningBalance, description: `Cash advance: ${advance.purpose}`, branchId: advance.branchId, createdById: req.user.id, cashAdvanceId: advance.id } });
      return tx.cashAdvance.findUnique({ where: { id: advance.id }, include: includeDetails });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result) return res.status(404).json({ error: "Cash advance not found" });
    res.json(result);
  } catch (error) { next(error); }
});

export default router;
