import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }));
  } catch (error) { next(error); }
});
export default router;
