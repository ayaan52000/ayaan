import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const branchSchema = z.object({ name: z.string().trim().min(2), code: z.string().trim().min(2).max(20) });

router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }));
  } catch (error) { next(error); }
});

router.post("/", authenticate, requirePermission("VIEW_ALL_BRANCHES"), async (req, res, next) => {
  try {
    const parsed = branchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid branch data", details: parsed.error.flatten() });
    res.status(201).json(await prisma.branch.create({ data: parsed.data }));
  } catch (error) { next(error); }
});

export default router;
