import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logAction } from "../lib/audit.js";
import { fundTotals } from "../lib/funds.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const optionalText = z.preprocess((v) => v === "" ? undefined : v, z.string().trim().max(2000).optional());
const createSchema = z.object({ donorName: z.string().trim().min(2).max(150), grantName: z.string().trim().min(2).max(150), totalAmount: z.coerce.number().positive().max(999999999999.99), currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((v) => v.toUpperCase()), startDate: z.coerce.date(), endDate: z.coerce.date(), notes: optionalText }).refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after start date", path: ["endDate"] });
const updateSchema = z.object({ donorName: z.string().trim().min(2).max(150).optional(), grantName: z.string().trim().min(2).max(150).optional(), totalAmount: z.coerce.number().positive().max(999999999999.99).optional(), currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((v) => v.toUpperCase()).optional(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), status: z.enum(["ACTIVE", "CLOSED"]).optional(), notes: optionalText });
const filterSchema = z.object({ status: z.enum(["ACTIVE", "CLOSED"]).optional(), donor: z.string().trim().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), branchId: z.string().optional() });
const allocationSchema = z.object({ branchId: z.string().min(1), allocatedAmount: z.coerce.number().positive().max(999999999999.99) });
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);

router.use(authenticate, requirePermission("VIEW_FUNDS"));
router.post("/", requirePermission("MANAGE_FUNDS"), async (req, res, next) => { try {
  const data = createSchema.parse(req.body);
  const fund = await prisma.$transaction(async (tx) => { const created = await tx.fund.create({ data: { ...data, createdById: req.user.id } }); await logAction(req.user.id, "FUND_CREATED", "Fund", created.id, { donorName: created.donorName, grantName: created.grantName, totalAmount: created.totalAmount.toString() }, tx); return created; });
  res.status(201).json(fund);
} catch (error) { next(error); } });

router.get("/", async (req, res, next) => { try {
  const q = filterSchema.parse(req.query); const branchId = localRoles.has(req.user.role) ? req.user.branchId ?? "__no_branch__" : q.branchId;
  const funds = await prisma.fund.findMany({ where: { ...(q.status ? { status: q.status } : {}), ...(q.donor ? { donorName: { contains: q.donor, mode: "insensitive" } } : {}), ...(q.from || q.to ? { AND: [{ endDate: { ...(q.from ? { gte: q.from } : {}) } }, { startDate: { ...(q.to ? { lte: q.to } : {}) } }] } : {}), ...(branchId ? { allocations: { some: { branchId } } } : {}) }, include: { allocations: { include: { branch: { select: { id: true, name: true, code: true } } } }, createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } });
  res.json(await Promise.all(funds.map(async (fund) => ({ ...fund, ...(await fundTotals(prisma, fund.id, branchId)) }))));
} catch (error) { next(error); } });

router.get("/:id", async (req, res, next) => { try {
  const branchId = localRoles.has(req.user.role) ? req.user.branchId ?? "__no_branch__" : null;
  const fund = await prisma.fund.findFirst({ where: { id: req.params.id, ...(branchId ? { allocations: { some: { branchId } } } : {}) }, include: { createdBy: { select: { id: true, name: true } }, allocations: { include: { branch: { select: { id: true, name: true, code: true } } }, orderBy: { createdAt: "asc" } }, cashAdvances: { where: branchId ? { branchId } : {}, include: { branch: { select: { name: true, code: true } }, requester: { select: { name: true } } }, orderBy: { createdAt: "desc" } }, expenses: { where: branchId ? { branchId } : {}, include: { branch: { select: { name: true, code: true } }, category: true }, orderBy: { expenseDate: "desc" } } } });
  if (!fund) return res.status(404).json({ error: "Fund not found" }); res.json({ ...fund, ...(await fundTotals(prisma, fund.id, branchId)) });
} catch (error) { next(error); } });

router.patch("/:id", requirePermission("MANAGE_FUNDS"), async (req, res, next) => { try {
  const data = updateSchema.parse(req.body); const result = await prisma.$transaction(async (tx) => { const current = await tx.fund.findUnique({ where: { id: req.params.id } }); if (!current) return null; const startDate = data.startDate ?? current.startDate; const endDate = data.endDate ?? current.endDate; if (endDate < startDate) throw Object.assign(new Error("End date must be on or after start date"), { statusCode: 400 }); if (data.totalAmount) { const allocated = await tx.fundAllocation.aggregate({ _sum: { allocatedAmount: true }, where: { fundId: current.id } }); if (new Prisma.Decimal(data.totalAmount).lt(allocated._sum.allocatedAmount ?? 0)) throw Object.assign(new Error("Total amount cannot be less than allocated amount"), { statusCode: 409 }); } const updated = await tx.fund.update({ where: { id: current.id }, data }); await logAction(req.user.id, data.status === "CLOSED" && current.status !== "CLOSED" ? "FUND_CLOSED" : "FUND_UPDATED", "Fund", current.id, data, tx); return updated; }); if (!result) return res.status(404).json({ error: "Fund not found" }); res.json(result);
} catch (error) { next(error); } });

router.post("/:id/allocate", requirePermission("MANAGE_FUNDS"), async (req, res, next) => { try {
  const data = allocationSchema.parse(req.body); const allocation = await prisma.$transaction(async (tx) => { const fund = await tx.fund.findUnique({ where: { id: req.params.id } }); if (!fund) return null; if (fund.status !== "ACTIVE") throw Object.assign(new Error("Closed funds cannot be allocated"), { statusCode: 409 }); const branch = await tx.branch.findFirst({ where: { id: data.branchId, isActive: true } }); if (!branch) throw Object.assign(new Error("Active branch not found"), { statusCode: 404 }); const current = await tx.fundAllocation.findUnique({ where: { fundId_branchId: { fundId: fund.id, branchId: branch.id } } }); const aggregate = await tx.fundAllocation.aggregate({ _sum: { allocatedAmount: true }, where: { fundId: fund.id } }); const projected = new Prisma.Decimal(aggregate._sum.allocatedAmount ?? 0).minus(current?.allocatedAmount ?? 0).plus(data.allocatedAmount); if (projected.gt(fund.totalAmount)) throw Object.assign(new Error("Allocation exceeds the fund total"), { statusCode: 409 }); const saved = await tx.fundAllocation.upsert({ where: { fundId_branchId: { fundId: fund.id, branchId: branch.id } }, create: { fundId: fund.id, branchId: branch.id, allocatedAmount: data.allocatedAmount }, update: { allocatedAmount: data.allocatedAmount } }); const previous = await tx.ledgerEntry.findFirst({ where: { branchId: branch.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }); const delta = new Prisma.Decimal(data.allocatedAmount).minus(current?.allocatedAmount ?? 0); const runningBalance = new Prisma.Decimal(previous?.runningBalance ?? 0).plus(delta); const ledgerEntry = await tx.ledgerEntry.create({ data: { type: "FUND_DEPOSIT", amount: delta, runningBalance, description: `Fund allocation: ${fund.grantName} (${fund.donorName})`, branchId: branch.id, createdById: req.user.id, fundId: fund.id } }); await logAction(req.user.id, "FUND_ALLOCATED", "Fund", fund.id, { branchId: branch.id, allocatedAmount: String(data.allocatedAmount), delta: delta.toString(), ledgerEntryId: ledgerEntry.id }, tx); return saved; }); if (!allocation) return res.status(404).json({ error: "Fund not found" }); res.status(201).json(allocation);
} catch (error) { next(error); } });

export default router;
