import { prisma } from "./prisma.js";

export function createNotification(userId, message, type, entityType, entityId, client = prisma) {
  return client.notification.create({ data: { userId, message, type, entityType, entityId } });
}

export async function notifyRole(role, message, type, entityType, entityId, branchId = null, client = prisma) {
  const users = await client.user.findMany({ where: { role, isActive: true, ...(branchId ? { branchId } : {}) }, select: { id: true } });
  if (!users.length) return [];
  return client.notification.createMany({ data: users.map(({ id }) => ({ userId: id, message, type, entityType, entityId })) });
}
