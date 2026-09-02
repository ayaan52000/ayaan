import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, requirePermission("VIEW_LEDGER"));

router.get("/summary", async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } });
    const summary = await Promise.all(branches.map(async (branch) => {
      const latest = await prisma.ledgerEntry.findFirst({ where: { branchId: branch.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      return { ...branch, currentBalance: latest?.runningBalance ?? 0, lastActivityAt: latest?.createdAt ?? null };
    }));
    res.json(summary);
  } catch (error) { next(error); }
});

router.get("/:branchId", async (req, res, next) => {
  try {
    const branch = await prisma.branch.findUnique({ where: { id: req.params.branchId }, select: { id: true, name: true, code: true } });
    if (!branch) return res.status(404).json({ error: "Branch not found" });
    const entries = await prisma.ledgerEntry.findMany({ where: { branchId: branch.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { createdBy: { select: { name: true, role: true } }, cashAdvance: { select: { purpose: true } }, expense: { select: { description: true } } } });
    res.json({ branch, currentBalance: entries.at(-1)?.runningBalance ?? 0, entries });
  } catch (error) { next(error); }
});

export default router;
