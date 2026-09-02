import { prisma } from "./prisma.js";

export function logAction(userId, action, entityType, entityId, metadata = {}, client = prisma) {
  return client.auditLog.create({
    data: { actorId: userId ?? null, action, entity: entityType, entityId: entityId ?? null, metadata },
  });
}
