import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();
const querySchema = z.object({
  entityType: z.string().trim().min(1).optional(), userId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0),
});

router.get("/", authenticate, requirePermission("VIEW_AUDIT_LOG"), async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid audit filters", details: parsed.error.flatten() });
    const { entityType, userId, from, to, limit, offset } = parsed.data;
    const where = { ...(entityType ? { entity: entityType } : {}), ...(userId ? { actorId: userId } : {}), ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ items, pagination: { total, limit, offset, hasMore: offset + items.length < total } });
  } catch (error) { next(error); }
});
export default router;
