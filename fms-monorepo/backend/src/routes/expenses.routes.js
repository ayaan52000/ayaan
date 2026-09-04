import { randomUUID } from "node:crypto";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertNextApprover, getApprovalChain, getEffectiveApprovalChain, nextApproval } from "../lib/approvalChains.js";
import { logAction } from "../lib/audit.js";
import { budgetMessage, budgetMode } from "../lib/budgetPolicy.js";
import { env } from "../lib/env.js";
import { createNotification, notifyRole } from "../lib/notify.js";
import { notifyFundThreshold } from "../lib/funds.js";
import { allowedReceiptMimeTypes, MAX_RECEIPT_BYTES, safeOriginalName, scanReceiptForMalware, validateReceiptFile } from "../lib/receiptSafety.js";
import { createCloudSignedReceiptUrl, createLocalSignedReceiptPath, deleteReceipt, readLocalReceipt, uploadReceipt, verifyLocalReceiptSignature } from "../lib/storage.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
  fileFilter: (_req, file, done) => allowedReceiptMimeTypes.has(file.mimetype)
    ? done(null, true)
    : done(Object.assign(new Error("Receipt must be JPG, PNG, WebP, or PDF"), { statusCode: 400 })),
});
const expenseSchema = z.object({
  amount: z.coerce.number().positive().max(999999999999.99),
  description: z.string().trim().min(3).max(500),
  categoryId: z.string().min(1),
  cashAdvanceId: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  fundId: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
});
const decisionSchema = z.object({ comment: z.string().trim().max(500).optional() });
const includeDetails = {
  branch: { select: { id: true, name: true, code: true } },
  creator: { select: { id: true, name: true, email: true } },
  category: true,
  cashAdvance: { select: { id: true, purpose: true, amount: true, status: true } },
  fund: { select: { id: true, donorName: true, grantName: true, currency: true } },
  approvalSteps: { orderBy: { level: "asc" }, include: { approver: { select: { id: true, name: true, role: true } } } },
};

function scopeFor(user) { return localRoles.has(user.role) ? { branchId: user.branchId ?? "__no_branch__" } : {}; }
function publicExpense(expense) {
  const { receiptKey, ...safeExpense } = expense;
  return { ...safeExpense, hasReceipt: Boolean(receiptKey) };
}

router.use(authenticate);

router.post("/", requirePermission("CREATE_EXPENSE"), upload.single("receipt"), async (req, res, next) => {
  let uploadedKey;
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid expense data", details: parsed.error.flatten() });
    if (!req.file) return res.status(400).json({ error: "A receipt file is required" });
    if (!req.user.branchId) return res.status(400).json({ error: "Your user is not assigned to a branch" });

    const category = await prisma.expenseCategory.findFirst({ where: { id: parsed.data.categoryId, isActive: true } });
    if (!category) return res.status(404).json({ error: "Expense category not found" });
    let fundId = parsed.data.fundId;
    if (parsed.data.cashAdvanceId) {
      const advance = await prisma.cashAdvance.findFirst({ where: { id: parsed.data.cashAdvanceId, branchId: req.user.branchId, status: "DISBURSED" } });
      if (!advance) return res.status(400).json({ error: "Linked advance must be disbursed and belong to your branch" });
      fundId = parsed.data.fundId ?? advance.fundId ?? undefined;
    }
    if (fundId) {
      const fund = await prisma.fund.findFirst({ where: { id: fundId, status: "ACTIVE", allocations: { some: { branchId: req.user.branchId } } } });
      if (!fund) return res.status(400).json({ error: "Selected fund must be active and allocated to your branch" });
    }

    const verifiedFile = await validateReceiptFile({ buffer: req.file.buffer, originalName: req.file.originalname, declaredMimeType: req.file.mimetype });
    const scan = await scanReceiptForMalware({ buffer: req.file.buffer, contentType: verifiedFile.contentType, name: verifiedFile.safeName });
    if (!scan.clean) throw Object.assign(new Error("Receipt failed malware scanning"), { statusCode: 400 });

    const expenseId = randomUUID();
    uploadedKey = `${req.user.branchId}/${expenseId}/${randomUUID()}-${verifiedFile.safeName}`;
    await uploadReceipt({ key: uploadedKey, buffer: req.file.buffer, contentType: verifiedFile.contentType });

    const expense = await prisma.$transaction(async (tx) => {
      const chain = await getApprovalChain("EXPENSE", req.user.branchId, parsed.data.categoryId, tx);
      const created = await tx.expense.create({ data: { id: expenseId, amount: parsed.data.amount, description: parsed.data.description, categoryId: parsed.data.categoryId, cashAdvanceId: parsed.data.cashAdvanceId, fundId, receiptKey: uploadedKey, expenseDate: new Date(), creatorId: req.user.id, branchId: req.user.branchId, status: "PENDING", approvalChain: chain.map((rule) => rule.approverRole) }, include: includeDetails });
      await logAction(req.user.id, "EXPENSE_CREATED", "Expense", created.id, { branchId: created.branchId, amount: created.amount.toString(), categoryId: created.categoryId, cashAdvanceId: created.cashAdvanceId, receiptStored: true, storageProvider: env.STORAGE_PROVIDER }, tx);
      await notifyRole(chain[0].approverRole, `Expense ${created.amount} for ${created.category.name} needs level 1 approval.`, "APPROVAL_PENDING", "Expense", created.id, localRoles.has(chain[0].approverRole) ? created.branchId : null, tx);
      return created;
    });
    uploadedKey = undefined;
    res.status(201).json(publicExpense(expense));
  } catch (error) {
    if (uploadedKey) await deleteReceipt(uploadedKey).catch((cleanupError) => console.error("Could not remove orphan receipt:", cleanupError));
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const expenses = await prisma.expense.findMany({ where: scopeFor(req.user), include: includeDetails, orderBy: { createdAt: "desc" } });
    res.json(await Promise.all(expenses.map(async (expense) => publicExpense({ ...expense, nextRequiredRole: expense.status === "PENDING" ? nextApproval(await getEffectiveApprovalChain("EXPENSE", expense.branchId, expense.categoryId, expense.approvalSteps, expense.approvalChain), expense.approvalSteps).requiredRole : null }))));
  } catch (error) { next(error); }
});

router.get("/:id/receipt-url", async (req, res, next) => {
  try {
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, ...scopeFor(req.user) }, select: { id: true, receiptKey: true } });
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    const url = env.STORAGE_PROVIDER === "local"
      ? createLocalSignedReceiptPath(expense.id, expense.receiptKey)
      : await createCloudSignedReceiptUrl(expense.receiptKey);
    res.set("Cache-Control", "no-store").json({ url, expiresIn: 900 });
  } catch (error) { next(error); }
});

router.get("/:id/receipt", async (req, res, next) => {
  try {
    if (env.STORAGE_PROVIDER !== "local") return res.status(404).json({ error: "Local receipt access is disabled" });
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, ...scopeFor(req.user) }, select: { id: true, receiptKey: true } });
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (!verifyLocalReceiptSignature(expense.id, expense.receiptKey, req.query.expires, req.query.signature)) return res.status(403).json({ error: "Receipt link is invalid or expired" });

    const buffer = await readLocalReceipt(expense.receiptKey);
    const verifiedFile = await validateReceiptFile({ buffer, originalName: expense.receiptKey, declaredMimeType: null });
    res.set({ "Content-Type": verifiedFile.contentType, "Content-Disposition": `inline; filename="${safeOriginalName(path.basename(expense.receiptKey))}"`, "Cache-Control": "private, no-store" });
    res.send(buffer);
  } catch (error) { next(error); }
});

async function decide(req, res, next, status) {
  try {
    const parsed = decisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid decision data" });
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id: req.params.id }, include: { approvalSteps: { orderBy: { level: "asc" } }, category: true } });
      if (!expense) return null;
      if (localRoles.has(req.user.role) && req.user.branchId !== expense.branchId) throw Object.assign(new Error("You can only review expenses for your own branch"), { statusCode: 403 });
      if (expense.status !== "PENDING") throw Object.assign(new Error("Only pending expenses can be reviewed"), { statusCode: 409 });
      const chain = await getEffectiveApprovalChain("EXPENSE", expense.branchId, expense.categoryId, expense.approvalSteps, expense.approvalChain, tx);
      const progress = assertNextApprover(chain, expense.approvalSteps, req.user.role);
      let warning = null;
      if (status === "APPROVED" && progress.isFinal && budgetMode() !== "off") {
        const monthStart = new Date(Date.UTC(expense.expenseDate.getUTCFullYear(), expense.expenseDate.getUTCMonth(), 1));
        const nextMonth = new Date(Date.UTC(expense.expenseDate.getUTCFullYear(), expense.expenseDate.getUTCMonth() + 1, 1));
        const aggregate = await tx.expense.aggregate({ _sum: { amount: true }, where: { branchId: expense.branchId, categoryId: expense.categoryId, status: "APPROVED", expenseDate: { gte: monthStart, lt: nextMonth } } });
        const projectedTotal = Number(aggregate._sum.amount ?? 0) + Number(expense.amount);
        warning = budgetMessage(expense.category, projectedTotal);
        if (warning && budgetMode() === "block") throw Object.assign(new Error(warning), { statusCode: 409 });
      }
      await tx.approvalStep.create({ data: { expenseId: expense.id, approverId: req.user.id, status, level: progress.level, comments: parsed.data.comment, actedAt: new Date() } });
      const parentStatus = status === "REJECTED" ? "REJECTED" : progress.isFinal ? "APPROVED" : "PENDING";
      const updated = await tx.expense.update({ where: { id: expense.id }, data: { status: parentStatus, ...(!expense.approvalChain ? { approvalChain: chain.map((rule) => rule.approverRole) } : {}) }, include: includeDetails });
      await logAction(req.user.id, status === "APPROVED" ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED", "Expense", expense.id, { level: progress.level, final: status === "APPROVED" && progress.isFinal, comment: parsed.data.comment ?? null, budgetWarning: warning }, tx);
      if (status === "REJECTED") await createNotification(expense.creatorId, `Your expense for ${expense.amount} was rejected.`, "REJECTED", "Expense", expense.id, tx);
      else if (progress.isFinal) await createNotification(expense.creatorId, `Your expense for ${expense.amount} was fully approved.`, "APPROVED", "Expense", expense.id, tx);
      else { const nextRole = nextApproval(chain, [...expense.approvalSteps, { status: "APPROVED", level: progress.level }]).requiredRole; await notifyRole(nextRole, `Expense ${expense.amount} needs level ${progress.level + 1} approval.`, "APPROVAL_PENDING", "Expense", expense.id, localRoles.has(nextRole) ? expense.branchId : null, tx); }
      if (status === "APPROVED" && progress.isFinal && expense.fundId && !expense.cashAdvanceId) await notifyFundThreshold(tx, expense.fundId);
      return { expense: publicExpense(updated), warning, nextRequiredRole: parentStatus === "PENDING" ? nextApproval(chain, [...expense.approvalSteps, { status: "APPROVED", level: progress.level }]).requiredRole : null };
    });
    if (!result) return res.status(404).json({ error: "Expense not found" });
    res.json(result);
  } catch (error) { next(error); }
}

router.patch("/:id/approve", requirePermission("APPROVE_EXPENSE"), (req, res, next) => decide(req, res, next, "APPROVED"));
router.patch("/:id/reject", requirePermission("APPROVE_EXPENSE"), (req, res, next) => decide(req, res, next, "REJECTED"));

export default router;
