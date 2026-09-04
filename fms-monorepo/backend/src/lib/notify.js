import { prisma } from "./prisma.js";
import { queueNotificationEmail } from "./email.js";

export async function createNotification(userId, message, type, entityType, entityId, client = prisma) {
  const [notification, user] = await Promise.all([
    client.notification.create({ data: { userId, message, type, entityType, entityId } }),
    client.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, emailNotificationsEnabled: true } }),
  ]);
  if (user) queueNotificationEmail(user, notification);
  return notification;
}

export async function notifyRole(role, message, type, entityType, entityId, branchId = null, client = prisma) {
  const users = await client.user.findMany({ where: { role, isActive: true, ...(branchId ? { branchId } : {}) }, select: { id: true, name: true, email: true, role: true, emailNotificationsEnabled: true } });
  if (!users.length) return [];
  const result = await client.notification.createMany({ data: users.map(({ id }) => ({ userId: id, message, type, entityType, entityId })) });
  for (const user of users) queueNotificationEmail(user, { message, type, entityType, entityId });
  return result;
}
