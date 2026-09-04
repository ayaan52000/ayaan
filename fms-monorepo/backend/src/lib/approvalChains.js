import { prisma } from "./prisma.js";

export const defaultApprovalChains = Object.freeze({ CASH_ADVANCE: ["ACCOUNTS_HEAD", "FINANCE_HEAD"], EXPENSE: ["BRANCH_MANAGER", "ACCOUNTS_HEAD"] });

export async function getApprovalChain(entityType, branchId = null, categoryId = null, client = prisma) {
  if (!defaultApprovalChains[entityType]) throw new Error(`Unknown approval entity: ${entityType}`);
  const rules = await client.approvalRule.findMany({ where: { entityType, isActive: true, AND: [branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }, entityType === "EXPENSE" && categoryId ? { OR: [{ categoryId }, { categoryId: null }] } : { categoryId: null }] }, orderBy: { level: "asc" } });
  const scopes = entityType === "EXPENSE" ? [[branchId, categoryId], [branchId, null], [null, categoryId], [null, null]] : [[branchId, null], [null, null]];
  for (const [scopeBranch, scopeCategory] of scopes) {
    const selected = rules.filter((rule) => rule.branchId === (scopeBranch ?? null) && rule.categoryId === (scopeCategory ?? null));
    if (selected.length) return selected.map((rule) => ({ id: rule.id, level: rule.level, approverRole: rule.approverRole }));
  }
  return defaultApprovalChains[entityType].map((approverRole, index) => ({ id: null, level: index + 1, approverRole }));
}

export async function getEffectiveApprovalChain(entityType, branchId, categoryId, approvalSteps, snapshot, client = prisma) {
  if (Array.isArray(snapshot) && snapshot.length && snapshot.every((role) => typeof role === "string")) return snapshot.map((approverRole, index) => ({ id: null, level: index + 1, approverRole }));
  if (approvalSteps.length) return defaultApprovalChains[entityType].map((approverRole, index) => ({ id: null, level: index + 1, approverRole }));
  return getApprovalChain(entityType, branchId, categoryId, client);
}

export function nextApproval(chain, approvalSteps) {
  const approved = approvalSteps.filter((step) => step.status === "APPROVED").sort((a, b) => a.level - b.level);
  if (approved.some((step, index) => step.level !== index + 1)) throw Object.assign(new Error("Existing approvals are out of sequence"), { statusCode: 409 });
  const next = chain[approved.length];
  return { level: approved.length + 1, requiredRole: next?.approverRole ?? null, isFinal: approved.length + 1 === chain.length, complete: approved.length >= chain.length };
}

export function assertNextApprover(chain, approvalSteps, role) {
  const progress = nextApproval(chain, approvalSteps);
  if (progress.complete) throw Object.assign(new Error("Approval chain is already complete"), { statusCode: 409 });
  if (progress.requiredRole !== role) {
    throw Object.assign(new Error(`Level ${progress.level} approval requires ${progress.requiredRole}`), { statusCode: 403 });
  }
  return progress;
}
