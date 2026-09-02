import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);
router.get("/", async (req, res, next) => {
  try {
    const [items, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);
    res.json({ items, unreadCount });
  } catch (error) { next(error); }
});
router.patch("/:id/read", async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { isRead: true } });
    if (!result.count) return res.status(404).json({ error: "Notification not found" });
    res.json({ id: req.params.id, isRead: true });
  } catch (error) { next(error); }
});
export default router;
