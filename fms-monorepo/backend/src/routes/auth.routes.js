import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { logAction } from "../lib/audit.js";

const router = Router();
const loginSchema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["FINANCE_HEAD", "ACCOUNTS_HEAD", "BRANCH_MANAGER", "DATA_ENTRY_OPERATOR", "PROGRAM_OFFICER", "AUDITOR"]),
  branchId: z.string().min(1).nullable().optional(),
});
const branchRoles = new Set(["BRANCH_MANAGER", "DATA_ENTRY_OPERATOR", "PROGRAM_OFFICER"]);

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid login details" });

    const email = parsed.data.email.toLowerCase() === "admin" ? "finance.head@fms.local" : parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId };
    const token = jwt.sign(publicUser, process.env.JWT_SECRET, { expiresIn: "8h" });
    return res.json({ token, user: publicUser });
  } catch (error) {
    next(error);
  }
});

router.post("/register", authenticate, requirePermission("CREATE_USER"), async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid user data", details: parsed.error.flatten() });
    const { name, email, password, role } = parsed.data;
    const branchId = parsed.data.branchId || null;
    if (branchRoles.has(role) && !branchId) return res.status(400).json({ error: "A branch is required for this role" });
    if (!branchRoles.has(role) && branchId) return res.status(400).json({ error: "This role cannot be assigned to a branch" });
    if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, isActive: true } }))) {
      return res.status(400).json({ error: "Active branch not found" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name, email: email.toLowerCase(), passwordHash, role, branchId } });
      await logAction(req.user.id, "USER_REGISTERED", "User", created.id, { email: created.email, role: created.role, branchId: created.branchId }, tx);
      return created;
    });
    return res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "A user with this email already exists" });
    next(error);
  }
});

export default router;
