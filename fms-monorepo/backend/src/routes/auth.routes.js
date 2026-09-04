import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { logAction } from "../lib/audit.js";
import { rateLimit } from "express-rate-limit";
import { env } from "../lib/env.js";

const router = Router();
const loginSchema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["FINANCE_HEAD", "ACCOUNTS_HEAD", "BRANCH_MANAGER", "DATA_ENTRY_OPERATOR", "PROGRAM_OFFICER", "AUDITOR"]),
  branchId: z.string().min(1).nullable().optional(),
});
const preferencesSchema = z.object({ emailNotificationsEnabled: z.boolean() });
const branchRoles = new Set(["BRANCH_MANAGER", "DATA_ENTRY_OPERATOR", "PROGRAM_OFFICER"]);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many login attempts. Try again in 15 minutes." } });
const sessionCookie = { httpOnly: true, secure: env.COOKIE_SECURE === "true", sameSite: "strict", maxAge: 8 * 60 * 60 * 1000, path: "/" };
const clearSessionCookie = { httpOnly: true, secure: env.COOKIE_SECURE === "true", sameSite: "strict", path: "/" };

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid login details" });

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId, emailNotificationsEnabled: user.emailNotificationsEnabled };
    const token = jwt.sign(publicUser, env.JWT_SECRET, { expiresIn: "8h" });
    res.cookie("fms_session", token, sessionCookie);
    return res.json({ user: publicUser });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("fms_session", clearSessionCookie);
  res.json({ status: "ok" });
});

router.get("/preferences", authenticate, async (req, res, next) => {
  try { const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { emailNotificationsEnabled: true } }); if (!user) return res.status(404).json({ error: "User not found" }); res.json(user); } catch (error) { next(error); }
});
router.patch("/preferences", authenticate, async (req, res, next) => {
  try { const data = preferencesSchema.parse(req.body); const user = await prisma.$transaction(async (tx) => { const updated = await tx.user.update({ where: { id: req.user.id }, data, select: { emailNotificationsEnabled: true } }); await logAction(req.user.id, "EMAIL_PREFERENCE_UPDATED", "User", req.user.id, data, tx); return updated; }); res.json(user); } catch (error) { next(error); }
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
