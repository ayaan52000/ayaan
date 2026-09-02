import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertNextApprover } from "../lib/approvalChains.js";
import { logAction } from "../lib/audit.js";
import { budgetMessage, budgetMode } from "../lib/budgetPolicy.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const receiptExtensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDir, filename: (_req, file, done) => done(null, `${randomUUID()}${receiptExtensions[file.mimetype] ?? ""}`) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, done) => allowedMimeTypes.has(file.mimetype) ? done(null, true) : done(new Error("Receipt must be JPG, PNG, WebP, or PDF")),
});
const expenseSchema = z.object({
  amount: z.coerce.number().positive().max(999999999999.99),
  description: z.string().trim().min(3).max(500),
  categoryId: z.string().min(1),
  cashAdvanceId: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
});
const decisionSchema = z.object({ comment: z.string().trim().max(500).optional() });
const includeDetails = {
  branch: { select: { id: true, name: true, code: true } },
  creator: { select: { id: true, name: true, email: true } },
  category: true,
  cashAdvance: { select: { id: true, purpose: true, amount: true, status: true } },
  approvalSteps: { orderBy: { level: "asc" }, include: { approver: { select: { id: true, name: true, role: true } } } },
};

function scopeFor(user) { return localRoles.has(user.role) ? { branchId: user.branchId ?? "__no_branch__" } : {}; }
async function removeUploaded(file) { if (file?.path) await unlink(file.path).catch(() => {}); }

router.use(authenticate);

router.post("/", requirePermission("CREATE_EXPENSE"), upload.single("receipt"), async (req, res, next) => {
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) { await removeUploaded(req.file); return res.status(400).json({ error: "Invalid expense data", details: parsed.error.flatten() }); }
    if (!req.file) return res.status(400).json({ error: "A receipt file is required" });
    if (!req.user.branchId) { await removeUploaded(req.file); return res.status(400).json({ error: "Your user is not assigned to a branch" }); }
    const category = await prisma.expenseCategory.findFirst({ where: { id: parsed.data.categoryId, isActive: true } });
    if (!category) { await removeUploaded(req.file); return res.status(404).json({ error: "Expense category not found" }); }
    if (parsed.data.cashAdvanceId) {
      const advance = await prisma.cashAdvance.findFirst({ where: { id: parsed.data.cashAdvanceId, branchId: req.user.branchId, status: "DISBURSED" } });
      if (!advance) { await removeUploaded(req.file); return res.status(400).json({ error: "Linked advance must be disbursed and belong to your branch" }); }
    }
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({ data: { amount: parsed.data.amount, description: parsed.data.description, categoryId: parsed.data.categoryId, cashAdvanceId: parsed.data.cashAdvanceId, receiptUrl: `/uploads/${req.file.filename}`, expenseDate: new Date(), creatorId: req.user.id, branchId: req.user.branchId, status: "PENDING" }, include: includeDetails });
      await logAction(req.user.id, "EXPENSE_CREATED", "Expense", created.id, { branchId: created.branchId, amount: created.amount.toString(), categoryId: created.categoryId, cashAdvanceId: created.cashAdvanceId, receiptUrl: created.receiptUrl }, tx);
      return created;
    });
    res.status(201).json(expense);
  } catch (error) { await removeUploaded(req.file); next(error); }
});

router.get("/", async (req, res, next) => {
  try { res.json(await prisma.expense.findMany({ where: scopeFor(req.user), include: includeDetails, orderBy: { createdAt: "desc" } })); }
  catch (error) { next(error); }
});

async function decide(req, res, next, status) {
  try {
    const parsed = decisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid decision data" });
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id: req.params.id }, include: { approvalSteps: { orderBy: { level: "asc" } }, category: true } });
      if (!expense) return null;
      if (expense.status !== "PENDING") throw Object.assign(new Error("Only pending expenses can be reviewed"), { statusCode: 409 });
      const progress = assertNextApprover("EXPENSE", expense.approvalSteps, req.user.role);
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
      const updated = await tx.expense.update({ where: { id: expense.id }, data: { status: parentStatus }, include: includeDetails });
      await logAction(req.user.id, status === "APPROVED" ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED", "Expense", expense.id, { level: progress.level, final: status === "APPROVED" && progress.isFinal, comment: parsed.data.comment ?? null, budgetWarning: warning }, tx);
      return { expense: updated, warning, nextRequiredRole: parentStatus === "PENDING" ? "ACCOUNTS_HEAD" : null };
    });
    if (!result) return res.status(404).json({ error: "Expense not found" });
    res.json(result);
  } catch (error) { next(error); }
}

router.patch("/:id/approve", requirePermission("APPROVE_EXPENSE"), (req, res, next) => decide(req, res, next, "APPROVED"));
router.patch("/:id/reject", requirePermission("APPROVE_EXPENSE"), (req, res, next) => decide(req, res, next, "REJECTED"));

export default router;
