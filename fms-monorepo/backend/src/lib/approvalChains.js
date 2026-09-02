export const approvalChains = Object.freeze({
  CASH_ADVANCE: ["ACCOUNTS_HEAD", "FINANCE_HEAD"],
  EXPENSE: ["BRANCH_MANAGER", "ACCOUNTS_HEAD"],
});

export function nextApproval(entityType, approvalSteps) {
  const chain = approvalChains[entityType];
  if (!chain) throw new Error(`Unknown approval entity: ${entityType}`);
  const approvedCount = approvalSteps.filter((step) => step.status === "APPROVED").length;
  return {
    level: approvedCount + 1,
    requiredRole: chain[approvedCount] ?? null,
    isFinal: approvedCount + 1 === chain.length,
    complete: approvedCount >= chain.length,
  };
}

export function assertNextApprover(entityType, approvalSteps, role) {
  const progress = nextApproval(entityType, approvalSteps);
  if (progress.complete) throw Object.assign(new Error("Approval chain is already complete"), { statusCode: 409 });
  if (progress.requiredRole !== role) {
    throw Object.assign(new Error(`Level ${progress.level} approval requires ${progress.requiredRole}`), { statusCode: 403 });
  }
  return progress;
}
