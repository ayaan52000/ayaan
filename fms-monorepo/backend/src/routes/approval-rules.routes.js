import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logAction } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const roles = ["FINANCE_HEAD", "ACCOUNTS_HEAD", "BRANCH_MANAGER", "DATA_ENTRY_OPERATOR", "PROGRAM_OFFICER", "AUDITOR"];
const nullableId = z.preprocess((v) => v === "" || v === undefined ? null : v, z.string().min(1).nullable());
const createSchema = z.object({ entityType: z.enum(["CASH_ADVANCE", "EXPENSE"]), level: z.coerce.number().int().positive(), approverRole: z.enum(roles), branchId: nullableId, categoryId: nullableId, isActive: z.boolean().optional().default(true) });
const updateSchema = z.object({ entityType: z.enum(["CASH_ADVANCE", "EXPENSE"]).optional(), level: z.coerce.number().int().positive().optional(), approverRole: z.enum(roles).optional(), branchId: nullableId.optional(), categoryId: nullableId.optional(), isActive: z.boolean().optional() });
const filtersSchema = z.object({ entityType: z.enum(["CASH_ADVANCE", "EXPENSE"]).optional(), branchId: z.string().optional(), active: z.enum(["true", "false"]).optional() });

function validateShape(rule) {
  if (rule.entityType === "CASH_ADVANCE" && rule.categoryId) throw Object.assign(new Error("Cash advance rules cannot have an expense category"), { statusCode: 400 });
}
async function validateReferences(client, rule) {
  const [branch, category] = await Promise.all([rule.branchId ? client.branch.findUnique({ where: { id: rule.branchId } }) : null, rule.categoryId ? client.expenseCategory.findUnique({ where: { id: rule.categoryId } }) : null]);
  if (rule.branchId && !branch) throw Object.assign(new Error("Branch not found"), { statusCode: 404 });
  if (rule.categoryId && !category) throw Object.assign(new Error("Expense category not found"), { statusCode: 404 });
}
async function validateScope(client, { entityType, branchId, categoryId }) {
  const rows = await client.approvalRule.findMany({ where: { entityType, branchId: branchId ?? null, categoryId: categoryId ?? null, isActive: true }, orderBy: { level: "asc" } });
  if (rows.some((row, index) => row.level !== index + 1)) throw Object.assign(new Error("Active levels in a scope must be sequential starting at 1"), { statusCode: 409 });
}
const include = { branch: { select: { id: true, name: true, code: true } }, category: { select: { id: true, name: true } } };

router.use(authenticate, requirePermission("MANAGE_APPROVAL_RULES"));
router.get("/", async (req, res, next) => { try { const q = filtersSchema.parse(req.query); res.json(await prisma.approvalRule.findMany({ where: { ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.branchId ? { branchId: q.branchId } : {}), ...(q.active ? { isActive: q.active === "true" } : {}) }, include, orderBy: [{ entityType: "asc" }, { branchId: "asc" }, { categoryId: "asc" }, { level: "asc" }] })); } catch (error) { next(error); } });
router.post("/", async (req, res, next) => { try {
  const data = createSchema.parse(req.body); validateShape(data);
  const created = await prisma.$transaction(async (tx) => { await validateReferences(tx, data); const rule = await tx.approvalRule.create({ data, include }); await validateScope(tx, data); await logAction(req.user.id, "APPROVAL_RULE_CREATED", "ApprovalRule", rule.id, data, tx); return rule; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  res.status(201).json(created);
} catch (error) { if (error?.code === "P2002") return res.status(409).json({ error: "An active rule already exists at this level and scope" }); next(error); } });
router.patch("/:id", async (req, res, next) => { try {
  const changes = updateSchema.parse(req.body); const updated = await prisma.$transaction(async (tx) => { const current = await tx.approvalRule.findUnique({ where: { id: req.params.id } }); if (!current) return null; const projected = { ...current, ...changes }; validateShape(projected); await validateReferences(tx, projected); const rule = await tx.approvalRule.update({ where: { id: current.id }, data: changes, include }); await validateScope(tx, current); await validateScope(tx, projected); await logAction(req.user.id, changes.isActive === false ? "APPROVAL_RULE_DEACTIVATED" : "APPROVAL_RULE_UPDATED", "ApprovalRule", rule.id, changes, tx); return rule; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!updated) return res.status(404).json({ error: "Approval rule not found" }); res.json(updated);
} catch (error) { if (error?.code === "P2002") return res.status(409).json({ error: "An active rule already exists at this level and scope" }); next(error); } });
router.delete("/:id", async (req, res, next) => { try {
  const updated = await prisma.$transaction(async (tx) => { const current = await tx.approvalRule.findUnique({ where: { id: req.params.id } }); if (!current) return null; if (!current.isActive) return current; const rule = await tx.approvalRule.update({ where: { id: current.id }, data: { isActive: false }, include }); await validateScope(tx, current); await logAction(req.user.id, "APPROVAL_RULE_DEACTIVATED", "ApprovalRule", rule.id, {}, tx); return rule; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!updated) return res.status(404).json({ error: "Approval rule not found" }); res.json(updated);
} catch (error) { next(error); } });

export default router;
